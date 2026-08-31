import { NextResponse } from "next/server";
import { getCostSummary } from "@/lib/costLedger";
import { getCostCurrency } from "@/lib/costConfig";

export const runtime = "nodejs";

// GET /api/costs/summary — STEP 21
//
// สรุปภาพรวมต้นทุน AI ทั้งระบบสำหรับ AI Cost Dashboard (วันนี้/เดือนนี้, estimated/actual แยกกัน
// ชัดเจน, จำนวน generation, ต้นทุนเฉลี่ยต่อสินค้า/คลิป, provider breakdown, operation breakdown)
//
// actualCost เป็น null (ไม่ใช่ 0) เสมอเมื่อไม่มีข้อมูล billing จริง — ห้ามตีความว่าใช้เงินจริง 0 บาท
export async function GET() {
  try {
    const summary = getCostSummary();

    return NextResponse.json({
      success: true,
      currency: getCostCurrency(),
      summary,
    });
  } catch (error) {
    console.error("GET /api/costs/summary error:", error);

    return NextResponse.json(
      { error: "ไม่สามารถโหลดสรุปต้นทุน AI ได้" },
      { status: 500 }
    );
  }
}
