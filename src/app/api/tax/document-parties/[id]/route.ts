import { NextRequest, NextResponse } from "next/server";
import {
  getDocumentPartyLinkById,
  unlinkDocumentParty,
  updateLinkNote,
} from "@/lib/taxDocumentParties";
import { resolveDocumentPartyLinkOwner } from "@/lib/taxOwnership";
import { SESSION_COOKIE_NAME, resolveSessionTaxpayerId } from "@/lib/auth";

// STEP 110 — single document-party link read + its two mutation paths. PATCH accepts ONLY `note`
// — party/document/row/role are immutable by construction in the DAL (no code path here or in
// src/lib/taxDocumentParties.ts touches them). DELETE calls the DAL's soft-unlink function only —
// there is no hard-delete function to call even by mistake.

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
    TAX_DOCUMENT_PARTY_NOT_FOUND: "Document-party link not found",
    TAX_DOCUMENT_NOT_FOUND: "Tax document not found",
  };

  if (message in notFoundMessages) {
    return NextResponse.json({ success: false, error: notFoundMessages[message] }, { status: 404 });
  }

  if (message === "TAX_PERIOD_CLOSED") {
    return NextResponse.json(
      { success: false, error: "งวดภาษีของเอกสารนี้ถูกปิดแล้ว ไม่สามารถแก้ไข party link ได้" },
      { status: 409 }
    );
  }

  if (message === "LINK_ALREADY_UNLINKED") {
    return NextResponse.json(
      { success: false, error: "link นี้ถูกยกเลิก (UNLINKED) ไปแล้ว ไม่สามารถแก้ไข/ยกเลิกซ้ำได้" },
      { status: 409 }
    );
  }

  const badRequestMessages: Record<string, string> = {
    INVALID_ID: "ID ที่อ้างอิงไม่ถูกต้อง",
    NOTE_TOO_LONG: "note ยาวเกินไป",
  };

  if (message in badRequestMessages) {
    return NextResponse.json({ success: false, error: badRequestMessages[message] }, { status: 400 });
  }

  console.error("Document-party link detail API error:", error);

  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json({ success: false, error: "Invalid link ID" }, { status: 400 });
    }

    const link = getDocumentPartyLinkById(id);

    if (!link) {
      return NextResponse.json({ success: false, error: "Document-party link not found" }, { status: 404 });
    }

    // STEP 118 — reporting-only ownership check (same pattern as STEP 116's
    // GET /api/tax/documents/[id]). READ-ONLY: resolveDocumentPartyLinkOwner()
    // (src/lib/taxOwnership.ts, STEP 114) and resolveSessionTaxpayerId() (decodes the
    // already-verified session cookie, src/lib/auth.ts) are both pure reads. Purely additive to the
    // response; never denies access, never changes the status code above, never alters
    // `success`/`data`.
    const ownership = resolveDocumentPartyLinkOwner(link.id);
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
      data: link,
      ownerStatus: ownership.status,
      sessionTaxpayerMatch,
    });
  } catch (error) {
    return errorToResponse(error);
  }
}

// Reads ONLY `note` from the body — any other key is silently ignored, matching every existing
// PATCH route's convention (e.g. src/app/api/tax/facts/[id]/route.ts).
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json({ success: false, error: "Invalid link ID" }, { status: 400 });
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

    const link = updateLinkNote(id, note);

    return NextResponse.json({ success: true, data: link });
  } catch (error) {
    return errorToResponse(error);
  }
}

// Soft-unlink only — sets status: UNLINKED via src/lib/taxDocumentParties.ts's
// unlinkDocumentParty(). There is no hard-delete function anywhere in that file to call instead. A
// DELETE request body is optional (uncommon but permitted by HTTP) and, if present, its `note` is
// passed through as the unlink reason; a missing/unparseable body simply leaves the existing note
// untouched (matches unlinkDocumentParty()'s own `reason === undefined` behavior).
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json({ success: false, error: "Invalid link ID" }, { status: 400 });
    }

    let reason: string | null | undefined;

    try {
      const body = (await request.json()) as Record<string, unknown> | null;
      reason = (body?.note as string | null | undefined) ?? undefined;
    } catch {
      reason = undefined;
    }

    const link = unlinkDocumentParty(id, reason);

    return NextResponse.json({ success: true, data: link });
  } catch (error) {
    return errorToResponse(error);
  }
}
