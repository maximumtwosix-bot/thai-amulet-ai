// STEP E.4 — unit tests for src/lib/bankStatementPdfRows.ts only.
//
// Per the STEP E.4 architecture (extracted PDF text -> PDF row extraction -> existing validation),
// these tests feed `pageLines: string[][]` DIRECTLY into extractStatementRowsFromPdfText() — they do
// NOT construct real PDF bytes at all. Row extraction and PDF decrypt/extract
// (src/lib/bankStatementPdf.ts, STEP E.3) are deliberately separate concerns with a separate test
// boundary; src/lib/__tests__/bankStatementPdf.test.ts already covers the PDF-bytes-in,
// text/pageLines-out boundary (including a real Thai-glyph-encoding concern that a hand-built
// minimal test PDF using the standard Helvetica font cannot represent at all — no embedded font
// program/ToUnicode CMap — which is why Thai text is exercised here, at the pageLines boundary,
// rather than by attempting to render Thai glyphs through a fixture PDF).
//
// Run: node --import tsx --test src/lib/__tests__/bankStatementPdfRows.test.ts
// (Same zero-new-dependency test approach as STEP E.3 — this project has no test framework
// installed; node:test + node:assert/strict are Node's own built-ins.)

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractStatementRowsFromPdfText,
  normalizePdfDateToIso,
  type BankStatementPdfRowLayout,
} from "../bankStatementPdfRows";
import { getPdfStatementLayout } from "../bankStatementPdfLayouts";

const BANK_ACCOUNT_ID = 1;

const HEADER_PATTERNS = [/^ธนาคารตัวอย่าง จำกัด \(มหาชน\)$/, /^วันที่\s+รายการ\s+ถอน\s+ฝาก\s+คงเหลือ$/];
const FOOTER_PATTERNS = [/^หน้า\s+\d+\s+จาก\s+\d+$/, /^เอกสารนี้ออกโดยระบบอัตโนมัติ$/];

// Named capture groups (`(?<name>...)`) in a REGEX LITERAL require TypeScript's `target` to be
// ES2018+; this project's tsconfig.json pins `target: "ES2017"` (a project-wide convention this
// STEP does not touch). `new RegExp("...")` sidesteps this entirely — TypeScript never parses a
// runtime string's contents as regex syntax, so the same named groups compile fine as strings, and
// behave identically at runtime (verified: Node.js has supported named capture groups since v10,
// long before this project's Node v24). Every `rowPattern` below uses this form for that reason;
// `transactionStartPattern` needs no named groups so it stays a plain literal.

// Layout A — separate debit/credit columns, Christian-Era numeric date (Requirement G case 2).
const LAYOUT_SEPARATE_COLUMNS: BankStatementPdfRowLayout = {
  repeatedHeaderPatterns: HEADER_PATTERNS,
  repeatedFooterPatterns: FOOTER_PATTERNS,
  transactionStartPattern: /^\d{2}\/\d{2}\/\d{4}/,
  rowPattern: new RegExp(
    "^(?<date>\\d{2}/\\d{2}/\\d{4})\\s+(?<description>.+?)\\s+(?<debit>[\\d,]+\\.\\d{2}|-)\\s+(?<credit>[\\d,]+\\.\\d{2}|-)\\s+(?<balance>[\\d,]+\\.\\d{2})$"
  ),
  dateFormat: "DD/MM/YYYY",
  money: { kind: "separate_columns", debitColumn: "debit", creditColumn: "credit" },
};

// Layout B — single signed amount column (Requirement G case 1).
const LAYOUT_SIGNED_AMOUNT: BankStatementPdfRowLayout = {
  repeatedHeaderPatterns: HEADER_PATTERNS,
  repeatedFooterPatterns: FOOTER_PATTERNS,
  transactionStartPattern: /^\d{2}\/\d{2}\/\d{4}/,
  rowPattern: new RegExp(
    "^(?<date>\\d{2}/\\d{2}/\\d{4})\\s+(?<description>.+?)\\s+(?<amount>[+-]?[\\d,]+\\.\\d{2})\\s+(?<balance>[\\d,]+\\.\\d{2})$"
  ),
  dateFormat: "DD/MM/YYYY",
  money: { kind: "signed_amount", amountColumn: "amount", positiveMeans: "credit" },
};

// Layout C — separate columns + a bank reference code column (Requirement 12).
const LAYOUT_WITH_REFERENCE: BankStatementPdfRowLayout = {
  repeatedHeaderPatterns: HEADER_PATTERNS,
  repeatedFooterPatterns: FOOTER_PATTERNS,
  transactionStartPattern: /^\d{2}\/\d{2}\/\d{4}/,
  rowPattern: new RegExp(
    "^(?<date>\\d{2}/\\d{2}/\\d{4})\\s+(?<description>.+?)\\s+(?<reference>REF\\d+)\\s+(?<debit>[\\d,]+\\.\\d{2}|-)\\s+(?<credit>[\\d,]+\\.\\d{2}|-)\\s+(?<balance>[\\d,]+\\.\\d{2})$"
  ),
  dateFormat: "DD/MM/YYYY",
  money: { kind: "separate_columns", debitColumn: "debit", creditColumn: "credit" },
};

// Layout D — Thai month-name Buddhist-Era date (Requirement F).
const LAYOUT_THAI_MONTH_DATE: BankStatementPdfRowLayout = {
  repeatedHeaderPatterns: HEADER_PATTERNS,
  repeatedFooterPatterns: FOOTER_PATTERNS,
  transactionStartPattern: /^\d{1,2}\s+(?:มกราคม|ม\.ค\.)\s+\d{4}/,
  rowPattern: new RegExp(
    "^(?<date>\\d{1,2}\\s+(?:มกราคม|ม\\.ค\\.)\\s+\\d{4})\\s+(?<description>.+?)\\s+(?<debit>[\\d,]+\\.\\d{2}|-)\\s+(?<credit>[\\d,]+\\.\\d{2}|-)\\s+(?<balance>[\\d,]+\\.\\d{2})$"
  ),
  dateFormat: "D_MMMTHAI_BBBB",
  money: { kind: "separate_columns", debitColumn: "debit", creditColumn: "credit" },
};

test("1. one transaction", () => {
  const result = extractStatementRowsFromPdfText(
    [["01/01/2025 ค่าสินค้า ATM 500.00 - 49,500.00"]],
    BANK_ACCOUNT_ID,
    LAYOUT_SEPARATE_COLUMNS
  );

  assert.equal(result.rows.length, 1);
  assert.equal(result.summary.valid, 1);
  assert.equal(result.summary.invalid, 0);
  assert.equal(result.rows[0].category, "NEW");
  assert.equal(result.rows[0].canonical?.transactionDate, "2025-01-01");
  assert.equal(result.rows[0].canonical?.debit, 50000);
  assert.equal(result.rows[0].canonical?.credit, null);
});

test("2. multiple transactions", () => {
  const result = extractStatementRowsFromPdfText(
    [
      [
        "01/01/2025 ค่าสินค้า ATM 500.00 - 49,500.00",
        "02/01/2025 รับโอนเงินเข้าบัญชี - 2,500.00 52,000.00",
        "03/01/2025 ค่าน้ำประปา 150.50 - 51,849.50",
      ],
    ],
    BANK_ACCOUNT_ID,
    LAYOUT_SEPARATE_COLUMNS
  );

  assert.equal(result.rows.length, 3);
  assert.equal(result.summary.valid, 3);
  assert.equal(result.summary.invalid, 0);
  assert.deepEqual(
    result.rows.map((r) => r.canonical?.transactionDate),
    ["2025-01-01", "2025-01-02", "2025-01-03"]
  );
});

test("3. multi-page transactions (wrapped description joins across a page boundary, no duplication)", () => {
  const result = extractStatementRowsFromPdfText(
    [
      [
        "ธนาคารตัวอย่าง จำกัด (มหาชน)",
        "วันที่ รายการ ถอน ฝาก คงเหลือ",
        "10/01/2025 ค่าบริการรายเดือนสำหรับ",
        "หน้า 1 จาก 2",
      ],
      [
        "ธนาคารตัวอย่าง จำกัด (มหาชน)",
        "วันที่ รายการ ถอน ฝาก คงเหลือ",
        "บัญชีออมทรัพย์ 200.00 - 49,800.00",
        "หน้า 2 จาก 2",
      ],
    ],
    BANK_ACCOUNT_ID,
    LAYOUT_SEPARATE_COLUMNS
  );

  assert.equal(result.rows.length, 1, "must be exactly ONE row, never duplicated across the page boundary");
  assert.equal(result.rows[0].category, "NEW");
  assert.equal(result.rows[0].canonical?.description, "ค่าบริการรายเดือนสำหรับ บัญชีออมทรัพย์");
  assert.equal(result.rows[0].canonical?.debit, 20000);
});

test("4. repeated page header is ignored on every page, not counted as a row", () => {
  const result = extractStatementRowsFromPdfText(
    [
      ["ธนาคารตัวอย่าง จำกัด (มหาชน)", "วันที่ รายการ ถอน ฝาก คงเหลือ", "01/01/2025 ค่าสินค้า 100.00 - 100.00"],
      ["ธนาคารตัวอย่าง จำกัด (มหาชน)", "วันที่ รายการ ถอน ฝาก คงเหลือ", "02/01/2025 ค่าสินค้า 200.00 - -100.00"],
    ],
    BANK_ACCOUNT_ID,
    LAYOUT_SEPARATE_COLUMNS
  );

  assert.equal(result.rows.length, 2);
  assert.ok(result.rows.every((r) => !JSON.stringify(r.raw).includes("ธนาคารตัวอย่าง")));
});

test("5. repeated page footer is ignored on every page, not counted as a row", () => {
  const result = extractStatementRowsFromPdfText(
    [
      ["01/01/2025 ค่าสินค้า 100.00 - 100.00", "หน้า 1 จาก 2", "เอกสารนี้ออกโดยระบบอัตโนมัติ"],
      ["02/01/2025 ค่าสินค้า 200.00 - -100.00", "หน้า 2 จาก 2", "เอกสารนี้ออกโดยระบบอัตโนมัติ"],
    ],
    BANK_ACCOUNT_ID,
    LAYOUT_SEPARATE_COLUMNS
  );

  assert.equal(result.rows.length, 2);
  assert.ok(result.rows.every((r) => !JSON.stringify(r.raw).includes("หน้า")));
});

test("6. wrapped Thai description is joined into one transaction, not split or guessed", () => {
  const result = extractStatementRowsFromPdfText(
    [["05/01/2025 ค่าเช่าร้านและ", "ค่าน้ำค่าไฟเดือนมกราคม 1,200.00 - 53,200.00"]],
    BANK_ACCOUNT_ID,
    LAYOUT_SEPARATE_COLUMNS
  );

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].canonical?.description, "ค่าเช่าร้านและ ค่าน้ำค่าไฟเดือนมกราคม");
  assert.equal(result.rows[0].canonical?.debit, 120000);
});

test("7. amount with comma grouping", () => {
  const result = extractStatementRowsFromPdfText(
    [["06/01/2025 โอนเงินจำนวนมาก - 12,345.67 65,545.67"]],
    BANK_ACCOUNT_ID,
    LAYOUT_SEPARATE_COLUMNS
  );

  assert.equal(result.rows[0].category, "NEW");
  assert.equal(result.rows[0].canonical?.credit, 1234567);
});

test("8. decimal amount (exactly 2 places)", () => {
  const result = extractStatementRowsFromPdfText(
    [["07/01/2025 ค่าธรรมเนียม 15.50 - 65,530.17"]],
    BANK_ACCOUNT_ID,
    LAYOUT_SEPARATE_COLUMNS
  );

  assert.equal(result.rows[0].canonical?.debit, 1550);
});

test("9. credit/income via signed_amount layout (positive = credit)", () => {
  const result = extractStatementRowsFromPdfText(
    [["04/01/2025 รับโอนเงินเดือน +2,500.00 54,400.00"]],
    BANK_ACCOUNT_ID,
    LAYOUT_SIGNED_AMOUNT
  );

  assert.equal(result.rows[0].category, "NEW");
  assert.equal(result.rows[0].canonical?.credit, 250000);
  assert.equal(result.rows[0].canonical?.debit, null);
});

test("10. debit/expense via signed_amount layout (negative = debit)", () => {
  const result = extractStatementRowsFromPdfText(
    [["03/01/2025 ค่าบริการรายเดือน -100.00 51,900.00"]],
    BANK_ACCOUNT_ID,
    LAYOUT_SIGNED_AMOUNT
  );

  assert.equal(result.rows[0].category, "NEW");
  assert.equal(result.rows[0].canonical?.debit, 10000);
  assert.equal(result.rows[0].canonical?.credit, null);
});

test("11. balance is parsed separately and never confused with amount/debit/credit", () => {
  const result = extractStatementRowsFromPdfText(
    [["01/01/2025 ค่าสินค้า ATM 500.00 - 49,500.00"]],
    BANK_ACCOUNT_ID,
    LAYOUT_SEPARATE_COLUMNS
  );

  const canonical = result.rows[0].canonical;
  assert.equal(canonical?.balance, 4950000);
  assert.notEqual(canonical?.balance, canonical?.debit);
  assert.notEqual(canonical?.balance, canonical?.amount);
});

test("12. reference parsing (when the layout has a reference column)", () => {
  const result = extractStatementRowsFromPdfText(
    [["13/01/2025 โอนเงิน REF12345 500.00 - 49,200.00"]],
    BANK_ACCOUNT_ID,
    LAYOUT_WITH_REFERENCE
  );

  assert.equal(result.rows[0].category, "NEW");
  assert.equal(result.rows[0].canonical?.reference, "REF12345");
});

test("13. invalid/malformed row (looks like a transaction start but does not match the row structure)", () => {
  const result = extractStatementRowsFromPdfText(
    [["11/01/2025 ยอดคงเหลือไม่ถูกต้อง"]],
    BANK_ACCOUNT_ID,
    LAYOUT_SEPARATE_COLUMNS
  );

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].category, "INVALID");
  assert.ok(result.rows[0].message?.startsWith("PDF_UNRECOGNIZED_ROW_STRUCTURE"));
  assert.equal(result.rows[0].canonical, undefined);
});

test("14. ambiguous row (both debit and credit populated) must NOT be guessed — rejected via reused CSV validation", () => {
  const result = extractStatementRowsFromPdfText(
    [["12/01/2025 รายการทดสอบ 100.00 200.00 49,700.00"]],
    BANK_ACCOUNT_ID,
    LAYOUT_SEPARATE_COLUMNS
  );

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].category, "INVALID");
  assert.equal(result.rows[0].errorCode, "INVALID_DEBIT_CREDIT_COMBINATION");
  assert.equal(result.rows[0].canonical, undefined);
});

test("15. no phantom transaction is ever created from a page header or footer line", () => {
  const result = extractStatementRowsFromPdfText(
    [
      ["ธนาคารตัวอย่าง จำกัด (มหาชน)", "วันที่ รายการ ถอน ฝาก คงเหลือ"],
      ["หน้า 1 จาก 1", "เอกสารนี้ออกโดยระบบอัตโนมัติ"],
    ],
    BANK_ACCOUNT_ID,
    LAYOUT_SEPARATE_COLUMNS
  );

  assert.equal(result.rows.length, 0);
  assert.equal(result.summary.total, 0);
});

test("16. empty extracted text produces zero rows, not an error", () => {
  const noPages = extractStatementRowsFromPdfText([], BANK_ACCOUNT_ID, LAYOUT_SEPARATE_COLUMNS);
  assert.deepEqual(noPages, { rows: [], summary: { total: 0, valid: 0, invalid: 0, warnings: 0, informational: 0 } });

  const blankPage = extractStatementRowsFromPdfText([[]], BANK_ACCOUNT_ID, LAYOUT_SEPARATE_COLUMNS);
  assert.deepEqual(blankPage, { rows: [], summary: { total: 0, valid: 0, invalid: 0, warnings: 0, informational: 0 } });
});

test("17. Thai text: Thai month-name Buddhist-Era date is normalized deterministically", () => {
  const result = extractStatementRowsFromPdfText(
    [["1 มกราคม 2568 ซื้อสินค้าออนไลน์ 350.00 - 50,000.00"]],
    BANK_ACCOUNT_ID,
    LAYOUT_THAI_MONTH_DATE
  );

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].category, "NEW");
  assert.equal(result.rows[0].canonical?.transactionDate, "2025-01-01");
  assert.equal(result.rows[0].canonical?.description, "ซื้อสินค้าออนไลน์");
});

test("normalizePdfDateToIso: Christian-Era numeric formats delegate unchanged to bankStatementCsv's real parseDateToIso", () => {
  assert.deepEqual(normalizePdfDateToIso("01/01/2025", "DD/MM/YYYY"), { isoDate: "2025-01-01", error: null });
  assert.deepEqual(normalizePdfDateToIso("2025-01-01", "YYYY-MM-DD"), { isoDate: "2025-01-01", error: null });
  // A real calendar-validity failure (Feb 30) must still be caught even after PDF-specific
  // normalization — confirms the REAL parseDateToIso() check runs, not a shape-only check.
  assert.deepEqual(normalizePdfDateToIso("30/02/2025", "DD/MM/YYYY"), { isoDate: null, error: "INVALID_DATE" });
});

test("normalizePdfDateToIso: Buddhist-Era numeric formats are converted deterministically (BE - 543 = CE)", () => {
  assert.deepEqual(normalizePdfDateToIso("01/01/2568", "DD/MM/BBBB"), { isoDate: "2025-01-01", error: null });
  assert.deepEqual(normalizePdfDateToIso("01-01-2568", "DD-MM-BBBB"), { isoDate: "2025-01-01", error: null });
  // A Buddhist-Era date that is not a real calendar date once converted must still be rejected.
  assert.deepEqual(normalizePdfDateToIso("30/02/2568", "DD/MM/BBBB"), { isoDate: null, error: "INVALID_DATE" });
});

test("normalizePdfDateToIso: Thai month-name format, both full name and dot-abbreviated form", () => {
  assert.deepEqual(normalizePdfDateToIso("1 มกราคม 2568", "D_MMMTHAI_BBBB"), { isoDate: "2025-01-01", error: null });
  assert.deepEqual(normalizePdfDateToIso("1 ม.ค. 2568", "D_MMMTHAI_BBBB"), { isoDate: "2025-01-01", error: null });
  assert.deepEqual(normalizePdfDateToIso("31 ธันวาคม 2568", "D_MMMTHAI_BBBB"), { isoDate: "2025-12-31", error: null });
});

test("normalizePdfDateToIso: never guesses — unrecognized text is rejected, not approximated", () => {
  assert.deepEqual(normalizePdfDateToIso("garbage", "DD/MM/YYYY"), { isoDate: null, error: "INVALID_DATE" });
  assert.deepEqual(normalizePdfDateToIso("", "DD/MM/YYYY"), { isoDate: null, error: "INVALID_DATE" });
  assert.deepEqual(normalizePdfDateToIso("1 มษายน 2568", "D_MMMTHAI_BBBB"), { isoDate: null, error: "INVALID_DATE" });
});

test("normalizePdfDateToIso: DD-MM-YY uses the fixed CE-2000s century policy (YY -> 20YY), never a heuristic", () => {
  assert.deepEqual(normalizePdfDateToIso("01-06-26", "DD-MM-YY"), { isoDate: "2026-06-01", error: null });
  assert.deepEqual(normalizePdfDateToIso("31-12-99", "DD-MM-YY"), { isoDate: "2099-12-31", error: null });
  assert.deepEqual(normalizePdfDateToIso("01-01-00", "DD-MM-YY"), { isoDate: "2000-01-01", error: null });
});

test("normalizePdfDateToIso: DD-MM-YY still rejects a real calendar-invalid date (Feb 30) after century conversion", () => {
  assert.deepEqual(normalizePdfDateToIso("30-02-26", "DD-MM-YY"), { isoDate: null, error: "INVALID_DATE" });
});

// ===== SA1500_V1 — description-leading-token closed-set direction mapping. Uses the REAL registry
// entry (not a reconstructed copy) so these tests fail if the actual layout drifts from what was
// audited. All fixture text below is synthetic test data invented for this test file only — never
// real statement content. =====

const SA1500 = getPdfStatementLayout("SA1500_V1")!;

test("SA1500_V1: known CREDIT type (leading token) resolves credit, never debit", () => {
  const result = extractStatementRowsFromPdfText(
    [["01-06-26 01-06-26 10:15 รับโอนเงิน จากเพื่อน 1,000.00 51,000.00 Mobile Banking รายละเอียดทดสอบ"]],
    BANK_ACCOUNT_ID,
    SA1500
  );

  assert.equal(result.rows[0].category, "NEW");
  assert.equal(result.rows[0].canonical?.credit, 100000);
  assert.equal(result.rows[0].canonical?.debit, null);
});

test("SA1500_V1: known DEBIT type 'ชำระเงิน' (leading token) resolves debit, never credit", () => {
  const result = extractStatementRowsFromPdfText(
    [["02-06-26 02-06-26 09:00 ชำระเงิน ค่าสินค้า 500.00 50,500.00 ATM รายละเอียดทดสอบ"]],
    BANK_ACCOUNT_ID,
    SA1500
  );

  assert.equal(result.rows[0].category, "NEW");
  assert.equal(result.rows[0].canonical?.debit, 50000);
  assert.equal(result.rows[0].canonical?.credit, null);
});

test("SA1500_V1: known DEBIT type 'โอนเงิน' (leading token) resolves debit, never credit", () => {
  const result = extractStatementRowsFromPdfText(
    [["03-06-26 03-06-26 11:30 โอนเงิน ให้เพื่อน 200.00 50,300.00 Mobile รายละเอียดทดสอบ"]],
    BANK_ACCOUNT_ID,
    SA1500
  );

  assert.equal(result.rows[0].category, "NEW");
  assert.equal(result.rows[0].canonical?.debit, 20000);
  assert.equal(result.rows[0].canonical?.credit, null);
});

test("SA1500_V1: transaction type outside the closed set fails closed (INVALID_DIRECTION_VALUE), never guessed", () => {
  const result = extractStatementRowsFromPdfText(
    [["04-06-26 04-06-26 12:00 ปรับปรุงยอด 100.00 50,200.00 Branch รายละเอียดทดสอบ"]],
    BANK_ACCOUNT_ID,
    SA1500
  );

  assert.equal(result.rows[0].category, "INVALID");
  assert.equal(result.rows[0].errorCode, "INVALID_DIRECTION_VALUE");
  assert.equal(result.rows[0].canonical, undefined);
});

test("SA1500_V1: a longer word that merely starts with a known token does NOT match (no prefix/fuzzy matching)", () => {
  const result = extractStatementRowsFromPdfText(
    [["05-06-26 05-06-26 13:00 รับโอนเงินสด เข้าบัญชี 100.00 50,300.00 ATM รายละเอียดทดสอบ"]],
    BANK_ACCOUNT_ID,
    SA1500
  );

  assert.equal(result.rows[0].category, "INVALID");
  assert.equal(result.rows[0].errorCode, "INVALID_DIRECTION_VALUE");
});

test("SA1500_V1: an excluded/ambiguous bare token (not the full closed-set string) fails closed", () => {
  const result = extractStatementRowsFromPdfText(
    [["06-06-26 06-06-26 14:00 โอน เงินสด 100.00 50,200.00 Branch รายละเอียดทดสอบ"]],
    BANK_ACCOUNT_ID,
    SA1500
  );

  assert.equal(result.rows[0].category, "INVALID");
  assert.equal(result.rows[0].errorCode, "INVALID_DIRECTION_VALUE");
});

test("SA1500_V1: 1-line continuation — direction still resolves correctly after description reassembly", () => {
  const result = extractStatementRowsFromPdfText(
    [["07-06-26 07-06-26 15:00 รับโอนเงิน จากบริษัท", "เอบีซี จำกัด 2,000.00 52,300.00 Mobile รายละเอียดทดสอบ"]],
    BANK_ACCOUNT_ID,
    SA1500
  );

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].category, "NEW");
  assert.equal(result.rows[0].canonical?.credit, 200000);
  assert.equal(result.rows[0].canonical?.debit, null);
});

test("SA1500_V1: 2-line continuation — direction still resolves correctly after description reassembly", () => {
  const result = extractStatementRowsFromPdfText(
    [
      [
        "08-06-26 08-06-26 16:00 ชำระเงิน ค่าบริการรายเดือนสำหรับ",
        "แพ็กเกจอินเทอร์เน็ต",
        "และโทรศัพท์ 300.00 52,000.00 ATM รายละเอียดทดสอบ",
      ],
    ],
    BANK_ACCOUNT_ID,
    SA1500
  );

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].category, "NEW");
  assert.equal(result.rows[0].canonical?.debit, 30000);
  assert.equal(result.rows[0].canonical?.credit, null);
});

test("SA1500_V1: strict money pattern rejects a malformed amount (no decimal places) — row fails closed, never guessed", () => {
  const result = extractStatementRowsFromPdfText(
    [["09-06-26 09-06-26 10:00 รับโอนเงิน ทดสอบ 1000 50000.00 ATM รายละเอียดทดสอบ"]],
    BANK_ACCOUNT_ID,
    SA1500
  );

  assert.equal(result.rows[0].category, "INVALID");
  assert.ok(result.rows[0].message?.startsWith("PDF_UNRECOGNIZED_ROW_STRUCTURE"));
});

test("SA1500_V1: repeated page header/footer stripped on every page, never counted as a row", () => {
  const headerLine = "วันที่ เวลา/วันที่มีผล รายการ ถอนเงิน/ฝากเงิน ยอดคงเหลือ ช่องทาง รายละเอียด";
  const result = extractStatementRowsFromPdfText(
    [
      [headerLine, "10-06-26 10-06-26 09:00 รับโอนเงิน ทดสอบ 100.00 100.00 ATM รายละเอียดทดสอบ", "หน้า 1/2"],
      [headerLine, "11-06-26 11-06-26 09:00 ชำระเงิน ทดสอบ 50.00 50.00 ATM รายละเอียดทดสอบ", "หน้า 2/2"],
    ],
    BANK_ACCOUNT_ID,
    SA1500
  );

  assert.equal(result.rows.length, 2);
  assert.ok(result.rows.every((r) => !JSON.stringify(r.raw).includes("วันที่มีผล")));
  assert.ok(result.rows.every((r) => !JSON.stringify(r.raw).includes("หน้า")));
});

test("SA1500_V1: effectiveDate/effectiveTime/channel/details never leak into CanonicalStatementRow", () => {
  const result = extractStatementRowsFromPdfText(
    [["12-06-26 12-06-26 08:45 รับโอนเงิน ทดสอบข้อมูล 1,500.00 53,500.00 InternetBanking รายละเอียดปลายทาง"]],
    BANK_ACCOUNT_ID,
    SA1500
  );

  const canonical = result.rows[0].canonical;
  assert.ok(canonical);
  assert.deepEqual(Object.keys(canonical).sort(), [
    "amount",
    "balance",
    "bankTransactionId",
    "debit",
    "description",
    "duplicateFingerprint",
    "credit",
    "reference",
    "transactionDate",
  ].sort());
  assert.ok(!canonical.description?.includes("InternetBanking"));
  assert.ok(!canonical.description?.includes("รายละเอียดปลายทาง"));
});
