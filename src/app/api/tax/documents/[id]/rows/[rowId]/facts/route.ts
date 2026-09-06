import { NextRequest, NextResponse } from "next/server";
import { listFactsForRow } from "@/lib/extractedFacts";

// STEP 104 — list every fact recorded so far for one specific tax_document_rows row.

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

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { rowId: rowIdParam } = await context.params;
    const rowId = parseId(rowIdParam);

    if (rowId === null) {
      return NextResponse.json({ success: false, error: "Invalid row ID" }, { status: 400 });
    }

    const facts = listFactsForRow(rowId);

    return NextResponse.json({ success: true, data: facts, count: facts.length });
  } catch (error) {
    console.error("Row facts list API error:", error);

    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
