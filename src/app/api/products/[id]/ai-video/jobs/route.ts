import { NextResponse } from "next/server";
import { listAiVideoJobs } from "@/lib/aiVideoJobs";

export const runtime = "nodejs";

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

// GET /api/products/[id]/ai-video/jobs — ประวัติ AI Video job ทั้งหมดของสินค้านี้ (ไม่ poll ซ้ำ)
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

    const jobs = listAiVideoJobs(productId);

    return NextResponse.json({ success: true, jobs });
  } catch (error) {
    console.error("GET /api/products/[id]/ai-video/jobs error:", error);

    return NextResponse.json(
      { error: "ไม่สามารถโหลดประวัติงานสร้างวิดีโอด้วย AI ได้" },
      { status: 500 }
    );
  }
}
