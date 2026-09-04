import { NextRequest, NextResponse } from "next/server";
import { createReconciliationSuggestion, type BankReconciliationMatchRow } from "@/lib/reconciliation";

export const runtime = "nodejs";

// STEP D.6 — creates a SUGGESTED-only mapping row, per the approved STEP D.5 audit contract. This is
// NOT a candidate-search/matching engine — the caller must already supply both IDs (a future UI
// decides the pairing, e.g. by a human visually comparing two lists); this route only records that
// decision. All semantic validation (FK existence, allocated_amount sign/integer/sum-overflow,
// match_strategy enum) lives exclusively in createReconciliationSuggestion() (src/lib/
// reconciliation.ts) — this route never re-implements or duplicates any of it. Only the five named
// fields below are ever read off the request body; any other field (status, actor, id, ...) is
// silently ignored and can never influence the created row.

const MAX_NOTE_LENGTH = 2000;

function errorToResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";

  const notFound: Record<string, string> = {
    SOURCE_NOT_FOUND: "ไม่พบรายการ Bank Statement Transaction นี้",
    TRANSACTION_NOT_FOUND: "ไม่พบรายการธุรกรรมทางการเงินนี้",
  };
  if (message in notFound) {
    return NextResponse.json({ success: false, error: notFound[message] }, { status: 404 });
  }

  const badRequest: Record<string, string> = {
    INVALID_BANK_STATEMENT_TRANSACTION_ID: "bankStatementTransactionId ไม่ถูกต้อง",
    INVALID_TRANSACTION_ID: "transactionId ไม่ถูกต้อง",
    INVALID_STRATEGY: "matchStrategy ไม่ถูกต้อง",
    INVALID_ALLOCATION_AMOUNT:
      "allocatedAmount ต้องเป็นจำนวนเต็ม (สตางค์) ไม่เป็นศูนย์ และมีเครื่องหมายตรงกับรายการธนาคาร",
  };
  if (message in badRequest) {
    return NextResponse.json({ success: false, error: badRequest[message] }, { status: 400 });
  }

  const conflict: Record<string, string> = {
    DUPLICATE_MATCH: "มีการจับคู่ที่ยังใช้งานอยู่ระหว่างสองรายการนี้แล้ว",
    ALLOCATION_EXCEEDS_BANK_TRANSACTION: "จำนวนเงินที่จัดสรรเกินยอดรายการธนาคาร",
    ALLOCATION_EXCEEDS_FINANCIAL_TRANSACTION: "จำนวนเงินที่จัดสรรเกินยอดรายการทางการเงิน",
  };
  if (message in conflict) {
    return NextResponse.json({ success: false, error: conflict[message] }, { status: 409 });
  }

  console.error("Reconciliation suggest API error:", error);
  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
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
      return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
    }

    const b = body as Record<string, unknown>;

    const bankStatementTransactionId = Number(b.bankStatementTransactionId);
    if (!Number.isInteger(bankStatementTransactionId) || bankStatementTransactionId <= 0) {
      return NextResponse.json(
        { success: false, error: "bankStatementTransactionId ไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const transactionId = Number(b.transactionId);
    if (!Number.isInteger(transactionId) || transactionId <= 0) {
      return NextResponse.json({ success: false, error: "transactionId ไม่ถูกต้อง" }, { status: 400 });
    }

    if (typeof b.allocatedAmount !== "number") {
      return NextResponse.json({ success: false, error: "allocatedAmount ต้องเป็นตัวเลข" }, { status: 400 });
    }

    if (typeof b.matchStrategy !== "string") {
      return NextResponse.json({ success: false, error: "matchStrategy ต้องเป็นข้อความ" }, { status: 400 });
    }

    let note: string | null = null;
    if (b.note !== undefined && b.note !== null) {
      if (typeof b.note !== "string") {
        return NextResponse.json({ success: false, error: "note ต้องเป็นข้อความ" }, { status: 400 });
      }
      if (b.note.length > MAX_NOTE_LENGTH) {
        return NextResponse.json(
          { success: false, error: `note ยาวเกินไป (ไม่เกิน ${MAX_NOTE_LENGTH} ตัวอักษร)` },
          { status: 400 }
        );
      }
      note = b.note;
    }

    const match = createReconciliationSuggestion({
      bankStatementTransactionId,
      transactionId,
      allocatedAmount: b.allocatedAmount,
      matchStrategy: b.matchStrategy,
      note,
    });

    return NextResponse.json({ success: true, data: toMatchDto(match) }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
