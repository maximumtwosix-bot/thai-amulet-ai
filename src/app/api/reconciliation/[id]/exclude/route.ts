import { NextRequest, NextResponse } from "next/server";
import { excludeReconciliation, type BankReconciliationMatchRow } from "@/lib/reconciliation";

export const runtime = "nodejs";

// STEP D.6 — SUGGESTED|MATCHED|NEEDS_REVIEW -> EXCLUDED, per the approved STEP D.5 audit contract.
// `reason` is required (excludeReconciliation() throws INVALID_REASON otherwise).
//
// EXCLUDED-without-counterpart (STEP D.4 §20 / STEP D.5 §11): this endpoint operates ONLY on an
// existing reconciliation match `id` — it structurally cannot be used to "exclude" a bank statement
// transaction that has no financial-transaction counterpart at all, since such a pairing was never
// approved to exist in this schema (bank_reconciliation_matches.transaction_id is NOT NULL, per STEP
// D.3). No workaround, placeholder transaction, or schema bypass is implemented here — per the STEP
// D.5 audit's Option A recommendation, a bank row with no real counterpart simply remains UNMATCHED
// (no row at all), which is fully visible in GET /api/reconciliation's queue queries. Confirmed no DAL
// gap exists for the case this endpoint actually needs to serve (excluding an EXISTING mapped match)
// — excludeReconciliation() already supports it exactly as approved.

const MAX_REASON_LENGTH = 2000;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(idParam: string): number | null {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function toMatchDto(row: BankReconciliationMatchRow) {
  return {
    id: row.id,
    bankStatementTransactionId: row.bankStatementTransactionId,
    transactionId: row.transactionId,
    allocatedAmount: row.allocatedAmount,
    matchStrategy: row.matchStrategy,
    status: row.status,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    confirmedAt: row.confirmedAt,
    confirmedBy: row.confirmedBy,
    unmatchedAt: row.unmatchedAt,
    unmatchedBy: row.unmatchedBy,
  };
}

function errorToResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";

  if (message === "NOT_FOUND") {
    return NextResponse.json({ success: false, error: "ไม่พบรายการ Reconciliation นี้" }, { status: 404 });
  }

  if (message === "INVALID_REASON") {
    return NextResponse.json({ success: false, error: "กรุณาระบุเหตุผลในการยกเว้นรายการนี้" }, { status: 400 });
  }

  if (message === "INVALID_STATE_TRANSITION") {
    return NextResponse.json(
      { success: false, error: "รายการนี้ไม่อยู่ในสถานะที่สามารถยกเว้นได้" },
      { status: 409 }
    );
  }

  console.error("Reconciliation exclude API error:", error);
  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json({ success: false, error: "Invalid reconciliation match ID" }, { status: 400 });
    }

    let body: unknown = {};
    const rawBody = await request.text();

    if (rawBody.trim()) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return NextResponse.json(
          { success: false, error: "Invalid request body (must be JSON)" },
          { status: 400 }
        );
      }
    }

    const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const reason = typeof b.reason === "string" ? b.reason : "";

    if (reason.length > MAX_REASON_LENGTH) {
      return NextResponse.json(
        { success: false, error: `reason ยาวเกินไป (ไม่เกิน ${MAX_REASON_LENGTH} ตัวอักษร)` },
        { status: 400 }
      );
    }

    const match = excludeReconciliation(id, reason);

    return NextResponse.json({ success: true, data: toMatchDto(match) });
  } catch (error) {
    return errorToResponse(error);
  }
}
