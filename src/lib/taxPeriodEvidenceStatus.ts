import db from "./db";
import { assertTaxPeriodExists } from "./taxPeriods";
import { recordAuditEvent } from "./taxAuditLog";
import { DOCUMENT_TYPES, isValidDocumentType } from "./taxDocumentTypes";

// Tax Period Evidence Status — STEP 100 — the gap-state vocabulary
// (FOUND/MISSING/EXPECTED_BUT_MISSING/NOT_APPLICABLE/UNKNOWN/NEEDS_REVIEW) from the STEP 97.2/99
// audits, stored as its own concept per (tax_period_id, document_type). See src/lib/db.ts's schema
// comment for why this is deliberately separate from tax_documents itself.
//
// This is always a HUMAN judgment — nothing in this file infers a status from the presence or
// absence of any tax_documents row. No automatic "if no document exists, mark MISSING" logic
// exists anywhere here, on purpose: only an explicit call sets a status.

export type EvidenceStatus =
  | "FOUND"
  | "MISSING"
  | "EXPECTED_BUT_MISSING"
  | "NOT_APPLICABLE"
  | "UNKNOWN"
  | "NEEDS_REVIEW";

export const EVIDENCE_STATUSES: EvidenceStatus[] = [
  "FOUND",
  "MISSING",
  "EXPECTED_BUT_MISSING",
  "NOT_APPLICABLE",
  "UNKNOWN",
  "NEEDS_REVIEW",
];

export function isValidEvidenceStatus(value: string): value is EvidenceStatus {
  return (EVIDENCE_STATUSES as string[]).includes(value);
}

export type TaxPeriodEvidenceStatusRow = {
  id: number;
  taxPeriodId: number;
  documentType: string;
  status: EvidenceStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: number;
  tax_period_id: number;
  document_type: string;
  status: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

function toRow(row: DbRow): TaxPeriodEvidenceStatusRow {
  return {
    id: row.id,
    taxPeriodId: row.tax_period_id,
    documentType: row.document_type,
    status: row.status as EvidenceStatus,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listEvidenceStatusForPeriod(taxPeriodId: number): TaxPeriodEvidenceStatusRow[] {
  const rows = db
    .prepare(
      "SELECT * FROM tax_period_evidence_status WHERE tax_period_id = ? ORDER BY document_type ASC"
    )
    .all(taxPeriodId) as DbRow[];

  return rows.map(toRow);
}

function getByPeriodAndType(
  taxPeriodId: number,
  documentType: string
): TaxPeriodEvidenceStatusRow | undefined {
  const row = db
    .prepare(
      "SELECT * FROM tax_period_evidence_status WHERE tax_period_id = ? AND document_type = ?"
    )
    .get(taxPeriodId, documentType) as DbRow | undefined;

  return row ? toRow(row) : undefined;
}

export interface SetEvidenceStatusInput {
  taxPeriodId: number;
  documentType: string;
  status: string;
  note?: string | null;
}

// Upsert: exactly one row per (taxPeriodId, documentType). Every call is an explicit human
// decision recorded as an UPDATE or CREATE audit event — there is no "default"/inferred write
// path anywhere in this function.
export function setEvidenceStatus(input: SetEvidenceStatusInput): TaxPeriodEvidenceStatusRow {
  const taxPeriodId =
    typeof input.taxPeriodId === "number" ? input.taxPeriodId : Number(input.taxPeriodId);

  if (!Number.isInteger(taxPeriodId) || taxPeriodId <= 0) {
    throw new Error("INVALID_TAX_PERIOD_ID");
  }

  assertTaxPeriodExists(taxPeriodId);

  const documentType = typeof input.documentType === "string" ? input.documentType : "";

  if (!isValidDocumentType(documentType)) {
    throw new Error("INVALID_DOCUMENT_TYPE");
  }

  const status = typeof input.status === "string" ? input.status : "";

  if (!isValidEvidenceStatus(status)) {
    throw new Error("INVALID_EVIDENCE_STATUS");
  }

  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;

  const existing = getByPeriodAndType(taxPeriodId, documentType);

  const upsert = db.transaction(() => {
    if (existing) {
      db.prepare(
        `
        UPDATE tax_period_evidence_status
        SET status = ?, note = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `
      ).run(status, note, existing.id);
    } else {
      db.prepare(
        `
        INSERT INTO tax_period_evidence_status (tax_period_id, document_type, status, note)
        VALUES (?, ?, ?, ?)
        `
      ).run(taxPeriodId, documentType, status, note);
    }

    const row = getByPeriodAndType(taxPeriodId, documentType);

    if (!row) {
      throw new Error("EVIDENCE_STATUS_SET_FAILED");
    }

    recordAuditEvent({
      entityType: "tax_period_evidence_status",
      entityId: row.id,
      action: existing ? "UPDATE" : "CREATE",
      beforeData: existing,
      afterData: row,
    });

    return row;
  });

  return upsert();
}

// Re-exported for API-layer convenience so a route can list every category (including ones with
// no status row yet, which should render as UNKNOWN in the UI, never as absent/zero).
export { DOCUMENT_TYPES };
