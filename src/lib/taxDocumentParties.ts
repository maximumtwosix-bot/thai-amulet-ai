import db from "./db";
import { getTaxDocumentById } from "./taxDocuments";
import { getTaxPeriodById } from "./taxPeriods";
import { getTaxDocumentRowById } from "./taxDocumentRows";
import { assertPartyExists } from "./parties";
import { recordAuditEvent } from "./taxAuditLog";

// Document-Party Linking — STEP 108 — CRUD layer for the `tax_document_parties` table added in the
// same STEP (src/lib/db.ts). See that table's schema comment for full design reasoning. This file
// is a pure mapping layer: it never creates/mutates a parties row, never creates/mutates a
// taxpayer_profiles row, never creates/mutates a customers row, and never creates a transaction. No
// name-based auto-match, no auto-merge, no OCR/AI, no tax/WHT/VAT calculation exists anywhere here.

export type PartyRole =
  | "ISSUER"
  | "COUNTERPARTY"
  | "PAYER"
  | "PAYEE"
  | "SUPPLIER"
  | "CUSTOMER"
  | "WITHHOLDING_AGENT"
  | "OTHER";

export const PARTY_ROLES: PartyRole[] = [
  "ISSUER",
  "COUNTERPARTY",
  "PAYER",
  "PAYEE",
  "SUPPLIER",
  "CUSTOMER",
  "WITHHOLDING_AGENT",
  "OTHER",
];

export function isValidPartyRole(value: string): value is PartyRole {
  return (PARTY_ROLES as string[]).includes(value);
}

// ACTIVE is the only non-terminal value — once UNLINKED, no further status change is accepted (a
// link is never re-activated in place; a new link row is created instead, same "correct by adding,
// never by resurrecting" discipline as every other entity in this schema).
export type LinkStatus = "ACTIVE" | "UNLINKED";

export const LINK_STATUSES: LinkStatus[] = ["ACTIVE", "UNLINKED"];

export function isValidLinkStatus(value: string): value is LinkStatus {
  return (LINK_STATUSES as string[]).includes(value);
}

export type TaxDocumentPartyRow = {
  id: number;
  taxDocumentId: number;
  taxDocumentRowId: number | null;
  partyId: number;
  role: PartyRole;
  status: LinkStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: number;
  tax_document_id: number;
  tax_document_row_id: number | null;
  party_id: number;
  role: string;
  status: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

function toRow(row: DbRow): TaxDocumentPartyRow {
  return {
    id: row.id,
    taxDocumentId: row.tax_document_id,
    taxDocumentRowId: row.tax_document_row_id,
    partyId: row.party_id,
    role: row.role as PartyRole,
    status: row.status as LinkStatus,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getById(id: number): TaxDocumentPartyRow | undefined {
  const row = db.prepare("SELECT * FROM tax_document_parties WHERE id = ?").get(id) as
    | DbRow
    | undefined;

  return row ? toRow(row) : undefined;
}

export function getDocumentPartyLinkById(id: number): TaxDocumentPartyRow | undefined {
  return getById(id);
}

export function listLinksForDocument(taxDocumentId: number): TaxDocumentPartyRow[] {
  const rows = db
    .prepare("SELECT * FROM tax_document_parties WHERE tax_document_id = ? ORDER BY id ASC")
    .all(taxDocumentId) as DbRow[];

  return rows.map(toRow);
}

export function listLinksForParty(partyId: number): TaxDocumentPartyRow[] {
  const rows = db
    .prepare("SELECT * FROM tax_document_parties WHERE party_id = ? ORDER BY id ASC")
    .all(partyId) as DbRow[];

  return rows.map(toRow);
}

// Same tiny, duplicated-per-file guard pattern as src/lib/taxDocumentRows.ts/extractionRuns.ts/
// extractedFacts.ts (STEP 102/104) — deliberately NOT shared. Zero changes to tax_documents.ts/
// taxPeriodEvidenceStatus.ts required. tax_years.LOCKED is deliberately NOT checked here, matching
// the identical precedent set by those three files.
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

const MAX_NOTE_LENGTH = 2000;

function normalizeOptionalNote(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;

  const text = typeof value === "string" ? value.trim() : "";

  if (text.length > MAX_NOTE_LENGTH) {
    throw new Error("NOTE_TOO_LONG");
  }

  return text || null;
}

export interface LinkPartyToDocumentInput {
  taxDocumentId: number;
  taxDocumentRowId?: number | null;
  partyId: number;
  role: string;
  note?: string | null;
}

// The ONLY create path. Enforces (in order): document exists, period mutable, party exists, row
// exists AND belongs to the same document (ROW_DOCUMENT_MISMATCH otherwise — identical check to
// createExtractedFact(), STEP 104), role is a valid, explicitly-supplied value. Never creates or
// mutates a parties/taxpayer_profiles/customers row; never creates a transaction.
export function linkPartyToDocument(input: LinkPartyToDocumentInput): TaxDocumentPartyRow {
  const taxDocumentId = normalizePositiveId(input.taxDocumentId);

  if (!getTaxDocumentById(taxDocumentId)) {
    throw new Error("TAX_DOCUMENT_NOT_FOUND");
  }

  assertDocumentPeriodMutable(taxDocumentId);

  const partyId = normalizePositiveId(input.partyId);
  assertPartyExists(partyId);

  const taxDocumentRowId = normalizeOptionalPositiveId(input.taxDocumentRowId);

  if (taxDocumentRowId !== null) {
    const row = getTaxDocumentRowById(taxDocumentRowId);

    if (!row) {
      throw new Error("TAX_DOCUMENT_ROW_NOT_FOUND");
    }

    if (row.taxDocumentId !== taxDocumentId) {
      throw new Error("ROW_DOCUMENT_MISMATCH");
    }
  }

  const role = typeof input.role === "string" ? input.role : "";

  if (!isValidPartyRole(role)) {
    throw new Error("INVALID_PARTY_ROLE");
  }

  const note = normalizeOptionalNote(input.note);

  const insert = db.transaction(() => {
    // Application-level duplicate check for the document-level case (taxDocumentRowId === null),
    // where SQLite's own unique index cannot help (NULL is never equal to NULL in a unique index) —
    // identical two-layer pattern already proven by createExtractedFact() (STEP 104). Safe within
    // this single-process, synchronous (better-sqlite3) transaction.
    if (taxDocumentRowId === null) {
      const existing = db
        .prepare(
          `
          SELECT id FROM tax_document_parties
          WHERE tax_document_id = ? AND tax_document_row_id IS NULL
            AND party_id = ? AND role = ?
          `
        )
        .get(taxDocumentId, partyId, role);

      if (existing) {
        throw new Error("DUPLICATE_LINK");
      }
    }

    let result;

    try {
      result = db
        .prepare(
          `
          INSERT INTO tax_document_parties (
            tax_document_id, tax_document_row_id, party_id, role, note
          )
          VALUES (?, ?, ?, ?, ?)
          `
        )
        .run(taxDocumentId, taxDocumentRowId, partyId, role, note);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error("DUPLICATE_LINK");
      }

      throw error;
    }

    const row = getById(Number(result.lastInsertRowid));

    if (!row) {
      throw new Error("TAX_DOCUMENT_PARTY_CREATE_FAILED");
    }

    recordAuditEvent({
      entityType: "tax_document_party",
      entityId: row.id,
      action: "CREATE",
      afterData: row,
    });

    return row;
  });

  return insert();
}

// Pure annotation — the only mutable field besides status. taxDocumentId/taxDocumentRowId/
// partyId/role are immutable by construction (no UPDATE statement anywhere in this file touches
// them). Rejected once the link is UNLINKED (a terminal, historical state must not be quietly
// re-annotated) and rejected under a CLOSED period, same guard as create.
export function updateLinkNote(id: number, note: string | null): TaxDocumentPartyRow {
  const existing = getById(id);

  if (!existing) {
    throw new Error("TAX_DOCUMENT_PARTY_NOT_FOUND");
  }

  assertDocumentPeriodMutable(existing.taxDocumentId);

  if (existing.status === "UNLINKED") {
    throw new Error("LINK_ALREADY_UNLINKED");
  }

  const nextNote = normalizeOptionalNote(note);

  const update = db.transaction(() => {
    db.prepare(
      "UPDATE tax_document_parties SET note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(nextNote, id);

    const row = getById(id);

    if (!row) {
      throw new Error("TAX_DOCUMENT_PARTY_UPDATE_FAILED");
    }

    recordAuditEvent({
      entityType: "tax_document_party",
      entityId: id,
      action: "UPDATE",
      beforeData: existing,
      afterData: row,
    });

    return row;
  });

  return update();
}

// The ONLY correction mechanism — a soft, audited status change, NEVER a row deletion. UNLINKED is
// terminal (no re-activation in place; a corrected relationship is expressed by creating a NEW link
// row via linkPartyToDocument(), leaving this row as permanent history).
export function unlinkDocumentParty(id: number, reason?: string | null): TaxDocumentPartyRow {
  const existing = getById(id);

  if (!existing) {
    throw new Error("TAX_DOCUMENT_PARTY_NOT_FOUND");
  }

  assertDocumentPeriodMutable(existing.taxDocumentId);

  if (existing.status === "UNLINKED") {
    throw new Error("LINK_ALREADY_UNLINKED");
  }

  const nextNote = reason === undefined ? existing.note : normalizeOptionalNote(reason);

  const update = db.transaction(() => {
    db.prepare(
      "UPDATE tax_document_parties SET status = 'UNLINKED', note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(nextNote, id);

    const row = getById(id);

    if (!row) {
      throw new Error("TAX_DOCUMENT_PARTY_UPDATE_FAILED");
    }

    recordAuditEvent({
      entityType: "tax_document_party",
      entityId: id,
      action: "UPDATE",
      beforeData: existing,
      afterData: row,
    });

    return row;
  });

  return update();
}
