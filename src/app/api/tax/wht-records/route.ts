import { NextRequest, NextResponse } from "next/server";
import { createWhtRecord, listWhtRecords, type WhtRecordRow } from "@/lib/whtRecords";

// STEP 94 — API layer for WHT Records (Type A only — tax withheld FROM this taxpayer's own income;
// see src/lib/db.ts's wht_records schema comment). Auth is NOT re-checked here — same convention as
// every other admin API in this codebase; already reachable only via a valid session because
// src/proxy.ts's isProtectedApi() already matches the whole "/api/tax/" prefix (STEP 22) — no
// proxy.ts change was needed for this STEP either.

function errorToResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";

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
        error: "ไม่สามารถบันทึกได้ — ปีภาษีนี้ไม่ได้อยู่ในสถานะ OPEN แล้ว",
      },
      { status: 409 }
    );
  }

  const badRequestMessages: Record<string, string> = {
    INVALID_TAX_YEAR_ID: "กรุณาระบุ taxYearId ที่ถูกต้อง",
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

  console.error("WHT records API error:", error);

  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}

// Never show more than the last 4 characters of the payer's tax ID — same masking shape/reasoning
// as taxpayer-profile's maskTaxpayerId() and bank-accounts' maskAccountNumber().
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    function parsePositiveIntParam(name: string): number | undefined {
      const raw = searchParams.get(name);
      if (raw === null || raw === "") return undefined;

      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`INVALID_${name.toUpperCase()}_PARAM`);
      }

      return parsed;
    }

    let taxpayerProfileId: number | undefined;
    let taxYearId: number | undefined;
    let transactionId: number | undefined;

    try {
      taxpayerProfileId = parsePositiveIntParam("taxpayerProfileId");
      taxYearId = parsePositiveIntParam("taxYearId");
      transactionId = parsePositiveIntParam("transactionId");
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid filter parameter" },
        { status: 400 }
      );
    }

    const rows = listWhtRecords({ taxpayerProfileId, taxYearId, transactionId });

    return NextResponse.json({ success: true, data: rows.map(toListItem), count: rows.length });
  } catch (error) {
    return errorToResponse(error);
  }
}

// Only known fields are ever read off the request body — taxpayerProfileId is never accepted (see
// src/lib/whtRecords.ts's createWhtRecord() comment: it is always derived from taxYearId).
export async function POST(request: NextRequest) {
  try {
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
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const b = body as Record<string, unknown>;

    const record = createWhtRecord({
      taxYearId: b.taxYearId as number,
      transactionId: (b.transactionId as number | null | undefined) ?? null,
      payerName: String(b.payerName || ""),
      payerTaxId: (b.payerTaxId as string | null | undefined) ?? null,
      certificateNumber: (b.certificateNumber as string | null | undefined) ?? null,
      certificateDate: (b.certificateDate as string | null | undefined) ?? null,
      grossAmount: b.grossAmount as number,
      withheldAmount: b.withheldAmount as number,
      note: (b.note as string | null | undefined) ?? null,
    });

    return NextResponse.json({ success: true, data: toListItem(record) }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
