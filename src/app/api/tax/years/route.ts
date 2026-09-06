import { NextRequest, NextResponse } from "next/server";
import { createTaxYear, listTaxYears } from "@/lib/taxYears";

// STEP 93 (PIT-1) — API layer for Tax Year. Auth is NOT re-checked here — same convention as every
// other admin API in this codebase; already reachable only via a valid session because
// src/proxy.ts's isProtectedApi() already matches the whole "/api/tax/" prefix (STEP 22).

function errorToResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";

  if (message === "TAXPAYER_PROFILE_NOT_FOUND") {
    return NextResponse.json(
      { success: false, error: "Taxpayer profile not found" },
      { status: 404 }
    );
  }

  const badRequestMessages: Record<string, string> = {
    INVALID_TAXPAYER_PROFILE_ID: "กรุณาระบุ taxpayerProfileId ที่ถูกต้อง",
    INVALID_TAX_YEAR: "taxYear ต้องเป็นจำนวนเต็มระหว่าง 2000-2100",
  };

  if (message in badRequestMessages) {
    return NextResponse.json(
      { success: false, error: badRequestMessages[message] },
      { status: 400 }
    );
  }

  // Same DB-unique-constraint-is-final-authority reasoning as POST /api/bank-accounts —
  // createTaxYear() relies on idx_tax_years_taxpayer_year (STEP 93) rather than a SELECT-first
  // check, so this is race-free.
  if (message === "DUPLICATE_TAX_YEAR") {
    return NextResponse.json(
      { success: false, error: "มีปีภาษีนี้ของผู้เสียภาษีรายนี้อยู่ในระบบแล้ว" },
      { status: 409 }
    );
  }

  console.error("Tax year API error:", error);

  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const taxpayerProfileIdParam = searchParams.get("taxpayerProfileId");
    let taxpayerProfileId: number | undefined;

    if (taxpayerProfileIdParam !== null && taxpayerProfileIdParam !== "") {
      const parsed = Number(taxpayerProfileIdParam);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        return NextResponse.json(
          { success: false, error: "Invalid taxpayerProfileId" },
          { status: 400 }
        );
      }

      taxpayerProfileId = parsed;
    }

    const rows = listTaxYears({
      taxpayerProfileId,
      status: searchParams.get("status") || undefined,
    });

    return NextResponse.json({ success: true, data: rows, count: rows.length });
  } catch (error) {
    return errorToResponse(error);
  }
}

// Only known fields are ever read off the request body — a new tax year always starts OPEN, no
// client-settable initial status (see src/lib/taxYears.ts's createTaxYear() comment).
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
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const b = body as Record<string, unknown>;

    const taxYear = createTaxYear({
      taxpayerProfileId: b.taxpayerProfileId as number,
      taxYear: b.taxYear as number,
    });

    return NextResponse.json({ success: true, data: taxYear }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
