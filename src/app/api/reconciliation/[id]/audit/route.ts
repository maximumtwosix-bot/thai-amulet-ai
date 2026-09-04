import { NextRequest, NextResponse } from "next/server";
import { getReconciliationMatch, getReconciliationAudit } from "@/lib/reconciliation";

export const runtime = "nodejs";

// STEP D.6 — read-only audit-history endpoint, per the approved STEP D.5 audit contract. Returns the
// append-only bank_reconciliation_audit trail for one match (chronological, per
// getReconciliationAudit()'s own deterministic ordering) — no UPDATE/DELETE path exists for that
// table anywhere in src/lib/reconciliation.ts, so there is structurally nothing this route could
// expose that would let a caller edit history even if it wanted to.

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(idParam: string): number | null {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function errorToResponse(error: unknown) {
  console.error("Reconciliation audit API error:", error);
  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json({ success: false, error: "Invalid reconciliation match ID" }, { status: 400 });
    }

    // Explicit 404 check even though getReconciliationAudit() itself returns [] leniently for a
    // nonexistent match id — the STEP D.5 approved contract requires 404 here specifically.
    const match = getReconciliationMatch(id);
    if (!match) {
      return NextResponse.json({ success: false, error: "ไม่พบรายการ Reconciliation นี้" }, { status: 404 });
    }

    const entries = getReconciliationAudit(id);

    return NextResponse.json({
      success: true,
      data: entries.map((entry) => ({
        id: entry.id,
        matchId: entry.matchId,
        bankStatementTransactionId: entry.bankStatementTransactionId,
        transactionId: entry.transactionId,
        action: entry.action,
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        reason: entry.reason,
        performedBy: entry.performedBy,
        performedAt: entry.performedAt,
      })),
      count: entries.length,
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
