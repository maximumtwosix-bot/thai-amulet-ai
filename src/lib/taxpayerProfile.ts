import db from "./db";
import { recordAuditEvent } from "./taxAuditLog";

// Taxpayer Profile — STEP 93 (PIT-1) — CRUD + validation layer for the `taxpayer_profiles` table
// added in the same STEP (src/lib/db.ts). Standalone entity: no relation to transactions/orders/
// customers/products. Reuses the same toRow()/DbRow/CRUD convention as src/lib/bankAccounts.ts and
// src/lib/customers.ts.
//
// No masking here — masking of taxpayerId is display-only and belongs to the API layer
// (src/app/api/tax/taxpayer-profile/route.ts), exactly matching bank_accounts' documented
// precedent (src/lib/bankAccounts.ts's own top-of-file comment). Every function here returns the
// real, unmasked row.

// Only 'INDIVIDUAL' is supported by this STEP, per the user-confirmed profile it was scoped
// against. Kept as a list (not a bare string literal check) so a future STEP can extend this
// without changing the validation call sites, matching src/lib/bankAccounts.ts's
// BANK_ACCOUNT_CLASSIFICATIONS pattern.
export type TaxpayerType = "INDIVIDUAL";

export const TAXPAYER_TYPES: TaxpayerType[] = ["INDIVIDUAL"];

export function isValidTaxpayerType(value: string): value is TaxpayerType {
  return (TAXPAYER_TYPES as string[]).includes(value);
}

export type TaxpayerProfileRow = {
  id: number;
  name: string;
  taxpayerId: string;
  taxpayerType: TaxpayerType;
  vatRegistered: boolean;
  whtApplicable: boolean;
  filingForm: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: number;
  name: string;
  taxpayer_id: string;
  taxpayer_type: string;
  vat_registered: number;
  wht_applicable: number;
  filing_form: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

function toRow(row: DbRow): TaxpayerProfileRow {
  return {
    id: row.id,
    name: row.name,
    taxpayerId: row.taxpayer_id,
    taxpayerType: row.taxpayer_type as TaxpayerType,
    vatRegistered: row.vat_registered === 1,
    whtApplicable: row.wht_applicable === 1,
    filingForm: row.filing_form,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getById(id: number): TaxpayerProfileRow | undefined {
  const row = db.prepare("SELECT * FROM taxpayer_profiles WHERE id = ?").get(id) as
    | DbRow
    | undefined;

  return row ? toRow(row) : undefined;
}

export function getTaxpayerProfileById(id: number): TaxpayerProfileRow | undefined {
  return getById(id);
}

// Exported so src/lib/taxYears.ts can verify a taxpayerProfileId actually references a real row
// before writing it into tax_years.taxpayer_profile_id — same rigor as
// assertCustomerExists()/assertProductExists() elsewhere in this codebase.
export function assertTaxpayerProfileExists(taxpayerProfileId: number): void {
  if (!getById(taxpayerProfileId)) {
    throw new Error("TAXPAYER_PROFILE_NOT_FOUND");
  }
}

export interface ListTaxpayerProfilesFilters {
  isActive?: boolean;
}

export function listTaxpayerProfiles(
  filters: ListTaxpayerProfilesFilters = {}
): TaxpayerProfileRow[] {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters.isActive !== undefined) {
    conditions.push("is_active = ?");
    params.push(filters.isActive ? 1 : 0);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `
      SELECT * FROM taxpayer_profiles
      ${whereClause}
      ORDER BY created_at DESC
      `
    )
    .all(...params) as DbRow[];

  return rows.map(toRow);
}

function normalizeRequiredText(value: unknown, errorCode: string): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw new Error(errorCode);
  }

  return text;
}

// Thai individual taxpayer ID / national ID is a stable 13-digit numeric civil-registration
// format — this is NOT a current-tax-law figure (rate/threshold/deadline) that could change with
// this year's Revenue Department rules, so validating its shape does not violate this STEP's
// "do not guess current tax law" constraint. Digits-only, exactly 13 characters, after trimming.
const TAXPAYER_ID_PATTERN = /^\d{13}$/;

function normalizeTaxpayerId(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (!TAXPAYER_ID_PATTERN.test(text)) {
    throw new Error("INVALID_TAXPAYER_ID");
  }

  return text;
}

function normalizeRequiredBoolean(value: unknown, errorCode: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(errorCode);
  }

  return value;
}

// filingForm is intentionally free text, never validated against a fixed enum (no
// ('90'|'91'|'94') list) — per the audit's explicit instruction that the applicable Revenue
// Department filing form must remain unconfirmed/nullable until verified against current official
// guidance. Only a resource-abuse length guard is applied, same convention as
// bankAccounts.ts's assertAccountNumberLength().
const MAX_FILING_FORM_LENGTH = 32;

function normalizeFilingForm(value: unknown): string | null {
  if (value === undefined || value === null) return null;

  const text = typeof value === "string" ? value.trim() : "";

  if (!text) return null;

  if (text.length > MAX_FILING_FORM_LENGTH) {
    throw new Error("FILING_FORM_TOO_LONG");
  }

  return text;
}

export interface CreateTaxpayerProfileInput {
  name: string;
  taxpayerId: string;
  taxpayerType: string;
  vatRegistered: boolean;
  whtApplicable: boolean;
  filingForm?: string | null;
}

// STEP 93 (PIT-1) — a new profile always starts isActive=true, same convention as
// createBankAccount() (no client-settable isActive on create; deactivating happens only via
// updateTaxpayerProfile()). vatRegistered/whtApplicable have no default anywhere in this path —
// the caller (API layer) must always supply them explicitly, matching the NOT NULL/NO DEFAULT
// columns in the schema.
export function createTaxpayerProfile(input: CreateTaxpayerProfileInput): TaxpayerProfileRow {
  const name = normalizeRequiredText(input.name, "INVALID_NAME");
  const taxpayerId = normalizeTaxpayerId(input.taxpayerId);

  const taxpayerType = typeof input.taxpayerType === "string" ? input.taxpayerType : "";

  if (!isValidTaxpayerType(taxpayerType)) {
    throw new Error("INVALID_TAXPAYER_TYPE");
  }

  const vatRegistered = normalizeRequiredBoolean(input.vatRegistered, "INVALID_VAT_REGISTERED");
  const whtApplicable = normalizeRequiredBoolean(input.whtApplicable, "INVALID_WHT_APPLICABLE");
  const filingForm = normalizeFilingForm(input.filingForm);

  // STEP 96 — insert + audit event as one atomic unit.
  const insert = db.transaction(() => {
    const result = db
      .prepare(
        `
        INSERT INTO taxpayer_profiles (
          name, taxpayer_id, taxpayer_type, vat_registered, wht_applicable, filing_form
        )
        VALUES (?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        name,
        taxpayerId,
        taxpayerType,
        vatRegistered ? 1 : 0,
        whtApplicable ? 1 : 0,
        filingForm
      );

    const row = getById(Number(result.lastInsertRowid));

    if (!row) {
      throw new Error("TAXPAYER_PROFILE_CREATE_FAILED");
    }

    recordAuditEvent({
      entityType: "taxpayer_profile",
      entityId: row.id,
      action: "CREATE",
      afterData: row,
    });

    return row;
  });

  return insert();
}

export interface UpdateTaxpayerProfileInput {
  name?: string;
  taxpayerId?: string;
  vatRegistered?: boolean;
  whtApplicable?: boolean;
  filingForm?: string | null;
  isActive?: boolean;
}

// taxpayerType is deliberately NOT updatable here — this STEP only ever supports 'INDIVIDUAL',
// and changing a taxpayer's legal type is a business decision out of this STEP's scope entirely,
// not a field this minimal foundation should let a PATCH silently flip.
export function updateTaxpayerProfile(
  id: number,
  input: UpdateTaxpayerProfileInput
): TaxpayerProfileRow {
  const existing = getById(id);

  if (!existing) {
    throw new Error("TAXPAYER_PROFILE_NOT_FOUND");
  }

  const nextName = input.name === undefined ? existing.name : normalizeRequiredText(input.name, "INVALID_NAME");

  const nextTaxpayerId =
    input.taxpayerId === undefined ? existing.taxpayerId : normalizeTaxpayerId(input.taxpayerId);

  const nextVatRegistered =
    input.vatRegistered === undefined
      ? existing.vatRegistered
      : normalizeRequiredBoolean(input.vatRegistered, "INVALID_VAT_REGISTERED");

  const nextWhtApplicable =
    input.whtApplicable === undefined
      ? existing.whtApplicable
      : normalizeRequiredBoolean(input.whtApplicable, "INVALID_WHT_APPLICABLE");

  const nextFilingForm =
    input.filingForm === undefined ? existing.filingForm : normalizeFilingForm(input.filingForm);

  const nextIsActive = input.isActive === undefined ? existing.isActive : input.isActive;

  // STEP 96 — update + audit event as one atomic unit.
  const update = db.transaction(() => {
    db.prepare(
      `
      UPDATE taxpayer_profiles
      SET
        name = ?,
        taxpayer_id = ?,
        vat_registered = ?,
        wht_applicable = ?,
        filing_form = ?,
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `
    ).run(
      nextName,
      nextTaxpayerId,
      nextVatRegistered ? 1 : 0,
      nextWhtApplicable ? 1 : 0,
      nextFilingForm,
      nextIsActive ? 1 : 0,
      id
    );

    const row = getById(id);

    if (!row) {
      throw new Error("TAXPAYER_PROFILE_UPDATE_FAILED");
    }

    recordAuditEvent({
      entityType: "taxpayer_profile",
      entityId: id,
      action: "UPDATE",
      beforeData: existing,
      afterData: row,
    });

    return row;
  });

  return update();
}
