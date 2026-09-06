import { NextRequest, NextResponse } from "next/server";
import { createExtractedFact } from "@/lib/extractedFacts";

// STEP 104 — create a fact under one extraction run. tax_document_id is always derived server-side
// from the run (src/lib/extractedFacts.ts) — never accepted from the client.

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
    EXTRACTION_RUN_NOT_FOUND: "Extraction run not found",
    TAX_DOCUMENT_ROW_NOT_FOUND: "Tax document row not found",
  };

  if (message in notFoundMessages) {
    return NextResponse.json({ success: false, error: notFoundMessages[message] }, { status: 404 });
  }

  if (message === "TAX_PERIOD_CLOSED") {
    return NextResponse.json(
      { success: false, error: "งวดภาษีของเอกสารนี้ถูกปิดแล้ว ไม่สามารถเพิ่ม fact ได้" },
      { status: 409 }
    );
  }

  if (message === "EXTRACTION_RUN_NOT_RUNNING") {
    return NextResponse.json(
      { success: false, error: "extraction run นี้ไม่ได้อยู่ในสถานะ RUNNING แล้ว" },
      { status: 409 }
    );
  }

  if (message === "ROW_DOCUMENT_MISMATCH") {
    return NextResponse.json(
      { success: false, error: "row ที่ระบุไม่ได้เป็นของเอกสารเดียวกับ extraction run นี้" },
      { status: 400 }
    );
  }

  if (message === "DUPLICATE_FACT") {
    return NextResponse.json(
      { success: false, error: "fact นี้ (key/occurrence เดียวกัน) มีอยู่ใน run นี้แล้ว" },
      { status: 409 }
    );
  }

  const badRequestMessages: Record<string, string> = {
    INVALID_ID: "ID ที่อ้างอิงไม่ถูกต้อง",
    INVALID_FACT_KEY: "factKey ไม่ถูกต้อง (ต้องเป็นตัวพิมพ์เล็ก/ตัวเลข/underscore คั่นด้วยจุด)",
    INVALID_OCCURRENCE_INDEX: "occurrenceIndex ต้องเป็นจำนวนเต็มไม่ติดลบ",
    INVALID_VALUE_TYPE: "valueType ต้องเป็น MONEY, DATE, DATETIME, STRING, BOOLEAN, IDENTIFIER หรือ ENUM",
    INVALID_VALUE_MONEY_SATANG: "value สำหรับ MONEY ต้องเป็นจำนวนเต็ม (satang) เท่านั้น",
    INVALID_CURRENCY: "currency ต้องเป็นรหัส 3 ตัวอักษร (เช่น THB)",
    INVALID_VALUE_DATE: "value สำหรับ DATE ต้องเป็น YYYY-MM-DD ที่ถูกต้อง",
    INVALID_VALUE_DATETIME: "value สำหรับ DATETIME ต้องเป็น YYYY-MM-DD HH:MM:SS ที่ถูกต้อง (UTC)",
    INVALID_VALUE_BOOLEAN: "value สำหรับ BOOLEAN ต้องเป็น true/false",
    INVALID_VALUE_TEXT: "value ไม่ถูกต้องหรือยาวเกินไป",
    SOURCE_FIELD_LABEL_TOO_LONG: "sourceFieldLabel ยาวเกินไป",
    INVALID_CONFIDENCE: "confidence ต้องอยู่ระหว่าง 0 ถึง 1",
  };

  if (message in badRequestMessages) {
    return NextResponse.json({ success: false, error: badRequestMessages[message] }, { status: 400 });
  }

  console.error("Extracted facts create API error:", error);

  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const extractionRunId = parseId(idParam);

    if (extractionRunId === null) {
      return NextResponse.json({ success: false, error: "Invalid extraction run ID" }, { status: 400 });
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

    const fact = createExtractedFact({
      extractionRunId,
      taxDocumentRowId: (b.taxDocumentRowId as number | null | undefined) ?? null,
      factKey: b.factKey as string,
      occurrenceIndex: (b.occurrenceIndex as number | null | undefined) ?? null,
      valueType: b.valueType as string,
      valueMoneySatang: (b.valueMoneySatang as number | null | undefined) ?? null,
      valueDate: (b.valueDate as string | null | undefined) ?? null,
      valueDatetime: (b.valueDatetime as string | null | undefined) ?? null,
      valueText: (b.valueText as string | null | undefined) ?? null,
      valueBoolean: (b.valueBoolean as boolean | null | undefined) ?? null,
      currency: (b.currency as string | null | undefined) ?? null,
      sourceFieldLabel: (b.sourceFieldLabel as string | null | undefined) ?? null,
      confidence: (b.confidence as number | null | undefined) ?? null,
    });

    return NextResponse.json({ success: true, data: fact }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
