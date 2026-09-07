import { NextRequest, NextResponse } from "next/server";
import { getExtractedFactById, updateFactNote } from "@/lib/extractedFacts";
import { resolveExtractedFactOwner } from "@/lib/taxOwnership";
import { SESSION_COOKIE_NAME, resolveSessionTaxpayerId } from "@/lib/auth";

// STEP 104 — single fact read + note-only update. Every other field (value/provenance/review
// status) has its own dedicated, more restrictive path — see review-status/route.ts and
// correct/route.ts.

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

  if (message === "EXTRACTED_FACT_NOT_FOUND") {
    return NextResponse.json({ success: false, error: "Extracted fact not found" }, { status: 404 });
  }

  if (message === "TAX_PERIOD_CLOSED") {
    return NextResponse.json(
      { success: false, error: "งวดภาษีของเอกสารนี้ถูกปิดแล้ว ไม่สามารถแก้ไข fact ได้" },
      { status: 409 }
    );
  }

  if (message === "INVALID_ID") {
    return NextResponse.json({ success: false, error: "ID ที่อ้างอิงไม่ถูกต้อง" }, { status: 400 });
  }

  console.error("Extracted fact detail API error:", error);

  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json({ success: false, error: "Invalid fact ID" }, { status: 400 });
    }

    const fact = getExtractedFactById(id);

    if (!fact) {
      return NextResponse.json({ success: false, error: "Extracted fact not found" }, { status: 404 });
    }

    // STEP 118 — reporting-only ownership check (same pattern as STEP 116's
    // GET /api/tax/documents/[id]). READ-ONLY: resolveExtractedFactOwner() (src/lib/taxOwnership.ts,
    // STEP 114) and resolveSessionTaxpayerId() (decodes the already-verified session cookie,
    // src/lib/auth.ts) are both pure reads. Purely additive to the response; never denies access,
    // never changes the status code above, never alters `success`/`data`.
    const ownership = resolveExtractedFactOwner(fact.id);
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
      data: fact,
      ownerStatus: ownership.status,
      sessionTaxpayerMatch,
    });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
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

    const b = body as Record<string, unknown> | null;
    const note = (b?.note as string | null | undefined) ?? null;

    const fact = updateFactNote(id, note);

    return NextResponse.json({ success: true, data: fact });
  } catch (error) {
    return errorToResponse(error);
  }
}
