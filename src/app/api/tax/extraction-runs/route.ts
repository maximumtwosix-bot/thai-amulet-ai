import { NextRequest, NextResponse } from "next/server";
import { createExtractionRun, listExtractionRunsForDocument } from "@/lib/extractionRuns";

// STEP 104 — Fact Extraction Storage. GET lists extraction runs for one document; POST starts a
// new run (parser/OCR/AI/manual-entry session). No extraction CODE runs here — this only records
// the bookkeeping of an attempt a caller declares. Session-gated by src/proxy.ts's existing
// `pathname.startsWith("/api/tax/")` rule — no proxy.ts change needed.

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
  };

  if (message in notFoundMessages) {
    return NextResponse.json({ success: false, error: notFoundMessages[message] }, { status: 404 });
  }

  if (message === "TAX_PERIOD_CLOSED") {
    return NextResponse.json(
      { success: false, error: "งวดภาษีของเอกสารนี้ถูกปิดแล้ว ไม่สามารถเริ่ม extraction run ได้" },
      { status: 409 }
    );
  }

  const badRequestMessages: Record<string, string> = {
    INVALID_ID: "ID ที่อ้างอิงไม่ถูกต้อง",
    INVALID_EXTRACTION_METHOD: "extractionMethod ต้องเป็น MANUAL, DETERMINISTIC_PARSER, OCR หรือ AI",
    EXTRACTOR_PROVIDER_TOO_LONG: "extractorProvider ยาวเกินไป",
    EXTRACTOR_VERSION_TOO_LONG: "extractorVersion ยาวเกินไป",
    MODEL_IDENTIFIER_TOO_LONG: "modelIdentifier ยาวเกินไป",
  };

  if (message in badRequestMessages) {
    return NextResponse.json({ success: false, error: badRequestMessages[message] }, { status: 400 });
  }

  console.error("Extraction runs API error:", error);

  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taxDocumentIdRaw = searchParams.get("taxDocumentId");
    const taxDocumentId = taxDocumentIdRaw ? parseId(taxDocumentIdRaw) : null;

    if (!taxDocumentId) {
      return NextResponse.json(
        { success: false, error: "กรุณาระบุ taxDocumentId" },
        { status: 400 }
      );
    }

    const runs = listExtractionRunsForDocument(taxDocumentId);

    return NextResponse.json({ success: true, data: runs, count: runs.length });
  } catch (error) {
    return errorToResponse(error);
  }
}

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
      return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
    }

    const b = body as Record<string, unknown>;

    const run = createExtractionRun({
      taxDocumentId: b.taxDocumentId as number,
      extractionMethod: b.extractionMethod as string,
      extractorProvider: (b.extractorProvider as string | null | undefined) ?? null,
      extractorVersion: (b.extractorVersion as string | null | undefined) ?? null,
      modelIdentifier: (b.modelIdentifier as string | null | undefined) ?? null,
    });

    return NextResponse.json({ success: true, data: run }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
