import { NextRequest, NextResponse } from "next/server";
import { markReconciliationMatched, type BankReconciliationMatchRow } from "@/lib/reconciliation";

export const runtime = "nodejs";

// STEP D.6 — SUGGESTED|NEEDS_REVIEW -> MATCHED, per the approved STEP D.5 audit contract. This
// endpoint exists to close the state-transition gap the D.5 audit found: without it, a SUGGESTED row
// could never move forward, since confirmReconciliation() only ever accepts MATCHED/NEEDS_REVIEW as
// a source state. MATCHED is explicitly NOT confirmation — no money is considered reconciled here;
// only a separate, later POST .../confirm call does that. Takes no request body — there is nothing a
// client could supply (no status, no actor) that this action needs.

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

  if (message === "INVALID_STATE_TRANSITION") {
    return NextResponse.json(
      { success: false, error: "รายการนี้ไม่อยู่ในสถานะที่สามารถทำรายการนี้ได้" },
      { status: 409 }
    );
  }

  console.error("Reconciliation match API error:", error);
  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json({ success: false, error: "Invalid reconciliation match ID" }, { status: 400 });
    }

    const match = markReconciliationMatched(id);

    return NextResponse.json({ success: true, data: toMatchDto(match) });
  } catch (error) {
    return errorToResponse(error);
  }
}
