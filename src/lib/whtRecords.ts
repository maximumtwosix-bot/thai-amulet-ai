import db from "./db";
import { getTaxYearById } from "./taxYears";
import { getTransactionById } from "./transactions";
import { recordAuditEvent } from "./taxAuditLog";

// Withholding Tax (WHT) Records — STEP 94 — CRUD + validation layer for the `wht_records` table
// added in the same STEP (src/lib/db.ts). Scoped strictly to Type A withholding (tax WITHHELD FROM
// this taxpayer's own income) — see that table's schema comment for why Type B (this taxpayer
// withholding from payments to others) is a different, out-of-scope workflow.
//
// NO WHT rate, income-category classification, or computed credit figure is calculated or stored
// anywhere in this file — every function here only records/reads the raw facts a real WHT
// certificate carries.
//
// Same toRow()/DbRow/CRUD convention as src/lib/taxpayerProfile.ts and src/lib/taxYears.ts. Zero
// changes to src/lib/transactions.ts or src/lib/transactionAttachments.ts — both are only read from
// here (getTransactionById()), never written.

export type WhtRecordRow = {
  id: number;
  taxpayerProfileId: number;
  taxYearId: number;
  transactionId: number | null;
  payerName: string;
  payerTaxId: string | null;
  certificateNumber: string | null;
  certificateDate: string | null;
  grossAmount: number;
  withheldAmount: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: number;
  taxpayer_profile_id: number;
  tax_year_id: number;
  transaction_id: number | null;
  payer_name: string;
  payer_tax_id: string | null;
  certificate_number: string | null;
  certificate_date: string | null;
  gross_amount: number;
  withheld_amount: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

function toRow(row: DbRow): WhtRecordRow {
  return {
    id: row.id,
    taxpayerProfileId: row.taxpayer_profile_id,
    taxYearId: row.tax_year_id,
    transactionId: row.transaction_id,
    payerName: row.payer_name,
    payerTaxId: row.payer_tax_id,
    certificateNumber: row.certificate_number,
    certificateDate: row.certificate_date,
    grossAmount: row.gross_amount,
    withheldAmount: row.withheld_amount,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getById(id: number): WhtRecordRow | undefined {
  const row = db.prepare("SELECT * FROM wht_records WHERE id = ?").get(id) as DbRow | undefined;

  return row ? toRow(row) : undefined;
}

export function getWhtRecordById(id: number): WhtRecordRow | undefined {
  return getById(id);
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error && (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

// A WHT record may only be created against, or edited under, a tax year that is still OPEN — reuses
// STEP 93's own tax-year lifecycle rather than a second status column on this table (see the schema
// comment in src/lib/db.ts). Throws TAX_YEAR_NOT_FOUND for a bad id (same as STEP 93's own
// assertTaxpayerProfileExists() pattern) so the caller gets one clear error either way.
function assertTaxYearOpen(taxYearId: number): void {
  const taxYear = getTaxYearById(taxYearId);

  if (!taxYear) {
    throw new Error("TAX_YEAR_NOT_FOUND");
  }

  if (taxYear.status !== "OPEN") {
    throw new Error("TAX_YEAR_NOT_OPEN");
  }
}

function normalizeRequiredText(value: unknown, errorCode: string): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw new Error(errorCode);
  }

  return text;
}

function normalizeOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Resource-abuse guards only (same convention/reasoning as bankAccounts.ts's
// assertAccountNumberLength()) — not a format rule, since neither field's real-world shape is a
// confirmed fact this codebase can assume.
const MAX_PAYER_TAX_ID_LENGTH = 64;
const MAX_CERTIFICATE_NUMBER_LENGTH = 64;

function normalizePayerTaxId(value: unknown): string | null {
  const text = normalizeOptionalText(value);

  if (text !== null && text.length > MAX_PAYER_TAX_ID_LENGTH) {
    throw new Error("PAYER_TAX_ID_TOO_LONG");
  }

  return text;
}

function normalizeCertificateNumber(value: unknown): string | null {
  const text = normalizeOptionalText(value);

  if (text !== null && text.length > MAX_CERTIFICATE_NUMBER_LENGTH) {
    throw new Error("CERTIFICATE_NUMBER_TOO_LONG");
  }

  return text;
}

function isValidDateString(value: string): boolean {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));
}

function normalizeCertificateDate(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value !== "string" || !isValidDateString(value)) {
    throw new Error("INVALID_CERTIFICATE_DATE");
  }

  return value;
}

// withheldAmount <= grossAmount is a basic arithmetic sanity guard (withholding cannot exceed its
// own base) — NOT a WHT-rate legal assertion. No rate is computed or checked here at all.
function normalizeAmounts(grossAmount: unknown, withheldAmount: unknown): {
  grossAmount: number;
  withheldAmount: number;
} {
  const gross = typeof grossAmount === "number" ? grossAmount : Number(grossAmount);

  if (!Number.isFinite(gross) || gross <= 0) {
    throw new Error("INVALID_GROSS_AMOUNT");
  }

  const withheld = typeof withheldAmount === "number" ? withheldAmount : Number(withheldAmount);

  if (!Number.isFinite(withheld) || withheld <= 0) {
    throw new Error("INVALID_WITHHELD_AMOUNT");
  }

  if (withheld > gross) {
    throw new Error("WITHHELD_EXCEEDS_GROSS");
  }

  return { grossAmount: gross, withheldAmount: withheld };
}

function normalizeTransactionId(value: unknown): number | null {
  if (value === undefined || value === null) return null;

  const id = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("INVALID_TRANSACTION_ID");
  }

  if (!getTransactionById(id)) {
    throw new Error("TRANSACTION_NOT_FOUND");
  }

  return id;
}

export interface CreateWhtRecordInput {
  taxYearId: number;
  transactionId?: number | null;
  payerName: string;
  payerTaxId?: string | null;
  certificateNumber?: string | null;
  certificateDate?: string | null;
  grossAmount: number;
  withheldAmount: number;
  note?: string | null;
}

// taxpayerProfileId is NEVER accepted as caller input — it is always derived from the given
// taxYearId's own taxpayer_profile_id and denormalized at insert time (see src/lib/db.ts's schema
// comment), so a record can never end up pointing at a taxpayer/tax-year combination that doesn't
// actually match.
export function createWhtRecord(input: CreateWhtRecordInput): WhtRecordRow {
  const taxYearId = typeof input.taxYearId === "number" ? input.taxYearId : Number(input.taxYearId);

  if (!Number.isInteger(taxYearId) || taxYearId <= 0) {
    throw new Error("INVALID_TAX_YEAR_ID");
  }

  assertTaxYearOpen(taxYearId);

  const taxYear = getTaxYearById(taxYearId);

  if (!taxYear) {
    throw new Error("TAX_YEAR_NOT_FOUND");
  }

  const transactionId = normalizeTransactionId(input.transactionId);
  const payerName = normalizeRequiredText(input.payerName, "INVALID_PAYER_NAME");
  const payerTaxId = normalizePayerTaxId(input.payerTaxId);
  const certificateNumber = normalizeCertificateNumber(input.certificateNumber);
  const certificateDate = normalizeCertificateDate(input.certificateDate);
  const { grossAmount, withheldAmount } = normalizeAmounts(input.grossAmount, input.withheldAmount);
  const note = normalizeOptionalText(input.note);

  // STEP 96 — insert + audit event as one atomic unit.
  const insert = db.transaction(() => {
    const result = db
      .prepare(
        `
        INSERT INTO wht_records (
          taxpayer_profile_id, tax_year_id, transaction_id, payer_name, payer_tax_id,
          certificate_number, certificate_date, gross_amount, withheld_amount, note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        taxYear.taxpayerProfileId,
        taxYearId,
        transactionId,
        payerName,
        payerTaxId,
        certificateNumber,
        certificateDate,
        grossAmount,
        withheldAmount,
        note
      );

    const row = getById(Number(result.lastInsertRowid));

    if (!row) {
      throw new Error("WHT_RECORD_CREATE_FAILED");
    }

    recordAuditEvent({
      entityType: "wht_record",
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
      throw new Error("DUPLICATE_CERTIFICATE_NUMBER");
    }

    throw error;
  }
}

export interface ListWhtRecordsFilters {
  taxpayerProfileId?: number;
  taxYearId?: number;
  transactionId?: number;
}

export function listWhtRecords(filters: ListWhtRecordsFilters = {}): WhtRecordRow[] {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters.taxpayerProfileId !== undefined) {
    conditions.push("taxpayer_profile_id = ?");
    params.push(filters.taxpayerProfileId);
  }

  if (filters.taxYearId !== undefined) {
    conditions.push("tax_year_id = ?");
    params.push(filters.taxYearId);
  }

  if (filters.transactionId !== undefined) {
    conditions.push("transaction_id = ?");
    params.push(filters.transactionId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `
      SELECT * FROM wht_records
      ${whereClause}
      ORDER BY certificate_date DESC, id DESC
      `
    )
    .all(...params) as DbRow[];

  return rows.map(toRow);
}

export interface UpdateWhtRecordInput {
  transactionId?: number | null;
  payerName?: string;
  payerTaxId?: string | null;
  certificateNumber?: string | null;
  certificateDate?: string | null;
  grossAmount?: number;
  withheldAmount?: number;
  note?: string | null;
}

// taxpayerProfileId and taxYearId are NEVER updatable — identity fields, same convention as STEP
// 93's taxpayerType being excluded from updateTaxpayerProfile(). If the wrong tax year was picked at
// create time, there is currently no correction path other than leaving the record as-is (no delete
// exists either) — a known limitation of this foundation STEP, not solved here.
export function updateWhtRecord(id: number, input: UpdateWhtRecordInput): WhtRecordRow {
  const existing = getById(id);

  if (!existing) {
    throw new Error("WHT_RECORD_NOT_FOUND");
  }

  assertTaxYearOpen(existing.taxYearId);

  const nextTransactionId =
    input.transactionId === undefined ? existing.transactionId : normalizeTransactionId(input.transactionId);

  const nextPayerName =
    input.payerName === undefined ? existing.payerName : normalizeRequiredText(input.payerName, "INVALID_PAYER_NAME");

  const nextPayerTaxId =
    input.payerTaxId === undefined ? existing.payerTaxId : normalizePayerTaxId(input.payerTaxId);

  const nextCertificateNumber =
    input.certificateNumber === undefined
      ? existing.certificateNumber
      : normalizeCertificateNumber(input.certificateNumber);

  const nextCertificateDate =
    input.certificateDate === undefined
      ? existing.certificateDate
      : normalizeCertificateDate(input.certificateDate);

  const nextGrossAmount = input.grossAmount === undefined ? existing.grossAmount : input.grossAmount;
  const nextWithheldAmount =
    input.withheldAmount === undefined ? existing.withheldAmount : input.withheldAmount;

  const { grossAmount, withheldAmount } = normalizeAmounts(nextGrossAmount, nextWithheldAmount);

  const nextNote = input.note === undefined ? existing.note : normalizeOptionalText(input.note);

  // STEP 96 — update + audit event as one atomic unit.
  const update = db.transaction(() => {
    db.prepare(
      `
      UPDATE wht_records
      SET
        transaction_id = ?,
        payer_name = ?,
        payer_tax_id = ?,
        certificate_number = ?,
        certificate_date = ?,
        gross_amount = ?,
        withheld_amount = ?,
        note = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `
    ).run(
      nextTransactionId,
      nextPayerName,
      nextPayerTaxId,
      nextCertificateNumber,
      nextCertificateDate,
      grossAmount,
      withheldAmount,
      nextNote,
      id
    );

    const row = getById(id);

    if (!row) {
      throw new Error("WHT_RECORD_UPDATE_FAILED");
    }

    recordAuditEvent({
      entityType: "wht_record",
      entityId: id,
      action: "UPDATE",
      beforeData: existing,
      afterData: row,
    });

    return row;
  });

  try {
    return update();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Error("DUPLICATE_CERTIFICATE_NUMBER");
    }

    throw error;
  }
}
