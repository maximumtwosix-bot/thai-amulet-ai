import { NextRequest, NextResponse } from "next/server";
import { getTaxDocumentById, updateTaxDocument } from "@/lib/taxDocuments";
import { resolveTaxDocumentOwner } from "@/lib/taxOwnership";
import { SESSION_COOKIE_NAME, resolveSessionTaxpayerId } from "@/lib/auth";

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
    TAX_PERIOD_NOT_FOUND: "Tax period not found",
    TRANSACTION_NOT_FOUND: "Transaction not found",
  };

  if (message in notFoundMessages) {
    return NextResponse.json({ success: false, error: notFoundMessages[message] }, { status: 404 });
  }

  if (message === "TAX_DOCUMENT_CONFIRMED") {
    return NextResponse.json(
      { success: false, error: "เอกสารนี้ถูกยืนยันแล้ว ไม่สามารถแก้ไขได้อีก" },
      { status: 409 }
    );
  }

  const badRequestMessages: Record<string, string> = {
    INVALID_ID: "ID ที่อ้างอิงไม่ถูกต้อง",
    INVALID_DOCUMENT_TYPE: "documentType ไม่ถูกต้อง",
    INVALID_DOCUMENT_SOURCE: "source ไม่ถูกต้อง",
    INVALID_DOCUMENT_DATE: "document_date ไม่ใช่วันที่ที่ถูกต้อง",
    INVALID_STATEMENT_PERIOD_FROM: "statement_period_from ไม่ใช่วันที่ที่ถูกต้อง",
    INVALID_STATEMENT_PERIOD_TO: "statement_period_to ไม่ใช่วันที่ที่ถูกต้อง",
    INVALID_STATEMENT_PERIOD_RANGE: "statement_period_from ต้องไม่มากกว่า statement_period_to",
  };

  if (message in badRequestMessages) {
    return NextResponse.json({ success: false, error: badRequestMessages[message] }, { status: 400 });
  }

  console.error("Tax document detail API error:", error);

  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json({ success: false, error: "Invalid tax document ID" }, { status: 400 });
    }

    const document = getTaxDocumentById(id);

    if (!document) {
      return NextResponse.json({ success: false, error: "Tax document not found" }, { status: 404 });
    }

    // STEP 116 — reporting-only ownership check (STEP 112/114 design). READ-ONLY: calls only
    // resolveTaxDocumentOwner() (a pure query, src/lib/taxOwnership.ts) and
    // resolveSessionTaxpayerId() (decodes the already-verified session cookie, src/lib/auth.ts) —
    // neither mutates anything. Purely additive to the response; never denies access, never
    // changes the status code above, never alters `success`/`data`. A future STEP may eventually
    // make this authorization-enforcing — this one does not.
    const ownership = resolveTaxDocumentOwner(document.id);
    const sessionTaxpayerId = resolveSessionTaxpayerId(request.cookies.get(SESSION_COOKIE_NAME)?.value);

    let sessionTaxpayerMatch: "MATCH" | "MISMATCH" | "SESSION_TAXPAYER_UNAVAILABLE" | "NOT_APPLICABLE";

    if (sessionTaxpayerId === null) {
      // Never guessed, never defaulted to "the one active taxpayer" — an unbound session (STEP
      // 113: old-format token, or bootstrap was UNAVAILABLE/AMBIGUOUS at login) reports this
      // explicitly, regardless of whether the document's own owner resolved cleanly.
      sessionTaxpayerMatch = "SESSION_TAXPAYER_UNAVAILABLE";
    } else if (ownership.status !== "RESOLVED") {
      // The document's own owner is UNRESOLVED/CONFLICT — no meaningful MATCH/MISMATCH comparison
      // is possible against it.
      sessionTaxpayerMatch = "NOT_APPLICABLE";
    } else {
      sessionTaxpayerMatch = ownership.taxpayerProfileId === sessionTaxpayerId ? "MATCH" : "MISMATCH";
    }

    return NextResponse.json({
      success: true,
      data: document,
      ownerStatus: ownership.status,
      sessionTaxpayerMatch,
    });
  } catch (error) {
    return errorToResponse(error);
  }
}

// Links to a period/transaction, classification, dates, and note only — never the file's own
// identity fields or review_status (see src/lib/taxDocuments.ts's updateTaxDocument() comment).
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
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

    const patch: Record<string, unknown> = {};

    if (b.taxPeriodId !== undefined) patch.taxPeriodId = b.taxPeriodId;
    if (b.transactionId !== undefined) patch.transactionId = b.transactionId;
    if (b.documentType !== undefined) patch.documentType = b.documentType;
    if (b.source !== undefined) patch.source = b.source;
    if (b.documentDate !== undefined) patch.documentDate = b.documentDate;
    if (b.statementPeriodFrom !== undefined) patch.statementPeriodFrom = b.statementPeriodFrom;
    if (b.statementPeriodTo !== undefined) patch.statementPeriodTo = b.statementPeriodTo;
    if (b.note !== undefined) patch.note = b.note;

    const document = updateTaxDocument(id, patch);

    return NextResponse.json({ success: true, data: document });
  } catch (error) {
    return errorToResponse(error);
  }
}
