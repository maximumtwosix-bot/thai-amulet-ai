import { NextRequest, NextResponse } from "next/server";
import { listReconciliationMatches, type BankReconciliationMatchRow } from "@/lib/reconciliation";

export const runtime = "nodejs";

// STEP D.6 — list endpoint, per the approved STEP D.5 audit contract. Auth is NOT re-checked here —
// src/proxy.ts gates "/api/reconciliation" (added alongside this file, see proxy.ts diff), same
// convention as every other admin API in this codebase. Thin wrapper only: all filtering/ordering
// logic lives in listReconciliationMatches() (src/lib/reconciliation.ts) — this route never builds
// its own SQL or re-implements ordering.

function errorToResponse(error: unknown) {
  console.error("Reconciliation list API error:", error);
  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

// Response DTO built explicitly field-by-field (never spreads the raw row) — same convention as
// every other list endpoint in this codebase (bank-accounts/route.ts's toListItem(), etc.).
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

// STEP D.5 §9 — status filter is passed through unvalidated (an unrecognized value simply matches
// zero rows), matching GET /api/bank-accounts's exact classification-filter convention — no format
// re-check duplicated here since listReconciliationMatches() already only ever compares it against
// real column values.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const bankStatementTransactionIdParam = searchParams.get("bankStatementTransactionId");
    let bankStatementTransactionId: number | undefined;

    if (bankStatementTransactionIdParam !== null && bankStatementTransactionIdParam !== "") {
      const parsed = Number(bankStatementTransactionIdParam);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        return NextResponse.json(
          { success: false, error: "Invalid bankStatementTransactionId" },
          { status: 400 }
        );
      }

      bankStatementTransactionId = parsed;
    }

    const transactionIdParam = searchParams.get("transactionId");
    let transactionId: number | undefined;

    if (transactionIdParam !== null && transactionIdParam !== "") {
      const parsed = Number(transactionIdParam);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        return NextResponse.json({ success: false, error: "Invalid transactionId" }, { status: 400 });
      }

      transactionId = parsed;
    }

    const limitParam = searchParams.get("limit");
    let limit: number | undefined;

    if (limitParam !== null && limitParam !== "") {
      const parsedLimit = Number(limitParam);

      if (!Number.isInteger(parsedLimit) || parsedLimit <= 0 || parsedLimit > 500) {
        return NextResponse.json(
          { success: false, error: "Invalid limit. Must be an integer between 1 and 500" },
          { status: 400 }
        );
      }

      limit = parsedLimit;
    }

    const rows = listReconciliationMatches({
      status: searchParams.get("status") || undefined,
      bankStatementTransactionId,
      transactionId,
      limit,
    });

    return NextResponse.json({ success: true, data: rows.map(toMatchDto), count: rows.length });
  } catch (error) {
    return errorToResponse(error);
  }
}
