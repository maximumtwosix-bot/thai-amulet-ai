import { NextRequest, NextResponse } from "next/server";
import {
  createTaxpayerProfile,
  listTaxpayerProfiles,
  type TaxpayerProfileRow,
} from "@/lib/taxpayerProfile";

// STEP 93 (PIT-1) — API layer for Taxpayer Profile. Auth is NOT re-checked here — same convention
// as every other admin API in this codebase (src/proxy.ts's STEP 70 comment: "the route itself does
// not re-check auth"). Already reachable only via a valid session because src/proxy.ts's
// isProtectedApi() already matches the whole "/api/tax/" prefix (STEP 22) — no proxy.ts change was
// needed for this STEP.

function errorToResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";

  const badRequestMessages: Record<string, string> = {
    INVALID_NAME: "กรุณาระบุชื่อผู้เสียภาษี",
    INVALID_TAXPAYER_ID: "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก",
    INVALID_TAXPAYER_TYPE: "taxpayerType ต้องเป็น INDIVIDUAL",
    INVALID_VAT_REGISTERED: "กรุณาระบุสถานะการจดทะเบียน VAT (true/false)",
    INVALID_WHT_APPLICABLE: "กรุณาระบุสถานะภาษีหัก ณ ที่จ่าย (true/false)",
    FILING_FORM_TOO_LONG: "filingForm ยาวเกินไป (ไม่เกิน 32 ตัวอักษร)",
  };

  if (message in badRequestMessages) {
    return NextResponse.json(
      { success: false, error: badRequestMessages[message] },
      { status: 400 }
    );
  }

  // Never include the raw error/body (which may contain taxpayerId) beyond the error object
  // itself — error.message here is always one of this file's fixed internal code strings, never an
  // interpolated field value. Same convention as bank-accounts' API layer.
  console.error("Taxpayer profile API error:", error);

  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}

// Never show more than the last 4 digits — same masking shape as bank-accounts'
// maskAccountNumber() (STEP B.3/B.6): a constant-length "•••••••••" prefix regardless of the real
// number's length, not one bullet per hidden digit (which would leak the real length).
function maskTaxpayerId(taxpayerId: string): string {
  if (!taxpayerId) return "•••••••••";

  return `•••••••••${taxpayerId.slice(-4)}`;
}

type TaxpayerProfileListItem = Omit<TaxpayerProfileRow, "taxpayerId"> & {
  taxpayerIdMasked: string;
};

// Response DTO built explicitly field-by-field (never spreads the raw DB row) so taxpayerId can
// never leak into the list endpoint by accident, now or after a future field is added to
// TaxpayerProfileRow — same convention as bank-accounts' toListItem().
function toListItem(row: TaxpayerProfileRow): TaxpayerProfileListItem {
  return {
    id: row.id,
    name: row.name,
    taxpayerIdMasked: maskTaxpayerId(row.taxpayerId),
    taxpayerType: row.taxpayerType,
    vatRegistered: row.vatRegistered,
    whtApplicable: row.whtApplicable,
    filingForm: row.filingForm,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const isActiveParam = searchParams.get("isActive");
    let isActive: boolean | undefined;

    if (isActiveParam !== null && isActiveParam !== "") {
      if (isActiveParam !== "true" && isActiveParam !== "false") {
        return NextResponse.json(
          { success: false, error: "Invalid isActive. Must be 'true' or 'false'" },
          { status: 400 }
        );
      }

      isActive = isActiveParam === "true";
    }

    const rows = listTaxpayerProfiles({ isActive });

    return NextResponse.json({
      success: true,
      data: rows.map(toListItem),
      count: rows.length,
    });
  } catch (error) {
    return errorToResponse(error);
  }
}

// Only known fields are ever read off the request body and forwarded to createTaxpayerProfile()
// — any other field the client sends (id, createdAt, updatedAt, isActive, ...) is silently
// ignored, never reaches the library. createTaxpayerProfile() always starts a new profile as
// isActive=true by design — there is intentionally no client-settable isActive on create.
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

    const profile = createTaxpayerProfile({
      name: String(b.name || ""),
      taxpayerId: String(b.taxpayerId || ""),
      taxpayerType: typeof b.taxpayerType === "string" ? b.taxpayerType : "",
      vatRegistered: b.vatRegistered as boolean,
      whtApplicable: b.whtApplicable as boolean,
      filingForm: (b.filingForm as string | null | undefined) ?? null,
    });

    return NextResponse.json({ success: true, data: toListItem(profile) }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
