import { NextRequest, NextResponse } from "next/server";
import { linkPartyToDocument, listLinksForDocument } from "@/lib/taxDocumentParties";

// STEP 110 — Document-Party Linking API. GET lists every party link recorded so far for one
// tax_documents row (document-level and row-level alike); POST creates a new link. Thin wrapper
// only — every business rule (document/party/row existence, row/document mismatch, role
// validation, duplicate detection, CLOSED-period guard, audit logging) lives in
// src/lib/taxDocumentParties.ts, never re-implemented here. Session-gated by src/proxy.ts's
// existing `pathname.startsWith("/api/tax/")` rule — no proxy.ts change needed.

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
    PARTY_NOT_FOUND: "Party not found",
    TAX_DOCUMENT_ROW_NOT_FOUND: "Tax document row not found",
  };

  if (message in notFoundMessages) {
    return NextResponse.json({ success: false, error: notFoundMessages[message] }, { status: 404 });
  }

  if (message === "ROW_DOCUMENT_MISMATCH") {
    return NextResponse.json(
      { success: false, error: "row ที่ระบุไม่ได้เป็นของเอกสารเดียวกับ tax document นี้" },
      { status: 400 }
    );
  }

  if (message === "TAX_PERIOD_CLOSED") {
    return NextResponse.json(
      { success: false, error: "งวดภาษีของเอกสารนี้ถูกปิดแล้ว ไม่สามารถเพิ่ม party link ได้" },
      { status: 409 }
    );
  }

  if (message === "DUPLICATE_LINK") {
    return NextResponse.json(
      { success: false, error: "party นี้ถูก link ด้วย role เดียวกันในตำแหน่งเดียวกันไปแล้ว" },
      { status: 409 }
    );
  }

  const badRequestMessages: Record<string, string> = {
    INVALID_ID: "ID ที่อ้างอิงไม่ถูกต้อง",
    INVALID_PARTY_ROLE:
      "role ต้องเป็น ISSUER, COUNTERPARTY, PAYER, PAYEE, SUPPLIER, CUSTOMER, WITHHOLDING_AGENT หรือ OTHER",
    NOTE_TOO_LONG: "note ยาวเกินไป",
  };

  if (message in badRequestMessages) {
    return NextResponse.json({ success: false, error: badRequestMessages[message] }, { status: 400 });
  }

  console.error("Document parties API error:", error);

  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const taxDocumentId = parseId(idParam);

    if (taxDocumentId === null) {
      return NextResponse.json({ success: false, error: "Invalid tax document ID" }, { status: 400 });
    }

    const links = listLinksForDocument(taxDocumentId);

    return NextResponse.json({ success: true, data: links, count: links.length });
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

    const link = linkPartyToDocument({
      taxDocumentId,
      partyId: b.partyId as number,
      role: b.role as string,
      taxDocumentRowId: (b.taxDocumentRowId as number | null | undefined) ?? null,
      note: (b.note as string | null | undefined) ?? null,
    });

    return NextResponse.json({ success: true, data: link }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
