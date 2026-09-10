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

// SA1500_V2 — STEP 3C. SA1500_V1 above (STEP E.6) encoded an ASSUMED column layout that was never
// checked against a real statement of this exact export; STEP 3B's read-only structural audit of
// bank_statement 525's actual decrypted PDF text (the real Kasikornbank SA1500 statement this
// account holder uploaded) found the true physical layout differs from SA1500_V1 in every column:
// one date + one time (no second "effective date/time" pair at all), balance immediately after
// channel (not near the end), and the credit/debit direction token trailing the free-text detail
// immediately before the amount (not leading it) — see this STEP's audit report for the exact
// evidence lines. SA1500_V1 itself is left completely unmodified; this is an additive sibling entry
// for the statements that actually match this real, audited shape.
//
// Confirmed real row shape (STEP 3B evidence, both a single-line and a multi-line/wrapped example):
//   "17-07-26 09:58 K PLUS 819.02 โอนไป X7390 นาย รัชกฤช กมลเลิศ++ โอนเงิน 1,570.00"
//   "15-07-26 17:36 K-Cash Connect Plus 1,095.02 จาก X4002 บจก. แฟลช เอ็กซ์เพ++ DIRECT
//    CREDIT Ref 20260715104549007939
//    รับโอนเงิน 1,095.00"                                    (3 physical lines, one transaction —
//                                                              the existing wrapped-continuation
//                                                              joiner in bankStatementPdfRows.ts
//                                                              already handles this unmodified)
// => date time channel balance description... direction amount
//
// `time`/`channel` are not in bankStatementPdfRows.ts's PDF_ROW_FIELDS — same discard-by-design
// treatment SA1500_V1 already relies on for its own unused `effectiveDate`/`effectiveTime`/`channel`/
// `details` groups (see that module's own comment): captured only to keep the recognized groups
// (`date`, `balance`, `description`, `direction`, `amount`) correctly aligned, never mapped anywhere.
//
// Direction token: unlike SA1500_V1, this layout does NOT set `descriptionDirectionTypes` — that
// mechanism (src/lib/bankStatementPdfRows.ts's own doc comment) is documented as needed ONLY when
// direction has no genuinely separate physical column. Here it DOES have one (a distinct,
// whitespace-delimited trailing token, confirmed by STEP 3B's audit) — `rowPattern` captures it
// directly as its own `(?<direction>...)` named group instead, which normalizeCellText()/
// parseStatementRow() already consume unchanged via the plain `money.kind: "amount_with_direction"`
// path (verified in src/lib/bankStatementCsv.ts: creditValues/debitValues membership on whatever the
// `direction` named group captured) — the exact same fail-closed INVALID_DIRECTION_VALUE safety
// SA1500_V1 relies on, reached by a different but equally config-only route. No change to
// bankStatementPdfRows.ts or bankStatementCsv.ts was needed or made for this.
//
// Direction vocabulary — STEP 3B audit evidence, extended by STEP 3D's full-file verification run
// (which parsed the real PDF's complete 439 lines, not just the STEP 3B sample). SA1500_V1's
// original two tokens are carried over (same real meaning), plus tokens STEP 3B/3D found actually
// occurring in this account's real statement text: "ฝากเงินสด" (cash deposit) and
// "รับดอกเบี้ยเงินฝาก" (interest received) — both money coming IN, i.e. credit, same as
// "รับโอนเงิน"; and, from STEP 3D's full-file run, "รับเงินคืน" (refund received — credit) and
// "ชำระด้วยบัตรเดบิต" (paid via debit card — debit). Each addition here is a token STEP 3D actually
// observed in the real PDF text (via its PDF_UNRECOGNIZED_ROW_STRUCTURE samples), never invented.
// Kept as a separate constant pair from SA1500_CREDIT_TYPES/SA1500_DEBIT_TYPES (not extending those
// in place) so SA1500_V1 remains byte-for-byte unmodified, per this STEP's explicit scope.
const SA1500_V2_CREDIT_TYPES = ["รับโอนเงิน", "ฝากเงินสด", "รับดอกเบี้ยเงินฝาก", "รับเงินคืน"];
const SA1500_V2_DEBIT_TYPES = ["ชำระเงิน", "โอนเงิน", "ชำระด้วยบัตรเดบิต"];

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

  SA1500_V2: {
    // STEP 3B audit evidence — real header text is split across THREE separate physical lines, in a
    // different column order than SA1500_V1's single-line assumption ("ถอนเงิน/ฝากเงิน ช่องทาง
    // รายการ ยอดคงเหลือ" for real vs. SA1500_V1's assumed "รายการ ถอนเงิน/ฝากเงิน ยอดคงเหลือ
    // ช่องทาง รายละเอียด") — three anchored patterns, one per confirmed real line, rather than one
    // pattern guessing at a merged order.
    repeatedHeaderPatterns: [
      new RegExp("^วันที่\\s+เวลา/$"),
      new RegExp("^วันที่มีผล\\s+ถอนเงิน\\s*/\\s*ฝากเงิน\\s+ช่องทาง\\s+รายการ\\s+ยอดคงเหลือ$"),
      new RegExp("^\\(บาท\\)\\s+รายละเอียด$"),
      // STEP 3D addition — a SECOND, previously-uncovered repeated block: STEP 3D's full-file run
      // found that transactions landing last on a page (pages 2-6) were getting corrupted by a
      // 12-line per-page account-identity block reprinted immediately above each page's own column
      // header (the 3 patterns just above) — this block was NOT in scope for STEP 3B's smaller
      // sample and so was missed there. Evidence for repetition: STEP 3D's PDF_UNRECOGNIZED_ROW_
      // STRUCTURE samples (rows 73/139/202/266/331) show this EXACT 12-line sequence, verbatim,
      // appended after 5 different real transactions on 5 different pages — direct proof it reprints
      // per page, not a one-off seen only on page 1. Each entry below is either an exact literal match
      // (account name/address/branch name/document reference numbers — genuinely statement-specific
      // values with no safe generic structural marker, so matched literally per "ห้ามเดาข้อมูล" rather
      // than guessed at with a loose pattern) or, for the two lines that DO have a clear, safe,
      // content-independent shape (the "<page>/<totalPages>(0391)" page indicator and the
      // "<date> - <date>" statement-period line), a narrow structural pattern — never a pattern broad
      // enough to also match a real transaction line (none of these start with a date the way
      // transactionStartPattern below does, so there is no overlap risk).
      new RegExp("^ที่\\s+DD\\.048\\s*:\\s*.+$"),
      new RegExp("^ชื่อบัญชี\\s+.+$"),
      new RegExp("^18/18\\s+ถ\\.บางกรวย-จงถนอม\\s+ต\\.มหาสวัสดิ์\\s+อ\\.บางกรวย\\s+จ\\.นนทบุรี\\s+11130$"),
      new RegExp("^\\d+/\\d+\\(0391\\)$"),
      new RegExp("^สาขาเซ็นทรัล\\s+นอร์ทวิลล์$"),
      new RegExp("^206-1-04150-0$"),
      new RegExp("^26090720132514764756$"),
      new RegExp("^\\d{2}/\\d{2}/\\d{4}\\s*-\\s*\\d{2}/\\d{2}/\\d{4}$"),
      new RegExp("^เลขที่บัญชีเงินฝาก$"),
      new RegExp("^สาขาเจ้าของบัญชี$"),
      new RegExp("^เลขที่อ้างอิง$"),
      new RegExp("^รอบระหว่างวันที่$"),
      // STEP 3B evidence: "01-06-26 0.00 ยอดยกมา" — the opening/brought-forward balance line. It
      // structurally matches transactionStartPattern (starts with a date) but is NOT a transaction
      // (no time, no channel, no direction, no amount — nothing rowPattern below could ever match).
      // Per this STEP's explicit instruction #8 ("ห้ามนับเป็น normal transaction โดยอัตโนมัติ"),
      // this line is discarded here as noise BEFORE row-boundary logic ever sees it — the same
      // mechanism already used for repeated header/footer text, applied to this one confirmed,
      // evidence-based line shape. It would in any case never match rowPattern (no `time` token) and
      // so would never become a bank_statement_transaction even without this explicit skip; adding it
      // here only avoids one spurious PDF_UNRECOGNIZED_ROW_STRUCTURE entry in the review list.
      new RegExp("^\\d{2}-\\d{2}-\\d{2}\\s+[\\d,]+\\.\\d{2}\\s+ยอดยกมา$"),
    ],
    // STEP 3B evidence — real per-page footer is three confirmed-repeating lines (seen identically at
    // both the audit's mid-file and end-of-file samples), none matching SA1500_V1's assumed "หน้า N"
    // shape.
    repeatedFooterPatterns: [
      new RegExp("^หน้าที่\\s*\\(PAGE/OF\\)\\s*\\d+\\s*/\\s*\\d+$"),
      new RegExp("^KBPDF \\(FM702-CA_SA-V\\.1\\) \\(03-25\\)$"),
      new RegExp("^ออกโดย\\s+K\\s+PLUS$"),
      // STEP 3D-F — STEP 3D-AUDIT-ROWS-84-324's evidence: the document's closing contact-center
      // disclaimer, confirmed appearing exactly once, as the very last line of the whole 439-line
      // file (page 6, immediately after the last real transaction). Because nothing follows it, the
      // continuation-joining loop in bankStatementPdfRows.ts had nothing to stop it, so it kept
      // absorbing this line into the last transaction's row, breaking that row's trailing `amount$`
      // anchor (PDF_UNRECOGNIZED_ROW_STRUCTURE). Matched here as an exact literal — highly specific
      // text (phone numbers, named departments) with zero structural resemblance to
      // transactionStartPattern, so there is no risk of this ever matching a real transaction line;
      // whether it also repeats on other pages is irrelevant to safety (same posture as this layout's
      // other exact-literal noise entries above) — it need only be excluded wherever it occurs.
      new RegExp(
        "^สอบถามข้อมูลเพิ่มเติม\\s+บุคคลธรรมดา\\s+K\\s+Contact\\s+Center\\s+02-8888888\\s+นิติบุคคล\\s+K-BIZ\\s+Contact\\s+Center\\s+02-8888822$"
      ),
    ],
    transactionStartPattern: new RegExp("^\\d{2}-\\d{2}-\\d{2}\\b"),
    // Physical column order per STEP 3B's audit: date, time, channel, balance, description, then the
    // credit/debit direction token, then amount — LAST, unlike SA1500_V1's `amount` before `balance`.
    // `time`/`channel` are discard-only (see this layout's own header comment above). `description`
    // is non-greedy; `direction` is `\S+` (STEP 3D revision — was a hardcoded literal alternation of
    // the then-known vocabulary; STEP 3D's full-file run found 2 MORE real tokens the hardcoded list
    // didn't cover, each silently surfacing as a generic PDF_UNRECOGNIZED_ROW_STRUCTURE instead of the
    // more diagnostic INVALID_DIRECTION_VALUE). Every confirmed real direction token (STEP 3B + 3D)
    // is one single whitespace-delimited word with no internal space, so `\S+` reliably captures
    // "whichever one word sits immediately before the amount" as its own group — regex backtracking
    // against the fixed trailing `amount$` anchor still finds the correct description/direction/amount
    // boundary. Whether that captured word is an actually-known credit/debit term is then decided
    // exclusively downstream by the existing, unmodified `money.kind: "amount_with_direction"`
    // handling in bankStatementCsv.ts (SA1500_V2_CREDIT_TYPES/SA1500_V2_DEBIT_TYPES membership) — an
    // unrecognized word now fails closed as INVALID_DIRECTION_VALUE, never guessed, and is easier to
    // spot/extend than before (no second edit site inside this regex for a future new token). Known
    // limitation, unchanged from STEP 3C: assumes none of the closed-set words legitimately occurs
    // earlier in a real channel/description text than its true trailing-token position — no such
    // collision found in STEP 3B or STEP 3D's evidence.
    rowPattern: new RegExp(
      "^(?<date>\\d{2}-\\d{2}-\\d{2})\\s+" +
        "(?<time>\\d{2}:\\d{2})\\s+" +
        "(?<channel>.+?)\\s+" +
        "(?<balance>[\\d,]+\\.\\d{2})\\s+" +
        "(?<description>.+?)\\s+" +
        "(?<direction>\\S+)\\s+" +
        "(?<amount>[\\d,]+\\.\\d{2})$"
    ),
    dateFormat: "DD-MM-YY",
    money: {
      kind: "amount_with_direction",
      amountColumn: "amount",
      directionColumn: "direction",
      creditValues: SA1500_V2_CREDIT_TYPES,
      debitValues: SA1500_V2_DEBIT_TYPES,
    },
    // Deliberately OMITTED (unlike SA1500_V1) — direction here has a genuine separate physical
    // capture group (`direction` above), so the description-leading-token derivation mechanism does
    // not apply; see this layout's own header comment for the full reasoning.
  },
};

export function isKnownPdfLayoutId(value: unknown): value is keyof typeof PDF_STATEMENT_LAYOUTS {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PDF_STATEMENT_LAYOUTS, value);
}

export function getPdfStatementLayout(layoutId: string): BankStatementPdfRowLayout | undefined {
  return PDF_STATEMENT_LAYOUTS[layoutId];
}
