// Bank Statement — STEP C.2 — data-access foundation for the `bank_statements` and
// `bank_statement_transactions` tables added in STEP C.2 (src/lib/db.ts). Mirrors the
// toRow()/DbRow/CRUD convention already established in src/lib/bankAccounts.ts and
// src/lib/transactions.ts.
//
// Explicitly OUT of scope here (per STEP C.2's instructions): no reconciliation logic, no matching
// logic, no relation of any kind to `transactions` (Finance), no file parsing, no batch/atomic
// import orchestration. This file provides: create statement metadata, list/get statements, a safe
// (transition-validated) status update, single-row transaction create/read primitives, and (STEP
// C.4) the DB-touching duplicate-candidate LOOKUP helpers that src/lib/bankStatementCsv.ts's pure
// functions cannot perform themselves (that file never touches the DB). The actual parse/preview/
// confirm ORCHESTRATION — reading the upload, calling the pure CSV engine, calling these lookups,
// running the atomic batch insert — lives in the API route layer (src/app/api/bank-statements/**,
// STEP C.4), not here, matching STEP C.3 §15's pure/DB-touching/filesystem/API-layer split.

import db from "./db";
import { getBankAccountById } from "./bankAccounts";

export type BankStatementStatus =
  | "UPLOADED"
  | "VALIDATING"
  | "PREVIEW_READY"
  | "IMPORTING"
  | "IMPORTED"
  | "FAILED"
  | "CANCELLED";

export const BANK_STATEMENT_STATUSES: BankStatementStatus[] = [
  "UPLOADED",
  "VALIDATING",
  "PREVIEW_READY",
  "IMPORTING",
  "IMPORTED",
  "FAILED",
  "CANCELLED",
];

export function isValidBankStatementStatus(value: string): value is BankStatementStatus {
  return (BANK_STATEMENT_STATUSES as string[]).includes(value);
}

// STEP E.5 — which parser must be used to re-parse this statement's source file (CSV grammar
// parser vs. PDF decrypt+extract+row-extraction). Enforced in the TS layer only, never a SQL CHECK
// — same convention as every other enum-like column in this schema (status above, bank_accounts.
// classification, etc). The DB column itself (bank_statements.source_file_type, STEP E.2) is
// TEXT NOT NULL DEFAULT 'CSV'.
export type BankStatementSourceFileType = "CSV" | "PDF";

export const BANK_STATEMENT_SOURCE_FILE_TYPES: BankStatementSourceFileType[] = ["CSV", "PDF"];

export function isValidBankStatementSourceFileType(value: string): value is BankStatementSourceFileType {
  return (BANK_STATEMENT_SOURCE_FILE_TYPES as string[]).includes(value);
}

// STEP C.0 §18 / STEP C.2 §4 — the only transitions updateBankStatementStatus() will allow.
// IMPORTED/FAILED/CANCELLED are terminal (empty arrays) — matches the immutable-once-terminal
// principle STEP C.1 established for statement-level lifecycle finality.
//
// STEP C.4 — PREVIEW_READY -> FAILED added (not present in the original STEP C.2 design; found
// missing by live-testing confirm's re-validation failure paths, which crashed with
// INVALID_STATUS_TRANSITION instead of returning a clean error). Confirm's own fresh re-validation
// (STEP C.3 §11 — re-hash the file, re-parse, compare against the preview-time summary) can
// legitimately discover a problem — a replaced file, a resubmitted mapping that no longer matches
// what was previewed, an unreadable source file — strictly BEFORE the atomic import transaction ever
// begins (i.e. before any IMPORTING state is claimed). That failure must still be recorded as FAILED
// directly from PREVIEW_READY, not routed back through IMPORTING first.
const ALLOWED_STATUS_TRANSITIONS: Record<BankStatementStatus, BankStatementStatus[]> = {
  UPLOADED: ["VALIDATING", "CANCELLED"],
  VALIDATING: ["PREVIEW_READY", "FAILED", "CANCELLED"],
  PREVIEW_READY: ["IMPORTING", "CANCELLED", "FAILED"],
  IMPORTING: ["IMPORTED", "FAILED"],
  IMPORTED: [],
  FAILED: [],
  CANCELLED: [],
};

export type BankStatementRow = {
  id: number;
  bankAccountId: number;
  sourceFileName: string;
  sourceFileHash: string;
  sourceFileUrl: string;
  statementPeriodFrom: string | null;
  statementPeriodTo: string | null;
  status: BankStatementStatus;
  rowCountTotal: number | null;
  rowCountValid: number | null;
  rowCountInvalid: number | null;
  rowCountDuplicate: number | null;
  errorSummary: string | null;
  importedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // STEP C.6 — raw JSON text of the BankStatementColumnMapping (src/lib/bankStatementCsv.ts) that
  // produced this statement's preview. Deliberately kept as an opaque string here rather than
  // importing/re-exposing bankStatementCsv.ts's type in this file — this module has never depended
  // on that one (parsing/mapping types belong to the pure engine, not the data-access layer); the
  // API route layer, which already imports both, is where this gets JSON.parse()'d. Null only for a
  // hypothetical pre-STEP-C.6 row (none exist in production as of this STEP).
  columnMapping: string | null;
  // STEP E.5 addition — see BankStatementSourceFileType's own comment above.
  sourceFileType: BankStatementSourceFileType;
};

type StatementDbRow = {
  id: number;
  bank_account_id: number;
  source_file_name: string;
  source_file_hash: string;
  source_file_url: string;
  statement_period_from: string | null;
  statement_period_to: string | null;
  status: string;
  row_count_total: number | null;
  row_count_valid: number | null;
  row_count_invalid: number | null;
  row_count_duplicate: number | null;
  error_summary: string | null;
  imported_at: string | null;
  created_at: string;
  updated_at: string;
  source_file_type: string;
  column_mapping: string | null;
};

function toStatementRow(row: StatementDbRow): BankStatementRow {
  return {
    id: row.id,
    bankAccountId: row.bank_account_id,
    sourceFileName: row.source_file_name,
    sourceFileHash: row.source_file_hash,
    sourceFileUrl: row.source_file_url,
    statementPeriodFrom: row.statement_period_from,
    statementPeriodTo: row.statement_period_to,
    status: row.status as BankStatementStatus,
    rowCountTotal: row.row_count_total,
    rowCountValid: row.row_count_valid,
    rowCountInvalid: row.row_count_invalid,
    rowCountDuplicate: row.row_count_duplicate,
    errorSummary: row.error_summary,
    importedAt: row.imported_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    columnMapping: row.column_mapping,
    sourceFileType: isValidBankStatementSourceFileType(row.source_file_type)
      ? row.source_file_type
      : "CSV",
  };
}

export type BankStatementTransactionRow = {
  id: number;
  bankStatementId: number;
  bankAccountId: number;
  bankTransactionId: string | null;
  transactionDate: string;
  valueDate: string | null;
  description: string | null;
  debit: number | null;
  credit: number | null;
  amount: number;
  balance: number | null;
  rawRowIndex: number | null;
  rawRowText: string | null;
  duplicateFingerprint: string;
  createdAt: string;
};

type TransactionDbRow = {
  id: number;
  bank_statement_id: number;
  bank_account_id: number;
  bank_transaction_id: string | null;
  transaction_date: string;
  value_date: string | null;
  description: string | null;
  debit: number | null;
  credit: number | null;
  amount: number;
  balance: number | null;
  raw_row_index: number | null;
  raw_row_text: string | null;
  duplicate_fingerprint: string;
  created_at: string;
};

function toTransactionRow(row: TransactionDbRow): BankStatementTransactionRow {
  return {
    id: row.id,
    bankStatementId: row.bank_statement_id,
    bankAccountId: row.bank_account_id,
    bankTransactionId: row.bank_transaction_id,
    transactionDate: row.transaction_date,
    valueDate: row.value_date,
    description: row.description,
    debit: row.debit,
    credit: row.credit,
    amount: row.amount,
    balance: row.balance,
    rawRowIndex: row.raw_row_index,
    rawRowText: row.raw_row_text,
    duplicateFingerprint: row.duplicate_fingerprint,
    createdAt: row.created_at,
  };
}

// Same cross-table existence-check convention as src/lib/transactions.ts's
// assertProductExists()/assertOrderExists() — a direct SELECT against the table, not an import of
// bankAccounts.ts's internals, matching this codebase's established pattern.
function assertBankAccountExists(bankAccountId: number): void {
  if (!getBankAccountById(bankAccountId)) {
    throw new Error("BANK_ACCOUNT_NOT_FOUND");
  }
}

function assertBankStatementExists(bankStatementId: number): BankStatementRow {
  const row = getBankStatementById(bankStatementId);

  if (!row) {
    throw new Error("BANK_STATEMENT_NOT_FOUND");
  }

  return row;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

function normalizeRequiredText(value: unknown, errorCode: string): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw new Error(errorCode);
  }

  return text;
}

function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));
}

function getStatementById(id: number): BankStatementRow | undefined {
  const row = db.prepare("SELECT * FROM bank_statements WHERE id = ?").get(id) as
    | StatementDbRow
    | undefined;

  return row ? toStatementRow(row) : undefined;
}

export function getBankStatementById(id: number): BankStatementRow | undefined {
  return getStatementById(id);
}

export interface CreateBankStatementInput {
  bankAccountId: number;
  sourceFileName: string;
  sourceFileHash: string;
  sourceFileUrl: string;
  // STEP C.6 — already-JSON-stringified BankStatementColumnMapping. Required here (unlike the
  // nullable DB column) because the one real caller (the upload route) always has a shape-validated
  // mapping by the time it creates a statement row — validation happens before this call, satisfying
  // "ต้องไม่ persist invalid/untrusted mapping ก่อน validation ผ่าน".
  columnMapping: string;
  // STEP E.5 — optional, defaults to 'CSV' when omitted so the existing CSV call site needs no
  // change at all. An explicitly-supplied value that fails isValidBankStatementSourceFileType()
  // throws rather than silently falling back — omission is a safe, intentional default;
  // an invalid explicit value is a caller bug that must fail loudly, not be masked.
  sourceFileType?: BankStatementSourceFileType;
}

// STEP C.2 — creates the metadata row only, always starting at status 'UPLOADED' (relies on the
// column's own SQL DEFAULT — never passed explicitly, so there is exactly one place that can ever
// set the starting status). No file parsing, no transaction rows, no relation to Finance
// transactions — purely the "a file was uploaded for this account" record.
//
// STEP C.6 — now also persists columnMapping (see BankStatementRow's field comment) at creation
// time, before parsing even begins — a FAILED statement (bad file, valid mapping) still keeps a
// record of the mapping it was uploaded with, which matters for any future audit of why it failed.
export function createBankStatement(input: CreateBankStatementInput): BankStatementRow {
  const bankAccountId = Number(input.bankAccountId);

  if (!Number.isInteger(bankAccountId) || bankAccountId <= 0) {
    throw new Error("INVALID_BANK_ACCOUNT_ID");
  }

  assertBankAccountExists(bankAccountId);

  const sourceFileName = normalizeRequiredText(input.sourceFileName, "INVALID_SOURCE_FILE_NAME");
  const sourceFileHash = normalizeRequiredText(input.sourceFileHash, "INVALID_SOURCE_FILE_HASH");
  const sourceFileUrl = normalizeRequiredText(input.sourceFileUrl, "INVALID_SOURCE_FILE_URL");
  const columnMapping = normalizeRequiredText(input.columnMapping, "INVALID_COLUMN_MAPPING");

  let sourceFileType: BankStatementSourceFileType = "CSV";
  if (input.sourceFileType !== undefined) {
    if (!isValidBankStatementSourceFileType(input.sourceFileType)) {
      throw new Error("INVALID_SOURCE_FILE_TYPE");
    }
    sourceFileType = input.sourceFileType;
  }

  let result;

  try {
    result = db
      .prepare(
        `
        INSERT INTO bank_statements (
          bank_account_id, source_file_name, source_file_hash, source_file_url, column_mapping,
          source_file_type
        )
        VALUES (?, ?, ?, ?, ?, ?)
        `
      )
      .run(bankAccountId, sourceFileName, sourceFileHash, sourceFileUrl, columnMapping, sourceFileType);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Error("DUPLICATE_STATEMENT_FILE");
    }

    throw error;
  }

  const row = getStatementById(Number(result.lastInsertRowid));

  if (!row) {
    throw new Error("BANK_STATEMENT_CREATE_FAILED");
  }

  return row;
}

export interface ListBankStatementsFilters {
  bankAccountId?: number;
  status?: string;
  limit?: number;
}

export function listBankStatements(filters: ListBankStatementsFilters = {}): BankStatementRow[] {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters.bankAccountId !== undefined) {
    conditions.push("bank_account_id = ?");
    params.push(filters.bankAccountId);
  }

  if (filters.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 100;

  const rows = db
    .prepare(
      `
      SELECT * FROM bank_statements
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
      `
    )
    .all(...params, limit) as StatementDbRow[];

  return rows.map(toStatementRow);
}

export interface UpdateBankStatementStatusOptions {
  statementPeriodFrom?: string | null;
  statementPeriodTo?: string | null;
  rowCountTotal?: number | null;
  rowCountValid?: number | null;
  rowCountInvalid?: number | null;
  rowCountDuplicate?: number | null;
  errorSummary?: string | null;
}

// STEP C.2 — the "safe" status update this STEP's scope calls for: validates the target status is a
// real enum value AND that the transition from the row's current status is one of
// ALLOWED_STATUS_TRANSITIONS above, rejecting anything else with INVALID_STATUS_TRANSITION rather
// than silently allowing an arbitrary jump (e.g. UPLOADED straight to IMPORTED). imported_at is set
// automatically (CURRENT_TIMESTAMP) only on the transition into 'IMPORTED', never settable directly
// by the caller. This function never touches bank_statement_transactions — STEP C.3 owns the actual
// batch-insert that happens during the IMPORTING status.
export function updateBankStatementStatus(
  id: number,
  nextStatus: string,
  options: UpdateBankStatementStatusOptions = {}
): BankStatementRow {
  const existing = assertBankStatementExists(id);

  if (!isValidBankStatementStatus(nextStatus)) {
    throw new Error("INVALID_STATUS");
  }

  const allowedNext = ALLOWED_STATUS_TRANSITIONS[existing.status];

  if (!allowedNext.includes(nextStatus)) {
    throw new Error("INVALID_STATUS_TRANSITION");
  }

  const nextPeriodFrom =
    options.statementPeriodFrom === undefined
      ? existing.statementPeriodFrom
      : options.statementPeriodFrom;
  const nextPeriodTo =
    options.statementPeriodTo === undefined ? existing.statementPeriodTo : options.statementPeriodTo;
  const nextRowCountTotal =
    options.rowCountTotal === undefined ? existing.rowCountTotal : options.rowCountTotal;
  const nextRowCountValid =
    options.rowCountValid === undefined ? existing.rowCountValid : options.rowCountValid;
  const nextRowCountInvalid =
    options.rowCountInvalid === undefined ? existing.rowCountInvalid : options.rowCountInvalid;
  const nextRowCountDuplicate =
    options.rowCountDuplicate === undefined
      ? existing.rowCountDuplicate
      : options.rowCountDuplicate;
  const nextErrorSummary =
    options.errorSummary === undefined ? existing.errorSummary : options.errorSummary;

  const setImportedAt = nextStatus === "IMPORTED";

  db.prepare(
    `
    UPDATE bank_statements
    SET
      status = ?,
      statement_period_from = ?,
      statement_period_to = ?,
      row_count_total = ?,
      row_count_valid = ?,
      row_count_invalid = ?,
      row_count_duplicate = ?,
      error_summary = ?,
      imported_at = ${setImportedAt ? "CURRENT_TIMESTAMP" : "imported_at"},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `
  ).run(
    nextStatus,
    nextPeriodFrom,
    nextPeriodTo,
    nextRowCountTotal,
    nextRowCountValid,
    nextRowCountInvalid,
    nextRowCountDuplicate,
    nextErrorSummary,
    id
  );

  const row = getStatementById(id);

  if (!row) {
    throw new Error("BANK_STATEMENT_UPDATE_FAILED");
  }

  return row;
}

function getTransactionById(id: number): BankStatementTransactionRow | undefined {
  const row = db.prepare("SELECT * FROM bank_statement_transactions WHERE id = ?").get(id) as
    | TransactionDbRow
    | undefined;

  return row ? toTransactionRow(row) : undefined;
}

export function getBankStatementTransactionById(
  id: number
): BankStatementTransactionRow | undefined {
  return getTransactionById(id);
}

export function listBankStatementTransactions(
  bankStatementId: number
): BankStatementTransactionRow[] {
  const rows = db
    .prepare(
      `
      SELECT * FROM bank_statement_transactions
      WHERE bank_statement_id = ?
      ORDER BY raw_row_index ASC, id ASC
      `
    )
    .all(bankStatementId) as TransactionDbRow[];

  return rows.map(toTransactionRow);
}

export interface CreateBankStatementTransactionInput {
  bankStatementId: number;
  bankTransactionId?: string | null;
  transactionDate: string;
  valueDate?: string | null;
  description?: string | null;
  debit?: number | null;
  credit?: number | null;
  amount: number;
  balance?: number | null;
  rawRowIndex?: number | null;
  rawRowText?: string | null;
  duplicateFingerprint: string;
}

// STEP C.2 — single-row insert primitive only. Deliberately does NOT parse a file, does NOT loop
// over rows, does NOT wrap anything in its own db.transaction() — a future STEP C.3 batch-import
// routine is expected to call this once per row from inside ITS OWN transaction, so the whole batch
// commits or rolls back atomically (per STEP C.1 Decision 6's atomicity requirement). bank_account_id
// is derived from the parent statement here (never accepted as caller input) so it can never drift
// from the statement it belongs to. Money fields are validated as integers (satang) — this is the
// library-level enforcement of STEP C.1's "no floating point as financial source of truth" decision.
export function createBankStatementTransaction(
  input: CreateBankStatementTransactionInput
): BankStatementTransactionRow {
  const bankStatementId = Number(input.bankStatementId);

  if (!Number.isInteger(bankStatementId) || bankStatementId <= 0) {
    throw new Error("INVALID_BANK_STATEMENT_ID");
  }

  const statement = assertBankStatementExists(bankStatementId);

  if (!isValidDateString(input.transactionDate)) {
    throw new Error("INVALID_TRANSACTION_DATE");
  }

  const valueDate =
    input.valueDate === undefined || input.valueDate === null || input.valueDate === ""
      ? null
      : isValidDateString(input.valueDate)
        ? input.valueDate
        : (() => {
            throw new Error("INVALID_VALUE_DATE");
          })();

  const description =
    typeof input.description === "string" && input.description.trim()
      ? input.description.trim()
      : null;

  const debit = normalizeMoneyField(input.debit, "INVALID_DEBIT");
  const credit = normalizeMoneyField(input.credit, "INVALID_CREDIT");

  if (debit !== null && debit > 0 && credit !== null && credit > 0) {
    throw new Error("INVALID_DEBIT_CREDIT_COMBINATION");
  }

  if (!Number.isInteger(input.amount)) {
    throw new Error("INVALID_AMOUNT");
  }

  const balance = normalizeMoneyField(input.balance, "INVALID_BALANCE");

  const rawRowIndex =
    input.rawRowIndex === undefined || input.rawRowIndex === null
      ? null
      : Number.isInteger(input.rawRowIndex) && input.rawRowIndex >= 0
        ? input.rawRowIndex
        : (() => {
            throw new Error("INVALID_RAW_ROW_INDEX");
          })();

  const rawRowText =
    typeof input.rawRowText === "string" && input.rawRowText.length > 0 ? input.rawRowText : null;

  const bankTransactionId =
    typeof input.bankTransactionId === "string" && input.bankTransactionId.trim()
      ? input.bankTransactionId.trim()
      : null;

  const duplicateFingerprint = normalizeRequiredText(
    input.duplicateFingerprint,
    "INVALID_DUPLICATE_FINGERPRINT"
  );

  let result;

  try {
    result = db
      .prepare(
        `
        INSERT INTO bank_statement_transactions (
          bank_statement_id, bank_account_id, bank_transaction_id, transaction_date, value_date,
          description, debit, credit, amount, balance, raw_row_index, raw_row_text,
          duplicate_fingerprint
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        bankStatementId,
        statement.bankAccountId,
        bankTransactionId,
        input.transactionDate,
        valueDate,
        description,
        debit,
        credit,
        input.amount,
        balance,
        rawRowIndex,
        rawRowText,
        duplicateFingerprint
      );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Error("DUPLICATE_BANK_STATEMENT_TRANSACTION");
    }

    throw error;
  }

  const row = getTransactionById(Number(result.lastInsertRowid));

  if (!row) {
    throw new Error("BANK_STATEMENT_TRANSACTION_CREATE_FAILED");
  }

  return row;
}

function normalizeMoneyField(value: number | null | undefined, errorCode: string): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(errorCode);
  }

  return value;
}

// ===== STEP C.4 — duplicate-candidate lookups. Read-only, never mutate anything. These exist so the
// API orchestration layer (src/app/api/bank-statements/**) can classify a freshly-parsed row as
// DUPLICATE_CANDIDATE before it ever reaches createBankStatementTransaction() — the DB's own unique
// indexes (STEP C.2) remain the final, race-free authority at actual insert time; these lookups are
// only for producing an accurate PREVIEW, and for confirm's fresh re-check (STEP C.3 §11 — never
// trust the preview-time state as still true at confirm time).

// File-level: does this exact (account, hash) pair already have a statement? Checked proactively
// during upload/preview (before attempting createBankStatement(), which would otherwise throw
// DUPLICATE_STATEMENT_FILE) so the caller can return a clear "already imported as statement #X"
// response instead of a raw creation failure.
export function findBankStatementByFileHash(
  bankAccountId: number,
  sourceFileHash: string
): BankStatementRow | undefined {
  const row = db
    .prepare("SELECT * FROM bank_statements WHERE bank_account_id = ? AND source_file_hash = ?")
    .get(bankAccountId, sourceFileHash) as StatementDbRow | undefined;

  return row ? toStatementRow(row) : undefined;
}

// Statement-level: soft warning only (STEP C.1 Decision 5 / STEP C.3 §8 — "ห้ามทำ hard block ที่อาจ
// ป้องกัน legitimate re-import/replacement"). Standard half-open interval overlap check against every
// IMPORTED statement for this account; returns candidates for the caller to surface as a warning, not
// something this function itself blocks on.
export function findOverlappingImportedStatements(
  bankAccountId: number,
  periodFrom: string | null,
  periodTo: string | null
): BankStatementRow[] {
  if (!periodFrom || !periodTo) {
    return [];
  }

  const rows = db
    .prepare(
      `
      SELECT * FROM bank_statements
      WHERE bank_account_id = ?
        AND status = 'IMPORTED'
        AND statement_period_from IS NOT NULL
        AND statement_period_to IS NOT NULL
        AND NOT (statement_period_to < ? OR statement_period_from > ?)
      `
    )
    .all(bankAccountId, periodFrom, periodTo) as StatementDbRow[];

  return rows.map(toStatementRow);
}

// Transaction-level, preferred identity (STEP C.1's BANK_PROVIDED_IDENTIFIER — stronger than any
// guessed fingerprint).
export function findBankStatementTransactionByBankId(
  bankAccountId: number,
  bankTransactionId: string
): BankStatementTransactionRow | undefined {
  const row = db
    .prepare(
      "SELECT * FROM bank_statement_transactions WHERE bank_account_id = ? AND bank_transaction_id = ?"
    )
    .get(bankAccountId, bankTransactionId) as TransactionDbRow | undefined;

  return row ? toTransactionRow(row) : undefined;
}

// Transaction-level fallback identity.
export function findBankStatementTransactionByFingerprint(
  bankAccountId: number,
  duplicateFingerprint: string
): BankStatementTransactionRow | undefined {
  const row = db
    .prepare(
      "SELECT * FROM bank_statement_transactions WHERE bank_account_id = ? AND duplicate_fingerprint = ?"
    )
    .get(bankAccountId, duplicateFingerprint) as TransactionDbRow | undefined;

  return row ? toTransactionRow(row) : undefined;
}
