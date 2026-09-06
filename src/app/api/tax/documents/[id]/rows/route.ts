import { NextRequest, NextResponse } from "next/server";
import { createTaxDocumentRow, listTaxDocumentRows } from "@/lib/taxDocumentRows";

// STEP 102 — Multi-row Document Row/Event architecture. GET lists every row/event recorded so far
// for one tax_documents row (deterministic row_index order); POST records a new row. No
// fact-extraction/OCR/AI runs here — every field is caller-supplied. Session-gated the same way as
// every other /api/tax/* route (src/proxy.ts's existing `pathname.startsWith("/api/tax/")` rule
// already covers this new prefix — no proxy.ts change needed).

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

function errorToResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";

  const notFoundMessages: Record<string, string> = {
    TAX_DOCUMENT_NOT_FOUND: "Tax document not found",
    TRANSACTION_NOT_FOUND: "Transaction not found",
  };

  if (message in notFoundMessages) {
    return NextResponse.json({ success: false, error: notFoundMessages[message] }, { status: 404 });
  }

  if (message === "TAX_PERIOD_CLOSED") {
    return NextResponse.json(
      { success: false, error: "งวดภาษีของเอกสารนี้ถูกปิดแล้ว ไม่สามารถเพิ่ม/แก้ไข row ได้" },
      { status: 409 }
    );
  }

  if (message === "DUPLICATE_ROW_INDEX") {
    return NextResponse.json(
      { success: false, error: "row นี้ (ลำดับเดียวกัน) มีอยู่ในเอกสารนี้แล้ว" },
      { status: 409 }
    );
  }

  const badRequestMessages: Record<string, string> = {
    INVALID_TAX_DOCUMENT_ID: "tax document ID ไม่ถูกต้อง",
    INVALID_ID: "ID ที่อ้างอิงไม่ถูกต้อง",
    INVALID_ROW_INDEX: "row_index ต้องเป็นจำนวนเต็มไม่ติดลบ",
    INVALID_EVENT_DATE: "event_date ไม่ใช่วันที่ที่ถูกต้อง",
    INVALID_AMOUNT_SATANG: "amount_satang ต้องเป็นจำนวนเต็ม (satang) เท่านั้น",
  };

  if (message in badRequestMessages) {
    return NextResponse.json({ success: false, error: badRequestMessages[message] }, { status: 400 });
  }

  console.error("Tax document rows API error:", error);

  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const taxDocumentId = parseId(idParam);

    if (taxDocumentId === null) {
      return NextResponse.json({ success: false, error: "Invalid tax document ID" }, { status: 400 });
    }

    const rows = listTaxDocumentRows(taxDocumentId);

    return NextResponse.json({ success: true, data: rows, count: rows.length });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const taxDocumentId = parseId(idParam);

    if (taxDocumentId === null) {
      return NextResponse.json({ success: false, error: "Invalid tax document ID" }, { status: 400 });
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

    const row = createTaxDocumentRow({
      taxDocumentId,
      rowIndex: b.rowIndex as number,
      sourceReference: (b.sourceReference as string | null | undefined) ?? null,
      eventDate: (b.eventDate as string | null | undefined) ?? null,
      description: (b.description as string | null | undefined) ?? null,
      amountSatang: (b.amountSatang as number | null | undefined) ?? null,
      rawRowText: (b.rawRowText as string | null | undefined) ?? null,
      transactionId: (b.transactionId as number | null | undefined) ?? null,
      note: (b.note as string | null | undefined) ?? null,
    });

    return NextResponse.json({ success: true, data: row }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
