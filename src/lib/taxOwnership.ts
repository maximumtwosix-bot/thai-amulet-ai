import db from "./db";
import { getTaxpayerProfileById } from "./taxpayerProfile";
import { getTaxYearById } from "./taxYears";
import { getTaxPeriodById } from "./taxPeriods";
import { getTaxDocumentById } from "./taxDocuments";
import { getTaxDocumentRowById } from "./taxDocumentRows";
import { getExtractionRunById } from "./extractionRuns";
import { getExtractedFactById } from "./extractedFacts";
import { getWhtRecordById } from "./whtRecords";
import { getDocumentPartyLinkById } from "./taxDocumentParties";
import { getPartyById } from "./parties";

// Tax Ownership Resolver — STEP 114 (STEP 112 Option A design, item 2 only). A single, central,
// READ-ONLY source of truth for "which taxpayer_profiles row, if any, owns this record" — walking
// the EXISTING FK graph built across STEP 93-110, never a new owner column. No function in this
// file performs an INSERT/UPDATE/DELETE, creates an audit event, creates a session, or writes a
// file — every one is a pure query over already-committed data.
//
// CRITICAL, per this STEP's own explicit instruction: this file only REPORTS ownership state. It
// enforces NOTHING. No route or DAL function calls anything here yet (that is a later STEP) — a
// resolver returning UNRESOLVED or CONFLICT must never be treated by a future caller as "no owner,
// therefore allowed"; the fail-closed decision belongs entirely to whichever future STEP actually
// wires this into an authorization check. This file has zero opinion on what to DO with its answer.

export type OwnershipResolution =
  | { status: "RESOLVED"; taxpayerProfileId: number }
  // The id doesn't exist, or exists but no owner is currently derivable (e.g. an unlinked
  // transaction) — "not yet known", never treated as "not owned by anyone, so accessible to all".
  | { status: "UNRESOLVED" }
  // Two independent paths to an owner disagree (see resolveTaxDocumentOwner/resolveWhtRecordOwner/
  // resolveExtractedFactOwner/resolveTransactionOwner below) — NEVER silently pick one.
  | { status: "CONFLICT" }
  // The entity type structurally has no taxpayer-ownership concept at all (parties, STEP 106) —
  // distinct from UNRESOLVED, which describes a specific row/id lacking a resolvable owner today.
  | { status: "NOT_APPLICABLE" };

export function resolveTaxpayerProfileOwner(taxpayerProfileId: number): OwnershipResolution {
  const profile = getTaxpayerProfileById(taxpayerProfileId);

  if (!profile) return { status: "UNRESOLVED" };

  return { status: "RESOLVED", taxpayerProfileId: profile.id };
}

export function resolveTaxYearOwner(taxYearId: number): OwnershipResolution {
  const taxYear = getTaxYearById(taxYearId);

  if (!taxYear) return { status: "UNRESOLVED" };

  return { status: "RESOLVED", taxpayerProfileId: taxYear.taxpayerProfileId };
}

export function resolveTaxPeriodOwner(taxPeriodId: number): OwnershipResolution {
  const period = getTaxPeriodById(taxPeriodId);

  if (!period) return { status: "UNRESOLVED" };

  return resolveTaxYearOwner(period.taxYearId);
}

// tax_documents.taxpayer_profile_id is NOT NULL and directly denormalized on the row itself (STEP
// 100's own schema comment: "independent of tax_period_id specifically because tax_period_id can
// be NULL") — the authoritative, single-hop answer. tax_period_id is nullable and, when present,
// is cross-checked against the direct column rather than trusted alone: nothing in
// src/lib/taxDocuments.ts's createTaxDocument()/updateTaxDocument() currently verifies that a
// supplied tax_period_id's own tax_year actually belongs to the SAME taxpayer as the document's
// own taxpayer_profile_id (it only checks the period exists, via assertTaxPeriodExists()) — so
// this cross-check is a genuine, currently-latent data-integrity safeguard, not a hypothetical one.
export function resolveTaxDocumentOwner(taxDocumentId: number): OwnershipResolution {
  const document = getTaxDocumentById(taxDocumentId);

  if (!document) return { status: "UNRESOLVED" };

  const directOwner = document.taxpayerProfileId;

  if (document.taxPeriodId !== null) {
    const periodOwner = resolveTaxPeriodOwner(document.taxPeriodId);

    if (periodOwner.status === "RESOLVED" && periodOwner.taxpayerProfileId !== directOwner) {
      return { status: "CONFLICT" };
    }
  }

  return { status: "RESOLVED", taxpayerProfileId: directOwner };
}

export function resolveTaxDocumentRowOwner(taxDocumentRowId: number): OwnershipResolution {
  const row = getTaxDocumentRowById(taxDocumentRowId);

  if (!row) return { status: "UNRESOLVED" };

  return resolveTaxDocumentOwner(row.taxDocumentId);
}

export function resolveExtractionRunOwner(extractionRunId: number): OwnershipResolution {
  const run = getExtractionRunById(extractionRunId);

  if (!run) return { status: "UNRESOLVED" };

  return resolveTaxDocumentOwner(run.taxDocumentId);
}

// extracted_facts carries THREE independent paths to a tax_documents row: its own (denormalized,
// NOT NULL) tax_document_id; its (NOT NULL) extraction_run_id, whose own run points at a document;
// and its (nullable) tax_document_row_id, whose own row points at a document. STEP 104's schema
// comment states these are guaranteed to agree by TS-layer discipline at insert time (never
// independently supplied, never updated after) — but that is an application-layer guarantee, not
// a database constraint, so this resolver checks all three paths that exist and reports CONFLICT
// if they ever disagree, rather than trusting the first one queried.
export function resolveExtractedFactOwner(extractedFactId: number): OwnershipResolution {
  const fact = getExtractedFactById(extractedFactId);

  if (!fact) return { status: "UNRESOLVED" };

  const owners = new Set<number>();

  const directOwner = resolveTaxDocumentOwner(fact.taxDocumentId);

  if (directOwner.status === "CONFLICT") return directOwner;
  if (directOwner.status === "RESOLVED") owners.add(directOwner.taxpayerProfileId);

  const runOwner = resolveExtractionRunOwner(fact.extractionRunId);

  if (runOwner.status === "CONFLICT") return runOwner;
  if (runOwner.status === "RESOLVED") owners.add(runOwner.taxpayerProfileId);

  if (fact.taxDocumentRowId !== null) {
    const rowOwner = resolveTaxDocumentRowOwner(fact.taxDocumentRowId);

    if (rowOwner.status === "CONFLICT") return rowOwner;
    if (rowOwner.status === "RESOLVED") owners.add(rowOwner.taxpayerProfileId);
  }

  if (owners.size === 0) return { status: "UNRESOLVED" };
  if (owners.size > 1) return { status: "CONFLICT" };

  return { status: "RESOLVED", taxpayerProfileId: [...owners][0] };
}

// wht_records.taxpayer_profile_id is NOT NULL and denormalized from tax_year_id at insert time
// (STEP 94/96's own schema comment: "copied once... never independently supplied by the caller,
// never updated after") — same cross-check reasoning as resolveTaxDocumentOwner above: an
// application-layer guarantee is not a database constraint, so both paths are checked.
export function resolveWhtRecordOwner(whtRecordId: number): OwnershipResolution {
  const record = getWhtRecordById(whtRecordId);

  if (!record) return { status: "UNRESOLVED" };

  const viaTaxYear = resolveTaxYearOwner(record.taxYearId);

  if (viaTaxYear.status === "RESOLVED" && viaTaxYear.taxpayerProfileId !== record.taxpayerProfileId) {
    return { status: "CONFLICT" };
  }

  return { status: "RESOLVED", taxpayerProfileId: record.taxpayerProfileId };
}

// The LINK's owner is the document's owner — party_id is never consulted for ownership, because
// parties have none (see resolvePartyOwner below).
export function resolveDocumentPartyLinkOwner(documentPartyLinkId: number): OwnershipResolution {
  const link = getDocumentPartyLinkById(documentPartyLinkId);

  if (!link) return { status: "UNRESOLVED" };

  return resolveTaxDocumentOwner(link.taxDocumentId);
}

// parties (STEP 106) has NO taxpayer_profile_id column and NO FK to taxpayer_profiles anywhere —
// it is deliberately global master data. Walking "backwards" through tax_document_parties would
// yield a SET of potentially different taxpayers who happen to reference this party (e.g. "TikTok
// Shop Thailand" linked from many different taxpayers' documents), which is categorically
// different from single-owner ownership — using that set as "the" owner would misrepresent a
// shared entity as taxpayer-owned. Per this STEP's explicit instruction: never infer, always report
// NOT_APPLICABLE (not UNRESOLVED — UNRESOLVED would wrongly imply an owner might exist but hasn't
// been found yet; NOT_APPLICABLE says the ownership concept itself does not apply to this entity
// type). A future, SEPARATE party-ownership design (STEP 112 Section G's Option 2, not adopted) is
// the only way this could ever change, and it is not built here.
export function resolvePartyOwner(partyId: number): OwnershipResolution {
  const party = getPartyById(partyId);

  if (!party) return { status: "UNRESOLVED" };

  return { status: "NOT_APPLICABLE" };
}

// transactions (STEP 19/20) has NO taxpayer_profile_id column at all, and predates the entire tax
// ownership graph (STEP 93+). The ONLY sanctioned path to an owner is an EXPLICIT
// tax_year_transaction_links row — never inferred from customer, bank account, transaction date,
// amount, order, or "whichever taxpayer happens to be the current session's". A transaction with
// zero links returns UNRESOLVED, exactly as it does today (STEP 112 Section H's own conclusion:
// "no automatic reassignment, no backfill").
//
// Deliberately queries ALL matching link rows via a direct, read-only SELECT (rather than the
// DAL's own single-row getTaxYearLinkForTransaction()) specifically to detect a conflict if one is
// ever structurally possible — even though idx_tax_year_transaction_links_transaction_id's UNIQUE
// constraint (STEP 96) currently guarantees at most one row per transaction_id, making a real
// conflict unreachable under today's schema. This is deliberate defense-in-depth against a future
// schema change removing that constraint, not a sign that a conflict is expected today.
export function resolveTransactionOwner(transactionId: number): OwnershipResolution {
  const rows = db
    .prepare("SELECT tax_year_id FROM tax_year_transaction_links WHERE transaction_id = ?")
    .all(transactionId) as Array<{ tax_year_id: number }>;

  if (rows.length === 0) {
    return { status: "UNRESOLVED" };
  }

  const owners = new Set<number>();

  for (const row of rows) {
    const yearOwner = resolveTaxYearOwner(row.tax_year_id);

    if (yearOwner.status === "RESOLVED") {
      owners.add(yearOwner.taxpayerProfileId);
    }
  }

  if (owners.size === 0) return { status: "UNRESOLVED" };
  if (owners.size > 1) return { status: "CONFLICT" };

  return { status: "RESOLVED", taxpayerProfileId: [...owners][0] };
}
