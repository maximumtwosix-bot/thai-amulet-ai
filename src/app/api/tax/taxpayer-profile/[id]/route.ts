import { NextRequest, NextResponse } from "next/server";
import {
  getTaxpayerProfileById,
  updateTaxpayerProfile,
  type TaxpayerProfileRow,
} from "@/lib/taxpayerProfile";

// Same masking shape/logic as src/app/api/tax/taxpayer-profile/route.ts's toListItem()/
// maskTaxpayerId(), duplicated here rather than extracted to a shared module — same convention as
// bank-accounts' STEP B.6 precedent (src/app/api/bank-accounts/[id]/route.ts's identical
// duplication). Used on PATCH's response only — GET below intentionally still returns the full
// value (see that handler's own comment).
function maskTaxpayerId(taxpayerId: string): string {
  if (!taxpayerId) return "•••••••••";

  return `•••••••••${taxpayerId.slice(-4)}`;
}

type TaxpayerProfileListItem = Omit<TaxpayerProfileRow, "taxpayerId"> & {
  taxpayerIdMasked: string;
};

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

// STEP 93 (PIT-1) — single taxpayer-profile detail/update. Full taxpayerId IS included on GET by
// design (unlike the list endpoint) — this is an authenticated, internal, single-admin endpoint
// (gated by proxy.ts's session cookie, same as every other Finance/Tax API), matching the exact
// precedent set by GET /api/bank-accounts/[id] returning the full accountNumber. The id in the URL
// is an internal auto-increment integer, never the taxpayer ID itself.

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

  if (message === "TAXPAYER_PROFILE_NOT_FOUND") {
    return NextResponse.json(
      { success: false, error: "Taxpayer profile not found" },
      { status: 404 }
    );
  }

  const badRequestMessages: Record<string, string> = {
    INVALID_NAME: "กรุณาระบุชื่อผู้เสียภาษี",
    INVALID_TAXPAYER_ID: "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก",
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

  console.error("Taxpayer profile detail API error:", error);

  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json(
        { success: false, error: "Invalid taxpayer profile ID" },
        { status: 400 }
      );
    }

    const profile = getTaxpayerProfileById(id);

    if (!profile) {
      return NextResponse.json(
        { success: false, error: "Taxpayer profile not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    return errorToResponse(error);
  }
}

// Edit one field or several — including isActive (the activate/deactivate mechanism, no separate
// endpoint, matching bank-accounts' PATCH design). taxpayerType is intentionally never accepted
// here — see src/lib/taxpayerProfile.ts's updateTaxpayerProfile() comment. Only fields explicitly
// present in the request body are forwarded; everything else on the existing row is left untouched.
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json(
        { success: false, error: "Invalid taxpayer profile ID" },
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

    const patch: Record<string, unknown> = {};

    if (b.name !== undefined) patch.name = String(b.name);
    if (b.taxpayerId !== undefined) patch.taxpayerId = String(b.taxpayerId);
    if (b.vatRegistered !== undefined) patch.vatRegistered = Boolean(b.vatRegistered);
    if (b.whtApplicable !== undefined) patch.whtApplicable = Boolean(b.whtApplicable);
    if (b.filingForm !== undefined) patch.filingForm = b.filingForm;
    if (b.isActive !== undefined) patch.isActive = Boolean(b.isActive);

    const profile = updateTaxpayerProfile(id, patch);

    // Masked in the response for the same reason as bank-accounts' PATCH (STEP B.6): nothing yet
    // reads the full taxpayerId back from this endpoint, so there is no benefit to echoing it —
    // only unnecessary exposure. GET single above is the one endpoint a future edit form would
    // genuinely need the full value from.
    return NextResponse.json({ success: true, data: toListItem(profile) });
  } catch (error) {
    return errorToResponse(error);
  }
}
