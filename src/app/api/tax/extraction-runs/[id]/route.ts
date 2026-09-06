import { NextRequest, NextResponse } from "next/server";
import { completeExtractionRun, getExtractionRunById } from "@/lib/extractionRuns";

// STEP 104 — single run read + the ONLY mutation path (complete: mark COMPLETED/FAILED/CANCELLED).
// Everything else about a run (its document/method/provider/version/started_at) is immutable.

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

  if (message === "EXTRACTION_RUN_NOT_FOUND") {
    return NextResponse.json({ success: false, error: "Extraction run not found" }, { status: 404 });
  }

  if (message === "EXTRACTION_RUN_ALREADY_TERMINAL") {
    return NextResponse.json(
      { success: false, error: "extraction run นี้จบแล้ว ไม่สามารถเปลี่ยนสถานะได้อีก" },
      { status: 409 }
    );
  }

  const badRequestMessages: Record<string, string> = {
    INVALID_ID: "ID ที่อ้างอิงไม่ถูกต้อง",
    INVALID_EXTRACTION_RUN_STATUS: "status ต้องเป็น COMPLETED, FAILED หรือ CANCELLED",
    ERROR_CODE_TOO_LONG: "errorCode ยาวเกินไป",
    ERROR_MESSAGE_TOO_LONG: "errorMessage ยาวเกินไป",
  };

  if (message in badRequestMessages) {
    return NextResponse.json({ success: false, error: badRequestMessages[message] }, { status: 400 });
  }

  console.error("Extraction run detail API error:", error);

  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json({ success: false, error: "Invalid extraction run ID" }, { status: 400 });
    }

    const run = getExtractionRunById(id);

    if (!run) {
      return NextResponse.json({ success: false, error: "Extraction run not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: run });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
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

    const b = body as Record<string, unknown> | null;

    const run = completeExtractionRun(id, {
      status: (b?.status as string) ?? "",
      errorCode: (b?.errorCode as string | null | undefined) ?? null,
      errorMessage: (b?.errorMessage as string | null | undefined) ?? null,
    });

    return NextResponse.json({ success: true, data: run });
  } catch (error) {
    return errorToResponse(error);
  }
}
