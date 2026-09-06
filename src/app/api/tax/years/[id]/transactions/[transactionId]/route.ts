import { NextRequest, NextResponse } from "next/server";
import { unlinkTransactionFromTaxYear } from "@/lib/taxYearTransactionLinks";

// STEP 96 — unlink a transaction from a tax year. Only allowed while that link's tax year is still
// OPEN (src/lib/taxYearTransactionLinks.ts) — this is the guard that closes the "unlink to bypass
// the lock" escape hatch.

type RouteContext = {
  params: Promise<{ id: string; transactionId: string }>;
};

function parseId(raw: string): number | null {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { transactionId: transactionIdParam } = await context.params;
    const transactionId = parseId(transactionIdParam);

    if (transactionId === null) {
      return NextResponse.json({ success: false, error: "Invalid transaction ID" }, { status: 400 });
    }

    unlinkTransactionFromTaxYear(transactionId);

    return NextResponse.json({ success: true, data: { transactionId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message === "TAX_YEAR_LINK_NOT_FOUND") {
      return NextResponse.json({ success: false, error: "Link not found" }, { status: 404 });
    }

    if (message === "TAX_YEAR_NOT_OPEN") {
      return NextResponse.json(
        {
          success: false,
          error: "ไม่สามารถยกเลิกการผูกได้ — ปีภาษีนี้ไม่ได้อยู่ในสถานะ OPEN แล้ว",
        },
        { status: 409 }
      );
    }

    console.error("Tax year transaction unlink API error:", error);

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
