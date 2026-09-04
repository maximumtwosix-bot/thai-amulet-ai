import { NextRequest, NextResponse } from "next/server";
import { confirmReconciliation, type BankReconciliationMatchRow } from "@/lib/reconciliation";

export const runtime = "nodejs";

// STEP D.6 — MATCHED|NEEDS_REVIEW -> CONFIRMED, per the approved STEP D.5 audit contract. This is the
// ONLY endpoint that ever produces a real, accounting-relevant reconciliation — always an explicit,
// deliberate human action, never reachable as a side effect of anything else. Takes no request body:
// no client-supplied status, no client-supplied actor — confirmReconciliation() sets the server-side
// literal "admin" actor entirely on its own (src/lib/reconciliation.ts). Double-click/concurrent-
// confirm safety is 100% the DAL's guarded-UPDATE-inside-db.transaction() mechanism (verified live in
// STEP D.4) — this route performs zero additional locking/checking and never converts a DAL CONFLICT
// into a success.

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

  if (message === "CONFLICT") {
    return NextResponse.json(
      { success: false, error: "รายการนี้ถูกดำเนินการไปแล้วหรือไม่อยู่ในสถานะที่สามารถยืนยันได้" },
      { status: 409 }
    );
  }

  console.error("Reconciliation confirm API error:", error);
  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json({ success: false, error: "Invalid reconciliation match ID" }, { status: 400 });
    }

    const match = confirmReconciliation(id);

    return NextResponse.json({ success: true, data: toMatchDto(match) });
  } catch (error) {
    return errorToResponse(error);
  }
}
