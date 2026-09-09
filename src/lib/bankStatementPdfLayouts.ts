// Bank Statement PDF Import — STEP E.6 — trusted, server-authored registry of named PDF
// row-extraction layouts (src/lib/bankStatementPdfRows.ts's BankStatementPdfRowLayout).
//
// WHY THIS FILE EXISTS (audit finding from this STEP): STEP E.5's upload/preview route accepts a
// raw, client-submitted `pdfLayout` JSON blob whose `transactionStartPattern`/`rowPattern`/header-
// and footer-patterns are arbitrary regex strings, compiled with `new RegExp()` and persisted
// verbatim into bank_statements.column_mapping. That is an acceptable design for a
// non-authoritative PREVIEW (the uploader visually reviews the result before deciding to confirm),
// but it is NOT acceptable as the authority for the actual financial write: a client-controlled
// regex determines WHICH SUBSTRING of real bank-statement text gets treated as "the amount" / "the
// date" / "the description" — before that substring is (correctly) validated by
// bankStatementCsv.ts's fixed, server-controlled money/date rules. The substring SELECTION itself
// would still be client-influenced, which defeats the entire point of Confirm re-deriving
// everything server-side rather than trusting whatever the client claims (STEP C.3 §11's
// established principle, applied to CSV mapping already — PDF needed the equivalent for regex).
//
// THE FIX: at Confirm time (STEP E.6), a PDF statement's actual row-extraction rules come ONLY from
// this fixed, developer-authored registry. A client may SELECT a layout by its `layoutId` (a plain
// string lookup key — exactly the same kind of "selection, not rule redefinition" trust boundary
// CSV's own column-name mapping already relies on) but can never supply, override, or influence the
// regex patterns themselves. bank_statements.column_mapping for a PDF statement (the client's
// original STEP E.5 upload-time submission) is NEVER read as parsing authority by the confirm route
// — it remains stored purely as a preview-time audit artifact.
//
// Adding support for a new real-world bank statement format is a deliberate, reviewed code change
// to this file (a new entry here), never a runtime/request-supplied configuration.

import type { BankStatementPdfRowLayout } from "./bankStatementPdfRows";

// A single, generic example layout (date DD/MM/YYYY, description, separate debit/credit columns,
// balance) — this project has no real production bank-statement PDF sample to calibrate additional
// layouts against (confirmed across every STEP of this feature's audit trail); adding a
// bank-specific layout here is future work once a real sample is available, not something this
// STEP invents evidence for. Named capture groups are written via `new RegExp(source)` rather than
// a `/…/` literal — this project's tsconfig.json targets ES2017, which cannot parse a named-group
// regex *literal* (a compile-time-only TypeScript restriction; the pattern itself runs fine on
// Node.js at any target once compiled from a string — same finding and same fix as STEP E.4's own
// test suite).
// SA1500_V1 — Kasikornbank savings account detailed statement. Every field below reflects only
// structural facts explicitly confirmed by the account holder reviewing their own real statement
// across a multi-step audit (see this feature's audit trail) — never calibrated against, or
// inferred from, real transaction content read by this codebase.
//
// Money representation: this statement has exactly ONE physical amount column ("ถอนเงิน / ฝากเงิน")
// — there is no separate debit/credit or direction column. Direction is signaled instead by an
// exact, closed-set LEADING TOKEN of the "รายการ" (description) field, extracted and classified by
// bankStatementPdfRows.ts's classifyDescriptionLeadingToken() BEFORE parseStatementRow() runs —
// never inferred from free description text, never fuzzy/substring matched. A transaction-type
// token outside this trusted closed set fails closed as INVALID_DIRECTION_VALUE via the existing,
// completely unmodified amount_with_direction handling in bankStatementCsv.ts. Ambiguous tokens
// (e.g. a bare "transfer" with no directional qualifier) are deliberately excluded from both lists
// below rather than guessed — an excluded token fails closed exactly like an unrecognized one.
//
// เวลา/วันที่มีผล (effective date/time) and ช่องทาง/รายละเอียด (channel/details) are matched only to
// keep column alignment correct for the fields around them — CanonicalStatementRow has no
// destination for any of them, so they are discarded by design (documented product-scope
// limitation, not a bug): see effectiveDate/effectiveTime/channel/details named groups below, none
// of which are in PDF_ROW_FIELDS.
const SA1500_CREDIT_TYPES = ["รับโอนเงิน"];
const SA1500_DEBIT_TYPES = ["ชำระเงิน", "โอนเงิน"];

export const PDF_STATEMENT_LAYOUTS: Record<string, BankStatementPdfRowLayout> = {
  GENERIC_DATE_DESC_DEBIT_CREDIT_BALANCE_V1: {
    repeatedHeaderPatterns: [],
    repeatedFooterPatterns: [new RegExp("^หน้า\\s+\\d+(\\s*/\\s*\\d+)?$"), new RegExp("^page\\s+\\d+(\\s*of\\s*\\d+)?$", "i")],
    transactionStartPattern: new RegExp("^\\d{2}/\\d{2}/\\d{4}"),
    rowPattern: new RegExp(
      "^(?<date>\\d{2}/\\d{2}/\\d{4})\\s+(?<description>.+?)\\s+(?<debit>[\\d,]+\\.\\d{2}|-)\\s+(?<credit>[\\d,]+\\.\\d{2}|-)\\s+(?<balance>[\\d,]+\\.\\d{2})$"
    ),
    dateFormat: "DD/MM/YYYY",
    money: { kind: "separate_columns", debitColumn: "debit", creditColumn: "credit" },
  },

  SA1500_V1: {
    repeatedHeaderPatterns: [
      new RegExp(
        "^วันที่\\s+เวลา\\s*/\\s*วันที่มีผล\\s+รายการ\\s+ถอนเงิน\\s*/\\s*ฝากเงิน\\s+ยอดคงเหลือ\\s+ช่องทาง\\s+รายละเอียด$"
      ),
    ],
    repeatedFooterPatterns: [new RegExp("^หน้า\\s+\\d+(\\s*/\\s*\\d+)?$"), new RegExp("^page\\s+\\d+(\\s*of\\s*\\d+)?$", "i")],
    transactionStartPattern: new RegExp("^\\d{2}-\\d{2}-\\d{2}\\b"),
    // Physical column order only — no separate direction field is ever captured here (see this
    // layout's own header comment above for why). effectiveDate/effectiveTime/channel/details are
    // discard-only, matched solely to keep the strictly-typed amount/balance groups correctly
    // aligned; description is a single ordinary field exactly at its real physical position.
    rowPattern: new RegExp(
      "^(?<date>\\d{2}-\\d{2}-\\d{2})\\s+" +
        "(?<effectiveDate>\\d{2}-\\d{2}-\\d{2})\\s+(?<effectiveTime>\\d{2}:\\d{2}(:\\d{2})?)\\s+" +
        "(?<description>.+?)\\s+" +
        "(?<amount>[\\d,]+\\.\\d{2})\\s+" +
        "(?<balance>[\\d,]+\\.\\d{2})\\s+" +
        "(?<channel>.+?)\\s+" +
        "(?<details>.*)$"
    ),
    dateFormat: "DD-MM-YY",
    money: {
      kind: "amount_with_direction",
      amountColumn: "amount",
      directionColumn: "direction",
      creditValues: SA1500_CREDIT_TYPES,
      debitValues: SA1500_DEBIT_TYPES,
    },
    descriptionDirectionTypes: {
      creditTypes: SA1500_CREDIT_TYPES,
      debitTypes: SA1500_DEBIT_TYPES,
    },
  },
};

export function isKnownPdfLayoutId(value: unknown): value is keyof typeof PDF_STATEMENT_LAYOUTS {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PDF_STATEMENT_LAYOUTS, value);
}

export function getPdfStatementLayout(layoutId: string): BankStatementPdfRowLayout | undefined {
  return PDF_STATEMENT_LAYOUTS[layoutId];
}
