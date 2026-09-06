import crypto from "node:crypto";
import db from "./db";

// Tax Audit Log — STEP 96 — append-only mutation trail for tax-relevant data (transactions,
// transaction_attachments, wht_records, taxpayer_profiles, tax_years, tax_year_transaction_links).
//
// NO update/delete function is ever written in this file, by design — same convention as
// src/lib/reconciliation.ts's bank_reconciliation_audit / inventory_movements / ai_cost_ledger.
// insertAuditEvent() below is called from WITHIN an existing db.transaction() at each mutation call
// site (createTransaction/updateTransaction/deleteTransaction, etc.) so it is atomic with the
// mutation it documents — better-sqlite3 transactions are fully synchronous, so nothing can
// interleave between the mutation and its audit row.
//
// actor is a FIXED LITERAL, never a per-user identity — src/lib/auth.ts's session token encodes only
// {exp}, no username, for a single shared admin credential. Representing this as anything other than
// a fixed literal would misrepresent what this system can actually attribute. Same documented
// limitation already established for bank_reconciliation_matches.confirmed_by/unmatched_by.
export const SINGLE_ADMIN_ACTOR = "admin";

export type TaxAuditEntityType =
  | "transaction"
  | "transaction_attachment"
  | "wht_record"
  | "taxpayer_profile"
  | "tax_year"
  | "tax_year_transaction_link"
  // STEP 100 — Tax Document Recovery Foundation. No column/table change to tax_audit_log itself
  // (entity_type is already generic TEXT) — these are additive TS-layer type members only.
  | "tax_period"
  | "tax_document"
  | "tax_period_evidence_status"
  // STEP 102 — Multi-row Document Row/Event architecture. No column/table change to
  // tax_audit_log itself (entity_type is already generic TEXT) — additive TS-layer type member only.
  | "tax_document_row"
  // STEP 104 — Fact Extraction Storage. No column/table change to tax_audit_log itself — additive
  // TS-layer type members only.
  | "extraction_run"
  | "extracted_fact"
  // STEP 106 — Parties Master Data. No column/table change to tax_audit_log itself — additive
  // TS-layer type members only. party_identifier mutations must snapshot a MASKED representation
  // (never the raw identifier_value_raw/identifier_value_normalized) — see
  // src/lib/partyIdentifiers.ts's maskIdentifierValue().
  | "party"
  | "party_identifier"
  // STEP 108 — Document-Party Linking. No column/table change to tax_audit_log itself — additive
  // TS-layer type member only.
  | "tax_document_party";

export type TaxAuditAction = "CREATE" | "UPDATE" | "DELETE";

export type TaxAuditLogRow = {
  id: number;
  entityType: TaxAuditEntityType;
  entityId: number;
  action: TaxAuditAction;
  actor: string;
  occurredAt: string;
  beforeData: unknown;
  afterData: unknown;
  prevHash: string;
  rowHash: string;
};

type DbRow = {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  actor: string;
  occurred_at: string;
  before_data: string | null;
  after_data: string | null;
  prev_hash: string;
  row_hash: string;
};

function toRow(row: DbRow): TaxAuditLogRow {
  return {
    id: row.id,
    entityType: row.entity_type as TaxAuditEntityType,
    entityId: row.entity_id,
    action: row.action as TaxAuditAction,
    actor: row.actor,
    occurredAt: row.occurred_at,
    beforeData: row.before_data ? JSON.parse(row.before_data) : null,
    afterData: row.after_data ? JSON.parse(row.after_data) : null,
    prevHash: row.prev_hash,
    rowHash: row.row_hash,
  };
}

// Fixed genesis value for the very first row ever inserted — same length/shape as a real SHA-256
// hex digest so the chain is uniform from row 1 onward, but distinguishable as "no predecessor"
// (all-zero) rather than a value that could ever collide with a real computed hash.
const GENESIS_HASH = "0".repeat(64);

function getLastRowHash(): string {
  const row = db
    .prepare("SELECT row_hash FROM tax_audit_log ORDER BY id DESC LIMIT 1")
    .get() as { row_hash: string } | undefined;

  return row ? row.row_hash : GENESIS_HASH;
}

// Fixed field order (never JSON.stringify on an object whose key order could vary) so the same
// logical content always hashes identically — required for the chain to be independently
// re-verifiable later (verifyChainIntegrity() below).
function computeRowHash(params: {
  prevHash: string;
  entityType: string;
  entityId: number;
  action: string;
  actor: string;
  occurredAt: string;
  beforeData: string | null;
  afterData: string | null;
}): string {
  const content = [
    params.prevHash,
    params.entityType,
    String(params.entityId),
    params.action,
    params.actor,
    params.occurredAt,
    params.beforeData ?? "",
    params.afterData ?? "",
  ].join("|");

  return crypto.createHash("sha256").update(content).digest("hex");
}

export interface RecordAuditEventInput {
  entityType: TaxAuditEntityType;
  entityId: number;
  action: TaxAuditAction;
  beforeData?: unknown;
  afterData?: unknown;
}

// Called from WITHIN the same db.transaction() as the mutation it documents (see call sites in
// src/lib/transactions.ts, src/lib/transactionAttachments.ts, src/lib/whtRecords.ts,
// src/lib/taxpayerProfile.ts, src/lib/taxYears.ts, src/lib/taxYearTransactionLinks.ts) — if the
// mutation's own transaction rolls back, this row is rolled back with it, so a failed mutation can
// never leave behind an audit event claiming it succeeded.
export function recordAuditEvent(input: RecordAuditEventInput): TaxAuditLogRow {
  const occurredAt = new Date().toISOString().replace("T", " ").slice(0, 19);
  const beforeData = input.beforeData === undefined ? null : JSON.stringify(input.beforeData);
  const afterData = input.afterData === undefined ? null : JSON.stringify(input.afterData);
  const prevHash = getLastRowHash();

  const rowHash = computeRowHash({
    prevHash,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actor: SINGLE_ADMIN_ACTOR,
    occurredAt,
    beforeData,
    afterData,
  });

  const result = db
    .prepare(
      `
      INSERT INTO tax_audit_log (
        entity_type, entity_id, action, actor, occurred_at, before_data, after_data, prev_hash, row_hash
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      input.entityType,
      input.entityId,
      input.action,
      SINGLE_ADMIN_ACTOR,
      occurredAt,
      beforeData,
      afterData,
      prevHash,
      rowHash
    );

  const row = db
    .prepare("SELECT * FROM tax_audit_log WHERE id = ?")
    .get(result.lastInsertRowid) as DbRow;

  return toRow(row);
}

export interface ListAuditEventsFilters {
  entityType?: string;
  entityId?: number;
  limit?: number;
}

export function listAuditEvents(filters: ListAuditEventsFilters = {}): TaxAuditLogRow[] {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters.entityType) {
    conditions.push("entity_type = ?");
    params.push(filters.entityType);
  }

  if (filters.entityId !== undefined) {
    conditions.push("entity_id = ?");
    params.push(filters.entityId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 200;

  const rows = db
    .prepare(
      `
      SELECT * FROM tax_audit_log
      ${whereClause}
      ORDER BY id DESC
      LIMIT ?
      `
    )
    .all(...params, limit) as DbRow[];

  return rows.map(toRow);
}

// Re-derives every row's hash from its own stored content and compares it against the stored
// row_hash, and confirms each row's stored prev_hash matches the previous row's actual row_hash —
// exposed for verification/testing (STEP 96 Phase 6/7), not called anywhere in a mutation path.
export function verifyChainIntegrity(): { valid: boolean; brokenAtId: number | null } {
  const rows = db
    .prepare("SELECT * FROM tax_audit_log ORDER BY id ASC")
    .all() as DbRow[];

  let expectedPrevHash = GENESIS_HASH;

  for (const row of rows) {
    if (row.prev_hash !== expectedPrevHash) {
      return { valid: false, brokenAtId: row.id };
    }

    const recomputed = computeRowHash({
      prevHash: row.prev_hash,
      entityType: row.entity_type,
      entityId: row.entity_id,
      action: row.action,
      actor: row.actor,
      occurredAt: row.occurred_at,
      beforeData: row.before_data,
      afterData: row.after_data,
    });

    if (recomputed !== row.row_hash) {
      return { valid: false, brokenAtId: row.id };
    }

    expectedPrevHash = row.row_hash;
  }

  return { valid: true, brokenAtId: null };
}
