import db from "./db";
import { getTaxYearById } from "./taxYears";
import { recordAuditEvent } from "./taxAuditLog";

// Tax Periods — STEP 100 — a month within a tax year (STEP 93), additive foundation for
// organizing recovered evidence. NOT auto-created for every month — a period exists only once
// explicitly created, on demand, when the owner starts working on that month. No backfill.
//
// status is a working-evidence lifecycle, deliberately distinct from tax_years' own legal
// OPEN/FINALIZED/LOCKED lock (STEP 93/96) — closing a period here has no effect on, and is not
// affected by, the tax year's own lock. See src/lib/db.ts's schema comment for full reasoning.

export type TaxPeriodStatus = "OPEN" | "PROCESSING" | "NEEDS_REVIEW" | "VERIFIED" | "CLOSED";

export const TAX_PERIOD_STATUSES: TaxPeriodStatus[] = [
  "OPEN",
  "PROCESSING",
  "NEEDS_REVIEW",
  "VERIFIED",
  "CLOSED",
];

export function isValidTaxPeriodStatus(value: string): value is TaxPeriodStatus {
  return (TAX_PERIOD_STATUSES as string[]).includes(value);
}

export type TaxPeriodRow = {
  id: number;
  taxYearId: number;
  periodMonth: number;
  status: TaxPeriodStatus;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: number;
  tax_year_id: number;
  period_month: number;
  status: string;
  created_at: string;
  updated_at: string;
};

function toRow(row: DbRow): TaxPeriodRow {
  return {
    id: row.id,
    taxYearId: row.tax_year_id,
    periodMonth: row.period_month,
    status: row.status as TaxPeriodStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getById(id: number): TaxPeriodRow | undefined {
  const row = db.prepare("SELECT * FROM tax_periods WHERE id = ?").get(id) as DbRow | undefined;

  return row ? toRow(row) : undefined;
}

export function getTaxPeriodById(id: number): TaxPeriodRow | undefined {
  return getById(id);
}

// Exported so src/lib/taxDocuments.ts can verify a taxPeriodId actually references a real row
// before linking a document to it — same cross-table-existence-check convention used throughout
// this codebase (assertProductExists()/assertOrderExists()/assertTaxpayerProfileExists()).
export function assertTaxPeriodExists(taxPeriodId: number): void {
  if (!getById(taxPeriodId)) {
    throw new Error("TAX_PERIOD_NOT_FOUND");
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error && (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

function normalizeTaxYearId(value: unknown): number {
  const id = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("INVALID_TAX_YEAR_ID");
  }

  return id;
}

function normalizePeriodMonth(value: unknown): number {
  const month = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("INVALID_PERIOD_MONTH");
  }

  return month;
}

export interface CreateTaxPeriodInput {
  taxYearId: number;
  periodMonth: number;
}

// A new period always starts OPEN — no client-settable initial status, matching this codebase's
// established "no client-settable initial state on create" convention (createBankAccount(),
// createTaxYear()). Does NOT require the parent tax year to still be OPEN — a period is a working
// container for evidence organization, not itself a legal filing action; unlike wht_records/
// tax_year_transaction_links, nothing about creating a period asserts or changes anything about
// the tax year's own filing status.
export function createTaxPeriod(input: CreateTaxPeriodInput): TaxPeriodRow {
  const taxYearId = normalizeTaxYearId(input.taxYearId);

  if (!getTaxYearById(taxYearId)) {
    throw new Error("TAX_YEAR_NOT_FOUND");
  }

  const periodMonth = normalizePeriodMonth(input.periodMonth);

  const insert = db.transaction(() => {
    let result;

    try {
      result = db
        .prepare("INSERT INTO tax_periods (tax_year_id, period_month) VALUES (?, ?)")
        .run(taxYearId, periodMonth);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error("DUPLICATE_TAX_PERIOD");
      }

      throw error;
    }

    const row = getById(Number(result.lastInsertRowid));

    if (!row) {
      throw new Error("TAX_PERIOD_CREATE_FAILED");
    }

    recordAuditEvent({
      entityType: "tax_period",
      entityId: row.id,
      action: "CREATE",
      afterData: row,
    });

    return row;
  });

  return insert();
}

export interface ListTaxPeriodsFilters {
  taxYearId?: number;
  status?: string;
}

export function listTaxPeriods(filters: ListTaxPeriodsFilters = {}): TaxPeriodRow[] {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters.taxYearId !== undefined) {
    conditions.push("tax_year_id = ?");
    params.push(filters.taxYearId);
  }

  if (filters.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `
      SELECT * FROM tax_periods
      ${whereClause}
      ORDER BY tax_year_id DESC, period_month DESC
      `
    )
    .all(...params) as DbRow[];

  return rows.map(toRow);
}

// CLOSED is terminal — no status change is accepted once a period reaches it, same "terminal
// state" precedent as tax_years.LOCKED (STEP 93). Unlike tax_years' strict forward-only adjacency
// list, every other transition is permitted (deliberately simpler — this is a working-evidence
// status, not a legal lock, per this file's own top-of-file comment) — same-status is rejected as
// a no-op, not silently accepted.
export function updateTaxPeriodStatus(id: number, nextStatus: string): TaxPeriodRow {
  const existing = getById(id);

  if (!existing) {
    throw new Error("TAX_PERIOD_NOT_FOUND");
  }

  if (!isValidTaxPeriodStatus(nextStatus)) {
    throw new Error("INVALID_STATUS");
  }

  if (existing.status === "CLOSED") {
    throw new Error("TAX_PERIOD_CLOSED");
  }

  if (nextStatus === existing.status) {
    throw new Error("INVALID_STATUS_TRANSITION");
  }

  const update = db.transaction(() => {
    db.prepare(
      "UPDATE tax_periods SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(nextStatus, id);

    const row = getById(id);

    if (!row) {
      throw new Error("TAX_PERIOD_UPDATE_FAILED");
    }

    recordAuditEvent({
      entityType: "tax_period",
      entityId: id,
      action: "UPDATE",
      beforeData: existing,
      afterData: row,
    });

    return row;
  });

  return update();
}
