import { NextRequest, NextResponse } from "next/server";
import { transitionTaxYearStatus } from "@/lib/taxYears";

// STEP 93 (PIT-1) — dedicated status-transition endpoint, same convention as the existing
// /api/orders/[id]/status route referenced in src/proxy.ts's STEP 78 comment: a status change is
// its own action, not a generic field patch. This is also the ONLY mutation this STEP exposes for
// a tax year — there is no PATCH /api/tax/years/[id] for other fields, matching
// src/lib/taxYears.ts's deliberate lack of a generic updateTaxYear().

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

  if (message === "INVALID_STATUS") {
    return NextResponse.json(
      { success: false, error: "status ต้องเป็น OPEN, FINALIZED หรือ LOCKED" },
      { status: 400 }
    );
  }

  if (message === "INVALID_STATUS_TRANSITION") {
    return NextResponse.json(
      {
        success: false,
        error:
          "ไม่สามารถเปลี่ยนสถานะนี้ได้ (ลำดับที่อนุญาต: OPEN -> FINALIZED -> LOCKED เท่านั้น, LOCKED เปลี่ยนสถานะต่อไม่ได้)",
      },
      { status: 409 }
    );
  }

  console.error("Tax year status API error:", error);

  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json(
        { success: false, error: "Invalid tax year ID" },
        { status: 400 }
      );
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
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const b = body as Record<string, unknown>;
    const status = typeof b.status === "string" ? b.status : "";

    const taxYear = transitionTaxYearStatus(id, status);

    return NextResponse.json({ success: true, data: taxYear });
  } catch (error) {
    return errorToResponse(error);
  }
}
