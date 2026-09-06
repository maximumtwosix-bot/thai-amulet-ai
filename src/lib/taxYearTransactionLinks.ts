import db from "./db";
import { getTaxYearById } from "./taxYears";
import { recordAuditEvent } from "./taxAuditLog";

// Tax Year ↔ Transaction Links — STEP 96 — the traceability layer between "transactions" (STEP 19/
// 20) and "tax_years" (STEP 93), per the STEP 95 follow-up audit's explicit design choice: a
// standalone mapping table rather than a tax_year_id column on "transactions" itself, so that table
// is never schema-touched by this STEP. See src/lib/db.ts's schema comment for the full reasoning.
//
// At most one link per transaction (enforced by the DB's own UNIQUE index,
// idx_tax_year_transaction_links_transaction_id) — a transaction belongs to zero or one tax year at
// a time. No transaction is linked by default; every existing transaction remains completely
// unaffected until this module is explicitly used to opt one in.
//
// assertTransactionMutable() below is the single guard reused by src/lib/transactions.ts
// (updateTransaction/deleteTransaction) AND src/lib/transactionAttachments.ts (insert/delete) — an
// unlinked transaction is always mutable (unchanged from today's behavior); a linked transaction is
// mutable only while its linked tax year's status is 'OPEN'.

export type TaxYearTransactionLinkRow = {
  id: number;
  transactionId: number;
  taxYearId: number;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: number;
  transaction_id: number;
  tax_year_id: number;
  created_at: string;
  updated_at: string;
};

function toRow(row: DbRow): TaxYearTransactionLinkRow {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    taxYearId: row.tax_year_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getByTransactionId(transactionId: number): TaxYearTransactionLinkRow | undefined {
  const row = db
    .prepare("SELECT * FROM tax_year_transaction_links WHERE transaction_id = ?")
    .get(transactionId) as DbRow | undefined;

  return row ? toRow(row) : undefined;
}

export function getTaxYearLinkForTransaction(
  transactionId: number
): TaxYearTransactionLinkRow | undefined {
  return getByTransactionId(transactionId);
}

function assertTransactionExists(transactionId: number): void {
  const row = db.prepare("SELECT id FROM transactions WHERE id = ?").get(transactionId);

  if (!row) {
    throw new Error("TRANSACTION_NOT_FOUND");
  }
}

// The one guard every tax-relevant mutation of a transaction (or its attachments) must pass. An
// unlinked transaction always passes (identical to pre-STEP-96 behavior). A linked transaction
// passes only while its tax year is OPEN.
export function assertTransactionMutable(transactionId: number): void {
  const link = getByTransactionId(transactionId);

  if (!link) {
    return;
  }

  const taxYear = getTaxYearById(link.taxYearId);

  if (!taxYear || taxYear.status !== "OPEN") {
    throw new Error("TAX_YEAR_NOT_OPEN");
  }
}

export interface LinkTransactionToTaxYearInput {
  transactionId: number;
  taxYearId: number;
}

// Creates a new link, or replaces an existing OPEN-year link with a different tax year (a
// correction). Rejected if: the transaction doesn't exist, the target tax year doesn't exist or
// isn't OPEN (you cannot slot a transaction into an already-finalized year), or an existing link's
// CURRENT tax year is not OPEN (you cannot move a transaction out of a locked year — this is the
// concrete mechanism that closes the "unlink to bypass the lock" escape hatch).
export function linkTransactionToTaxYear(
  input: LinkTransactionToTaxYearInput
): TaxYearTransactionLinkRow {
  const transactionId =
    typeof input.transactionId === "number" ? input.transactionId : Number(input.transactionId);

  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    throw new Error("INVALID_TRANSACTION_ID");
  }

  assertTransactionExists(transactionId);

  const taxYearId = typeof input.taxYearId === "number" ? input.taxYearId : Number(input.taxYearId);

  if (!Number.isInteger(taxYearId) || taxYearId <= 0) {
    throw new Error("INVALID_TAX_YEAR_ID");
  }

  const targetTaxYear = getTaxYearById(taxYearId);

  if (!targetTaxYear) {
    throw new Error("TAX_YEAR_NOT_FOUND");
  }

  if (targetTaxYear.status !== "OPEN") {
    throw new Error("TAX_YEAR_NOT_OPEN");
  }

  const existing = getByTransactionId(transactionId);

  if (existing) {
    const currentTaxYear = getTaxYearById(existing.taxYearId);

    if (!currentTaxYear || currentTaxYear.status !== "OPEN") {
      throw new Error("TAX_YEAR_NOT_OPEN");
    }
  }

  const result = db.transaction(() => {
    if (existing) {
      db.prepare(
        "UPDATE tax_year_transaction_links SET tax_year_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(taxYearId, existing.id);
    } else {
      db.prepare(
        "INSERT INTO tax_year_transaction_links (transaction_id, tax_year_id) VALUES (?, ?)"
      ).run(transactionId, taxYearId);
    }

    const row = getByTransactionId(transactionId);

    if (!row) {
      throw new Error("TAX_YEAR_LINK_CREATE_FAILED");
    }

    recordAuditEvent({
      entityType: "tax_year_transaction_link",
      entityId: row.id,
      action: existing ? "UPDATE" : "CREATE",
      beforeData: existing ?? undefined,
      afterData: row,
    });

    return row;
  });

  return result();
}

// Only allowed while the link's current tax year is OPEN — same reasoning as reassignment above.
export function unlinkTransactionFromTaxYear(transactionId: number): void {
  const existing = getByTransactionId(transactionId);

  if (!existing) {
    throw new Error("TAX_YEAR_LINK_NOT_FOUND");
  }

  const currentTaxYear = getTaxYearById(existing.taxYearId);

  if (!currentTaxYear || currentTaxYear.status !== "OPEN") {
    throw new Error("TAX_YEAR_NOT_OPEN");
  }

  db.transaction(() => {
    db.prepare("DELETE FROM tax_year_transaction_links WHERE id = ?").run(existing.id);

    recordAuditEvent({
      entityType: "tax_year_transaction_link",
      entityId: existing.id,
      action: "DELETE",
      beforeData: existing,
    });
  })();
}

export function listLinksForTaxYear(taxYearId: number): TaxYearTransactionLinkRow[] {
  const rows = db
    .prepare("SELECT * FROM tax_year_transaction_links WHERE tax_year_id = ? ORDER BY id ASC")
    .all(taxYearId) as DbRow[];

  return rows.map(toRow);
}
