import { NextRequest, NextResponse } from "next/server";
import { getWhtRecordById, updateWhtRecord, type WhtRecordRow } from "@/lib/whtRecords";
import { resolveWhtRecordOwner } from "@/lib/taxOwnership";
import { SESSION_COOKIE_NAME, resolveSessionTaxpayerId } from "@/lib/auth";

// STEP 94 — single WHT record detail/update. Full payerTaxId IS included on GET by design (unlike
// the list endpoint) — same precedent as GET /api/tax/taxpayer-profile/[id] and
// GET /api/bank-accounts/[id]. No DELETE — see src/lib/db.ts's wht_records schema comment for why.

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(idParam: string): number | null {
  const id = Number(idParam);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

function maskPayerTaxId(payerTaxId: string | null): string | null {
  if (payerTaxId === null) return null;
  if (!payerTaxId) return "••••";

  return `••••${payerTaxId.slice(-4)}`;
}

type WhtRecordListItem = Omit<WhtRecordRow, "payerTaxId"> & {
  payerTaxIdMasked: string | null;
};

function toListItem(row: WhtRecordRow): WhtRecordListItem {
  return {
    id: row.id,
    taxpayerProfileId: row.taxpayerProfileId,
    taxYearId: row.taxYearId,
    transactionId: row.transactionId,
    payerName: row.payerName,
    payerTaxIdMasked: maskPayerTaxId(row.payerTaxId),
    certificateNumber: row.certificateNumber,
    certificateDate: row.certificateDate,
    grossAmount: row.grossAmount,
    withheldAmount: row.withheldAmount,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function errorToResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";

  if (message === "WHT_RECORD_NOT_FOUND") {
    return NextResponse.json({ success: false, error: "WHT record not found" }, { status: 404 });
  }

  if (message === "TAX_YEAR_NOT_FOUND") {
    return NextResponse.json({ success: false, error: "Tax year not found" }, { status: 404 });
  }

  if (message === "TRANSACTION_NOT_FOUND") {
    return NextResponse.json({ success: false, error: "Transaction not found" }, { status: 404 });
  }

  if (message === "TAX_YEAR_NOT_OPEN") {
    return NextResponse.json(
      {
        success: false,
        error: "ไม่สามารถแก้ไขได้ — ปีภาษีนี้ไม่ได้อยู่ในสถานะ OPEN แล้ว",
      },
      { status: 409 }
    );
  }

  const badRequestMessages: Record<string, string> = {
    INVALID_TRANSACTION_ID: "transactionId ไม่ถูกต้อง",
    INVALID_PAYER_NAME: "กรุณาระบุชื่อผู้หักภาษี ณ ที่จ่าย",
    PAYER_TAX_ID_TOO_LONG: "payerTaxId ยาวเกินไป (ไม่เกิน 64 ตัวอักษร)",
    CERTIFICATE_NUMBER_TOO_LONG: "certificateNumber ยาวเกินไป (ไม่เกิน 64 ตัวอักษร)",
    INVALID_CERTIFICATE_DATE: "certificateDate ไม่ใช่วันที่ที่ถูกต้อง",
    INVALID_GROSS_AMOUNT: "grossAmount ต้องเป็นตัวเลขมากกว่า 0",
    INVALID_WITHHELD_AMOUNT: "withheldAmount ต้องเป็นตัวเลขมากกว่า 0",
    WITHHELD_EXCEEDS_GROSS: "withheldAmount ต้องไม่มากกว่า grossAmount",
  };

  if (message in badRequestMessages) {
    return NextResponse.json(
      { success: false, error: badRequestMessages[message] },
      { status: 400 }
    );
  }

  if (message === "DUPLICATE_CERTIFICATE_NUMBER") {
    return NextResponse.json(
      { success: false, error: "มีเลขที่ใบรับรองหักภาษี ณ ที่จ่ายนี้ของผู้เสียภาษีรายนี้อยู่แล้ว" },
      { status: 409 }
    );
  }

  console.error("WHT record detail API error:", error);

  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json({ success: false, error: "Invalid WHT record ID" }, { status: 400 });
    }

    const record = getWhtRecordById(id);

    if (!record) {
      return NextResponse.json({ success: false, error: "WHT record not found" }, { status: 404 });
    }

    // STEP 118 — reporting-only ownership check (same pattern as STEP 116's
    // GET /api/tax/documents/[id]). READ-ONLY: resolveWhtRecordOwner() (src/lib/taxOwnership.ts,
    // STEP 114) and resolveSessionTaxpayerId() (decodes the already-verified session cookie,
    // src/lib/auth.ts) are both pure reads. Purely additive to the response; never denies access,
    // never changes the status code above, never alters `success`/`data`.
    const ownership = resolveWhtRecordOwner(record.id);
    const sessionTaxpayerId = resolveSessionTaxpayerId(request.cookies.get(SESSION_COOKIE_NAME)?.value);

    let sessionTaxpayerMatch: "MATCH" | "MISMATCH" | "SESSION_TAXPAYER_UNAVAILABLE" | "NOT_APPLICABLE";

    if (sessionTaxpayerId === null) {
      sessionTaxpayerMatch = "SESSION_TAXPAYER_UNAVAILABLE";
    } else if (ownership.status !== "RESOLVED") {
      sessionTaxpayerMatch = "NOT_APPLICABLE";
    } else {
      sessionTaxpayerMatch = ownership.taxpayerProfileId === sessionTaxpayerId ? "MATCH" : "MISMATCH";
    }

    return NextResponse.json({
      success: true,
      data: record,
      ownerStatus: ownership.status,
      sessionTaxpayerMatch,
    });
  } catch (error) {
    return errorToResponse(error);
  }
}

// Edit only the safe/descriptive fields — taxpayerProfileId and taxYearId are never accepted here
// (identity fields, see src/lib/whtRecords.ts's updateWhtRecord() comment). Rejected with 409 if the
// record's linked tax year is no longer OPEN.
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json({ success: false, error: "Invalid WHT record ID" }, { status: 400 });
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body (must be JSON)" },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
    }

    const b = body as Record<string, unknown>;

    const patch: Record<string, unknown> = {};

    if (b.transactionId !== undefined) patch.transactionId = b.transactionId;
    if (b.payerName !== undefined) patch.payerName = String(b.payerName);
    if (b.payerTaxId !== undefined) patch.payerTaxId = b.payerTaxId;
    if (b.certificateNumber !== undefined) patch.certificateNumber = b.certificateNumber;
    if (b.certificateDate !== undefined) patch.certificateDate = b.certificateDate;
    if (b.grossAmount !== undefined) patch.grossAmount = b.grossAmount;
    if (b.withheldAmount !== undefined) patch.withheldAmount = b.withheldAmount;
    if (b.note !== undefined) patch.note = b.note;

    const record = updateWhtRecord(id, patch);

    return NextResponse.json({ success: true, data: toListItem(record) });
  } catch (error) {
    return errorToResponse(error);
  }
}
