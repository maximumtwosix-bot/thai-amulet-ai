import { NextRequest, NextResponse } from "next/server";
import { linkTransactionToTaxYear, listLinksForTaxYear } from "@/lib/taxYearTransactionLinks";

// STEP 96 — link a transaction into a tax year (opt-in traceability layer; see
// src/lib/db.ts's tax_year_transaction_links schema comment). Under the already-protected
// "/api/tax/" prefix — no src/proxy.ts change needed.

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

  if (message === "TAX_YEAR_NOT_FOUND") {
    return NextResponse.json({ success: false, error: "Tax year not found" }, { status: 404 });
  }

  if (message === "TRANSACTION_NOT_FOUND") {
    return NextResponse.json({ success: false, error: "Transaction not found" }, { status: 404 });
  }

  if (message === "TAX_YEAR_NOT_OPEN") {
    return NextResponse.json(
      {
        success: false,
        error: "ไม่สามารถผูก/ย้ายรายการนี้ได้ — ปีภาษี (ต้นทางหรือปลายทาง) ไม่ได้อยู่ในสถานะ OPEN",
      },
      { status: 409 }
    );
  }

  const badRequestMessages: Record<string, string> = {
    INVALID_TRANSACTION_ID: "กรุณาระบุ transactionId ที่ถูกต้อง",
    INVALID_TAX_YEAR_ID: "tax year ID ในเส้นทางไม่ถูกต้อง",
  };

  if (message in badRequestMessages) {
    return NextResponse.json(
      { success: false, error: badRequestMessages[message] },
      { status: 400 }
    );
  }

  console.error("Tax year transaction link API error:", error);

  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const taxYearId = parseId(idParam);

    if (taxYearId === null) {
      return NextResponse.json({ success: false, error: "Invalid tax year ID" }, { status: 400 });
    }

    const links = listLinksForTaxYear(taxYearId);

    return NextResponse.json({ success: true, data: links, count: links.length });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const taxYearId = parseId(idParam);

    if (taxYearId === null) {
      return NextResponse.json({ success: false, error: "Invalid tax year ID" }, { status: 400 });
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

    const link = linkTransactionToTaxYear({
      transactionId: b.transactionId as number,
      taxYearId,
    });

    return NextResponse.json({ success: true, data: link }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
