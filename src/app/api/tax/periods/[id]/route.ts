import { NextRequest, NextResponse } from "next/server";
import { getTaxPeriodById } from "@/lib/taxPeriods";
import { resolveTaxPeriodOwner } from "@/lib/taxOwnership";
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

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json({ success: false, error: "Invalid tax period ID" }, { status: 400 });
    }

    const period = getTaxPeriodById(id);

    if (!period) {
      return NextResponse.json({ success: false, error: "Tax period not found" }, { status: 404 });
    }

    // STEP 118 — reporting-only ownership check (same pattern as STEP 116's
    // GET /api/tax/documents/[id]). READ-ONLY: resolveTaxPeriodOwner() (src/lib/taxOwnership.ts,
    // STEP 114) and resolveSessionTaxpayerId() (decodes the already-verified session cookie,
    // src/lib/auth.ts) are both pure reads. Purely additive to the response; never denies access,
    // never changes the status code above, never alters `success`/`data`.
    const ownership = resolveTaxPeriodOwner(period.id);
    const sessionTaxpayerId = resolveSessionTaxpayerId(request.cookies.get(SESSION_COOKIE_NAME)?.value);

    let sessionTaxpayerMatch: "MATCH" | "MISMATCH" | "SESSION_TAXPAYER_UNAVAILABLE" | "NOT_APPLICABLE";

    if (sessionTaxpayerId === null) {
      sessionTaxpayerMatch = "SESSION_TAXPAYER_UNAVAILABLE";
    } else if (ownership.status !== "RESOLVED") {
      sessionTaxpayerMatch = "NOT_APPLICABLE";
    } else {
      sessionTaxpayerMatch = ownership.taxpayerProfileId === sessionTaxpayerId ? "MATCH" : "MISMATCH";
    }

    return NextResponse.json({
      success: true,
      data: period,
      ownerStatus: ownership.status,
      sessionTaxpayerMatch,
    });
  } catch (error) {
    console.error("Tax period detail API error:", error);

    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
