import { NextRequest, NextResponse } from "next/server";
import { createTaxPeriod, listTaxPeriods } from "@/lib/taxPeriods";

// STEP 100 — API layer for Tax Periods. Under the already-protected "/api/tax/" prefix — no
// src/proxy.ts change needed.

function errorToResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";

  if (message === "TAX_YEAR_NOT_FOUND") {
    return NextResponse.json({ success: false, error: "Tax year not found" }, { status: 404 });
  }

  const badRequestMessages: Record<string, string> = {
    INVALID_TAX_YEAR_ID: "กรุณาระบุ taxYearId ที่ถูกต้อง",
    INVALID_PERIOD_MONTH: "periodMonth ต้องเป็นจำนวนเต็มระหว่าง 1-12",
  };

  if (message in badRequestMessages) {
    return NextResponse.json(
      { success: false, error: badRequestMessages[message] },
      { status: 400 }
    );
  }

  if (message === "DUPLICATE_TAX_PERIOD") {
    return NextResponse.json(
      { success: false, error: "มีเดือนภาษีนี้ของปีภาษีนี้อยู่ในระบบแล้ว" },
      { status: 409 }
    );
  }

  console.error("Tax periods API error:", error);

  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const taxYearIdParam = searchParams.get("taxYearId");
    let taxYearId: number | undefined;

    if (taxYearIdParam !== null && taxYearIdParam !== "") {
      const parsed = Number(taxYearIdParam);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        return NextResponse.json({ success: false, error: "Invalid taxYearId" }, { status: 400 });
      }

      taxYearId = parsed;
    }

    const periods = listTaxPeriods({
      taxYearId,
      status: searchParams.get("status") || undefined,
    });

    return NextResponse.json({ success: true, data: periods, count: periods.length });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
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

    const period = createTaxPeriod({
      taxYearId: b.taxYearId as number,
      periodMonth: b.periodMonth as number,
    });

    return NextResponse.json({ success: true, data: period }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
