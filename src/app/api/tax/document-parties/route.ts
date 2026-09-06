import { NextRequest, NextResponse } from "next/server";
import { listLinksForParty } from "@/lib/taxDocumentParties";

// STEP 110 — list document-party links by party, across all documents. Mirrors
// src/app/api/tax/extraction-runs/route.ts's own `?taxDocumentId=` required-query-param GET
// convention exactly (STEP 104 precedent) — the same pattern applied here for `?partyId=`.
// Deliberately no broad party-search endpoint exists here or anywhere else — this only lists
// EXISTING links for an already-known partyId, never searches parties by name.

function parseId(idParam: string): number | null {
  const id = Number(idParam);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const partyIdRaw = searchParams.get("partyId");
    const partyId = partyIdRaw ? parseId(partyIdRaw) : null;

    if (!partyId) {
      return NextResponse.json({ success: false, error: "กรุณาระบุ partyId" }, { status: 400 });
    }

    const links = listLinksForParty(partyId);

    return NextResponse.json({ success: true, data: links, count: links.length });
  } catch (error) {
    console.error("Document parties by-party list API error:", error);

    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
