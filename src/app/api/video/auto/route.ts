import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import db from "@/lib/db";
import { generateVoice } from "@/lib/voice";
import { prepareProductMedia, type MediaItem } from "@/lib/media";
import { createTimeline, type TimelineItem } from "@/lib/timeline";
import { calculateEstimatedCost } from "@/lib/costConfig";
import { finalizeAiGenerationCost, recordAiGeneration } from "@/lib/costLedger";

const VOICE_MODEL = "tts-1-hd";

export const runtime = "nodejs";

// เดาชนิดไฟล์จากนามสกุล + ชนิดสื่อ (ไม่มี Content-Type ติดมากับไฟล์ที่อ่านจากดิสก์โดยตรง) —
// ใช้ตอนสร้าง Blob ให้ Render API เห็นชนิดไฟล์ถูกต้อง (render.ts เช็ค file.type.startsWith("image/")
// เทียบ "video/") — STEP 14: เพิ่มสาขาวิดีโอ เพื่อรองรับ AI Video (product_media.type="video")
// ที่ไหลผ่าน pipeline เดียวกับรูปภาพ โดยไม่ต้องแก้ render.ts เลย (รองรับ video อยู่แล้วตั้งแต่ต้น)
function guessMediaMimeType(fileName: string, mediaType: "image" | "video"): string {
  const extension = path.extname(fileName).toLowerCase();

  if (mediaType === "video") {
    switch (extension) {
      case ".webm":
        return "video/webm";
      case ".mov":
        return "video/quicktime";
      case ".mp4":
      default:
        return "video/mp4";
    }
  }

  switch (extension) {
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".jpg":
    case ".jpeg":
    default:
      return "image/jpeg";
  }
}

/**
 * เรียก Render API (STABLE COMPONENT — ไม่แก้ src/app/api/video/render/route.ts) จากฝั่ง server
 * โดยสร้าง multipart request ให้ตรงกับ implementation จริงที่ตรวจสอบมาแล้ว:
 *   - timeline: JSON string ของ TimelineItem[]
 *   - script: string
 *   - audioUrl: string ขึ้นต้นด้วย "/generated/" (Render API resolve จากดิสก์เอง ไม่ต้องส่งไฟล์เสียง)
 *   - media: ไฟล์จริง (File/Blob) หนึ่งรายการต่อ Scene เรียงตามลำดับเดียวกับ timeline.items
 *
 * อ่านไฟล์รูปภาพสินค้าจริงจากดิสก์ตรงๆ (public/${media.url}) ไม่ fabricate ไฟล์ใดๆ —
 * ถ้าไฟล์ที่บันทึกไว้ใน product_media หายไปจากดิสก์จริง จะโยน error ทันทีแทนที่จะส่งข้อมูลปลอม
 */
async function renderVideoFromTimeline(
  requestUrl: string,
  params: {
    timeline: TimelineItem[];
    script: string;
    audioUrl: string;
    media: MediaItem[];
  }
): Promise<{ videoUrl: string; fileName: string }> {
  const formData = new FormData();

  formData.append("timeline", JSON.stringify(params.timeline));
  formData.append("script", params.script);
  formData.append("audioUrl", params.audioUrl);

  for (const item of params.media) {
    const mediaFilePath = path.join(
      process.cwd(),
      "public",
      item.url.replace(/^\/+/, "")
    );

    let buffer: Buffer;

    try {
      buffer = await readFile(mediaFilePath);
    } catch {
      throw new Error(
        `ไม่พบไฟล์รูปภาพสินค้า "${item.fileName}" บนดิสก์ — ข้อมูลใน Product Media อาจไม่ตรงกับไฟล์จริง`
      );
    }

    const mimeType = guessMediaMimeType(item.fileName, item.type);
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });

    formData.append("media", blob, item.fileName);
  }

  const renderUrl = new URL("/api/video/render", requestUrl);

  const renderResponse = await fetch(renderUrl, {
    method: "POST",
    body: formData,
    cache: "no-store",
  });

  const renderData = await renderResponse.json();

  if (!renderResponse.ok) {
    throw new Error(
      renderData?.error || "ไม่สามารถสร้างวิดีโอ MP4 ได้"
    );
  }

  if (!renderData?.videoUrl || !renderData?.fileName) {
    throw new Error("Render API ไม่ได้ส่ง videoUrl/fileName กลับมา");
  }

  // ห้ามรายงาน video_ready ถ้าไฟล์ MP4 ไม่มีอยู่จริง — ตรวจ filesystem ตรงๆ อีกครั้ง
  const videoFilePath = path.join(
    process.cwd(),
    "public",
    String(renderData.videoUrl).replace(/^\/+/, "")
  );

  try {
    const stats = await stat(videoFilePath);

    if (!stats.isFile() || stats.size <= 0) {
      throw new Error("empty or invalid file");
    }
  } catch {
    throw new Error(
      "Render API รายงานว่าสำเร็จ แต่ไม่พบไฟล์วิดีโอ MP4 บนดิสก์จริง"
    );
  }

  return {
    videoUrl: renderData.videoUrl,
    fileName: renderData.fileName,
  };
}

type AutoVideoRequest = {
  productId?: number;
  script?: string;
  tone?: string;
};

type Product = {
  id: number;
  name: string;
  model: string | null;
  master: string | null;
  year: string | null;
  description: string | null;
  price: number;
  stock: number;
  category: string | null;
  status: string | null;
};

export async function POST(request: Request) {
  let voiceLedgerId: number | null = null;
  let voiceLedgerFinalized = false;

  try {
    let body: AutoVideoRequest;

    try {
      body = (await request.json()) as AutoVideoRequest;
    } catch {
      return NextResponse.json(
        { error: "รูปแบบคำขอไม่ถูกต้อง (ต้องเป็น JSON)" },
        { status: 400 }
      );
    }

    const productId = Number(body.productId || 0);
    const manualScript = String(body.script || "").trim();
    const tone = String(body.tone || "premium");

    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json(
        { error: "กรุณาระบุรหัสสินค้าให้ถูกต้อง" },
        { status: 400 }
      );
    }

    const product = db
      .prepare(`
        SELECT
          id,
          name,
          model,
          master,
          year,
          description,
          price,
          stock,
          category,
          status
        FROM products
        WHERE id = ?
      `)
      .get(productId) as Product | undefined;

    if (!product) {
      return NextResponse.json(
        { error: `ไม่พบสินค้ารหัส ${productId}` },
        { status: 404 }
      );
    }

    let content: {
      facebook: string;
      reels: string;
      tiktok: string;
      script: string;
    };

    if (manualScript) {
      content = {
        facebook: "",
        reels: "",
        tiktok: "",
        script: manualScript,
      };
    } else {
      const contentUrl = new URL(
        "/api/content/generate",
        request.url
      );

      const contentResponse = await fetch(contentUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product: {
            id: product.id,
            name: product.name,
            model: product.model || "",
            master: product.master || "",
            year: product.year || "",
            description: product.description || "",
            price: product.price,
            stock: product.stock,
            category: product.category || "",
            status: product.status || "",
          },
          tone,
        }),
        cache: "no-store",
      });

      const contentData = await contentResponse.json();

      if (!contentResponse.ok) {
        throw new Error(
          contentData?.error ||
            "ไม่สามารถสร้างคอนเทนต์จากสินค้าได้"
        );
      }

      if (!contentData?.content) {
        throw new Error(
          "Content Generate API ไม่ได้ส่ง content กลับมา"
        );
      }

      content = contentData.content;
    }

    const script = String(content.script || "").trim();

    if (!script) {
      return NextResponse.json(
        { error: "ไม่พบ script สำหรับสร้างเสียงพากย์" },
        { status: 400 }
      );
    }

    // STEP 21: /api/video/auto เรียก generateVoice() ตรงๆ (ไม่ผ่าน HTTP ไป /api/voice) จึงต้อง
    // บันทึก ledger เองที่นี่ — productId รู้แน่นอนอยู่แล้วในขั้นตอนนี้ (มาจาก product.id ที่โหลดจาก DB
    // จริงด้านบน) ไม่แตะ src/app/api/video/render/route.ts หรือ render.ts ใดๆ ทั้งสิ้น
    const voiceEstimate = calculateEstimatedCost({
      provider: "openai",
      operation: "voice",
      characterCount: script.length,
    });

    const voiceLedger = recordAiGeneration({
      productId: product.id,
      provider: "openai",
      model: VOICE_MODEL,
      operation: "voice_generate",
      inputUnits: script.length,
      estimatedCost: voiceEstimate.cost,
      metadata: { pricingReason: voiceEstimate.reason, source: "video_auto" },
    });

    voiceLedgerId = voiceLedger.id;

    const voice = await generateVoice(script);

    finalizeAiGenerationCost(voiceLedger.id, { status: "succeeded" });
    voiceLedgerFinalized = true;

    const media = await prepareProductMedia({ id: product.id });

    const timeline = await createTimeline(voice.filePath, media.items);

    const baseResponse = {
      product: {
        id: product.id,
        name: product.name,
        model: product.model,
        master: product.master,
        year: product.year,
        price: product.price,
        stock: product.stock,
      },

      content: {
        facebook: content.facebook || "",
        reels: content.reels || "",
        tiktok: content.tiktok || "",
        script: content.script || "",
      },

      voice: {
        audioUrl: voice.audioUrl,
        fileName: voice.fileName,
      },

      media: {
        items: media.items,
        count: media.count,
        status: media.status,
      },

      timeline: {
        items: timeline.items,
        duration: timeline.duration,
        status: timeline.status,
      },
    };

    // ต้องมีทั้ง media และ timeline items อย่างน้อย 1 รายการก่อนถึงจะ render ได้จริง — ถ้าไม่มี
    // ให้หยุดอย่างปลอดภัย ไม่ fabricate media/timeline และไม่พยายามเรียก Render API เลย
    if (media.items.length === 0 || timeline.items.length === 0) {
      return NextResponse.json({
        success: true,

        pipeline: {
          status: "no_media",
          step: "render-video",
          productId: product.id,
        },

        ...baseResponse,

        nextStep: "upload-product-media",

        message:
          "สินค้านี้ยังไม่มีรูปภาพ กรุณาอัปโหลดรูปสินค้าก่อนจึงจะสร้างวิดีโอได้",
      });
    }

    // ยืนยันว่าไฟล์เสียงพากย์มีอยู่จริงบนดิสก์ก่อนส่งต่อไปยัง Render API
    try {
      const audioStats = await stat(voice.filePath);

      if (!audioStats.isFile() || audioStats.size <= 0) {
        throw new Error("empty or invalid file");
      }
    } catch {
      throw new Error("ไม่พบไฟล์เสียงพากย์บนดิสก์จริง");
    }

    const video = await renderVideoFromTimeline(request.url, {
      timeline: timeline.items,
      script,
      audioUrl: voice.audioUrl,
      media: media.items,
    });

    return NextResponse.json({
      success: true,

      pipeline: {
        status: "video_ready",
        step: "render-video",
        productId: product.id,
      },

      ...baseResponse,

      video: {
        videoUrl: video.videoUrl,
        fileName: video.fileName,
      },

      nextStep: "complete",

      message: "สร้าง AI Content เสียงพากย์ และวิดีโอสำเร็จแล้ว",
    });
  } catch (error) {
    console.error(
      "POST /api/video/auto error:",
      error
    );

    if (voiceLedgerId !== null && !voiceLedgerFinalized) {
      finalizeAiGenerationCost(voiceLedgerId, {
        status: "failed",
        metadataPatch: { error: error instanceof Error ? error.message : String(error) },
      });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "ไม่สามารถเริ่ม Auto Video Pipeline ได้",
      },
      { status: 500 }
    );
  }
}
