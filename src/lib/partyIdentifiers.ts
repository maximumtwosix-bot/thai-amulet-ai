import db from "./db";
import { assertPartyExists } from "./parties";
import { recordAuditEvent } from "./taxAuditLog";

// Party Identifiers — STEP 106 — CRUD layer for the `party_identifiers` table added in the same
// STEP (src/lib/db.ts). See that table's schema comment for full design reasoning. Every
// identifier_value_raw is stored exactly as given and NEVER modified after insert — no format is
// assumed or enforced regardless of identifier_type (this deliberately extends
// wht_records.payer_tax_id's own "no format assumption" policy rather than reusing
// taxpayer_profiles.taxpayer_id's stricter ^\d{13}$ regex). No document-party linking, no
// merge/auto-match, no money/tax semantics anywhere in this file.

export type IdentifierType =
  | "THAI_INDIVIDUAL_TAX_ID"
  | "THAI_JURISTIC_TAX_ID"
  | "FOREIGN_TAX_ID"
  | "COMPANY_REGISTRATION_NUMBER"
  | "BANK_IDENTIFIER"
  | "EXTERNAL_PLATFORM_ID"
  | "UNKNOWN";

export const IDENTIFIER_TYPES: IdentifierType[] = [
  "THAI_INDIVIDUAL_TAX_ID",
  "THAI_JURISTIC_TAX_ID",
  "FOREIGN_TAX_ID",
  "COMPANY_REGISTRATION_NUMBER",
  "BANK_IDENTIFIER",
  "EXTERNAL_PLATFORM_ID",
  "UNKNOWN",
];

export function isValidIdentifierType(value: string): value is IdentifierType {
  return (IDENTIFIER_TYPES as string[]).includes(value);
}

// Normalization is only ever computed for these two types (digits-only extraction) — every other
// type leaves identifier_value_normalized NULL, since no safe, non-assumption-laden normalization
// rule is known for foreign tax IDs, company registration numbers, bank identifiers, or platform
// IDs. See src/lib/db.ts's schema comment.
const THAI_TAX_ID_TYPES: IdentifierType[] = ["THAI_INDIVIDUAL_TAX_ID", "THAI_JURISTIC_TAX_ID"];

export type PartyIdentifierRow = {
  id: number;
  partyId: number;
  identifierType: IdentifierType;
  identifierValueRaw: string;
  identifierValueNormalized: string | null;
  country: string | null;
  sourceDescription: string | null;
  isPrimary: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: number;
  party_id: number;
  identifier_type: string;
  identifier_value_raw: string;
  identifier_value_normalized: string | null;
  country: string | null;
  source_description: string | null;
  is_primary: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

function toRow(row: DbRow): PartyIdentifierRow {
  return {
    id: row.id,
    partyId: row.party_id,
    identifierType: row.identifier_type as IdentifierType,
    identifierValueRaw: row.identifier_value_raw,
    identifierValueNormalized: row.identifier_value_normalized,
    country: row.country,
    sourceDescription: row.source_description,
    isPrimary: row.is_primary === 1,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getById(id: number): PartyIdentifierRow | undefined {
  const row = db.prepare("SELECT * FROM party_identifiers WHERE id = ?").get(id) as
    | DbRow
    | undefined;

  return row ? toRow(row) : undefined;
}

export function getPartyIdentifierById(id: number): PartyIdentifierRow | undefined {
  return getById(id);
}

export function listPartyIdentifiers(partyId: number): PartyIdentifierRow[] {
  const rows = db
    .prepare("SELECT * FROM party_identifiers WHERE party_id = ? ORDER BY id ASC")
    .all(partyId) as DbRow[];

  return rows.map(toRow);
}

// STEP 106 Phase 9/10 — audit events for this table must NEVER snapshot the raw identifier value.
// Masks all but the last 4 characters (fully masked if 4 chars or fewer) — applied ONLY to the
// object passed to recordAuditEvent(), never to what a DAL caller (getPartyIdentifierById/
// listPartyIdentifiers) actually receives, since there is no API yet to leak that through (masking
// for API/list responses is explicitly deferred to a future STEP, per the STEP 105 audit).
function maskIdentifierValue(value: string | null): string | null {
  if (value === null) return null;
  if (value.length <= 4) return "*".repeat(value.length);

  return "*".repeat(value.length - 4) + value.slice(-4);
}

function toMaskedAuditSnapshot(row: PartyIdentifierRow): Record<string, unknown> {
  return {
    ...row,
    identifierValueRaw: maskIdentifierValue(row.identifierValueRaw),
    identifierValueNormalized: maskIdentifierValue(row.identifierValueNormalized),
  };
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

const MAX_IDENTIFIER_VALUE_LENGTH = 128;
const MAX_COUNTRY_LENGTH = 100;
const MAX_SOURCE_DESCRIPTION_LENGTH = 500;
const MAX_NOTE_LENGTH = 2000;

// No format is assumed or enforced here — see this file's top comment and src/lib/db.ts's schema
// comment. Only a resource-abuse length guard applies, same convention as
// bankAccounts.ts's/whtRecords.ts's own length guards on identifier-shaped fields. Never logged,
// never echoed into a thrown error message (STEP 106 Phase 10) — the thrown Error is always a
// fixed code string, the raw value is never interpolated into it.
function normalizeIdentifierValueRaw(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text || text.length > MAX_IDENTIFIER_VALUE_LENGTH) {
    throw new Error("INVALID_IDENTIFIER_VALUE");
  }

  return text;
}

// Digits-only extraction, computed once at insert time — a convenience candidate, never a format
// gate (the resulting digit count is never validated against 13 or any other length).
function computeNormalizedCandidate(identifierType: IdentifierType, rawValue: string): string | null {
  if (!THAI_TAX_ID_TYPES.includes(identifierType)) {
    return null;
  }

  const digitsOnly = rawValue.replace(/\D/g, "");

  return digitsOnly || null;
}

function normalizeOptionalText(value: unknown, maxLength: number, errorCode: string): string | null {
  if (value === undefined || value === null || value === "") return null;

  const text = typeof value === "string" ? value.trim() : "";

  if (text.length > maxLength) {
    throw new Error(errorCode);
  }

  return text || null;
}

export interface CreatePartyIdentifierInput {
  partyId: number;
  identifierType: string;
  identifierValueRaw: string;
  country?: string | null;
  sourceDescription?: string | null;
  isPrimary?: boolean;
  note?: string | null;
}

// identifierType has NO default — the caller must always explicitly state it, even if 'UNKNOWN'
// (see src/lib/db.ts's schema comment for why this differs from parties.partyType's own safe
// default). isPrimary defaults to false when omitted — a newly-added identifier does not silently
// displace an existing primary; promoting one requires the separate, explicit
// setPrimaryPartyIdentifier() call below.
export function createPartyIdentifier(input: CreatePartyIdentifierInput): PartyIdentifierRow {
  const partyId = normalizePositiveId(input.partyId);
  assertPartyExists(partyId);

  const identifierType = typeof input.identifierType === "string" ? input.identifierType : "";

  if (!isValidIdentifierType(identifierType)) {
    throw new Error("INVALID_IDENTIFIER_TYPE");
  }

  const identifierValueRaw = normalizeIdentifierValueRaw(input.identifierValueRaw);
  const identifierValueNormalized = computeNormalizedCandidate(identifierType, identifierValueRaw);
  const country = normalizeOptionalText(input.country, MAX_COUNTRY_LENGTH, "COUNTRY_TOO_LONG");
  const sourceDescription = normalizeOptionalText(
    input.sourceDescription,
    MAX_SOURCE_DESCRIPTION_LENGTH,
    "SOURCE_DESCRIPTION_TOO_LONG"
  );
  const note = normalizeOptionalText(input.note, MAX_NOTE_LENGTH, "NOTE_TOO_LONG");
  const isPrimary = input.isPrimary === true;

  const insert = db.transaction(() => {
    if (isPrimary) {
      db.prepare("UPDATE party_identifiers SET is_primary = 0 WHERE party_id = ? AND is_primary = 1").run(
        partyId
      );
    }

    let result;

    try {
      result = db
        .prepare(
          `
          INSERT INTO party_identifiers (
            party_id, identifier_type, identifier_value_raw, identifier_value_normalized,
            country, source_description, is_primary, note
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          partyId,
          identifierType,
          identifierValueRaw,
          identifierValueNormalized,
          country,
          sourceDescription,
          isPrimary ? 1 : 0,
          note
        );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error("DUPLICATE_IDENTIFIER");
      }

      throw error;
    }

    const row = getById(Number(result.lastInsertRowid));

    if (!row) {
      throw new Error("PARTY_IDENTIFIER_CREATE_FAILED");
    }

    recordAuditEvent({
      entityType: "party_identifier",
      entityId: row.id,
      action: "CREATE",
      afterData: toMaskedAuditSnapshot(row),
    });

    return row;
  });

  return insert();
}

// The ONLY status-like mutation — flips this identifier to primary and unsets any other primary
// for the same party (enforced additionally by the partial unique index at the DB level).
export function setPrimaryPartyIdentifier(id: number): PartyIdentifierRow {
  const existing = getById(id);

  if (!existing) {
    throw new Error("PARTY_IDENTIFIER_NOT_FOUND");
  }

  const update = db.transaction(() => {
    db.prepare("UPDATE party_identifiers SET is_primary = 0 WHERE party_id = ? AND is_primary = 1").run(
      existing.partyId
    );

    db.prepare(
      "UPDATE party_identifiers SET is_primary = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(id);

    const row = getById(id);

    if (!row) {
      throw new Error("PARTY_IDENTIFIER_UPDATE_FAILED");
    }

    recordAuditEvent({
      entityType: "party_identifier",
      entityId: id,
      action: "UPDATE",
      beforeData: toMaskedAuditSnapshot(existing),
      afterData: toMaskedAuditSnapshot(row),
    });

    return row;
  });

  return update();
}

// Pure annotation — identifier_value_raw/normalized/type/country are immutable by construction (no
// UPDATE statement anywhere in this file touches them).
export function updatePartyIdentifierNote(id: number, note: string | null): PartyIdentifierRow {
  const existing = getById(id);

  if (!existing) {
    throw new Error("PARTY_IDENTIFIER_NOT_FOUND");
  }

  const nextNote = normalizeOptionalText(note, MAX_NOTE_LENGTH, "NOTE_TOO_LONG");

  const update = db.transaction(() => {
    db.prepare(
      "UPDATE party_identifiers SET note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(nextNote, id);

    const row = getById(id);

    if (!row) {
      throw new Error("PARTY_IDENTIFIER_UPDATE_FAILED");
    }

    recordAuditEvent({
      entityType: "party_identifier",
      entityId: id,
      action: "UPDATE",
      beforeData: toMaskedAuditSnapshot(existing),
      afterData: toMaskedAuditSnapshot(row),
    });

    return row;
  });

  return update();
}
