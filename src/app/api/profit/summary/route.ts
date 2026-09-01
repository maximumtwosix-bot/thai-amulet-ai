import { NextRequest, NextResponse } from "next/server";
import { getProfitSummary } from "@/lib/profitSummary";
import { parseTaxSummaryParams } from "@/lib/taxSummary";

function errorToResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";

  const badRequestMessages: Record<string, string> = {
    YEAR_REQUIRED: "Provide either year (optionally with month), or both dateFrom and dateTo",
    INVALID_YEAR: "year must be an integer between 2000 and 2100",
    INVALID_MONTH: "month must be an integer between 1 and 12",
    INVALID_DATE_RANGE: "dateFrom/dateTo must be valid dates",
    INVALID_DATE_RANGE_ORDER: "dateFrom must not be after dateTo",
  };

  if (message in badRequestMessages) {
    return NextResponse.json(
      { success: false, error: badRequestMessages[message] },
      { status: 400 }
    );
  }

  console.error("Profit summary API error:", error);

  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}

// GET /api/profit/summary — STEP 37, read-only aggregation over the existing `transactions`/
// `orders`/`order_items` tables. Same query-param contract as GET /api/tax/summary (year [+month],
// or dateFrom+dateTo) — reuses parseTaxSummaryParams() directly so date semantics are identical.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const params = parseTaxSummaryParams(searchParams);

    const summary = getProfitSummary(params);

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    return errorToResponse(error);
  }
}
