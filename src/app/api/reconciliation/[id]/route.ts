import { NextRequest, NextResponse } from "next/server";
import { getReconciliationMatch, evaluateReconciliationMatchStaleness } from "@/lib/reconciliation";

export const runtime = "nodejs";

// STEP D.6 — read-only detail endpoint, per the approved STEP D.5 audit contract. This is the
// primary place evaluateReconciliationMatchStaleness() (the LAZY NEEDS_REVIEW model, STEP D.4) is
// surfaced — a pure, read-only computation with zero DB side effect (verified live in STEP D.4);
// calling it here does not make this GET handler a mutation. No other endpoint calls it.

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(idParam: string): number | null {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function errorToResponse(error: unknown) {
  console.error("Reconciliation detail API error:", error);
  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json({ success: false, error: "Invalid reconciliation match ID" }, { status: 400 });
    }

    const match = getReconciliationMatch(id);

    if (!match) {
      return NextResponse.json({ success: false, error: "ไม่พบรายการ Reconciliation นี้" }, { status: 404 });
    }

    const staleness = evaluateReconciliationMatchStaleness(match);

    return NextResponse.json({
      success: true,
      data: {
        id: match.id,
        bankStatementTransactionId: match.bankStatementTransactionId,
        transactionId: match.transactionId,
        allocatedAmount: match.allocatedAmount,
        matchStrategy: match.matchStrategy,
        status: match.status,
        note: match.note,
        createdAt: match.createdAt,
        updatedAt: match.updatedAt,
        confirmedAt: match.confirmedAt,
        confirmedBy: match.confirmedBy,
        unmatchedAt: match.unmatchedAt,
        unmatchedBy: match.unmatchedBy,
        possiblyStale: staleness.possiblyStale,
        staleReason: staleness.reason,
      },
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
