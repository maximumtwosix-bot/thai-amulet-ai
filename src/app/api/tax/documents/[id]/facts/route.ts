import { NextRequest, NextResponse } from "next/server";
import { listFactsForDocument } from "@/lib/extractedFacts";

// STEP 104 — list every fact recorded so far for one tax_documents row, across all extraction runs.

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

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const taxDocumentId = parseId(idParam);

    if (taxDocumentId === null) {
      return NextResponse.json({ success: false, error: "Invalid tax document ID" }, { status: 400 });
    }

    const facts = listFactsForDocument(taxDocumentId);

    return NextResponse.json({ success: true, data: facts, count: facts.length });
  } catch (error) {
    console.error("Document facts list API error:", error);

    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
