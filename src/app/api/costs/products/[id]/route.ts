import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCostCurrency } from "@/lib/costConfig";
import { getProductAiCost, listClipAiCostsForProduct } from "@/lib/costLedger";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type Product = { id: number; name: string };

function parseProductId(rawId: string): number | null {
  const productId = Number(rawId);

  if (!Number.isInteger(productId) || productId <= 0) {
    return null;
  }

  return productId;
}

// GET /api/costs/products/[id] — STEP 21
//
// ต้นทุน AI ทั้งหมดของสินค้าหนึ่งชิ้น รวมทุก generation (text/image/video/voice) ที่เคยเรียกจริง
// ไม่ใช่แค่ไฟล์ล่าสุด — แยก Content/Image/Video/Voice/Other และ estimated/actual ชัดเจน
// พร้อมรายการ "คลิป" (ai_video_job) แต่ละอันของสินค้านี้ต้นทุนแยกราย clip
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const productId = parseProductId(id);

    if (productId === null) {
      return NextResponse.json({ error: "กรุณาระบุรหัสสินค้าให้ถูกต้อง" }, { status: 400 });
    }

    const product = db
      .prepare("SELECT id, name FROM products WHERE id = ?")
      .get(productId) as Product | undefined;

    if (!product) {
      return NextResponse.json({ error: `ไม่พบสินค้ารหัส ${productId}` }, { status: 404 });
    }

    const cost = getProductAiCost(productId);
    const clips = listClipAiCostsForProduct(productId);

    return NextResponse.json({
      success: true,
      currency: getCostCurrency(),
      product: { id: product.id, name: product.name },
      cost,
      clips,
    });
  } catch (error) {
    console.error("GET /api/costs/products/[id] error:", error);

    return NextResponse.json({ error: "ไม่สามารถโหลดต้นทุน AI ของสินค้าได้" }, { status: 500 });
  }
}
