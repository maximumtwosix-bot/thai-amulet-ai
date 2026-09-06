import db from "./db";
import { getTaxDocumentById } from "./taxDocuments";
import { getTaxPeriodById } from "./taxPeriods";
import { getTransactionById } from "./transactions";
import { recordAuditEvent } from "./taxAuditLog";

// Tax Document Rows — STEP 102 — CRUD layer for the `tax_document_rows` table added in the same
// STEP (src/lib/db.ts). See that table's schema comment for the full design reasoning. This file
// performs NO fact-extraction, OCR, AI call, tax calculation, WHT/VAT treatment decision, or
// reconciliation of any kind — it only records/reads the raw facts a human enters about one row
// within one already-uploaded tax_documents row.
//
// Every mutation here (create, link/unlink transaction, note update) is gated by
// assertDocumentPeriodMutable() below, which rejects the action if the parent document's tax
// period is CLOSED — the narrow, scope-limited fix for the STEP 101 audit's Section P finding,
// applied only to this new table (tax_documents/tax_period_evidence_status themselves are
// deliberately left untouched by this STEP).

export type TaxDocumentRowRow = {
  id: number;
  taxDocumentId: number;
  rowIndex: number;
  sourceReference: string | null;
  eventDate: string | null;
  description: string | null;
  amountSatang: number | null;
  rawRowText: string | null;
  transactionId: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: number;
  tax_document_id: number;
  row_index: number;
  source_reference: string | null;
  event_date: string | null;
  description: string | null;
  amount_satang: number | null;
  raw_row_text: string | null;
  transaction_id: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

function toRow(row: DbRow): TaxDocumentRowRow {
  return {
    id: row.id,
    taxDocumentId: row.tax_document_id,
    rowIndex: row.row_index,
    sourceReference: row.source_reference,
    eventDate: row.event_date,
    description: row.description,
    amountSatang: row.amount_satang,
    rawRowText: row.raw_row_text,
    transactionId: row.transaction_id,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getById(id: number): TaxDocumentRowRow | undefined {
  const row = db.prepare("SELECT * FROM tax_document_rows WHERE id = ?").get(id) as
    | DbRow
    | undefined;

  return row ? toRow(row) : undefined;
}

export function getTaxDocumentRowById(id: number): TaxDocumentRowRow | undefined {
  return getById(id);
}

export function listTaxDocumentRows(taxDocumentId: number): TaxDocumentRowRow[] {
  const rows = db
    .prepare("SELECT * FROM tax_document_rows WHERE tax_document_id = ? ORDER BY row_index ASC")
    .all(taxDocumentId) as DbRow[];

  return rows.map(toRow);
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error && (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

// The single, scope-limited CLOSED-period guard this STEP adds (see src/lib/db.ts's schema
// comment). Deliberately does NOT touch tax_documents.ts/taxPeriodEvidenceStatus.ts — this only
// gates mutations on the NEW tax_document_rows table.
function assertDocumentPeriodMutable(taxDocumentId: number): void {
  const document = getTaxDocumentById(taxDocumentId);

  if (!document) {
    throw new Error("TAX_DOCUMENT_NOT_FOUND");
  }

  if (document.taxPeriodId !== null) {
    const period = getTaxPeriodById(document.taxPeriodId);

    if (period && period.status === "CLOSED") {
      throw new Error("TAX_PERIOD_CLOSED");
    }
  }
}

function normalizeRowIndex(value: unknown): number {
  const index = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(index) || index < 0) {
    throw new Error("INVALID_ROW_INDEX");
  }

  return index;
}

function normalizeOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isValidDateString(value: string): boolean {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));
}

function normalizeOptionalDate(value: unknown, errorCode: string): string | null {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value !== "string" || !isValidDateString(value)) {
    throw new Error(errorCode);
  }

  return value;
}

// Sign is meaningful (positive/negative/zero all legitimate) — no business-rule check beyond
// "finite integer", per this table's own schema comment. Never a WHT-rate/tax-treatment assertion.
function normalizeOptionalAmountSatang(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;

  const amount = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    throw new Error("INVALID_AMOUNT_SATANG");
  }

  return amount;
}

function normalizePositiveId(value: unknown): number | null {
  if (value === undefined || value === null) return null;

  const id = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("INVALID_ID");
  }

  return id;
}

function assertTransactionExists(transactionId: number): void {
  if (!getTransactionById(transactionId)) {
    throw new Error("TRANSACTION_NOT_FOUND");
  }
}

export interface CreateTaxDocumentRowInput {
  taxDocumentId: number;
  rowIndex: number;
  sourceReference?: string | null;
  eventDate?: string | null;
  description?: string | null;
  amountSatang?: number | null;
  rawRowText?: string | null;
  transactionId?: number | null;
  note?: string | null;
}

// transaction_id, if supplied, is a reference/link to an ALREADY-EXISTING transaction only — this
// function never inserts into "transactions". row_index must be supplied explicitly by the caller
// (no auto-numbering) — see src/lib/db.ts's schema comment for why.
export function createTaxDocumentRow(input: CreateTaxDocumentRowInput): TaxDocumentRowRow {
  const taxDocumentId = normalizePositiveId(input.taxDocumentId);

  if (taxDocumentId === null) {
    throw new Error("INVALID_TAX_DOCUMENT_ID");
  }

  if (!getTaxDocumentById(taxDocumentId)) {
    throw new Error("TAX_DOCUMENT_NOT_FOUND");
  }

  assertDocumentPeriodMutable(taxDocumentId);

  const rowIndex = normalizeRowIndex(input.rowIndex);
  const sourceReference = normalizeOptionalText(input.sourceReference);
  const eventDate = normalizeOptionalDate(input.eventDate, "INVALID_EVENT_DATE");
  const description = normalizeOptionalText(input.description);
  const amountSatang = normalizeOptionalAmountSatang(input.amountSatang);
  const rawRowText = normalizeOptionalText(input.rawRowText);

  const transactionId = normalizePositiveId(input.transactionId);

  if (transactionId !== null) {
    assertTransactionExists(transactionId);
  }

  const note = normalizeOptionalText(input.note);

  const insert = db.transaction(() => {
    let result;

    try {
      result = db
        .prepare(
          `
          INSERT INTO tax_document_rows (
            tax_document_id, row_index, source_reference, event_date, description,
            amount_satang, raw_row_text, transaction_id, note
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          taxDocumentId,
          rowIndex,
          sourceReference,
          eventDate,
          description,
          amountSatang,
          rawRowText,
          transactionId,
          note
        );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error("DUPLICATE_ROW_INDEX");
      }

      throw error;
    }

    const row = getById(Number(result.lastInsertRowid));

    if (!row) {
      throw new Error("TAX_DOCUMENT_ROW_CREATE_FAILED");
    }

    recordAuditEvent({
      entityType: "tax_document_row",
      entityId: row.id,
      action: "CREATE",
      afterData: row,
    });

    return row;
  });

  return insert();
}

export interface UpdateTaxDocumentRowInput {
  transactionId?: number | null;
  note?: string | null;
}

// The ONLY mutation path for an existing row — restricted to transaction_id (link/unlink an
// EXISTING transaction only, never created here) and note. Every other field
// (row_index/source_reference/event_date/amount_satang/raw_row_text) is immutable by construction:
// this function has no code path that writes to them.
export function updateTaxDocumentRow(
  id: number,
  input: UpdateTaxDocumentRowInput
): TaxDocumentRowRow {
  const existing = getById(id);

  if (!existing) {
    throw new Error("TAX_DOCUMENT_ROW_NOT_FOUND");
  }

  assertDocumentPeriodMutable(existing.taxDocumentId);

  const nextTransactionId =
    input.transactionId === undefined
      ? existing.transactionId
      : normalizePositiveId(input.transactionId);

  if (nextTransactionId !== null) {
    assertTransactionExists(nextTransactionId);
  }

  const nextNote = input.note === undefined ? existing.note : normalizeOptionalText(input.note);

  const update = db.transaction(() => {
    db.prepare(
      `
      UPDATE tax_document_rows
      SET transaction_id = ?, note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `
    ).run(nextTransactionId, nextNote, id);

    const row = getById(id);

    if (!row) {
      throw new Error("TAX_DOCUMENT_ROW_UPDATE_FAILED");
    }

    recordAuditEvent({
      entityType: "tax_document_row",
      entityId: id,
      action: "UPDATE",
      beforeData: existing,
      afterData: row,
    });

    return row;
  });

  return update();
}
