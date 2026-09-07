import { NextRequest, NextResponse } from "next/server";
import { getTaxDocumentRowById, updateTaxDocumentRow } from "@/lib/taxDocumentRows";
import { resolveTaxDocumentRowOwner } from "@/lib/taxOwnership";
import { SESSION_COOKIE_NAME, resolveSessionTaxpayerId } from "@/lib/auth";

// STEP 102 — single-row read + the ONLY mutation path (link/unlink an existing transaction, edit
// note). Every other field on a tax_document_rows row is immutable — see
// src/lib/taxDocumentRows.ts's updateTaxDocumentRow() comment.

type RouteContext = {
  params: Promise<{ id: string; rowId: string }>;
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
    TAX_DOCUMENT_ROW_NOT_FOUND: "Tax document row not found",
    TAX_DOCUMENT_NOT_FOUND: "Tax document not found",
    TRANSACTION_NOT_FOUND: "Transaction not found",
  };

  if (message in notFoundMessages) {
    return NextResponse.json({ success: false, error: notFoundMessages[message] }, { status: 404 });
  }

  if (message === "TAX_PERIOD_CLOSED") {
    return NextResponse.json(
      { success: false, error: "งวดภาษีของเอกสารนี้ถูกปิดแล้ว ไม่สามารถแก้ไข row ได้" },
      { status: 409 }
    );
  }

  const badRequestMessages: Record<string, string> = {
    INVALID_ID: "ID ที่อ้างอิงไม่ถูกต้อง",
  };

  if (message in badRequestMessages) {
    return NextResponse.json({ success: false, error: badRequestMessages[message] }, { status: 400 });
  }

  console.error("Tax document row detail API error:", error);

  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { rowId: rowIdParam } = await context.params;
    const rowId = parseId(rowIdParam);

    if (rowId === null) {
      return NextResponse.json({ success: false, error: "Invalid row ID" }, { status: 400 });
    }

    const row = getTaxDocumentRowById(rowId);

    if (!row) {
      return NextResponse.json({ success: false, error: "Tax document row not found" }, { status: 404 });
    }

    // STEP 118 — reporting-only ownership check (same pattern as STEP 116's
    // GET /api/tax/documents/[id]). READ-ONLY: resolveTaxDocumentRowOwner() (src/lib/taxOwnership.ts,
    // STEP 114) and resolveSessionTaxpayerId() (decodes the already-verified session cookie,
    // src/lib/auth.ts) are both pure reads. Purely additive to the response; never denies access,
    // never changes the status code above, never alters `success`/`data`.
    const ownership = resolveTaxDocumentRowOwner(row.id);
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
      data: row,
      ownerStatus: ownership.status,
      sessionTaxpayerMatch,
    });
  } catch (error) {
    return errorToResponse(error);
  }
}

// transactionId: reference/link to an ALREADY-EXISTING transaction only, or null to unlink — never
// creates a transaction. note: free-text human annotation. Every other field is rejected silently
// (ignored) since updateTaxDocumentRow() only ever reads these two keys off the input object.
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { rowId: rowIdParam } = await context.params;
    const rowId = parseId(rowIdParam);

    if (rowId === null) {
      return NextResponse.json({ success: false, error: "Invalid row ID" }, { status: 400 });
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
    if (b.note !== undefined) patch.note = b.note;

    const row = updateTaxDocumentRow(rowId, patch);

    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    return errorToResponse(error);
  }
}
