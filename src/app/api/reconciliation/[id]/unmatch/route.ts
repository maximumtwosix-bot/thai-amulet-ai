import { NextRequest, NextResponse } from "next/server";
import { unmatchReconciliation, type BankReconciliationMatchRow } from "@/lib/reconciliation";

export const runtime = "nodejs";

// STEP D.6 — CONFIRMED -> UNMATCHED, per the approved STEP D.5 audit contract. The only way out of
// CONFIRMED via explicit human action. `reason` is required (unmatchReconciliation() throws
// INVALID_REASON otherwise) — never a hard delete, the row is preserved as the soft-delete marker
// (docs/RECONCILIATION_DATA_MODEL.md §10). Double-click/concurrent-unmatch safety is entirely the
// DAL's guarded-UPDATE mechanism — this route never converts a DAL CONFLICT into a success.

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
    return NextResponse.json({ success: false, error: "กรุณาระบุเหตุผลในการยกเลิกการจับคู่" }, { status: 400 });
  }

  if (message === "CONFLICT") {
    return NextResponse.json(
      {
        success: false,
        error: "รายการนี้ถูกดำเนินการไปแล้วหรือไม่อยู่ในสถานะที่สามารถยกเลิกการจับคู่ได้",
      },
      { status: 409 }
    );
  }

  console.error("Reconciliation unmatch API error:", error);
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

    const match = unmatchReconciliation(id, reason);

    return NextResponse.json({ success: true, data: toMatchDto(match) });
  } catch (error) {
    return errorToResponse(error);
  }
}
