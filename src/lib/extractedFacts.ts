import db from "./db";
import { getTaxDocumentById } from "./taxDocuments";
import { getTaxPeriodById } from "./taxPeriods";
import { getTaxDocumentRowById } from "./taxDocumentRows";
import { getExtractionRunById } from "./extractionRuns";
import { recordAuditEvent } from "./taxAuditLog";

// Extracted Facts — STEP 104 (Phases 2-5) — CRUD layer for the `extracted_facts` table added in
// the same STEP (src/lib/db.ts). See that table's schema comment for full design reasoning. This
// file performs NO extraction/OCR/AI call, no tax calculation, no WHT/VAT treatment decision, and
// NEVER creates or mutates a transactions/wht_records row. A fact is a claim about a value found in
// a source row/document — nothing more.

export type FactValueType =
  | "MONEY"
  | "DATE"
  | "DATETIME"
  | "STRING"
  | "BOOLEAN"
  | "IDENTIFIER"
  | "ENUM";

export const FACT_VALUE_TYPES: FactValueType[] = [
  "MONEY",
  "DATE",
  "DATETIME",
  "STRING",
  "BOOLEAN",
  "IDENTIFIER",
  "ENUM",
];

export function isValidFactValueType(value: string): value is FactValueType {
  return (FACT_VALUE_TYPES as string[]).includes(value);
}

// Terminal states: CONFIRMED, REJECTED. See src/lib/db.ts's schema comment for why "CORRECTED" is
// NOT a review_status value (correction is a structural, superseded_by_fact_id mechanism instead).
export type FactReviewStatus = "EXTRACTED" | "NEEDS_REVIEW" | "CONFIRMED" | "REJECTED";

export const FACT_REVIEW_STATUSES: FactReviewStatus[] = [
  "EXTRACTED",
  "NEEDS_REVIEW",
  "CONFIRMED",
  "REJECTED",
];

export function isValidFactReviewStatus(value: string): value is FactReviewStatus {
  return (FACT_REVIEW_STATUSES as string[]).includes(value);
}

function isTerminalReviewStatus(status: FactReviewStatus): boolean {
  return status === "CONFIRMED" || status === "REJECTED";
}

export type ExtractedFactRow = {
  id: number;
  taxDocumentId: number;
  taxDocumentRowId: number | null;
  extractionRunId: number;
  factKey: string;
  occurrenceIndex: number;
  valueType: FactValueType;
  valueMoneySatang: number | null;
  valueDate: string | null;
  valueDatetime: string | null;
  valueText: string | null;
  valueBoolean: boolean | null;
  currency: string | null;
  sourceFieldLabel: string | null;
  confidence: number | null;
  reviewStatus: FactReviewStatus;
  supersededByFactId: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: number;
  tax_document_id: number;
  tax_document_row_id: number | null;
  extraction_run_id: number;
  fact_key: string;
  occurrence_index: number;
  value_type: string;
  value_money_satang: number | null;
  value_date: string | null;
  value_datetime: string | null;
  value_text: string | null;
  value_boolean: number | null;
  currency: string | null;
  source_field_label: string | null;
  confidence: number | null;
  review_status: string;
  superseded_by_fact_id: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

function toRow(row: DbRow): ExtractedFactRow {
  return {
    id: row.id,
    taxDocumentId: row.tax_document_id,
    taxDocumentRowId: row.tax_document_row_id,
    extractionRunId: row.extraction_run_id,
    factKey: row.fact_key,
    occurrenceIndex: row.occurrence_index,
    valueType: row.value_type as FactValueType,
    valueMoneySatang: row.value_money_satang,
    valueDate: row.value_date,
    valueDatetime: row.value_datetime,
    valueText: row.value_text,
    valueBoolean: row.value_boolean === null ? null : row.value_boolean === 1,
    currency: row.currency,
    sourceFieldLabel: row.source_field_label,
    confidence: row.confidence,
    reviewStatus: row.review_status as FactReviewStatus,
    supersededByFactId: row.superseded_by_fact_id,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getById(id: number): ExtractedFactRow | undefined {
  const row = db.prepare("SELECT * FROM extracted_facts WHERE id = ?").get(id) as
    | DbRow
    | undefined;

  return row ? toRow(row) : undefined;
}

export function getExtractedFactById(id: number): ExtractedFactRow | undefined {
  return getById(id);
}

export function listFactsForDocument(taxDocumentId: number): ExtractedFactRow[] {
  const rows = db
    .prepare("SELECT * FROM extracted_facts WHERE tax_document_id = ? ORDER BY id ASC")
    .all(taxDocumentId) as DbRow[];

  return rows.map(toRow);
}

export function listFactsForRow(taxDocumentRowId: number): ExtractedFactRow[] {
  const rows = db
    .prepare("SELECT * FROM extracted_facts WHERE tax_document_row_id = ? ORDER BY id ASC")
    .all(taxDocumentRowId) as DbRow[];

  return rows.map(toRow);
}

// Same tiny, duplicated-per-file guard pattern as src/lib/taxDocumentRows.ts/extractionRuns.ts
// (STEP 102/104 Decision Gate E) — deliberately NOT shared. Zero changes to tax_documents.ts/
// taxPeriodEvidenceStatus.ts required.
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

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error && (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

function normalizePositiveId(value: unknown): number {
  const id = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("INVALID_ID");
  }

  return id;
}

function normalizeOptionalPositiveId(value: unknown): number | null {
  if (value === undefined || value === null) return null;

  return normalizePositiveId(value);
}

// STEP 104 Decision Gate B — fact_key is validated ONLY for shape (lowercase alnum/underscore
// segments joined by '.'), never against a closed list. Namespacing (e.g. "settlement.gross_amount")
// is a convention, not an enforced taxonomy — a caller may introduce any new key without a schema
// or code change.
const FACT_KEY_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/;
const MAX_FACT_KEY_LENGTH = 128;

function normalizeFactKey(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text || text.length > MAX_FACT_KEY_LENGTH || !FACT_KEY_PATTERN.test(text)) {
    throw new Error("INVALID_FACT_KEY");
  }

  return text;
}

function normalizeOccurrenceIndex(value: unknown): number {
  if (value === undefined || value === null) return 0;

  const index = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(index) || index < 0) {
    throw new Error("INVALID_OCCURRENCE_INDEX");
  }

  return index;
}

function isValidDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function isValidDatetimeString(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value.replace(" ", "T")))
  );
}

const MAX_TEXT_VALUE_LENGTH = 2000;
const MAX_SOURCE_FIELD_LABEL_LENGTH = 200;

export interface FactValueInput {
  valueType: string;
  valueMoneySatang?: number | null;
  valueDate?: string | null;
  valueDatetime?: string | null;
  valueText?: string | null;
  valueBoolean?: boolean | null;
  currency?: string | null;
}

type NormalizedFactValue = {
  valueType: FactValueType;
  valueMoneySatang: number | null;
  valueDate: string | null;
  valueDatetime: string | null;
  valueText: string | null;
  valueBoolean: number | null;
  currency: string | null;
};

// A fact always asserts a concrete value — exactly one value_* column populated, matching the
// declared value_type. Money is always an integer (satang) — a decimal/float input is rejected,
// never silently rounded (STEP 104's explicit "ห้ามใช้ floating-point money").
function normalizeFactValue(input: FactValueInput): NormalizedFactValue {
  const valueType = typeof input.valueType === "string" ? input.valueType : "";

  if (!isValidFactValueType(valueType)) {
    throw new Error("INVALID_VALUE_TYPE");
  }

  const result: NormalizedFactValue = {
    valueType,
    valueMoneySatang: null,
    valueDate: null,
    valueDatetime: null,
    valueText: null,
    valueBoolean: null,
    currency: null,
  };

  if (valueType === "MONEY") {
    const amount =
      typeof input.valueMoneySatang === "number"
        ? input.valueMoneySatang
        : Number(input.valueMoneySatang);

    if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
      throw new Error("INVALID_VALUE_MONEY_SATANG");
    }

    result.valueMoneySatang = amount;

    const currency =
      typeof input.currency === "string" && input.currency.trim() ? input.currency.trim().toUpperCase() : "THB";

    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error("INVALID_CURRENCY");
    }

    result.currency = currency;

    return result;
  }

  if (valueType === "DATE") {
    const value = typeof input.valueDate === "string" ? input.valueDate.trim() : "";

    if (!isValidDateString(value)) {
      throw new Error("INVALID_VALUE_DATE");
    }

    result.valueDate = value;

    return result;
  }

  if (valueType === "DATETIME") {
    const value = typeof input.valueDatetime === "string" ? input.valueDatetime.trim() : "";

    if (!isValidDatetimeString(value)) {
      throw new Error("INVALID_VALUE_DATETIME");
    }

    result.valueDatetime = value;

    return result;
  }

  if (valueType === "BOOLEAN") {
    if (typeof input.valueBoolean !== "boolean") {
      throw new Error("INVALID_VALUE_BOOLEAN");
    }

    result.valueBoolean = input.valueBoolean ? 1 : 0;

    return result;
  }

  // STRING / IDENTIFIER / ENUM all share value_text.
  const text = typeof input.valueText === "string" ? input.valueText.trim() : "";

  if (!text || text.length > MAX_TEXT_VALUE_LENGTH) {
    throw new Error("INVALID_VALUE_TEXT");
  }

  result.valueText = text;

  return result;
}

function normalizeOptionalSourceFieldLabel(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;

  const text = typeof value === "string" ? value.trim() : "";

  if (text.length > MAX_SOURCE_FIELD_LABEL_LENGTH) {
    throw new Error("SOURCE_FIELD_LABEL_TOO_LONG");
  }

  return text || null;
}

function normalizeOptionalConfidence(value: unknown): number | null {
  if (value === undefined || value === null) return null;

  const confidence = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("INVALID_CONFIDENCE");
  }

  return confidence;
}

function normalizeOptionalNote(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export interface CreateExtractedFactInput extends FactValueInput {
  extractionRunId: number;
  taxDocumentRowId?: number | null;
  factKey: string;
  occurrenceIndex?: number | null;
  sourceFieldLabel?: string | null;
  confidence?: number | null;
}

// tax_document_id is ALWAYS derived from the run (never independently supplied) — see
// src/lib/db.ts's schema comment. A fact may only be created while its run is still RUNNING.
export function createExtractedFact(input: CreateExtractedFactInput): ExtractedFactRow {
  const extractionRunId = normalizePositiveId(input.extractionRunId);
  const run = getExtractionRunById(extractionRunId);

  if (!run) {
    throw new Error("EXTRACTION_RUN_NOT_FOUND");
  }

  if (run.status !== "RUNNING") {
    throw new Error("EXTRACTION_RUN_NOT_RUNNING");
  }

  assertDocumentPeriodMutable(run.taxDocumentId);

  const taxDocumentRowId = normalizeOptionalPositiveId(input.taxDocumentRowId);

  if (taxDocumentRowId !== null) {
    const row = getTaxDocumentRowById(taxDocumentRowId);

    if (!row) {
      throw new Error("TAX_DOCUMENT_ROW_NOT_FOUND");
    }

    if (row.taxDocumentId !== run.taxDocumentId) {
      throw new Error("ROW_DOCUMENT_MISMATCH");
    }
  }

  const factKey = normalizeFactKey(input.factKey);
  const occurrenceIndex = normalizeOccurrenceIndex(input.occurrenceIndex);
  const value = normalizeFactValue(input);
  const sourceFieldLabel = normalizeOptionalSourceFieldLabel(input.sourceFieldLabel);
  const confidence = normalizeOptionalConfidence(input.confidence);

  const insert = db.transaction(() => {
    // Application-level duplicate check for the document-level case (taxDocumentRowId === null),
    // where SQLite's own unique index cannot help (NULL is never equal to NULL in a unique index) —
    // see src/lib/db.ts's schema comment. Safe within this single-process, synchronous
    // (better-sqlite3) transaction.
    if (taxDocumentRowId === null) {
      const existing = db
        .prepare(
          `
          SELECT id FROM extracted_facts
          WHERE extraction_run_id = ? AND tax_document_row_id IS NULL
            AND fact_key = ? AND occurrence_index = ?
          `
        )
        .get(extractionRunId, factKey, occurrenceIndex);

      if (existing) {
        throw new Error("DUPLICATE_FACT");
      }
    }

    let result;

    try {
      result = db
        .prepare(
          `
          INSERT INTO extracted_facts (
            tax_document_id, tax_document_row_id, extraction_run_id, fact_key, occurrence_index,
            value_type, value_money_satang, value_date, value_datetime, value_text, value_boolean,
            currency, source_field_label, confidence
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          run.taxDocumentId,
          taxDocumentRowId,
          extractionRunId,
          factKey,
          occurrenceIndex,
          value.valueType,
          value.valueMoneySatang,
          value.valueDate,
          value.valueDatetime,
          value.valueText,
          value.valueBoolean,
          value.currency,
          sourceFieldLabel,
          confidence
        );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error("DUPLICATE_FACT");
      }

      throw error;
    }

    const row = getById(Number(result.lastInsertRowid));

    if (!row) {
      throw new Error("EXTRACTED_FACT_CREATE_FAILED");
    }

    recordAuditEvent({
      entityType: "extracted_fact",
      entityId: row.id,
      action: "CREATE",
      afterData: row,
    });

    return row;
  });

  return insert();
}

// The ONLY path that changes review_status. AI/OCR code (none exists in this STEP) must never be
// the caller that sets 'CONFIRMED' — that must always trace back to an explicit, human-initiated
// API call, same convention as src/lib/taxDocuments.ts's updateReviewStatus().
export function updateFactReviewStatus(id: number, nextStatus: string): ExtractedFactRow {
  const existing = getById(id);

  if (!existing) {
    throw new Error("EXTRACTED_FACT_NOT_FOUND");
  }

  assertDocumentPeriodMutable(existing.taxDocumentId);

  if (isTerminalReviewStatus(existing.reviewStatus)) {
    throw new Error("FACT_REVIEW_TERMINAL");
  }

  if (!isValidFactReviewStatus(nextStatus)) {
    throw new Error("INVALID_REVIEW_STATUS");
  }

  if (nextStatus === existing.reviewStatus) {
    throw new Error("INVALID_STATUS_TRANSITION");
  }

  const update = db.transaction(() => {
    db.prepare(
      "UPDATE extracted_facts SET review_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(nextStatus, id);

    const row = getById(id);

    if (!row) {
      throw new Error("EXTRACTED_FACT_UPDATE_FAILED");
    }

    recordAuditEvent({
      entityType: "extracted_fact",
      entityId: id,
      action: "UPDATE",
      beforeData: existing,
      afterData: row,
    });

    return row;
  });

  return update();
}

// Pure annotation — deliberately NOT gated by terminal review_status (a note can be added even to
// a CONFIRMED/REJECTED fact, since it never changes the asserted value), same "note is metadata,
// not evidence" precedent as src/lib/taxDocumentRows.ts.
export function updateFactNote(id: number, note: string | null): ExtractedFactRow {
  const existing = getById(id);

  if (!existing) {
    throw new Error("EXTRACTED_FACT_NOT_FOUND");
  }

  assertDocumentPeriodMutable(existing.taxDocumentId);

  const nextNote = normalizeOptionalNote(note);

  const update = db.transaction(() => {
    db.prepare(
      "UPDATE extracted_facts SET note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(nextNote, id);

    const row = getById(id);

    if (!row) {
      throw new Error("EXTRACTED_FACT_UPDATE_FAILED");
    }

    recordAuditEvent({
      entityType: "extracted_fact",
      entityId: id,
      action: "UPDATE",
      beforeData: existing,
      afterData: row,
    });

    return row;
  });

  return update();
}

export interface CorrectFactInput extends FactValueInput {
  extractionRunId: number;
  sourceFieldLabel?: string | null;
  confidence?: number | null;
}

// The ONLY correction mechanism (STEP 104 Phase 3/5): NEVER rewrites the old fact's value fields —
// creates a brand-new extracted_facts row (reusing the old fact's tax_document_row_id/fact_key/
// occurrence_index, under the NEW extraction_run_id supplied here, which the caller creates first —
// typically a fresh 'MANUAL' run) and links the old fact's superseded_by_fact_id to it. This is the
// one narrow, always-audited mutation permitted on an otherwise-terminal (CONFIRMED/REJECTED) old
// fact — a forward pointer, never a value change.
export function correctFact(
  oldFactId: number,
  input: CorrectFactInput
): { oldFact: ExtractedFactRow; newFact: ExtractedFactRow } {
  const oldFact = getById(oldFactId);

  if (!oldFact) {
    throw new Error("EXTRACTED_FACT_NOT_FOUND");
  }

  if (oldFact.supersededByFactId !== null) {
    throw new Error("FACT_ALREADY_SUPERSEDED");
  }

  assertDocumentPeriodMutable(oldFact.taxDocumentId);

  const newFact = createExtractedFact({
    extractionRunId: input.extractionRunId,
    taxDocumentRowId: oldFact.taxDocumentRowId,
    factKey: oldFact.factKey,
    occurrenceIndex: oldFact.occurrenceIndex,
    valueType: input.valueType,
    valueMoneySatang: input.valueMoneySatang,
    valueDate: input.valueDate,
    valueDatetime: input.valueDatetime,
    valueText: input.valueText,
    valueBoolean: input.valueBoolean,
    currency: input.currency,
    sourceFieldLabel: input.sourceFieldLabel,
    confidence: input.confidence,
  });

  const update = db.transaction(() => {
    db.prepare(
      "UPDATE extracted_facts SET superseded_by_fact_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(newFact.id, oldFactId);

    const updatedOldFact = getById(oldFactId);

    if (!updatedOldFact) {
      throw new Error("EXTRACTED_FACT_UPDATE_FAILED");
    }

    recordAuditEvent({
      entityType: "extracted_fact",
      entityId: oldFactId,
      action: "UPDATE",
      beforeData: oldFact,
      afterData: updatedOldFact,
    });

    return updatedOldFact;
  });

  return { oldFact: update(), newFact };
}
