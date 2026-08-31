import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getVideoProvider } from "@/lib/ai/video";
import { buildAmuletVideoPrompt } from "@/lib/ai/promptBuilder";
import { insertAiVideoJob, setAiVideoJobExternalId, markAiVideoJobFailed } from "@/lib/aiVideoJobs";
import { calculateEstimatedCost } from "@/lib/costConfig";
import { finalizeAiGenerationCost, recordAiGeneration } from "@/lib/costLedger";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type Product = {
  id: number;
  name: string;
  category: string | null;
};

function parseProductId(rawId: string): number | null {
  const productId = Number(rawId);

  if (!Number.isInteger(productId) || productId <= 0) {
    return null;
  }

  return productId;
}

// POST /api/products/[id]/ai-video/generate — เริ่ม async job สร้างวิดีโอด้วย AI (Replicate)
// ไม่ block รอผลเสร็จ (video generation ใช้เวลานาน) — คืน jobId ให้ client poll ต่อผ่าน
// GET /api/products/[id]/ai-video/jobs/[jobId]
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

    const product = db
      .prepare("SELECT id, name, category FROM products WHERE id = ?")
      .get(productId) as Product | undefined;

    if (!product) {
      return NextResponse.json(
        { error: `ไม่พบสินค้ารหัส ${productId}` },
        { status: 404 }
      );
    }

    const provider = getVideoProvider();
    const connection = await provider.validateConnection();

    // ห้าม fake success — เช็ค connection จริงก่อนเสมอ ไม่แตะ DB เลยถ้ายังไม่พร้อม
    if (connection.status === "not_configured") {
      return NextResponse.json(
        {
          success: false,
          status: "not_configured",
          error: `ยังไม่ได้ตั้งค่าการเชื่อมต่อ AI Video Generation (${provider.name})`,
        },
        { status: 503 }
      );
    }

    if (connection.status === "error") {
      return NextResponse.json(
        {
          success: false,
          status: "error",
          error: connection.message || `ไม่สามารถเชื่อมต่อ ${provider.name} ได้`,
        },
        { status: 502 }
      );
    }

    // STEP 19: รับ prompt กำหนดเองได้ (เช่นจาก Content Plan's video_prompt) — ทางเลือกเท่านั้น
    // ไม่มี body หรือ body ไม่ใช่ JSON ก็ยังทำงานได้ปกติ (fallback ไป buildAmuletVideoPrompt เดิม)
    // STEP 21: รับ contentPlanId เพิ่มเติมได้ (optional) เพื่อผูก AI Cost Ledger กลับไปยังแผนที่สั่งสร้าง
    // วิดีโอนี้ — ถ้าไม่ส่งมาก็ยังทำงานได้ปกติทุกประการ เหมือนเดิม
    let customPrompt = "";
    let contentPlanId: number | null = null;

    try {
      const body = (await request.json()) as { prompt?: string; contentPlanId?: number };

      if (typeof body?.prompt === "string") {
        customPrompt = body.prompt.trim();
      }

      if (
        typeof body?.contentPlanId === "number" &&
        Number.isInteger(body.contentPlanId) &&
        body.contentPlanId > 0
      ) {
        contentPlanId = body.contentPlanId;
      }
    } catch {
      // ไม่มี body หรือ body ไม่ใช่ JSON — ใช้ prompt อัตโนมัติตามเดิม ไม่ถือเป็น error
    }

    if (customPrompt.length > 2000) {
      return NextResponse.json(
        { error: "prompt ยาวเกินไป (สูงสุด 2000 ตัวอักษร)" },
        { status: 400 }
      );
    }

    const prompt = customPrompt || buildAmuletVideoPrompt(product);

    const job = insertAiVideoJob({
      productId,
      provider: provider.name,
      prompt,
    });

    // STEP 21: video generation เป็น async job — ledger นี้ยังไม่ finalize ตรงนี้ (ไม่รู้ผลจริงจนกว่า
    // provider จะยืนยันว่า succeeded/failed) การ finalize เกิดที่ GET .../jobs/[jobId] เมื่อ poll
    // สถานะจริงแล้วเท่านั้น (ดู finalizeAiGenerationCostByAiVideoJobId) estimated cost ตรงนี้เป็นแค่
    // ราคาประมาณการแบบ flat ต่อการเริ่มงาน 1 ครั้ง (ยังไม่รู้ duration จริง)
    const initialEstimate = calculateEstimatedCost({
      provider: "replicate",
      operation: "video",
      durationSeconds: null,
    });

    const ledger = recordAiGeneration({
      productId,
      contentPlanId,
      aiVideoJobId: job.id,
      provider: "replicate",
      model: process.env.REPLICATE_VIDEO_MODEL || null,
      operation: "video_generate",
      estimatedCost: initialEstimate.cost,
    });

    try {
      const created = await provider.createJob({ prompt });

      setAiVideoJobExternalId(job.id, created.externalJobId);

      return NextResponse.json(
        {
          success: true,
          jobId: job.id,
          status: "processing",
          message: "เริ่มสร้างวิดีโอด้วย AI แล้ว — ใช้เวลาสักครู่ ตรวจสถานะได้ที่ jobId นี้",
        },
        { status: 202 }
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "ไม่สามารถเริ่มสร้างวิดีโอด้วย AI ได้";

      markAiVideoJobFailed(job.id, message);

      finalizeAiGenerationCost(ledger.id, {
        status: "failed",
        metadataPatch: { error: message, pricingReason: initialEstimate.reason },
      });

      console.error(`POST /api/products/${productId}/ai-video/generate error:`, message);

      return NextResponse.json(
        { success: false, status: "failed", jobId: job.id, error: message },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error("POST /api/products/[id]/ai-video/generate error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "ไม่สามารถเริ่มสร้างวิดีโอด้วย AI ได้",
      },
      { status: 500 }
    );
  }
}
