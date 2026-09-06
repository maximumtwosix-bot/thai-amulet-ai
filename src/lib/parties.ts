import db from "./db";
import { recordAuditEvent } from "./taxAuditLog";

// Parties — STEP 106 — CRUD layer for the `parties` table added in the same STEP
// (src/lib/db.ts). See that table's schema comment for full design reasoning. This file is
// standalone master identity/context data ONLY — it does not represent a transaction, a customer
// order, a taxpayer profile, a tax treatment, a WHT record, or a bank account, and it performs no
// document-party linking, no merge/auto-match, no identity confirmation, and no money/tax
// calculation of any kind. No API route exists for this yet (STEP 106 explicitly excludes it).

export type PartyType = "INDIVIDUAL" | "JURISTIC_PERSON" | "GOVERNMENT" | "PLATFORM" | "BANK" | "UNKNOWN";

export const PARTY_TYPES: PartyType[] = [
  "INDIVIDUAL",
  "JURISTIC_PERSON",
  "GOVERNMENT",
  "PLATFORM",
  "BANK",
  "UNKNOWN",
];

export function isValidPartyType(value: string): value is PartyType {
  return (PARTY_TYPES as string[]).includes(value);
}

export type PartyRow = {
  id: number;
  partyType: PartyType;
  displayName: string;
  legalName: string | null;
  country: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: number;
  party_type: string;
  display_name: string;
  legal_name: string | null;
  country: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

function toRow(row: DbRow): PartyRow {
  return {
    id: row.id,
    partyType: row.party_type as PartyType,
    displayName: row.display_name,
    legalName: row.legal_name,
    country: row.country,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getById(id: number): PartyRow | undefined {
  const row = db.prepare("SELECT * FROM parties WHERE id = ?").get(id) as DbRow | undefined;

  return row ? toRow(row) : undefined;
}

export function getPartyById(id: number): PartyRow | undefined {
  return getById(id);
}

// Exported so a future document-party-link STEP can verify a partyId actually references a real
// row before writing it into a link table — same cross-table-existence-check convention used
// throughout this codebase (assertProductExists()/assertTaxDocumentExists()/etc.). Not called
// anywhere in this STEP (no linking exists yet).
export function assertPartyExists(partyId: number): void {
  if (!getById(partyId)) {
    throw new Error("PARTY_NOT_FOUND");
  }
}

const MAX_DISPLAY_NAME_LENGTH = 200;
const MAX_LEGAL_NAME_LENGTH = 200;
const MAX_COUNTRY_LENGTH = 100;
const MAX_NOTE_LENGTH = 2000;

function normalizeRequiredDisplayName(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text || text.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new Error("INVALID_DISPLAY_NAME");
  }

  return text;
}

function normalizeOptionalText(value: unknown, maxLength: number, errorCode: string): string | null {
  if (value === undefined || value === null || value === "") return null;

  const text = typeof value === "string" ? value.trim() : "";

  if (text.length > maxLength) {
    throw new Error(errorCode);
  }

  return text || null;
}

export interface CreatePartyInput {
  partyType?: string | null;
  displayName: string;
  legalName?: string | null;
  country?: string | null;
  note?: string | null;
}

// partyType defaults to 'UNKNOWN' when omitted — the only honest state absent judgment (same
// precedent as tax_period_evidence_status.status DEFAULT 'UNKNOWN', STEP 100) — never silently
// assumed to be INDIVIDUAL/JURISTIC_PERSON/etc.
export function createParty(input: CreatePartyInput): PartyRow {
  const partyTypeRaw = typeof input.partyType === "string" && input.partyType.trim()
    ? input.partyType.trim()
    : "UNKNOWN";

  if (!isValidPartyType(partyTypeRaw)) {
    throw new Error("INVALID_PARTY_TYPE");
  }

  const displayName = normalizeRequiredDisplayName(input.displayName);
  const legalName = normalizeOptionalText(input.legalName, MAX_LEGAL_NAME_LENGTH, "LEGAL_NAME_TOO_LONG");
  const country = normalizeOptionalText(input.country, MAX_COUNTRY_LENGTH, "COUNTRY_TOO_LONG");
  const note = normalizeOptionalText(input.note, MAX_NOTE_LENGTH, "NOTE_TOO_LONG");

  const insert = db.transaction(() => {
    const result = db
      .prepare(
        `
        INSERT INTO parties (party_type, display_name, legal_name, country, note)
        VALUES (?, ?, ?, ?, ?)
        `
      )
      .run(partyTypeRaw, displayName, legalName, country, note);

    const row = getById(Number(result.lastInsertRowid));

    if (!row) {
      throw new Error("PARTY_CREATE_FAILED");
    }

    recordAuditEvent({
      entityType: "party",
      entityId: row.id,
      action: "CREATE",
      afterData: row,
    });

    return row;
  });

  return insert();
}

export interface ListPartiesFilters {
  partyType?: string;
  search?: string;
  limit?: number;
}

// search matches display_name OR legal_name (substring, plain LIKE) — same "no fuzzy matching"
// convention as src/lib/customers.ts's own listCustomers(). Never used for identity matching/merge
// (STEP 106 Phase 4) — this is a lookup convenience only.
export function listParties(filters: ListPartiesFilters = {}): PartyRow[] {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters.partyType) {
    conditions.push("party_type = ?");
    params.push(filters.partyType);
  }

  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push("(display_name LIKE ? OR legal_name LIKE ?)");
    params.push(term, term);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 100;

  const rows = db
    .prepare(
      `
      SELECT * FROM parties
      ${whereClause}
      ORDER BY display_name ASC
      LIMIT ?
      `
    )
    .all(...params, limit) as DbRow[];

  return rows.map(toRow);
}

export interface UpdatePartyInput {
  partyType?: string | null;
  displayName?: string;
  legalName?: string | null;
  country?: string | null;
  note?: string | null;
}

// partyType IS updatable here (unlike taxpayer_profiles.taxpayerType) — it is a classification
// label only, never itself a tax/legal conclusion (same "document type carries no tax-treatment
// meaning" precedent as src/lib/taxDocumentTypes.ts), so correcting a classification mistake is a
// normal master-data edit, not an evidence correction requiring supersession.
export function updateParty(id: number, input: UpdatePartyInput): PartyRow {
  const existing = getById(id);

  if (!existing) {
    throw new Error("PARTY_NOT_FOUND");
  }

  const nextPartyType =
    input.partyType === undefined
      ? existing.partyType
      : (() => {
          const text = typeof input.partyType === "string" ? input.partyType.trim() : "";

          if (!isValidPartyType(text)) {
            throw new Error("INVALID_PARTY_TYPE");
          }

          return text;
        })();

  const nextDisplayName =
    input.displayName === undefined ? existing.displayName : normalizeRequiredDisplayName(input.displayName);

  const nextLegalName =
    input.legalName === undefined
      ? existing.legalName
      : normalizeOptionalText(input.legalName, MAX_LEGAL_NAME_LENGTH, "LEGAL_NAME_TOO_LONG");

  const nextCountry =
    input.country === undefined
      ? existing.country
      : normalizeOptionalText(input.country, MAX_COUNTRY_LENGTH, "COUNTRY_TOO_LONG");

  const nextNote =
    input.note === undefined ? existing.note : normalizeOptionalText(input.note, MAX_NOTE_LENGTH, "NOTE_TOO_LONG");

  const update = db.transaction(() => {
    db.prepare(
      `
      UPDATE parties
      SET party_type = ?, display_name = ?, legal_name = ?, country = ?, note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `
    ).run(nextPartyType, nextDisplayName, nextLegalName, nextCountry, nextNote, id);

    const row = getById(id);

    if (!row) {
      throw new Error("PARTY_UPDATE_FAILED");
    }

    recordAuditEvent({
      entityType: "party",
      entityId: id,
      action: "UPDATE",
      beforeData: existing,
      afterData: row,
    });

    return row;
  });

  return update();
}
