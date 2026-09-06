import db from "./db";
import { assertTaxpayerProfileExists } from "./taxpayerProfile";
import { assertTaxPeriodExists } from "./taxPeriods";
import { recordAuditEvent } from "./taxAuditLog";
import { isValidDocumentType, isValidDocumentSource } from "./taxDocumentTypes";

// Tax Documents — STEP 100 — the standalone evidence store the STEP 99 audit found necessary.
// See src/lib/db.ts's schema comment for the full design reasoning. This file does NOT perform
// any file I/O (writing the file to disk is the API route's job, same separation-of-concerns
// convention as src/lib/transactionAttachments.ts) and does NOT perform any extraction/OCR/AI
// call — this STEP's approved scope explicitly excludes that. Every field here is either supplied
// by the caller (already-validated file metadata) or a plain human-set classification/status value.
//
// No calculation, no WHT-applicability decision, no gross/net determination, no VAT-registration
// conclusion is made anywhere in this file.

export type TaxDocumentReviewStatus =
  | "UPLOADED"
  | "PROCESSING"
  | "EXTRACTED"
  | "NEEDS_REVIEW"
  | "CONFIRMED"
  | "REJECTED"
  | "DUPLICATE"
  | "FAILED";

export const TAX_DOCUMENT_REVIEW_STATUSES: TaxDocumentReviewStatus[] = [
  "UPLOADED",
  "PROCESSING",
  "EXTRACTED",
  "NEEDS_REVIEW",
  "CONFIRMED",
  "REJECTED",
  "DUPLICATE",
  "FAILED",
];

export function isValidReviewStatus(value: string): value is TaxDocumentReviewStatus {
  return (TAX_DOCUMENT_REVIEW_STATUSES as string[]).includes(value);
}

// CONFIRMED is the one terminal value — the concrete mechanism behind "AI may propose, only a
// human confirms, and a confirmation is not casually reversed." Every other status may transition
// to any other non-CONFIRMED status (a simple, permissive foundation, matching src/lib/taxPeriods.ts's
// own "not a strict adjacency graph" choice) — only entering/leaving CONFIRMED is restricted.
function assertReviewStatusMutable(current: TaxDocumentReviewStatus): void {
  if (current === "CONFIRMED") {
    throw new Error("TAX_DOCUMENT_CONFIRMED");
  }
}

export type TaxDocumentRow = {
  id: number;
  taxpayerProfileId: number;
  taxPeriodId: number | null;
  transactionId: number | null;
  documentType: string | null;
  source: string | null;
  originalFilename: string;
  fileName: string;
  fileUrl: string;
  fileHash: string;
  mimeType: string;
  fileExtension: string;
  fileSizeBytes: number;
  documentDate: string | null;
  statementPeriodFrom: string | null;
  statementPeriodTo: string | null;
  reviewStatus: TaxDocumentReviewStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: number;
  taxpayer_profile_id: number;
  tax_period_id: number | null;
  transaction_id: number | null;
  document_type: string | null;
  source: string | null;
  original_filename: string;
  file_name: string;
  file_url: string;
  file_hash: string;
  mime_type: string;
  file_extension: string;
  file_size_bytes: number;
  document_date: string | null;
  statement_period_from: string | null;
  statement_period_to: string | null;
  review_status: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

function toRow(row: DbRow): TaxDocumentRow {
  return {
    id: row.id,
    taxpayerProfileId: row.taxpayer_profile_id,
    taxPeriodId: row.tax_period_id,
    transactionId: row.transaction_id,
    documentType: row.document_type,
    source: row.source,
    originalFilename: row.original_filename,
    fileName: row.file_name,
    fileUrl: row.file_url,
    fileHash: row.file_hash,
    mimeType: row.mime_type,
    fileExtension: row.file_extension,
    fileSizeBytes: row.file_size_bytes,
    documentDate: row.document_date,
    statementPeriodFrom: row.statement_period_from,
    statementPeriodTo: row.statement_period_to,
    reviewStatus: row.review_status as TaxDocumentReviewStatus,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getById(id: number): TaxDocumentRow | undefined {
  const row = db.prepare("SELECT * FROM tax_documents WHERE id = ?").get(id) as
    | DbRow
    | undefined;

  return row ? toRow(row) : undefined;
}

export function getTaxDocumentById(id: number): TaxDocumentRow | undefined {
  return getById(id);
}

// Exported so the upload route can check for a duplicate BEFORE writing the file to disk — the
// DB-level unique constraint (idx_tax_documents_taxpayer_hash) inside createTaxDocument() remains
// the authoritative, race-free backstop; this is purely to avoid the wasted/orphaned disk write on
// the common path (same fix already applied to the transaction-attachments upload route, STEP 96).
export function getTaxDocumentByHash(
  taxpayerProfileId: number,
  fileHash: string
): TaxDocumentRow | undefined {
  const row = db
    .prepare("SELECT * FROM tax_documents WHERE taxpayer_profile_id = ? AND file_hash = ?")
    .get(taxpayerProfileId, fileHash) as DbRow | undefined;

  return row ? toRow(row) : undefined;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error && (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

function normalizeRequiredText(value: unknown, errorCode: string): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw new Error(errorCode);
  }

  return text;
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

function normalizePositiveId(value: unknown): number | null {
  if (value === undefined || value === null) return null;

  const id = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("INVALID_ID");
  }

  return id;
}

function assertTransactionExists(transactionId: number): void {
  const row = db.prepare("SELECT id FROM transactions WHERE id = ?").get(transactionId);

  if (!row) {
    throw new Error("TRANSACTION_NOT_FOUND");
  }
}

export interface CreateTaxDocumentInput {
  taxpayerProfileId: number;
  taxPeriodId?: number | null;
  transactionId?: number | null;
  documentType?: string | null;
  source?: string | null;
  originalFilename: string;
  fileName: string;
  fileUrl: string;
  fileHash: string;
  mimeType: string;
  fileExtension: string;
  fileSizeBytes: number;
  documentDate?: string | null;
  statementPeriodFrom?: string | null;
  statementPeriodTo?: string | null;
  note?: string | null;
}

// The caller (API route) has already written the file to disk and computed its SHA-256 hash
// before this is called — this function only records metadata, matching the exact separation of
// concerns already used by src/lib/transactionAttachments.ts's insertTransactionAttachment().
// review_status always starts 'UPLOADED' — never client-settable on create.
export function createTaxDocument(input: CreateTaxDocumentInput): TaxDocumentRow {
  const taxpayerProfileId = normalizePositiveId(input.taxpayerProfileId);

  if (taxpayerProfileId === null) {
    throw new Error("INVALID_TAXPAYER_PROFILE_ID");
  }

  assertTaxpayerProfileExists(taxpayerProfileId);

  const taxPeriodId = normalizePositiveId(input.taxPeriodId);

  if (taxPeriodId !== null) {
    assertTaxPeriodExists(taxPeriodId);
  }

  const transactionId = normalizePositiveId(input.transactionId);

  if (transactionId !== null) {
    assertTransactionExists(transactionId);
  }

  const documentTypeRaw = normalizeOptionalText(input.documentType);

  if (documentTypeRaw !== null && !isValidDocumentType(documentTypeRaw)) {
    throw new Error("INVALID_DOCUMENT_TYPE");
  }

  const sourceRaw = normalizeOptionalText(input.source);

  if (sourceRaw !== null && !isValidDocumentSource(sourceRaw)) {
    throw new Error("INVALID_DOCUMENT_SOURCE");
  }

  const originalFilename = normalizeRequiredText(input.originalFilename, "INVALID_ORIGINAL_FILENAME");
  const fileName = normalizeRequiredText(input.fileName, "INVALID_FILE_NAME");
  const fileUrl = normalizeRequiredText(input.fileUrl, "INVALID_FILE_URL");
  const fileHash = normalizeRequiredText(input.fileHash, "INVALID_FILE_HASH");
  const mimeType = normalizeRequiredText(input.mimeType, "INVALID_MIME_TYPE");
  const fileExtension = normalizeRequiredText(input.fileExtension, "INVALID_FILE_EXTENSION");

  const fileSizeBytes =
    typeof input.fileSizeBytes === "number" ? input.fileSizeBytes : Number(input.fileSizeBytes);

  if (!Number.isInteger(fileSizeBytes) || fileSizeBytes <= 0) {
    throw new Error("INVALID_FILE_SIZE");
  }

  const documentDate = normalizeOptionalDate(input.documentDate, "INVALID_DOCUMENT_DATE");
  const statementPeriodFrom = normalizeOptionalDate(
    input.statementPeriodFrom,
    "INVALID_STATEMENT_PERIOD_FROM"
  );
  const statementPeriodTo = normalizeOptionalDate(
    input.statementPeriodTo,
    "INVALID_STATEMENT_PERIOD_TO"
  );

  if (
    statementPeriodFrom !== null &&
    statementPeriodTo !== null &&
    statementPeriodFrom > statementPeriodTo
  ) {
    throw new Error("INVALID_STATEMENT_PERIOD_RANGE");
  }

  const note = normalizeOptionalText(input.note);

  const insert = db.transaction(() => {
    let result;

    try {
      result = db
        .prepare(
          `
          INSERT INTO tax_documents (
            taxpayer_profile_id, tax_period_id, transaction_id, document_type, source,
            original_filename, file_name, file_url, file_hash, mime_type, file_extension,
            file_size_bytes, document_date, statement_period_from, statement_period_to, note
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          taxpayerProfileId,
          taxPeriodId,
          transactionId,
          documentTypeRaw,
          sourceRaw,
          originalFilename,
          fileName,
          fileUrl,
          fileHash,
          mimeType,
          fileExtension,
          fileSizeBytes,
          documentDate,
          statementPeriodFrom,
          statementPeriodTo,
          note
        );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error("DUPLICATE_DOCUMENT_HASH");
      }

      throw error;
    }

    const row = getById(Number(result.lastInsertRowid));

    if (!row) {
      throw new Error("TAX_DOCUMENT_CREATE_FAILED");
    }

    recordAuditEvent({
      entityType: "tax_document",
      entityId: row.id,
      action: "CREATE",
      afterData: row,
    });

    return row;
  });

  return insert();
}

export interface ListTaxDocumentsFilters {
  taxpayerProfileId?: number;
  taxPeriodId?: number;
  transactionId?: number;
  documentType?: string;
  reviewStatus?: string;
  unlinkedOnly?: boolean;
}

// unlinkedOnly surfaces exactly the "evidence exists, no transaction/period match yet" case this
// STEP exists to support.
export function listTaxDocuments(filters: ListTaxDocumentsFilters = {}): TaxDocumentRow[] {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters.taxpayerProfileId !== undefined) {
    conditions.push("taxpayer_profile_id = ?");
    params.push(filters.taxpayerProfileId);
  }

  if (filters.taxPeriodId !== undefined) {
    conditions.push("tax_period_id = ?");
    params.push(filters.taxPeriodId);
  }

  if (filters.transactionId !== undefined) {
    conditions.push("transaction_id = ?");
    params.push(filters.transactionId);
  }

  if (filters.documentType) {
    conditions.push("document_type = ?");
    params.push(filters.documentType);
  }

  if (filters.reviewStatus) {
    conditions.push("review_status = ?");
    params.push(filters.reviewStatus);
  }

  if (filters.unlinkedOnly) {
    conditions.push("transaction_id IS NULL");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `
      SELECT * FROM tax_documents
      ${whereClause}
      ORDER BY id DESC
      `
    )
    .all(...params) as DbRow[];

  return rows.map(toRow);
}

export interface UpdateTaxDocumentInput {
  taxPeriodId?: number | null;
  transactionId?: number | null;
  documentType?: string | null;
  source?: string | null;
  documentDate?: string | null;
  statementPeriodFrom?: string | null;
  statementPeriodTo?: string | null;
  note?: string | null;
}

// taxpayerProfileId, the file's own identity fields (filename/hash/MIME/etc.), and reviewStatus
// are never accepted here — reviewStatus has its own dedicated function below (updateReviewStatus)
// so a status transition is always its own explicit, auditable action, same convention as
// src/lib/taxYears.ts's transitionTaxYearStatus() being separate from any generic update.
export function updateTaxDocument(id: number, input: UpdateTaxDocumentInput): TaxDocumentRow {
  const existing = getById(id);

  if (!existing) {
    throw new Error("TAX_DOCUMENT_NOT_FOUND");
  }

  assertReviewStatusMutable(existing.reviewStatus);

  const nextTaxPeriodId =
    input.taxPeriodId === undefined ? existing.taxPeriodId : normalizePositiveId(input.taxPeriodId);

  if (nextTaxPeriodId !== null) {
    assertTaxPeriodExists(nextTaxPeriodId);
  }

  const nextTransactionId =
    input.transactionId === undefined
      ? existing.transactionId
      : normalizePositiveId(input.transactionId);

  if (nextTransactionId !== null) {
    assertTransactionExists(nextTransactionId);
  }

  const nextDocumentType =
    input.documentType === undefined ? existing.documentType : normalizeOptionalText(input.documentType);

  if (nextDocumentType !== null && !isValidDocumentType(nextDocumentType)) {
    throw new Error("INVALID_DOCUMENT_TYPE");
  }

  const nextSource = input.source === undefined ? existing.source : normalizeOptionalText(input.source);

  if (nextSource !== null && !isValidDocumentSource(nextSource)) {
    throw new Error("INVALID_DOCUMENT_SOURCE");
  }

  const nextDocumentDate =
    input.documentDate === undefined
      ? existing.documentDate
      : normalizeOptionalDate(input.documentDate, "INVALID_DOCUMENT_DATE");

  const nextStatementPeriodFrom =
    input.statementPeriodFrom === undefined
      ? existing.statementPeriodFrom
      : normalizeOptionalDate(input.statementPeriodFrom, "INVALID_STATEMENT_PERIOD_FROM");

  const nextStatementPeriodTo =
    input.statementPeriodTo === undefined
      ? existing.statementPeriodTo
      : normalizeOptionalDate(input.statementPeriodTo, "INVALID_STATEMENT_PERIOD_TO");

  if (
    nextStatementPeriodFrom !== null &&
    nextStatementPeriodTo !== null &&
    nextStatementPeriodFrom > nextStatementPeriodTo
  ) {
    throw new Error("INVALID_STATEMENT_PERIOD_RANGE");
  }

  const nextNote = input.note === undefined ? existing.note : normalizeOptionalText(input.note);

  const update = db.transaction(() => {
    db.prepare(
      `
      UPDATE tax_documents
      SET
        tax_period_id = ?,
        transaction_id = ?,
        document_type = ?,
        source = ?,
        document_date = ?,
        statement_period_from = ?,
        statement_period_to = ?,
        note = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `
    ).run(
      nextTaxPeriodId,
      nextTransactionId,
      nextDocumentType,
      nextSource,
      nextDocumentDate,
      nextStatementPeriodFrom,
      nextStatementPeriodTo,
      nextNote,
      id
    );

    const row = getById(id);

    if (!row) {
      throw new Error("TAX_DOCUMENT_UPDATE_FAILED");
    }

    recordAuditEvent({
      entityType: "tax_document",
      entityId: id,
      action: "UPDATE",
      beforeData: existing,
      afterData: row,
    });

    return row;
  });

  return update();
}

// The one and only path that changes review_status. AI/OCR code (none exists in this STEP) must
// never be the caller that sets 'CONFIRMED' — that must always trace back to an explicit,
// human-initiated API call. See assertReviewStatusMutable() above for the terminal-state guard.
export function updateReviewStatus(id: number, nextStatus: string): TaxDocumentRow {
  const existing = getById(id);

  if (!existing) {
    throw new Error("TAX_DOCUMENT_NOT_FOUND");
  }

  if (!isValidReviewStatus(nextStatus)) {
    throw new Error("INVALID_REVIEW_STATUS");
  }

  assertReviewStatusMutable(existing.reviewStatus);

  if (nextStatus === existing.reviewStatus) {
    throw new Error("INVALID_STATUS_TRANSITION");
  }

  const update = db.transaction(() => {
    db.prepare(
      "UPDATE tax_documents SET review_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(nextStatus, id);

    const row = getById(id);

    if (!row) {
      throw new Error("TAX_DOCUMENT_UPDATE_FAILED");
    }

    recordAuditEvent({
      entityType: "tax_document",
      entityId: id,
      action: "UPDATE",
      beforeData: existing,
      afterData: row,
    });

    return row;
  });

  return update();
}
