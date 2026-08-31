import { NextRequest, NextResponse } from "next/server";
import { getTaxSummary, parseTaxSummaryParams } from "@/lib/taxSummary";

export const runtime = "nodejs";

function errorToResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";

  const badRequestMessages: Record<string, string> = {
    YEAR_REQUIRED: "Provide either year (optionally with month), or both dateFrom and dateTo",
    INVALID_YEAR: "year must be an integer between 2000 and 2100",
    INVALID_MONTH: "month must be an integer between 1 and 12",
    INVALID_DATE_RANGE: "dateFrom/dateTo must be valid dates",
    INVALID_DATE_RANGE_ORDER: "dateFrom must not be after dateTo",
  };

  if (message in badRequestMessages) {
    return NextResponse.json(
      { success: false, error: badRequestMessages[message] },
      { status: 400 }
    );
  }

  console.error("Tax export API error:", error);

  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}

// RFC 4180-style escaping — quote a field only when it contains a comma, quote, or newline; double
// up any internal quotes. No CSV library needed for this, matching the rest of this codebase's
// preference for zero new dependencies.
function csvField(value: string | number | boolean | null): string {
  const text = value === null || value === undefined ? "" : String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function csvRow(fields: Array<string | number | boolean | null>): string {
  return fields.map(csvField).join(",") + "\r\n";
}

// GET /api/tax/export — CSV of every transaction in the period (enough detail to continue
// bookkeeping outside the app) plus a summary block at the end. Same params as /api/tax/summary.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const params = parseTaxSummaryParams(searchParams);

    const summary = getTaxSummary(params);

    let csv = "﻿"; // BOM — ให้ Excel เปิดไฟล์ CSV ภาษาไทยแล้วอ่าน UTF-8 ถูกต้อง ไม่เพี้ยนเป็น mojibake

    csv += csvRow([
      "วันที่",
      "ประเภท",
      "หมวดหมู่",
      "ช่องทางการขาย",
      "จำนวนเงิน",
      "รายละเอียด",
      "วิธีชำระเงิน",
      "รหัสสินค้า",
      "รหัสออเดอร์",
      "มีไฟล์แนบ",
      "หมายเหตุ",
    ]);

    for (const t of summary.transactions) {
      csv += csvRow([
        t.transactionDate,
        t.transactionType === "income" ? "รายรับ" : "รายจ่าย",
        t.category,
        t.salesChannel || "",
        t.amount,
        t.description || "",
        t.paymentMethod || "",
        t.productId ?? "",
        t.orderId ?? "",
        t.hasAttachment ? "มี" : "ไม่มี",
        t.notes || "",
      ]);
    }

    csv += "\r\n";
    csv += csvRow(["สรุป", `${summary.period.dateFrom} ถึง ${summary.period.dateTo}`]);
    csv += csvRow(["รายรับรวม", summary.totalIncome]);
    csv += csvRow(["รายจ่ายรวม", summary.totalExpense]);
    csv += csvRow(["สุทธิ", summary.netIncome]);
    csv += csvRow(["จำนวนรายการ", summary.transactionCount]);

    csv += "\r\n";
    csv += csvRow(["รายรับตามช่องทางการขาย"]);
    csv += csvRow(["ช่องทาง", "ยอดรวม", "จำนวนรายการ"]);
    for (const c of summary.incomeBySalesChannel) {
      csv += csvRow([c.salesChannel, c.total, c.count]);
    }

    csv += "\r\n";
    csv += csvRow(["รายจ่ายตามหมวดหมู่"]);
    csv += csvRow(["หมวดหมู่", "ยอดรวม", "จำนวนรายการ"]);
    for (const c of summary.expenseByCategory) {
      csv += csvRow([c.category, c.total, c.count]);
    }

    const fileName = `tax-summary-${summary.period.dateFrom}_to_${summary.period.dateTo}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
