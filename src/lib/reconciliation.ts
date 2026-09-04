// Reconciliation — STEP D.3 (schema-foundation types/enums) + STEP D.4 (data-access layer), per the
// approved design in docs/RECONCILIATION_DATA_MODEL.md (STEP D.2).
//
// STEP D.3 added the type/enum section below with NO database access at all — same precedent
// established once already in this codebase by src/lib/transactions.ts's own STEP 19 section. STEP
// D.4 adds the actual CRUD/state-transition functions (this file now DOES touch the database, via the
// two new tables ONLY — bank_reconciliation_matches, bank_reconciliation_audit).
//
// Explicitly OUT of scope for STEP D.4 (per that STEP's instructions): no matching/candidate-scoring
// engine (no code here ever searches for or proposes a candidate pairing — every function requires
// the caller to already know which bank_statement_transaction_id/transaction_id to link), no API
// routes, no UI, no bulk confirmation, no automatic reconciliation, no change to src/lib/transactions.ts
// or src/lib/bankStatements.ts. Every mutation here touches ONLY bank_reconciliation_matches and
// bank_reconciliation_audit — transactions/bank_statement_transactions/bank_statements/bank_accounts/
// orders are read-only inputs for validation, never written.

import db from "./db";

export type ReconciliationStatus =
  | "SUGGESTED"
  | "MATCHED"
  | "CONFIRMED"
  | "EXCLUDED"
  | "UNMATCHED"
  | "NEEDS_REVIEW";

export const RECONCILIATION_STATUSES: ReconciliationStatus[] = [
  "SUGGESTED",
  "MATCHED",
  "CONFIRMED",
  "EXCLUDED",
  "UNMATCHED",
  "NEEDS_REVIEW",
];

export function isValidReconciliationStatus(value: string): value is ReconciliationStatus {
  return (RECONCILIATION_STATUSES as string[]).includes(value);
}

// docs/RECONCILIATION_DATA_MODEL.md §4 — purely descriptive of how a pairing was originally
// identified; never itself a confirmation signal. 'BANK_TRANSACTION_ID' is reserved for a future
// extension (not usable today — `transactions` has no field to carry a bank-provided transaction ID)
// but kept in the enum now so it never needs a later breaking change. 'NORMALIZED_CANDIDATE'
// (docs/BANK_ACCOUNT_NUMBER_POLICY.md's vocabulary) is deliberately NOT reused here — that value's
// entire purpose there is account-number text normalization, a problem this table doesn't have, since
// bank_statement_transactions.bank_account_id is already a real, denormalized FK pinned at ingestion
// (STEP C.2).
export type ReconciliationMatchStrategy =
  | "BANK_TRANSACTION_ID"
  | "EXACT_DATE_AMOUNT_ACCOUNT"
  | "CONSTRAINED_FINGERPRINT"
  | "MANUAL";

export const RECONCILIATION_MATCH_STRATEGIES: ReconciliationMatchStrategy[] = [
  "BANK_TRANSACTION_ID",
  "EXACT_DATE_AMOUNT_ACCOUNT",
  "CONSTRAINED_FINGERPRINT",
  "MANUAL",
];

export function isValidReconciliationMatchStrategy(
  value: string
): value is ReconciliationMatchStrategy {
  return (RECONCILIATION_MATCH_STRATEGIES as string[]).includes(value);
}

// docs/RECONCILIATION_DATA_MODEL.md §6 — audit `action` values. Deliberately does not include a
// value for SUGGESTED row creation (a system-generated candidate is not a decision worth auditing).
export type ReconciliationAuditAction =
  | "MATCHED"
  | "CONFIRMED"
  | "UNMATCHED"
  | "EXCLUDED"
  | "NEEDS_REVIEW_FLAGGED"
  | "RESOLVED";

export const RECONCILIATION_AUDIT_ACTIONS: ReconciliationAuditAction[] = [
  "MATCHED",
  "CONFIRMED",
  "UNMATCHED",
  "EXCLUDED",
  "NEEDS_REVIEW_FLAGGED",
  "RESOLVED",
];

export function isValidReconciliationAuditAction(
  value: string
): value is ReconciliationAuditAction {
  return (RECONCILIATION_AUDIT_ACTIONS as string[]).includes(value);
}

// Row shape of `bank_reconciliation_matches` (src/lib/db.ts, STEP D.3) — camelCase mirror of the
// snake_case DB columns, same toRow() convention as every other data-access file in this codebase.
export type BankReconciliationMatchRow = {
  id: number;
  bankStatementTransactionId: number;
  transactionId: number;
  allocatedAmount: number;
  matchStrategy: ReconciliationMatchStrategy;
  status: ReconciliationStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  confirmedBy: string | null;
  unmatchedAt: string | null;
  unmatchedBy: string | null;
};

type MatchDbRow = {
  id: number;
  bank_statement_transaction_id: number;
  transaction_id: number;
  allocated_amount: number;
  match_strategy: string;
  status: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  unmatched_at: string | null;
  unmatched_by: string | null;
};

export function toReconciliationMatchRow(row: MatchDbRow): BankReconciliationMatchRow {
  return {
    id: row.id,
    bankStatementTransactionId: row.bank_statement_transaction_id,
    transactionId: row.transaction_id,
    allocatedAmount: row.allocated_amount,
    matchStrategy: row.match_strategy as ReconciliationMatchStrategy,
    status: row.status as ReconciliationStatus,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    confirmedAt: row.confirmed_at,
    confirmedBy: row.confirmed_by,
    unmatchedAt: row.unmatched_at,
    unmatchedBy: row.unmatched_by,
  };
}

// Row shape of `bank_reconciliation_audit` (src/lib/db.ts, STEP D.3).
export type BankReconciliationAuditRow = {
  id: number;
  matchId: number;
  action: ReconciliationAuditAction;
  fromStatus: ReconciliationStatus | null;
  toStatus: ReconciliationStatus;
  reason: string | null;
  performedBy: string;
  performedAt: string;
};

type AuditDbRow = {
  id: number;
  match_id: number;
  action: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  performed_by: string;
  performed_at: string;
};

export function toReconciliationAuditRow(row: AuditDbRow): BankReconciliationAuditRow {
  return {
    id: row.id,
    matchId: row.match_id,
    action: row.action as ReconciliationAuditAction,
    fromStatus: row.from_status as ReconciliationStatus | null,
    toStatus: row.to_status as ReconciliationStatus,
    reason: row.reason,
    performedBy: row.performed_by,
    performedAt: row.performed_at,
  };
}

// ===== STEP D.4 — data-access layer ===============================================================

// docs/RECONCILIATION_DATA_MODEL.md §6 — no multi-user identity model exists in this app (single
// shared admin session). Per STEP D.4's approved Open Decision 2: confirmed_by/unmatched_by/
// performed_by are always this fixed literal — never a fake per-user identity, never a process.env
// read (no sibling src/lib/*.ts file reads process.env either).
const ADMIN_ACTOR = "admin";

// Statuses considered "active" for allocation-sum and duplicate-pair purposes — mirrors the exact
// WHERE clause of idx_bank_reconciliation_matches_active_pair (src/lib/db.ts, STEP D.3).
const ACTIVE_STATUSES: ReconciliationStatus[] = ["SUGGESTED", "MATCHED", "CONFIRMED", "NEEDS_REVIEW"];

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error && (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

function isForeignKeyConstraintError(error: unknown): boolean {
  return (
    error instanceof Error && (error as { code?: string }).code === "SQLITE_CONSTRAINT_FOREIGNKEY"
  );
}

// ----- read-only source-table lookups, for validation only (never written by this file) -----------
// Same cross-table existence-check convention already established in this codebase (src/lib/
// transactions.ts's assertProductExists()/assertOrderExists(), src/lib/bankStatements.ts's
// assertBankAccountExists()) — a direct SELECT against the table, not an import of another lib
// file's getter.

type BankStatementTransactionForValidation = { id: number; amount: number };

function getBankStatementTransactionForValidation(
  id: number
): BankStatementTransactionForValidation | undefined {
  return db
    .prepare("SELECT id, amount FROM bank_statement_transactions WHERE id = ?")
    .get(id) as BankStatementTransactionForValidation | undefined;
}

type FinancialTransactionForValidation = { id: number; amount: number; updatedAt: string };

function getFinancialTransactionForValidation(
  id: number
): FinancialTransactionForValidation | undefined {
  const row = db.prepare("SELECT id, amount, updated_at FROM transactions WHERE id = ?").get(id) as
    | { id: number; amount: number; updated_at: string }
    | undefined;

  return row ? { id: row.id, amount: row.amount, updatedAt: row.updated_at } : undefined;
}

// SUM(ABS(allocated_amount)) over currently-active rows — magnitude only (sign is validated
// per-row at insert time against the bank row's own sign, docs/RECONCILIATION_DATA_MODEL.md §3).
function sumActiveAllocationsForBankTransaction(bankStatementTransactionId: number): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(ABS(allocated_amount)), 0) AS total
       FROM bank_reconciliation_matches
       WHERE bank_statement_transaction_id = ? AND status IN (${ACTIVE_STATUSES.map(() => "?").join(",")})`
    )
    .get(bankStatementTransactionId, ...ACTIVE_STATUSES) as { total: number };

  return row.total;
}

function sumActiveAllocationsForTransaction(transactionId: number): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(ABS(allocated_amount)), 0) AS total
       FROM bank_reconciliation_matches
       WHERE transaction_id = ? AND status IN (${ACTIVE_STATUSES.map(() => "?").join(",")})`
    )
    .get(transactionId, ...ACTIVE_STATUSES) as { total: number };

  return row.total;
}

function getMatchById(id: number): BankReconciliationMatchRow | undefined {
  const row = db.prepare("SELECT * FROM bank_reconciliation_matches WHERE id = ?").get(id) as
    | MatchDbRow
    | undefined;

  return row ? toReconciliationMatchRow(row) : undefined;
}

function insertAuditRow(params: {
  matchId: number;
  action: ReconciliationAuditAction;
  fromStatus: ReconciliationStatus | null;
  toStatus: ReconciliationStatus;
  reason?: string | null;
  performedBy: string;
}): void {
  try {
    db.prepare(
      `INSERT INTO bank_reconciliation_audit
         (match_id, action, from_status, to_status, reason, performed_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      params.matchId,
      params.action,
      params.fromStatus,
      params.toStatus,
      params.reason ?? null,
      params.performedBy
    );
  } catch {
    // Any failure writing the audit row happens INSIDE the caller's db.transaction() — throwing here
    // aborts and rolls back the whole transaction (including the state UPDATE that preceded it), per
    // docs/RECONCILIATION_DATA_MODEL.md's atomicity requirement ("หาก audit insert fail: state
    // mutation ต้อง rollback"). AUDIT_FAILURE is a deliberately generic code — the underlying DB error
    // is never leaked to the caller, matching this codebase's existing error-contract convention.
    throw new Error("AUDIT_FAILURE");
  }
}

function requireValidId(id: number): number {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    throw new Error("NOT_FOUND");
  }
  return idNum;
}

function requireReason(reason: unknown): string {
  const text = typeof reason === "string" ? reason.trim() : "";
  if (!text) {
    throw new Error("INVALID_REASON");
  }
  return text;
}

// ===== Read functions — never mutate, deterministic ordering ======================================

export function getReconciliationMatch(id: number): BankReconciliationMatchRow | undefined {
  return getMatchById(id);
}

export interface ListReconciliationMatchesFilters {
  status?: string;
  bankStatementTransactionId?: number;
  transactionId?: number;
  limit?: number;
}

export function listReconciliationMatches(
  filters: ListReconciliationMatchesFilters = {}
): BankReconciliationMatchRow[] {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }

  if (filters.bankStatementTransactionId !== undefined) {
    conditions.push("bank_statement_transaction_id = ?");
    params.push(filters.bankStatementTransactionId);
  }

  if (filters.transactionId !== undefined) {
    conditions.push("transaction_id = ?");
    params.push(filters.transactionId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 100;

  const rows = db
    .prepare(
      `SELECT * FROM bank_reconciliation_matches
       ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(...params, limit) as MatchDbRow[];

  return rows.map(toReconciliationMatchRow);
}

export function listMatchesForBankStatementTransaction(
  bankStatementTransactionId: number
): BankReconciliationMatchRow[] {
  return listReconciliationMatches({ bankStatementTransactionId });
}

export function listMatchesForTransaction(transactionId: number): BankReconciliationMatchRow[] {
  return listReconciliationMatches({ transactionId });
}

// Enriches each audit row with the bank/financial IDs it concerns, via a join through match_id —
// bank_reconciliation_audit deliberately does NOT store these columns itself
// (docs/RECONCILIATION_DATA_MODEL.md §6), since bank_reconciliation_matches's own two FKs are
// immutable and always resolve the correct, stable pair.
export interface ReconciliationAuditEntry extends BankReconciliationAuditRow {
  bankStatementTransactionId: number;
  transactionId: number;
}

export function getReconciliationAudit(matchId: number): ReconciliationAuditEntry[] {
  const match = getMatchById(matchId);
  if (!match) {
    return [];
  }

  const rows = db
    .prepare(
      "SELECT * FROM bank_reconciliation_audit WHERE match_id = ? ORDER BY performed_at ASC, id ASC"
    )
    .all(matchId) as AuditDbRow[];

  return rows.map((row) => ({
    ...toReconciliationAuditRow(row),
    bankStatementTransactionId: match.bankStatementTransactionId,
    transactionId: match.transactionId,
  }));
}

// Pure, read-only evaluation — NEVER mutates `status`, NEVER writes NEEDS_REVIEW automatically. Per
// STEP D.4's approved "LAZY" model for Open Decision 1: staleness is computed on demand by comparing
// the linked transactions row's updated_at against this match's confirmed_at. A caller (a future
// API/UI layer) decides whether to surface this and whether to separately, explicitly call
// markReconciliationNeedsReview() — this function itself has zero side effects.
export interface ReconciliationStalenessCheck {
  possiblyStale: boolean;
  reason: "TRANSACTION_NOT_FOUND" | "TRANSACTION_MODIFIED_AFTER_CONFIRMATION" | null;
}

export function evaluateReconciliationMatchStaleness(
  match: BankReconciliationMatchRow
): ReconciliationStalenessCheck {
  if (match.status !== "CONFIRMED" || !match.confirmedAt) {
    return { possiblyStale: false, reason: null };
  }

  const finTxn = getFinancialTransactionForValidation(match.transactionId);

  if (!finTxn) {
    return { possiblyStale: true, reason: "TRANSACTION_NOT_FOUND" };
  }

  if (finTxn.updatedAt > match.confirmedAt) {
    return { possiblyStale: true, reason: "TRANSACTION_MODIFIED_AFTER_CONFIRMATION" };
  }

  return { possiblyStale: false, reason: null };
}

// ===== Create — SUGGESTED only ======================================================================

export interface CreateReconciliationSuggestionInput {
  bankStatementTransactionId: number;
  transactionId: number;
  allocatedAmount: number;
  matchStrategy: string;
  note?: string | null;
}

// Creates a mapping row that ALWAYS starts at status = 'SUGGESTED' — there is no way to call this
// function and end up with a MATCHED/CONFIRMED row directly (per this STEP's explicit instruction:
// "ห้ามสร้าง function ที่สร้าง CONFIRMED โดยตรง"). No audit row is written for this action
// (docs/RECONCILIATION_DATA_MODEL.md §6 — a system/manually-entered candidate is not itself a
// decision worth auditing; auditing begins at markReconciliationMatched()). Allocation-sum validation
// and the INSERT itself are both inside the same db.transaction() so a concurrent second suggestion
// cannot race past the sum check (SQLite serializes writer transactions).
export function createReconciliationSuggestion(
  input: CreateReconciliationSuggestionInput
): BankReconciliationMatchRow {
  const bankStatementTransactionId = Number(input.bankStatementTransactionId);
  if (!Number.isInteger(bankStatementTransactionId) || bankStatementTransactionId <= 0) {
    throw new Error("INVALID_BANK_STATEMENT_TRANSACTION_ID");
  }

  const transactionId = Number(input.transactionId);
  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    throw new Error("INVALID_TRANSACTION_ID");
  }

  if (typeof input.matchStrategy !== "string" || !isValidReconciliationMatchStrategy(input.matchStrategy)) {
    throw new Error("INVALID_STRATEGY");
  }

  if (!Number.isInteger(input.allocatedAmount) || input.allocatedAmount === 0) {
    throw new Error("INVALID_ALLOCATION_AMOUNT");
  }

  const bankTxn = getBankStatementTransactionForValidation(bankStatementTransactionId);
  if (!bankTxn) {
    throw new Error("SOURCE_NOT_FOUND");
  }

  const finTxn = getFinancialTransactionForValidation(transactionId);
  if (!finTxn) {
    throw new Error("TRANSACTION_NOT_FOUND");
  }

  // Sign must match the bank row's own sign (docs/RECONCILIATION_DATA_MODEL.md §3) — a bank debit
  // (negative amount) can only be allocated with negative allocated_amount, a credit only positive.
  const bankSign = Math.sign(bankTxn.amount);
  const allocationSign = Math.sign(input.allocatedAmount);
  if (bankSign === 0 || allocationSign !== bankSign) {
    throw new Error("INVALID_ALLOCATION_AMOUNT");
  }

  const bankMagnitude = Math.abs(bankTxn.amount);
  // transactions.amount is REAL baht — converted to satang only at this comparison boundary
  // (Math.round, never persisted), per docs/RECONCILIATION_DATA_MODEL.md §3's documented exception.
  const financialSatang = Math.round(finTxn.amount * 100);
  const allocationMagnitude = Math.abs(input.allocatedAmount);

  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;

  const insert = db.transaction(() => {
    const existingBankSum = sumActiveAllocationsForBankTransaction(bankStatementTransactionId);
    if (existingBankSum + allocationMagnitude > bankMagnitude) {
      throw new Error("ALLOCATION_EXCEEDS_BANK_TRANSACTION");
    }

    const existingFinSum = sumActiveAllocationsForTransaction(transactionId);
    if (existingFinSum + allocationMagnitude > financialSatang) {
      throw new Error("ALLOCATION_EXCEEDS_FINANCIAL_TRANSACTION");
    }

    let result;
    try {
      result = db
        .prepare(
          `INSERT INTO bank_reconciliation_matches
             (bank_statement_transaction_id, transaction_id, allocated_amount, match_strategy, status, note)
           VALUES (?, ?, ?, ?, 'SUGGESTED', ?)`
        )
        .run(bankStatementTransactionId, transactionId, input.allocatedAmount, input.matchStrategy, note);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error("DUPLICATE_MATCH");
      }
      if (isForeignKeyConstraintError(error)) {
        throw new Error("SOURCE_NOT_FOUND");
      }
      throw error;
    }

    return Number(result.lastInsertRowid);
  });

  const id = insert();
  const row = getMatchById(id);

  if (!row) {
    throw new Error("CREATE_FAILED");
  }

  return row;
}

// ===== State transitions ============================================================================
// Every function: validates current state via a WHERE-guarded UPDATE inside db.transaction(), never
// trusts a caller-supplied "current status" claim, re-reads the resulting row, appends exactly one
// audit row atomically with the state change, and never touches transactions/bank_statement_
// transactions/bank_statements/bank_accounts/orders.

// SUGGESTED|NEEDS_REVIEW -> MATCHED. A human explicitly selecting a specific pairing
// (docs/RECONCILIATION_DATA_MODEL.md §5) — NEEDS_REVIEW is included as a valid source because §5's
// transition table explicitly allows a human to re-resolve NEEDS_REVIEW into any of the five other
// states, including MATCHED.
export function markReconciliationMatched(id: number): BankReconciliationMatchRow {
  const idNum = requireValidId(id);

  const run = db.transaction(() => {
    const before = getMatchById(idNum);
    if (!before) {
      throw new Error("NOT_FOUND");
    }

    const guard = db
      .prepare(
        `UPDATE bank_reconciliation_matches
         SET status = 'MATCHED', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status IN ('SUGGESTED', 'NEEDS_REVIEW')`
      )
      .run(idNum);

    if (guard.changes !== 1) {
      throw new Error("INVALID_STATE_TRANSITION");
    }

    insertAuditRow({
      matchId: idNum,
      action: "MATCHED",
      fromStatus: before.status,
      toStatus: "MATCHED",
      performedBy: ADMIN_ACTOR,
    });
  });

  run();

  const after = getMatchById(idNum);
  if (!after) {
    throw new Error("NOT_FOUND");
  }

  return after;
}

// MATCHED|NEEDS_REVIEW -> CONFIRMED. The ONLY transition that ever produces a real, accounting-
// relevant match — always an explicit call, never reachable from SUGGESTED directly
// (docs/RECONCILIATION_DATA_MODEL.md §5's transition table has no SUGGESTED -> CONFIRMED row).
// Double-click / concurrent-confirm safe: the WHERE-guarded UPDATE is the first write inside this
// db.transaction() (SQLite serializes writer transactions), so only one of two near-simultaneous
// calls for the same id can ever see changes === 1 — the other throws CONFLICT before writing
// anything.
export function confirmReconciliation(id: number): BankReconciliationMatchRow {
  const idNum = requireValidId(id);

  const run = db.transaction(() => {
    const before = getMatchById(idNum);
    if (!before) {
      throw new Error("NOT_FOUND");
    }

    const guard = db
      .prepare(
        `UPDATE bank_reconciliation_matches
         SET status = 'CONFIRMED', confirmed_at = CURRENT_TIMESTAMP, confirmed_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status IN ('MATCHED', 'NEEDS_REVIEW')`
      )
      .run(ADMIN_ACTOR, idNum);

    if (guard.changes !== 1) {
      throw new Error("CONFLICT");
    }

    insertAuditRow({
      matchId: idNum,
      action: "CONFIRMED",
      fromStatus: before.status,
      toStatus: "CONFIRMED",
      performedBy: ADMIN_ACTOR,
    });
  });

  run();

  const after = getMatchById(idNum);
  if (!after) {
    throw new Error("NOT_FOUND");
  }

  return after;
}

// SUGGESTED|MATCHED|NEEDS_REVIEW -> EXCLUDED. `reason` is required (docs/RECONCILIATION_DATA_MODEL.md
// §2 — note required at the TS layer for EXCLUDED). CONFIRMED is deliberately NOT a valid source
// state here — §5's transition table has no CONFIRMED -> EXCLUDED row; a confirmed match can only
// leave CONFIRMED via unmatchReconciliation().
export function excludeReconciliation(id: number, reason: string): BankReconciliationMatchRow {
  const idNum = requireValidId(id);
  const reasonText = requireReason(reason);

  const run = db.transaction(() => {
    const before = getMatchById(idNum);
    if (!before) {
      throw new Error("NOT_FOUND");
    }

    const guard = db
      .prepare(
        `UPDATE bank_reconciliation_matches
         SET status = 'EXCLUDED', note = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status IN ('SUGGESTED', 'MATCHED', 'NEEDS_REVIEW')`
      )
      .run(reasonText, idNum);

    if (guard.changes !== 1) {
      throw new Error("INVALID_STATE_TRANSITION");
    }

    insertAuditRow({
      matchId: idNum,
      action: "EXCLUDED",
      fromStatus: before.status,
      toStatus: "EXCLUDED",
      reason: reasonText,
      performedBy: ADMIN_ACTOR,
    });
  });

  run();

  const after = getMatchById(idNum);
  if (!after) {
    throw new Error("NOT_FOUND");
  }

  return after;
}

// SUGGESTED|MATCHED|CONFIRMED -> NEEDS_REVIEW. This is an EXPLICIT mutation function — it is never
// called automatically by any read function in this file (evaluateReconciliationMatchStaleness()
// above is the read-only counterpart; it never calls this). A future caller (API layer) decides when
// to invoke this, whether prompted by a human or by a separately-scheduled/explicit check — this
// file itself wires nothing automatic. `reason` is required.
export function markReconciliationNeedsReview(id: number, reason: string): BankReconciliationMatchRow {
  const idNum = requireValidId(id);
  const reasonText = requireReason(reason);

  const run = db.transaction(() => {
    const before = getMatchById(idNum);
    if (!before) {
      throw new Error("NOT_FOUND");
    }

    const guard = db
      .prepare(
        `UPDATE bank_reconciliation_matches
         SET status = 'NEEDS_REVIEW', note = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status IN ('SUGGESTED', 'MATCHED', 'CONFIRMED')`
      )
      .run(reasonText, idNum);

    if (guard.changes !== 1) {
      throw new Error("INVALID_STATE_TRANSITION");
    }

    insertAuditRow({
      matchId: idNum,
      action: "NEEDS_REVIEW_FLAGGED",
      fromStatus: before.status,
      toStatus: "NEEDS_REVIEW",
      reason: reasonText,
      performedBy: ADMIN_ACTOR,
    });
  });

  run();

  const after = getMatchById(idNum);
  if (!after) {
    throw new Error("NOT_FOUND");
  }

  return after;
}

// CONFIRMED -> UNMATCHED. The only transition permitted out of CONFIRMED via explicit human action
// (docs/RECONCILIATION_DATA_MODEL.md §5/§10) — the row is never deleted, only flipped to UNMATCHED
// (the soft-delete marker per §10), which is row-terminal (re-linking the same pair requires a new
// row via createReconciliationSuggestion(), not reuse of this one). `reason` required. Double-click /
// concurrent-unmatch safe via the same WHERE-guarded-UPDATE-first-in-transaction pattern as
// confirmReconciliation().
export function unmatchReconciliation(id: number, reason: string): BankReconciliationMatchRow {
  const idNum = requireValidId(id);
  const reasonText = requireReason(reason);

  const run = db.transaction(() => {
    const before = getMatchById(idNum);
    if (!before) {
      throw new Error("NOT_FOUND");
    }

    const guard = db
      .prepare(
        `UPDATE bank_reconciliation_matches
         SET status = 'UNMATCHED', unmatched_at = CURRENT_TIMESTAMP, unmatched_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'CONFIRMED'`
      )
      .run(ADMIN_ACTOR, idNum);

    if (guard.changes !== 1) {
      throw new Error("CONFLICT");
    }

    insertAuditRow({
      matchId: idNum,
      action: "UNMATCHED",
      fromStatus: before.status,
      toStatus: "UNMATCHED",
      reason: reasonText,
      performedBy: ADMIN_ACTOR,
    });
  });

  run();

  const after = getMatchById(idNum);
  if (!after) {
    throw new Error("NOT_FOUND");
  }

  return after;
}
