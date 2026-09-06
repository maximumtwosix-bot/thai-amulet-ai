// Tax Document Classification vocabulary — STEP 100 — schema-foundation constants only, no
// database access, same "STEP 19 constants file" precedent as src/lib/transactions.ts. Shared by
// src/lib/taxDocuments.ts and src/lib/taxPeriodEvidenceStatus.ts so both use one authoritative
// list rather than two independently-maintained copies.
//
// This vocabulary is DOCUMENT TYPE ONLY — what kind of paper this is. It carries no tax-treatment
// meaning whatsoever: classifying a file as TIKTOK_FEE_INVOICE never implies the fee is
// deductible, and classifying one as VAT_EVIDENCE never implies the taxpayer is VAT-registered
// (see src/lib/taxpayerProfile.ts's vatRegistered field, which this list never writes to). Per the
// STEP 97.2/99/100 audits' own repeated finding: DOCUMENT TYPE, EXTRACTED FACT, and TAX TREATMENT
// must never be conflated, and this file only ever represents the first of the three.
//
// Derived only from document types actually described across this project's audits (STEP 97.2 §5,
// STEP 98 §8, STEP 99 §K/L/M) — nothing here is invented beyond what was already discussed.
export type TaxDocumentType =
  | "TIKTOK_SETTLEMENT"
  | "TIKTOK_FEE_INVOICE"
  | "TIKTOK_SALES_REPORT"
  | "FACEBOOK_PAYOUT"
  | "FACEBOOK_FEE"
  | "BANK_STATEMENT"
  | "WHT_CERTIFICATE"
  | "EXPENSE_RECEIPT"
  | "EXPENSE_TAX_INVOICE"
  | "VAT_EVIDENCE"
  | "REFUND_EVIDENCE"
  | "CANCELLATION_EVIDENCE"
  | "OTHER";

export const DOCUMENT_TYPES: TaxDocumentType[] = [
  "TIKTOK_SETTLEMENT",
  "TIKTOK_FEE_INVOICE",
  "TIKTOK_SALES_REPORT",
  "FACEBOOK_PAYOUT",
  "FACEBOOK_FEE",
  "BANK_STATEMENT",
  "WHT_CERTIFICATE",
  "EXPENSE_RECEIPT",
  "EXPENSE_TAX_INVOICE",
  "VAT_EVIDENCE",
  "REFUND_EVIDENCE",
  "CANCELLATION_EVIDENCE",
  "OTHER",
];

export function isValidDocumentType(value: string): value is TaxDocumentType {
  return (DOCUMENT_TYPES as string[]).includes(value);
}

// Descriptive only — where a document came from. Never used to infer tax treatment.
export type TaxDocumentSource = "tiktok" | "facebook" | "bank" | "manual" | "other";

export const DOCUMENT_SOURCES: TaxDocumentSource[] = [
  "tiktok",
  "facebook",
  "bank",
  "manual",
  "other",
];

export function isValidDocumentSource(value: string): value is TaxDocumentSource {
  return (DOCUMENT_SOURCES as string[]).includes(value);
}
