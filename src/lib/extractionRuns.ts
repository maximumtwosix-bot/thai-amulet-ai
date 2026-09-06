import db from "./db";
import { getTaxDocumentById } from "./taxDocuments";
import { getTaxPeriodById } from "./taxPeriods";
import { recordAuditEvent } from "./taxAuditLog";

// Extraction Runs — STEP 104 (Phase 2, Decision Gate C) — CRUD layer for the `extraction_runs`
// table added in the same STEP (src/lib/db.ts). See that table's schema comment for full design
// reasoning. This file performs NO parsing, OCR, or AI call of any kind — it only records the
// bookkeeping of an extraction attempt a caller declares (including 'MANUAL' human entry).

export type ExtractionMethod = "MANUAL" | "DETERMINISTIC_PARSER" | "OCR" | "AI";

export const EXTRACTION_METHODS: ExtractionMethod[] = [
  "MANUAL",
  "DETERMINISTIC_PARSER",
  "OCR",
  "AI",
];

export function isValidExtractionMethod(value: string): value is ExtractionMethod {
  return (EXTRACTION_METHODS as string[]).includes(value);
}

export type ExtractionRunStatus = "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export const EXTRACTION_RUN_STATUSES: ExtractionRunStatus[] = [
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

export function isValidExtractionRunStatus(value: string): value is ExtractionRunStatus {
  return (EXTRACTION_RUN_STATUSES as string[]).includes(value);
}

export type ExtractionRunRow = {
  id: number;
  taxDocumentId: number;
  extractionMethod: ExtractionMethod;
  extractorProvider: string | null;
  extractorVersion: string | null;
  modelIdentifier: string | null;
  status: ExtractionRunStatus;
  startedAt: string;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type DbRow = {
  id: number;
  tax_document_id: number;
  extraction_method: string;
  extractor_provider: string | null;
  extractor_version: string | null;
  model_identifier: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
};

function toRow(row: DbRow): ExtractionRunRow {
  return {
    id: row.id,
    taxDocumentId: row.tax_document_id,
    extractionMethod: row.extraction_method as ExtractionMethod,
    extractorProvider: row.extractor_provider,
    extractorVersion: row.extractor_version,
    modelIdentifier: row.model_identifier,
    status: row.status as ExtractionRunStatus,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

function getById(id: number): ExtractionRunRow | undefined {
  const row = db.prepare("SELECT * FROM extraction_runs WHERE id = ?").get(id) as
    | DbRow
    | undefined;

  return row ? toRow(row) : undefined;
}

export function getExtractionRunById(id: number): ExtractionRunRow | undefined {
  return getById(id);
}

export function listExtractionRunsForDocument(taxDocumentId: number): ExtractionRunRow[] {
  const rows = db
    .prepare("SELECT * FROM extraction_runs WHERE tax_document_id = ? ORDER BY id DESC")
    .all(taxDocumentId) as DbRow[];

  return rows.map(toRow);
}

// Same tiny, duplicated-per-file guard pattern as src/lib/taxDocumentRows.ts's own
// assertDocumentPeriodMutable() (STEP 102) — deliberately NOT shared/imported, matching this
// codebase's established convention (e.g. isUniqueConstraintError() duplicated per DAL file).
// Zero changes to tax_documents.ts/taxPeriodEvidenceStatus.ts required (STEP 104 Decision Gate E).
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

function normalizePositiveId(value: unknown): number {
  const id = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("INVALID_ID");
  }

  return id;
}

const MAX_DESCRIPTIVE_TEXT_LENGTH = 128;

function normalizeOptionalDescriptiveText(value: unknown, errorCode: string): string | null {
  if (value === undefined || value === null || value === "") return null;

  const text = typeof value === "string" ? value.trim() : "";

  if (!text || text.length > MAX_DESCRIPTIVE_TEXT_LENGTH) {
    throw new Error(errorCode);
  }

  return text;
}

export interface CreateExtractionRunInput {
  taxDocumentId: number;
  extractionMethod: string;
  extractorProvider?: string | null;
  extractorVersion?: string | null;
  modelIdentifier?: string | null;
}

// status always starts 'RUNNING' — never client-settable on create, matching this codebase's
// "no client-settable initial state" convention (createBankAccount(), createTaxPeriod()).
export function createExtractionRun(input: CreateExtractionRunInput): ExtractionRunRow {
  const taxDocumentId = normalizePositiveId(input.taxDocumentId);

  if (!getTaxDocumentById(taxDocumentId)) {
    throw new Error("TAX_DOCUMENT_NOT_FOUND");
  }

  assertDocumentPeriodMutable(taxDocumentId);

  const extractionMethod = typeof input.extractionMethod === "string" ? input.extractionMethod : "";

  if (!isValidExtractionMethod(extractionMethod)) {
    throw new Error("INVALID_EXTRACTION_METHOD");
  }

  const extractorProvider = normalizeOptionalDescriptiveText(
    input.extractorProvider,
    "EXTRACTOR_PROVIDER_TOO_LONG"
  );
  const extractorVersion = normalizeOptionalDescriptiveText(
    input.extractorVersion,
    "EXTRACTOR_VERSION_TOO_LONG"
  );
  const modelIdentifier = normalizeOptionalDescriptiveText(
    input.modelIdentifier,
    "MODEL_IDENTIFIER_TOO_LONG"
  );

  const insert = db.transaction(() => {
    const result = db
      .prepare(
        `
        INSERT INTO extraction_runs (
          tax_document_id, extraction_method, extractor_provider, extractor_version, model_identifier
        )
        VALUES (?, ?, ?, ?, ?)
        `
      )
      .run(taxDocumentId, extractionMethod, extractorProvider, extractorVersion, modelIdentifier);

    const row = getById(Number(result.lastInsertRowid));

    if (!row) {
      throw new Error("EXTRACTION_RUN_CREATE_FAILED");
    }

    recordAuditEvent({
      entityType: "extraction_run",
      entityId: row.id,
      action: "CREATE",
      afterData: row,
    });

    return row;
  });

  return insert();
}

const MAX_ERROR_TEXT_LENGTH = 500;

function normalizeOptionalErrorText(value: unknown, errorCode: string): string | null {
  if (value === undefined || value === null || value === "") return null;

  const text = typeof value === "string" ? value.trim() : "";

  // Bounded length only — a deliberate guard against raw document content/stack traces ending up
  // here (STEP 104 Decision Gate D: "ห้าม log sensitive values" / no raw content in error metadata).
  if (!text || text.length > MAX_ERROR_TEXT_LENGTH) {
    throw new Error(errorCode);
  }

  return text;
}

export interface CompleteExtractionRunInput {
  status: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}

// The ONLY mutation path for an existing run — moves it from RUNNING to a terminal status.
// Deliberately does NOT check the CLOSED-period guard: completing an already-started run is
// finishing bookkeeping on a process already under way, not adding new evidence work.
export function completeExtractionRun(
  id: number,
  input: CompleteExtractionRunInput
): ExtractionRunRow {
  const existing = getById(id);

  if (!existing) {
    throw new Error("EXTRACTION_RUN_NOT_FOUND");
  }

  if (existing.status !== "RUNNING") {
    throw new Error("EXTRACTION_RUN_ALREADY_TERMINAL");
  }

  const status = typeof input.status === "string" ? input.status : "";

  if (!isValidExtractionRunStatus(status) || status === "RUNNING") {
    throw new Error("INVALID_EXTRACTION_RUN_STATUS");
  }

  const errorCode = normalizeOptionalErrorText(input.errorCode, "ERROR_CODE_TOO_LONG");
  const errorMessage = normalizeOptionalErrorText(input.errorMessage, "ERROR_MESSAGE_TOO_LONG");

  const update = db.transaction(() => {
    db.prepare(
      `
      UPDATE extraction_runs
      SET status = ?, completed_at = CURRENT_TIMESTAMP, error_code = ?, error_message = ?
      WHERE id = ?
      `
    ).run(status, errorCode, errorMessage, id);

    const row = getById(id);

    if (!row) {
      throw new Error("EXTRACTION_RUN_UPDATE_FAILED");
    }

    recordAuditEvent({
      entityType: "extraction_run",
      entityId: id,
      action: "UPDATE",
      beforeData: existing,
      afterData: row,
    });

    return row;
  });

  return update();
}
