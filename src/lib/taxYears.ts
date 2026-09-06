import db from "./db";
import { assertTaxpayerProfileExists } from "./taxpayerProfile";
import { recordAuditEvent } from "./taxAuditLog";

// Tax Year — STEP 93 (PIT-1) — CRUD + status-lifecycle layer for the `tax_years` table added in the
// same STEP (src/lib/db.ts). References taxpayer_profiles by id only (assertTaxpayerProfileExists(),
// same cross-table-existence-check convention as assertProductExists()/assertOrderExists() in
// src/lib/transactions.ts).
//
// This STEP implements no tax calculation whatsoever — a tax_years row currently holds only an
// identity (taxpayer + year) and a lifecycle status. There is deliberately no generic
// updateTaxYear() — the only mutation this STEP provides is the status transition below, so "a
// locked year cannot be casually changed" holds by construction (there is no other field-level
// write path to guard).

export type TaxYearStatus = "OPEN" | "FINALIZED" | "LOCKED";

export const TAX_YEAR_STATUSES: TaxYearStatus[] = ["OPEN", "FINALIZED", "LOCKED"];

export function isValidTaxYearStatus(value: string): value is TaxYearStatus {
  return (TAX_YEAR_STATUSES as string[]).includes(value);
}

// Only forward transitions are ever allowed; LOCKED is terminal (no key for it below, so every
// transition attempted from LOCKED falls through to INVALID_STATUS_TRANSITION). Staying on the same
// status, skipping a stage (OPEN -> LOCKED directly), or moving backward are all rejected the same
// way — this is the concrete mechanism behind "locked year cannot be casually changed" and "invalid
// transition rejected".
const ALLOWED_TAX_YEAR_TRANSITIONS: Record<TaxYearStatus, TaxYearStatus[]> = {
  OPEN: ["FINALIZED"],
  FINALIZED: ["LOCKED"],
  LOCKED: [],
};

export type TaxYearRow = {
  id: number;
  taxpayerProfileId: number;
  taxYear: number;
  status: TaxYearStatus;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: number;
  taxpayer_profile_id: number;
  tax_year: number;
  status: string;
  created_at: string;
  updated_at: string;
};

function toRow(row: DbRow): TaxYearRow {
  return {
    id: row.id,
    taxpayerProfileId: row.taxpayer_profile_id,
    taxYear: row.tax_year,
    status: row.status as TaxYearStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getById(id: number): TaxYearRow | undefined {
  const row = db.prepare("SELECT * FROM tax_years WHERE id = ?").get(id) as DbRow | undefined;

  return row ? toRow(row) : undefined;
}

export function getTaxYearById(id: number): TaxYearRow | undefined {
  return getById(id);
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error && (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

// Same bounds as src/lib/taxSummary.ts's resolveTaxPeriod() INVALID_YEAR check, for consistency
// with the rest of this codebase's existing tax-year-adjacent validation.
function normalizeTaxYear(value: unknown): number {
  const year = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("INVALID_TAX_YEAR");
  }

  return year;
}

function normalizeTaxpayerProfileId(value: unknown): number {
  const id = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("INVALID_TAXPAYER_PROFILE_ID");
  }

  return id;
}

export interface CreateTaxYearInput {
  taxpayerProfileId: number;
  taxYear: number;
}

// A new tax year always starts OPEN — no client-settable initial status, matching
// createBankAccount()'s "no client-settable isActive on create" convention. Relies on the DB unique
// constraint (idx_tax_years_taxpayer_year) rather than a SELECT-first check for the duplicate
// rejection, same race-free pattern as createBankAccount().
export function createTaxYear(input: CreateTaxYearInput): TaxYearRow {
  const taxpayerProfileId = normalizeTaxpayerProfileId(input.taxpayerProfileId);
  assertTaxpayerProfileExists(taxpayerProfileId);

  const taxYear = normalizeTaxYear(input.taxYear);

  // STEP 96 — insert + audit event as one atomic unit.
  const insert = db.transaction(() => {
    const result = db
      .prepare(
        `
        INSERT INTO tax_years (taxpayer_profile_id, tax_year)
        VALUES (?, ?)
        `
      )
      .run(taxpayerProfileId, taxYear);

    const row = getById(Number(result.lastInsertRowid));

    if (!row) {
      throw new Error("TAX_YEAR_CREATE_FAILED");
    }

    recordAuditEvent({
      entityType: "tax_year",
      entityId: row.id,
      action: "CREATE",
      afterData: row,
    });

    return row;
  });

  try {
    return insert();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Error("DUPLICATE_TAX_YEAR");
    }

    throw error;
  }
}

export interface ListTaxYearsFilters {
  taxpayerProfileId?: number;
  status?: string;
}

export function listTaxYears(filters: ListTaxYearsFilters = {}): TaxYearRow[] {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters.taxpayerProfileId !== undefined) {
    conditions.push("taxpayer_profile_id = ?");
    params.push(filters.taxpayerProfileId);
  }

  if (filters.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `
      SELECT * FROM tax_years
      ${whereClause}
      ORDER BY tax_year DESC
      `
    )
    .all(...params) as DbRow[];

  return rows.map(toRow);
}

// The one and only mutation this STEP provides. Rejects same-status, backward, skipped-stage, and
// any transition attempted from LOCKED — see ALLOWED_TAX_YEAR_TRANSITIONS above.
export function transitionTaxYearStatus(id: number, nextStatus: string): TaxYearRow {
  const existing = getById(id);

  if (!existing) {
    throw new Error("TAX_YEAR_NOT_FOUND");
  }

  if (!isValidTaxYearStatus(nextStatus)) {
    throw new Error("INVALID_STATUS");
  }

  const allowed = ALLOWED_TAX_YEAR_TRANSITIONS[existing.status];

  if (!allowed.includes(nextStatus)) {
    throw new Error("INVALID_STATUS_TRANSITION");
  }

  // STEP 96 — update + audit event as one atomic unit.
  const update = db.transaction(() => {
    db.prepare(
      `
      UPDATE tax_years
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `
    ).run(nextStatus, id);

    const row = getById(id);

    if (!row) {
      throw new Error("TAX_YEAR_UPDATE_FAILED");
    }

    recordAuditEvent({
      entityType: "tax_year",
      entityId: id,
      action: "UPDATE",
      beforeData: existing,
      afterData: row,
    });

    return row;
  });

  return update();
}
