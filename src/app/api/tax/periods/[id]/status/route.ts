import { NextRequest, NextResponse } from "next/server";
import { updateTaxPeriodStatus } from "@/lib/taxPeriods";

// STEP 100 — dedicated status-transition endpoint, same convention as
// /api/tax/years/[id]/status (STEP 93) and /api/orders/[id]/status.

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

  if (message === "TAX_PERIOD_NOT_FOUND") {
    return NextResponse.json({ success: false, error: "Tax period not found" }, { status: 404 });
  }

  if (message === "INVALID_STATUS") {
    return NextResponse.json(
      { success: false, error: "status ต้องเป็น OPEN, PROCESSING, NEEDS_REVIEW, VERIFIED หรือ CLOSED" },
      { status: 400 }
    );
  }

  if (message === "TAX_PERIOD_CLOSED") {
    return NextResponse.json(
      { success: false, error: "เดือนภาษีนี้ถูกปิดแล้ว ไม่สามารถเปลี่ยนสถานะได้อีก" },
      { status: 409 }
    );
  }

  if (message === "INVALID_STATUS_TRANSITION") {
    return NextResponse.json(
      { success: false, error: "สถานะนี้เหมือนกับสถานะปัจจุบันอยู่แล้ว" },
      { status: 409 }
    );
  }

  console.error("Tax period status API error:", error);

  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json({ success: false, error: "Invalid tax period ID" }, { status: 400 });
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
    const status = typeof b?.status === "string" ? b.status : "";

    const period = updateTaxPeriodStatus(id, status);

    return NextResponse.json({ success: true, data: period });
  } catch (error) {
    return errorToResponse(error);
  }
}
