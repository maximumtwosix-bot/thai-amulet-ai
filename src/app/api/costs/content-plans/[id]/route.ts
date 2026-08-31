import { NextResponse } from "next/server";
import { getContentPlanById } from "@/lib/contentPlans";
import { getCostCurrency } from "@/lib/costConfig";
import { getContentPlanAiCost } from "@/lib/costLedger";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(rawId: string): number | null {
  const value = Number(rawId);

  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

// GET /api/costs/content-plans/[id] — STEP 21
//
// ต้นทุน AI ทั้งหมดที่ trace กลับมายัง content plan นี้ได้ (text ที่สร้างแผนนี้ + image/video ที่สร้าง
// จาก image_prompt/video_prompt ของแผนนี้) — ไม่ใช่แค่ generation ล่าสุด รวมทุกครั้งที่เคยเรียกจริง
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const contentPlanId = parseId(id);

    if (contentPlanId === null) {
      return NextResponse.json({ error: "กรุณาระบุรหัส Content Plan ให้ถูกต้อง" }, { status: 400 });
    }

    const plan = getContentPlanById(contentPlanId);

    if (!plan) {
      return NextResponse.json({ error: `ไม่พบ Content Plan รหัส ${contentPlanId}` }, { status: 404 });
    }

    const cost = getContentPlanAiCost(contentPlanId);

    return NextResponse.json({
      success: true,
      currency: getCostCurrency(),
      contentPlan: { id: plan.id, productId: plan.productId, contentType: plan.contentType },
      cost,
    });
  } catch (error) {
    console.error("GET /api/costs/content-plans/[id] error:", error);

    return NextResponse.json(
      { error: "ไม่สามารถโหลดต้นทุน AI ของ Content Plan ได้" },
      { status: 500 }
    );
  }
}
