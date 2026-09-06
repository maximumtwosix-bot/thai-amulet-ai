import { NextRequest, NextResponse } from "next/server";
import { correctFact } from "@/lib/extractedFacts";

// STEP 104 — the ONLY correction path. Never rewrites the old fact's value fields (even if
// CONFIRMED) — creates a brand-new extracted_facts row under the caller-supplied extraction run
// (typically a fresh MANUAL run created via POST /api/tax/extraction-runs first) and links the old
// fact's superseded_by_fact_id to it. Source evidence (tax_documents/tax_document_rows) is never
// touched by this endpoint.

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
    EXTRACTED_FACT_NOT_FOUND: "Extracted fact not found",
    EXTRACTION_RUN_NOT_FOUND: "Extraction run not found",
  };

  if (message in notFoundMessages) {
    return NextResponse.json({ success: false, error: notFoundMessages[message] }, { status: 404 });
  }

  if (message === "FACT_ALREADY_SUPERSEDED") {
    return NextResponse.json(
      { success: false, error: "fact นี้ถูกแก้ไข (superseded) ไปแล้ว ไม่สามารถแก้ไขซ้ำได้" },
      { status: 409 }
    );
  }

  if (message === "TAX_PERIOD_CLOSED") {
    return NextResponse.json(
      { success: false, error: "งวดภาษีของเอกสารนี้ถูกปิดแล้ว ไม่สามารถแก้ไข fact ได้" },
      { status: 409 }
    );
  }

  if (message === "EXTRACTION_RUN_NOT_RUNNING") {
    return NextResponse.json(
      { success: false, error: "extraction run ที่ระบุไม่ได้อยู่ในสถานะ RUNNING แล้ว" },
      { status: 409 }
    );
  }

  if (message === "DUPLICATE_FACT") {
    return NextResponse.json(
      { success: false, error: "fact ที่แก้ไข (key/occurrence เดียวกัน) มีอยู่ใน run นี้แล้ว" },
      { status: 409 }
    );
  }

  const badRequestMessages: Record<string, string> = {
    INVALID_ID: "ID ที่อ้างอิงไม่ถูกต้อง",
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

  console.error("Fact correction API error:", error);

  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const oldFactId = parseId(idParam);

    if (oldFactId === null) {
      return NextResponse.json({ success: false, error: "Invalid fact ID" }, { status: 400 });
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

    const result = correctFact(oldFactId, {
      extractionRunId: b.extractionRunId as number,
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

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
