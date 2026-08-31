import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import db from "@/lib/db";
import { listProductMedia, insertProductMedia } from "@/lib/productMedia";

export const runtime = "nodejs";

// จำกัดขนาดไฟล์รูปภาพที่รับอัปโหลดไว้ที่ 10MB — เพียงพอสำหรับรูปสินค้าจริงทั่วไป กันไฟล์ใหญ่ผิดปกติ
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

// นามสกุลรูปภาพจริงที่ระบบรับ (คงจาก STEP 26.10 เดิม ไม่เพิ่ม format ใหม่)
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

type ImageSignatureType = "jpeg" | "png" | "gif" | "webp";

// extension → ชนิดไฟล์ภาพที่คาดหวังจริง ใช้เทียบกับผลตรวจ magic bytes
const EXTENSION_TO_SIGNATURE_TYPE: Record<string, ImageSignatureType> = {
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".png": "png",
  ".gif": "gif",
  ".webp": "webp",
};

// Content-Type ที่ client แจ้งมา → ชนิดไฟล์ภาพที่คาดหวังจริง ใช้เทียบกับผลตรวจ magic bytes เช่นกัน —
// ไม่ถือ Content-Type อย่างเดียวเป็นหลักฐานว่าไฟล์ปลอดภัย เพราะ client ปลอมค่านี้ได้ง่าย
const MIME_TO_SIGNATURE_TYPE: Record<string, ImageSignatureType> = {
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/pjpeg": "jpeg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

function signatureTypeToExtension(type: ImageSignatureType): string {
  switch (type) {
    case "jpeg":
      return ".jpg";
    case "png":
      return ".png";
    case "gif":
      return ".gif";
    case "webp":
      return ".webp";
    default:
      return ".jpg";
  }
}

// STEP 27 security fix: ตรวจชนิดไฟล์จาก "เนื้อไฟล์จริง" (magic bytes / file signature) แทนการเชื่อ
// extension หรือ Content-Type ที่ client ส่งมาเพียงอย่างเดียว (ทั้งสองปลอมได้ง่ายจากฝั่ง client) —
// รองรับเฉพาะ format ที่ระบบตั้งใจรับอยู่แล้ว (ตรงกับ ALLOWED_IMAGE_EXTENSIONS เดิมทุกประการ) ไม่เพิ่ม
// format ใหม่ใดๆ คืน null เมื่อตรวจไม่พบ signature ที่รู้จัก — caller ต้อง reject เสมอเมื่อได้ null
// (fail closed ไม่ fallback ยอมรับไฟล์ที่ตรวจไม่ได้)
function detectImageSignatureType(buffer: Buffer): ImageSignatureType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  if (
    buffer.length >= 6 &&
    (buffer.toString("ascii", 0, 6) === "GIF87a" || buffer.toString("ascii", 0, 6) === "GIF89a")
  ) {
    return "gif";
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }

  return null;
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseProductId(rawId: string): number | null {
  const productId = Number(rawId);

  if (!Number.isInteger(productId) || productId <= 0) {
    return null;
  }

  return productId;
}

function loadProduct(productId: number): { id: number } | undefined {
  return db
    .prepare("SELECT id FROM products WHERE id = ?")
    .get(productId) as { id: number } | undefined;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const productId = parseProductId(id);

    if (productId === null) {
      return NextResponse.json(
        { error: "กรุณาระบุรหัสสินค้าให้ถูกต้อง" },
        { status: 400 }
      );
    }

    const product = loadProduct(productId);

    if (!product) {
      return NextResponse.json(
        { error: `ไม่พบสินค้ารหัส ${productId}` },
        { status: 404 }
      );
    }

    const items = listProductMedia(productId);

    return NextResponse.json({
      success: true,
      items,
    });
  } catch (error) {
    console.error("GET /api/products/[id]/media error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "ไม่สามารถโหลดรูปภาพสินค้าได้",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const productId = parseProductId(id);

    if (productId === null) {
      return NextResponse.json(
        { error: "กรุณาระบุรหัสสินค้าให้ถูกต้อง" },
        { status: 400 }
      );
    }

    const product = loadProduct(productId);

    if (!product) {
      return NextResponse.json(
        { error: `ไม่พบสินค้ารหัส ${productId}` },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("image");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "กรุณาเลือกไฟล์รูปภาพ" },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "รองรับเฉพาะไฟล์รูปภาพเท่านั้น" },
        { status: 400 }
      );
    }

    if (file.size <= 0) {
      return NextResponse.json(
        { error: "ไฟล์รูปภาพว่างเปล่า" },
        { status: 400 }
      );
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "ไฟล์รูปภาพมีขนาดใหญ่เกินไป (จำกัดไม่เกิน 10MB)" },
        { status: 400 }
      );
    }

    // ไม่ใช้ชื่อไฟล์เดิมจากผู้ใช้เลย (กัน path traversal / ชื่อไฟล์ชนกัน) — ใช้เฉพาะนามสกุลไฟล์
    // ที่ผ่านการตรวจสอบรูปแบบแล้วเท่านั้น ส่วนชื่อไฟล์จริงสุ่มใหม่ทั้งหมดด้วย randomUUID()
    //
    // STEP 26.10 security fix: allowlist นามสกุลรูปภาพจริงเท่านั้น (.php/.html/.js/.svg/.exe ฯลฯ
    // ถูกปฏิเสธเป็น 400) — นามสกุลที่ไม่มีเลยยังผ่านชั้นนี้ได้ (กำหนดนามสกุลจริงหลังตรวจ magic bytes
    // ด้านล่างแทน ดู STEP 27)
    const rawExtension = path.extname(file.name).toLowerCase();

    if (rawExtension && !ALLOWED_IMAGE_EXTENSIONS.has(rawExtension)) {
      return NextResponse.json(
        { error: "รองรับเฉพาะไฟล์นามสกุล .jpg, .jpeg, .png, .gif, .webp เท่านั้น" },
        { status: 400 }
      );
    }

    // STEP 27 security fix: Content-Type ที่ client แจ้งมาต้องเป็น subtype รูปภาพที่ระบบรองรับจริง
    // ด้วย — "image/svg+xml"/"image/bmp" ผ่านเช็ค startsWith("image/") ด้านบนได้ แต่ไม่ใช่ format ที่
    // ตั้งใจรับ ต้องถูกปฏิเสธตรงนี้ก่อนอ่านไฟล์
    const mimeSignatureType =
      MIME_TO_SIGNATURE_TYPE[file.type.split(";")[0].trim().toLowerCase()];

    if (!mimeSignatureType) {
      return NextResponse.json(
        { error: "รองรับเฉพาะไฟล์รูปภาพ JPEG, PNG, GIF, WEBP เท่านั้น" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // STEP 27 security fix: ตรวจ "เนื้อไฟล์จริง" ด้วย magic bytes — ไม่เชื่อ extension/Content-Type
    // ที่ client ส่งมาเพียงอย่างเดียวอีกต่อไป (ทั้งสองปลอมได้ง่ายจากฝั่ง client) ถ้าตรวจ signature
    // ไม่ได้เลย (ไฟล์เสียหาย/ไม่ใช่รูปภาพที่รองรับ) ต้อง reject ทันที ไม่ fallback ยอมรับ (fail closed)
    const detectedSignatureType = detectImageSignatureType(buffer);

    if (!detectedSignatureType) {
      return NextResponse.json(
        { error: "ไม่สามารถตรวจสอบชนิดไฟล์จากเนื้อไฟล์จริงได้ — ไฟล์อาจเสียหายหรือไม่ใช่ไฟล์รูปภาพ" },
        { status: 400 }
      );
    }

    if (detectedSignatureType !== mimeSignatureType) {
      return NextResponse.json(
        { error: "ชนิดไฟล์จริงไม่ตรงกับ Content-Type ที่แจ้งมา" },
        { status: 400 }
      );
    }

    if (rawExtension && EXTENSION_TO_SIGNATURE_TYPE[rawExtension] !== detectedSignatureType) {
      return NextResponse.json(
        { error: "ชนิดไฟล์จริงไม่ตรงกับนามสกุลไฟล์ที่ระบุ" },
        { status: 400 }
      );
    }

    // นามสกุลที่ไม่มีเลยจากผู้ใช้ — เดิม fallback เป็น .jpg แบบเดา ตอนนี้ใช้ชนิดไฟล์จริงที่ตรวจจาก
    // magic bytes แทน (แม่นยำกว่าการเดาเดิม และสอดคล้องกับเนื้อไฟล์จริงเสมอ)
    const safeExtension = rawExtension || signatureTypeToExtension(detectedSignatureType);

    const mediaDirectory = path.join(
      process.cwd(),
      "public",
      "generated",
      "product-media"
    );

    await mkdir(mediaDirectory, { recursive: true });

    const fileName = `product-${productId}-${randomUUID()}${safeExtension}`;
    const filePath = path.join(mediaDirectory, fileName);

    await writeFile(filePath, buffer);

    const imageUrl = `/generated/product-media/${fileName}`;

    const media = insertProductMedia({
      productId,
      fileName,
      imageUrl,
    });

    return NextResponse.json({
      success: true,
      media: {
        productId,
        fileName: media.fileName,
        imageUrl: media.url,
        type: "image",
        source: "product",
      },
    });
  } catch (error) {
    console.error("POST /api/products/[id]/media error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "ไม่สามารถอัปโหลดรูปภาพสินค้าได้",
      },
      { status: 500 }
    );
  }
}
