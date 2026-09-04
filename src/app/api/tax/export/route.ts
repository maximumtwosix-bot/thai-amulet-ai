import { NextRequest, NextResponse } from "next/server";
import { getTaxSummary, parseTaxSummaryParams, type TaxSummaryTransaction } from "@/lib/taxSummary";
import { ORDER_STATUS_LABELS } from "@/lib/orderStatus";

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

// STEP TAX-2 — per the TAX-1 audit finding: the export previously included cancelled-order income
// in "รายรับรวม" with no flag anywhere in the file, risking an overstated taxable-income figure if
// used directly for filing. Reuses ORDER_STATUS_LABELS (src/lib/orderStatus.ts, STEP 32's single
// shared source of truth — already used by src/app/tax/page.tsx for the same purpose) rather than a
// fourth local duplicate. Falls back to the raw status string for any unrecognized value — must
// never crash the export over an unexpected value, matching this codebase's established convention.
function orderStatusLabel(status: string | null): string {
  if (!status) return "";
  return (ORDER_STATUS_LABELS as Record<string, string>)[status] ?? status;
}

// Scoped narrowly to the exact TAX-1 finding — cancelled orders only (not STEP 67's separate
// "returned-but-not-cancelled" carve-out, which is a Profit-report-only rule per profitSummary.ts
// and was not the audited gap here). Only ever true for income rows — an expense row is never
// mis-read as revenue regardless of any order link.
function isCancelledOrderIncomeRow(t: Pick<TaxSummaryTransaction, "transactionType" | "linkedOrderStatus">): boolean {
  return t.transactionType === "income" && t.linkedOrderStatus === "cancelled";
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
      // STEP TAX-2 — appended at the end (never inserted mid-row) so any existing consumer relying
      // on the original 11 column positions is unaffected; these two are purely additive.
      "สถานะออเดอร์ที่เกี่ยวข้อง",
      "คำเตือนภาษี",
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
        orderStatusLabel(t.linkedOrderStatus),
        isCancelledOrderIncomeRow(t)
          ? "⚠️ ออเดอร์นี้ถูกยกเลิก — ไม่ควรนับเป็นรายได้ที่ต้องเสียภาษี"
          : "",
      ]);
    }

    // STEP TAX-2 — computed purely by filtering the SAME summary.transactions array already
    // returned by getTaxSummary() (src/lib/taxSummary.ts) — zero new query, zero change to that
    // file's own totals/logic (explicitly out of scope, per the TAX-1 audit's approved fix and this
    // STEP's own instructions). orderId is deduplicated via a Set because STEP 34's duplicate-
    // income-per-order guard means this is normally 1:1 with row count, but counting distinct orders
    // rather than rows is the more defensively correct definition of "how many cancelled orders".
    const cancelledIncomeRows = summary.transactions.filter(isCancelledOrderIncomeRow);
    const cancelledIncomeTotal = cancelledIncomeRows.reduce((sum, t) => sum + t.amount, 0);
    const cancelledOrderCount = new Set(cancelledIncomeRows.map((t) => t.orderId)).size;
    const taxSafeIncomeTotal = summary.totalIncome - cancelledIncomeTotal;

    csv += "\r\n";
    csv += csvRow(["สรุป", `${summary.period.dateFrom} ถึง ${summary.period.dateTo}`]);
    csv += csvRow(["รายรับรวม", summary.totalIncome]);
    csv += csvRow(["รายจ่ายรวม", summary.totalExpense]);
    csv += csvRow(["สุทธิ", summary.netIncome]);
    csv += csvRow(["จำนวนรายการ", summary.transactionCount]);

    // STEP TAX-2 — the TAX-1 audit's approved fix: "รายรับรวม" above is left completely unchanged
    // (still the raw, cancellation-inclusive figure — same number GET /api/tax/summary and the Tax
    // UI show, per STEP 32's rule that cancellation never changes Finance/Tax totals). This block is
    // purely additive, giving the file itself an explicit, impossible-to-miss adjusted figure so a
    // reader is never left to discover the cancelled-order overstatement risk on their own.
    csv += "\r\n";
    csv += csvRow(["คำเตือนสำหรับการยื่นภาษี — ออเดอร์ที่ยกเลิก"]);
    csv += csvRow([
      "รายรับรวมด้านบนยังคงรวมรายรับจากออเดอร์ที่ถูกยกเลิก (ตามกฎเดิมของระบบ — ไม่มีการแก้ไขในจุดนี้) กรุณาใช้ตัวเลขด้านล่างเพื่อประเมินรายได้ที่ต้องเสียภาษีจริง",
    ]);
    csv += csvRow(["รายรับจากออเดอร์ที่ยกเลิก (ไม่ควรนับเป็นรายได้)", cancelledIncomeTotal]);
    csv += csvRow(["จำนวนออเดอร์ที่ยกเลิกซึ่งรวมอยู่ในรายรับรวมด้านบน", cancelledOrderCount]);
    csv += csvRow(["รายรับรวม ไม่รวมออเดอร์ที่ยกเลิก (แนะนำสำหรับคำนวณภาษี)", taxSafeIncomeTotal]);

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
