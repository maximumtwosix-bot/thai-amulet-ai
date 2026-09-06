import { NextRequest, NextResponse } from "next/server";
import { listEvidenceStatusForPeriod, setEvidenceStatus } from "@/lib/taxPeriodEvidenceStatus";

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

  if (message === "TAX_PERIOD_NOT_FOUND") {
    return NextResponse.json({ success: false, error: "Tax period not found" }, { status: 404 });
  }

  const badRequestMessages: Record<string, string> = {
    INVALID_TAX_PERIOD_ID: "tax period ID ในเส้นทางไม่ถูกต้อง",
    INVALID_DOCUMENT_TYPE: "documentType ไม่ถูกต้อง",
    INVALID_EVIDENCE_STATUS:
      "status ต้องเป็น FOUND, MISSING, EXPECTED_BUT_MISSING, NOT_APPLICABLE, UNKNOWN หรือ NEEDS_REVIEW",
  };

  if (message in badRequestMessages) {
    return NextResponse.json(
      { success: false, error: badRequestMessages[message] },
      { status: 400 }
    );
  }

  console.error("Tax period evidence-status API error:", error);

  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

// GET returns one row per document type that has an explicit status set so far — a category with
// no row at all should be rendered by the caller as UNKNOWN, never as absent/zero (per the STEP
// 99 audit's own rule), so callers should cross-reference this list against
// src/lib/taxDocumentTypes.ts's DOCUMENT_TYPES, not treat a missing row as a meaningful signal by
// itself.
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const taxPeriodId = parseId(idParam);

    if (taxPeriodId === null) {
      return NextResponse.json({ success: false, error: "Invalid tax period ID" }, { status: 400 });
    }

    const rows = listEvidenceStatusForPeriod(taxPeriodId);

    return NextResponse.json({ success: true, data: rows, count: rows.length });
  } catch (error) {
    return errorToResponse(error);
  }
}

// A human-set judgment only — see src/lib/taxPeriodEvidenceStatus.ts's own comment: nothing here
// infers a status from whether any tax_documents row exists.
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const taxPeriodId = parseId(idParam);

    if (taxPeriodId === null) {
      return NextResponse.json({ success: false, error: "Invalid tax period ID" }, { status: 400 });
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

    const b = body as Record<string, unknown> | null;

    const row = setEvidenceStatus({
      taxPeriodId,
      documentType: typeof b?.documentType === "string" ? b.documentType : "",
      status: typeof b?.status === "string" ? b.status : "",
      note: (b?.note as string | null | undefined) ?? null,
    });

    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    return errorToResponse(error);
  }
}
