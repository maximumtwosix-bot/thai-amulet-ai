// Bank Statement CSV Import Engine — STEP C.4 — pure/deterministic logic only.
//
// This file must NEVER: mutate the DB, touch the filesystem, make an HTTP call, read a session, or
// read an environment variable. Every exported function is (input) -> (structured output), safe to
// call directly with no setup/teardown of any kind — this is what lets it be smoke-tested without a
// db.transaction() wrapper at all (STEP C.3 §15/§17). Duplicate-candidate *lookups* against
// bank_statements/bank_statement_transactions are DB-touching and deliberately live in
// src/lib/bankStatements.ts instead (STEP C.4 §12) — this file only computes the deterministic
// fingerprint a lookup would search for, never performs the lookup itself.
//
// No dependency was added to build this (STEP C.4 §0 — confirmed no CSV/date/validation library
// exists anywhere in this project, and Node's standard library has no CSV parser either) — matches
// this codebase's existing convention of hand-writing this class of logic
// (src/app/api/tax/export/route.ts's CSV writer).

import { createHash } from "node:crypto";

// ===== Error/result taxonomy (STEP C.3 §13) =====

export type BankStatementFileErrorCode =
  | "EMPTY_FILE"
  | "UNREADABLE_ENCODING"
  | "FILE_TOO_LARGE"
  | "TOO_MANY_ROWS"
  | "TOO_MANY_COLUMNS"
  | "CELL_TOO_LONG"
  | "MALFORMED_CSV_STRUCTURE"
  | "MISSING_HEADER"
  | "DUPLICATE_HEADER"
  | "REQUIRED_COLUMN_NOT_MAPPED";

export type BankStatementRowErrorCode =
  | "COLUMN_COUNT_MISMATCH"
  | "MISSING_REQUIRED_FIELD"
  | "INVALID_DATE"
  | "INVALID_AMOUNT"
  | "TOO_MANY_DECIMAL_PLACES"
  | "INVALID_DEBIT"
  | "INVALID_CREDIT"
  | "INVALID_DEBIT_CREDIT_COMBINATION"
  | "INVALID_DIRECTION_VALUE"
  | "AMOUNT_DIRECTION_CONFLICT";

// Safe, fixed, non-interpolated messages only — never includes the offending cell's raw content in
// case that content is itself something unsafe to echo back verbatim (matches this codebase's
// existing convention throughout src/lib/bankAccounts.ts/src/lib/transactions.ts of never
// interpolating field values into thrown/returned messages).
const FILE_ERROR_MESSAGES: Record<BankStatementFileErrorCode, string> = {
  EMPTY_FILE: "ไฟล์ว่างเปล่า",
  UNREADABLE_ENCODING: "ไม่สามารถอ่านไฟล์ได้ — อาจไม่ใช่ไฟล์ UTF-8 ที่ถูกต้อง",
  FILE_TOO_LARGE: "ไฟล์มีขนาดใหญ่เกินกำหนด",
  TOO_MANY_ROWS: "ไฟล์มีจำนวนแถวมากเกินกำหนด",
  TOO_MANY_COLUMNS: "ไฟล์มีจำนวนคอลัมน์มากเกินกำหนด",
  CELL_TOO_LONG: "พบข้อมูลในเซลล์ที่ยาวผิดปกติ",
  MALFORMED_CSV_STRUCTURE: "โครงสร้างไฟล์ CSV ไม่ถูกต้อง (เช่น เครื่องหมายคำพูดไม่ปิด)",
  MISSING_HEADER: "ไม่พบแถวหัวตาราง (header row)",
  DUPLICATE_HEADER: "พบชื่อคอลัมน์ซ้ำกันในแถวหัวตาราง",
  REQUIRED_COLUMN_NOT_MAPPED: "การตั้งค่าคอลัมน์ (mapping) ไม่ครบตามที่จำเป็น",
};

const ROW_ERROR_MESSAGES: Record<BankStatementRowErrorCode, string> = {
  COLUMN_COUNT_MISMATCH: "จำนวนคอลัมน์ในแถวนี้ไม่ตรงกับแถวหัวตาราง",
  MISSING_REQUIRED_FIELD: "ข้อมูลที่จำเป็นในแถวนี้ไม่ครบ",
  INVALID_DATE: "รูปแบบวันที่ไม่ถูกต้องหรือเป็นวันที่ที่ไม่มีจริง",
  INVALID_AMOUNT: "รูปแบบจำนวนเงินไม่ถูกต้อง",
  TOO_MANY_DECIMAL_PLACES: "จำนวนเงินมีทศนิยมเกิน 2 ตำแหน่ง",
  INVALID_DEBIT: "รูปแบบยอดถอน/หักไม่ถูกต้อง",
  INVALID_CREDIT: "รูปแบบยอดฝาก/เข้าไม่ถูกต้อง",
  INVALID_DEBIT_CREDIT_COMBINATION: "แถวนี้มีทั้งยอดถอนและยอดฝากพร้อมกัน ซึ่งไม่ถูกต้อง",
  INVALID_DIRECTION_VALUE: "ค่าคอลัมน์ประเภทรายการ (ฝาก/ถอน) ไม่ถูกต้องหรือไม่รู้จัก",
  AMOUNT_DIRECTION_CONFLICT: "จำนวนเงินและคอลัมน์ทิศทางขัดแย้งกัน — ตรวจสอบการตั้งค่าคอลัมน์",
};

export function fileErrorMessage(code: BankStatementFileErrorCode): string {
  return FILE_ERROR_MESSAGES[code];
}

export function rowErrorMessage(code: BankStatementRowErrorCode): string {
  return ROW_ERROR_MESSAGES[code];
}

// ===== Limits (STEP C.3 §14 — MVP values, each with its own stated reason) =====

export interface CsvValidationLimits {
  maxFileSizeBytes: number;
  maxRows: number;
  maxColumns: number;
  maxCellLength: number;
  maxPreviewRows: number;
}

export const DEFAULT_CSV_LIMITS: CsvValidationLimits = {
  // Matches src/app/api/transactions/[id]/attachments/route.ts's existing MAX_IMAGE_SIZE_BYTES (10MB)
  // for consistency — generous for a CSV statement even at tens of thousands of rows as plain text.
  maxFileSizeBytes: 10 * 1024 * 1024,
  // A realistic annual statement for a very active small-business account (~50 txns/day * 365) is
  // ~18,250 rows; 50,000 gives headroom without being unbounded.
  maxRows: 50_000,
  // Real bank exports have well under 20 columns; 50 rejects a pathological file while giving
  // generous headroom.
  maxColumns: 50,
  // No legitimate date/amount/description/reference cell approaches this — exists specifically to
  // catch a pathological giant-quoted-field / runaway-embedded-newline attack, checked incrementally
  // during parsing (not after the fact) so a single malicious cell can't buffer unbounded memory.
  maxCellLength: 10_000,
  // Balances useful preview visibility against response-payload size; rows beyond this are still
  // counted in the summary totals, just not returned in full row-level detail.
  maxPreviewRows: 500,
};

// ===== CSV grammar parser (RFC-4180-safe state machine — no split(",")) =====

export interface CsvParseResult {
  rows: string[][] | null;
  fatalError: { code: BankStatementFileErrorCode; message: string } | null;
}

// A small character-by-character state machine. Handles: UTF-8 BOM (stripped before parsing begins —
// operates on the decoded string, not raw bytes, which is why this stays "pure" despite handling BOM:
// the caller already turned bytes into a JS string), quoted fields, "" as an escaped literal quote
// inside a quoted field, commas/newlines inside quoted fields treated as literal content (not
// delimiters), both CRLF and bare LF as row terminators, and an unterminated quote at EOF reported as
// MALFORMED_CSV_STRUCTURE rather than silently absorbing the rest of the file into one field.
//
// Row/column/cell-length limits are enforced INCREMENTALLY during the scan (not after building the
// full in-memory row array) specifically so a pathological file (a single multi-hundred-MB quoted
// cell with no closing quote, or millions of columns) is rejected as soon as the relevant limit is
// crossed, not after the parser has already tried to buffer the whole thing.
export function parseCsvText(text: string, limits: CsvValidationLimits = DEFAULT_CSV_LIMITS): CsvParseResult {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  if (withoutBom.trim().length === 0) {
    return { rows: null, fatalError: { code: "EMPTY_FILE", message: fileErrorMessage("EMPTY_FILE") } };
  }

  // Heuristic corrupt/undecodable-input detector: a real UTF-8 file that got mis-decoded produces a
  // dense run of U+FFFD replacement characters. A handful could legitimately appear in genuinely odd
  // source data, so this only fires above a small density threshold rather than on any occurrence.
  const replacementCharCount = (withoutBom.match(/�/g) || []).length;
  if (replacementCharCount > 10 && replacementCharCount / withoutBom.length > 0.001) {
    return {
      rows: null,
      fatalError: { code: "UNREADABLE_ENCODING", message: fileErrorMessage("UNREADABLE_ENCODING") },
    };
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let fieldHadOpeningQuote = false;

  function pushField() {
    if (currentField.length > limits.maxCellLength) {
      throw new LimitExceeded("CELL_TOO_LONG");
    }
    currentRow.push(currentField);
    currentField = "";
    fieldHadOpeningQuote = false;
  }

  function pushRow() {
    pushField();
    if (currentRow.length > limits.maxColumns) {
      throw new LimitExceeded("TOO_MANY_COLUMNS");
    }
    rows.push(currentRow);
    if (rows.length > limits.maxRows) {
      throw new LimitExceeded("TOO_MANY_ROWS");
    }
    currentRow = [];
  }

  class LimitExceeded {
    code: BankStatementFileErrorCode;
    constructor(code: BankStatementFileErrorCode) {
      this.code = code;
    }
  }

  try {
    let i = 0;
    const len = withoutBom.length;

    while (i < len) {
      const char = withoutBom[i];

      if (inQuotes) {
        if (char === '"') {
          if (withoutBom[i + 1] === '"') {
            // Escaped literal quote inside a quoted field.
            currentField += '"';
            i += 2;
            continue;
          }
          // Closing quote.
          inQuotes = false;
          i += 1;
          continue;
        }

        currentField += char;
        if (currentField.length > limits.maxCellLength) {
          throw new LimitExceeded("CELL_TOO_LONG");
        }
        i += 1;
        continue;
      }

      if (char === '"' && currentField.length === 0 && !fieldHadOpeningQuote) {
        inQuotes = true;
        fieldHadOpeningQuote = true;
        i += 1;
        continue;
      }

      if (char === ",") {
        pushField();
        i += 1;
        continue;
      }

      if (char === "\r") {
        // Only a row terminator when followed by \n (CRLF) or at EOF; a bare \r elsewhere is kept as
        // literal content (rare, but never silently dropped).
        if (withoutBom[i + 1] === "\n") {
          pushRow();
          i += 2;
          continue;
        }
        pushRow();
        i += 1;
        continue;
      }

      if (char === "\n") {
        pushRow();
        i += 1;
        continue;
      }

      currentField += char;
      if (currentField.length > limits.maxCellLength) {
        throw new LimitExceeded("CELL_TOO_LONG");
      }
      i += 1;
    }

    if (inQuotes) {
      // Unterminated quote spanning to EOF — the parser can no longer trust row boundaries.
      return {
        rows: null,
        fatalError: {
          code: "MALFORMED_CSV_STRUCTURE",
          message: fileErrorMessage("MALFORMED_CSV_STRUCTURE"),
        },
      };
    }

    // Final row (file may or may not end with a trailing newline).
    if (currentField.length > 0 || currentRow.length > 0) {
      pushRow();
    }
  } catch (error) {
    if (error instanceof LimitExceeded) {
      return { rows: null, fatalError: { code: error.code, message: fileErrorMessage(error.code) } };
    }
    throw error;
  }

  return { rows, fatalError: null };
}

// ===== Money parsing — STEP C.4 §5. String -> INTEGER satang, zero float arithmetic. =====

export interface MoneyParseResult {
  satang: number | null; // null only when the cell is legitimately empty and emptiness is allowed
  error: BankStatementRowErrorCode | null;
}

// Deliberately does NOT strip currency symbols or handle parenthetical-negative notation — STEP C.3
// §6 explicitly recommended against guessing either without real evidence of a Thai bank export using
// them. Only digits, thousands-comma-grouping, an optional leading '-', and an optional 1-2-digit
// decimal part are accepted; anything else is rejected as malformed rather than guessed at.
const MONEY_SHAPE_PATTERN = /^-?(\d{1,3}(,\d{3})*|\d+)(\.\d+)?$/;

export function parseMoneyToSatang(raw: string | undefined | null, allowEmpty: boolean): MoneyParseResult {
  const trimmed = typeof raw === "string" ? raw.trim() : "";

  if (!trimmed) {
    return allowEmpty ? { satang: null, error: null } : { satang: null, error: "INVALID_AMOUNT" };
  }

  if (!MONEY_SHAPE_PATTERN.test(trimmed)) {
    return { satang: null, error: "INVALID_AMOUNT" };
  }

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [integerPartRaw, fractionalPartRaw] = unsigned.split(".");
  const integerPart = integerPartRaw.replace(/,/g, "");

  if (fractionalPartRaw !== undefined && fractionalPartRaw.length > 2) {
    return { satang: null, error: "TOO_MANY_DECIMAL_PLACES" };
  }

  // Pure string manipulation only — the fractional part is right-padded to exactly 2 digits, then
  // concatenated with the integer part into one all-digit string, which is what actually gets
  // numerically parsed. This final parse is exact for any realistic magnitude (it is a plain integer
  // string with no decimal point), unlike parsing "1500.75" as a float and multiplying by 100.
  const fractionalPart = (fractionalPartRaw ?? "").padEnd(2, "0");
  const digitsOnly = `${integerPart}${fractionalPart}`;

  if (!/^\d+$/.test(digitsOnly)) {
    return { satang: null, error: "INVALID_AMOUNT" };
  }

  const satang = Number(digitsOnly) * (negative ? -1 : 1);

  if (!Number.isSafeInteger(satang)) {
    return { satang: null, error: "INVALID_AMOUNT" };
  }

  return { satang, error: null };
}

// ===== Date parsing — STEP C.4 §4. Explicit closed format set, never Date.parse()/new Date(string)
// used to INTERPRET the raw text — regex extracts the components first; Date is only used afterward,
// with already-known integer y/m/d, purely to validate that the calendar date is real (catches e.g.
// Feb 30 rolling over to March 2). =====

export type BankStatementDateFormat = "YYYY-MM-DD" | "DD/MM/YYYY" | "DD-MM-YYYY" | "YYYY/MM/DD";

export const SUPPORTED_DATE_FORMATS: BankStatementDateFormat[] = [
  "YYYY-MM-DD",
  "DD/MM/YYYY",
  "DD-MM-YYYY",
  "YYYY/MM/DD",
];

// MM/DD/YYYY (US convention) is deliberately NOT in SUPPORTED_DATE_FORMATS — STEP C.3 §5: supporting
// both DD/MM/YYYY and MM/DD/YYYY at once creates real, unresolvable ambiguity for any date where the
// day is <=12 (e.g. "03/04/2026"). The format is a property of the mapping/configuration, declared
// once per import, never guessed per row.

export interface DateParseResult {
  isoDate: string | null;
  error: "INVALID_DATE" | null;
}

// Sanity bound on the year component — rejects a stray Buddhist-Era year (e.g. 2569 for CE 2026)
// rather than silently accepting it as a wildly-wrong-but-technically-real CE calendar year. STEP
// C.3 §5 explicitly decided Buddhist Era is NOT supported without real evidence of a Thai bank export
// using it; this range check is what makes "not supported" an enforced rejection rather than a latent
// misinterpretation risk.
const MIN_REASONABLE_YEAR = 1900;
const MAX_REASONABLE_YEAR = 2200;

function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < MIN_REASONABLE_YEAR || year > MAX_REASONABLE_YEAR) return false;

  const check = new Date(Date.UTC(year, month - 1, day));

  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function parseDateToIso(raw: string, format: BankStatementDateFormat): DateParseResult {
  const trimmed = typeof raw === "string" ? raw.trim() : "";

  let match: RegExpExecArray | null;
  let year: number;
  let month: number;
  let day: number;

  switch (format) {
    case "YYYY-MM-DD":
      match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
      if (!match) return { isoDate: null, error: "INVALID_DATE" };
      year = Number(match[1]);
      month = Number(match[2]);
      day = Number(match[3]);
      break;
    case "DD/MM/YYYY":
      match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
      if (!match) return { isoDate: null, error: "INVALID_DATE" };
      day = Number(match[1]);
      month = Number(match[2]);
      year = Number(match[3]);
      break;
    case "DD-MM-YYYY":
      match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(trimmed);
      if (!match) return { isoDate: null, error: "INVALID_DATE" };
      day = Number(match[1]);
      month = Number(match[2]);
      year = Number(match[3]);
      break;
    case "YYYY/MM/DD":
      match = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(trimmed);
      if (!match) return { isoDate: null, error: "INVALID_DATE" };
      year = Number(match[1]);
      month = Number(match[2]);
      day = Number(match[3]);
      break;
    default:
      return { isoDate: null, error: "INVALID_DATE" };
  }

  if (!isRealCalendarDate(year, month, day)) {
    return { isoDate: null, error: "INVALID_DATE" };
  }

  return { isoDate: `${year}-${pad2(month)}-${pad2(day)}`, error: null };
}

// ===== Formula / content safety — STEP C.4 §8 =====

// Source values are NEVER mutated by this check — it only classifies. Defusing (if ever needed) is
// an export/display-boundary concern, not an ingest-time rewrite of source evidence (STEP C.3 §9 /
// docs/BANK_ACCOUNT_NUMBER_POLICY.md's no-silent-rewrite principle, extended here to statement text).
export function isFormulaLikeText(value: string): boolean {
  return /^[=+\-@]/.test(value);
}

// Only ever used at a future export/re-render boundary — never applied to the value that gets stored
// as source evidence.
export function toSafeSpreadsheetText(value: string): string {
  return isFormulaLikeText(value) ? `'${value}` : value;
}

// ===== Duplicate fingerprint — STEP C.4 §7. Deterministic: same input always produces the same
// fingerprint. Never description-alone or amount-alone — always this full composite. =====

export function computeDuplicateFingerprint(params: {
  bankAccountId: number;
  transactionDate: string;
  amount: number;
  description: string | null;
  occurrenceIndex: number;
}): string {
  const canonical = [
    params.bankAccountId,
    params.transactionDate,
    params.amount,
    (params.description ?? "").trim(),
    params.occurrenceIndex,
  ].join("|");

  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

// ===== Column mapping — STEP C.4 §3/§6. Explicit only, never guessed. =====

export type BankStatementMoneyStrategy =
  | { kind: "separate_columns"; debitColumn: string; creditColumn: string }
  | {
      kind: "amount_with_direction";
      amountColumn: string;
      directionColumn: string;
      creditValues: string[];
      debitValues: string[];
    }
  | { kind: "signed_amount"; amountColumn: string; positiveMeans: "credit" | "debit" };

export interface BankStatementColumnMapping {
  dateColumn: string;
  dateFormat: BankStatementDateFormat;
  descriptionColumn?: string;
  balanceColumn?: string;
  bankTransactionIdColumn?: string;
  referenceColumn?: string;
  money: BankStatementMoneyStrategy;
}

export interface CanonicalStatementRow {
  transactionDate: string;
  description: string | null;
  debit: number | null;
  credit: number | null;
  amount: number;
  balance: number | null;
  bankTransactionId: string | null;
  reference: string | null;
  // Populated by parseAndValidateStatementCsv() only (parseStatementRow() alone has no
  // bankAccountId/occurrence-index context to compute this) — "" until then.
  duplicateFingerprint: string;
}

export type BankStatementRowCategory = "NEW" | "INVALID" | "WARNING" | "INFORMATIONAL";
// "DUPLICATE_CANDIDATE" is intentionally not a value this pure module ever assigns — that
// classification requires a DB lookup (src/lib/bankStatements.ts, STEP C.4 §12), which this file
// cannot perform. The orchestration layer (future API route) merges this module's NEW/INVALID/
// WARNING/INFORMATIONAL classification with the DB-touching duplicate lookup to produce the final
// preview categories, including DUPLICATE_CANDIDATE.

export interface ParsedRowResult {
  rowNumber: number;
  category: BankStatementRowCategory;
  errorCode?: BankStatementRowErrorCode;
  message?: string;
  canonical?: CanonicalStatementRow;
  raw: Record<string, string>;
}

function getCell(headerIndex: Map<string, number>, cells: string[], columnName: string | undefined): string | undefined {
  if (!columnName) return undefined;
  const idx = headerIndex.get(columnName);
  if (idx === undefined) return undefined;
  return cells[idx];
}

// Applies one row's raw cells through the declared mapping and produces either a canonical row or a
// row-level error. Never throws — every failure path returns an INVALID/WARNING/INFORMATIONAL
// ParsedRowResult instead, so a single bad row can never abort parsing the rest of the file.
export function parseStatementRow(
  headerIndex: Map<string, number>,
  header: string[],
  cells: string[],
  rowNumber: number,
  mapping: BankStatementColumnMapping
): ParsedRowResult {
  const raw: Record<string, string> = {};
  header.forEach((name, idx) => {
    raw[name] = cells[idx] ?? "";
  });

  if (cells.length !== header.length) {
    return {
      rowNumber,
      category: "INVALID",
      errorCode: "COLUMN_COUNT_MISMATCH",
      message: rowErrorMessage("COLUMN_COUNT_MISMATCH"),
      raw,
    };
  }

  const rawDate = getCell(headerIndex, cells, mapping.dateColumn);
  if (!rawDate || !rawDate.trim()) {
    return {
      rowNumber,
      category: "INVALID",
      errorCode: "MISSING_REQUIRED_FIELD",
      message: rowErrorMessage("MISSING_REQUIRED_FIELD"),
      raw,
    };
  }

  const dateResult = parseDateToIso(rawDate, mapping.dateFormat);
  if (dateResult.error || !dateResult.isoDate) {
    return {
      rowNumber,
      category: "INVALID",
      errorCode: "INVALID_DATE",
      message: rowErrorMessage("INVALID_DATE"),
      raw,
    };
  }

  const description = mapping.descriptionColumn
    ? getCell(headerIndex, cells, mapping.descriptionColumn)?.trim() || null
    : null;
  const balanceRaw = mapping.balanceColumn ? getCell(headerIndex, cells, mapping.balanceColumn) : undefined;
  const bankTransactionId = mapping.bankTransactionIdColumn
    ? getCell(headerIndex, cells, mapping.bankTransactionIdColumn)?.trim() || null
    : null;
  const reference = mapping.referenceColumn
    ? getCell(headerIndex, cells, mapping.referenceColumn)?.trim() || null
    : null;

  let debit: number | null = null;
  let credit: number | null = null;
  let warning: string | undefined;

  if (mapping.money.kind === "separate_columns") {
    const debitResult = parseMoneyToSatang(getCell(headerIndex, cells, mapping.money.debitColumn), true);
    if (debitResult.error) {
      return {
        rowNumber,
        category: "INVALID",
        errorCode: "INVALID_DEBIT",
        message: rowErrorMessage("INVALID_DEBIT"),
        raw,
      };
    }

    const creditResult = parseMoneyToSatang(getCell(headerIndex, cells, mapping.money.creditColumn), true);
    if (creditResult.error) {
      return {
        rowNumber,
        category: "INVALID",
        errorCode: "INVALID_CREDIT",
        message: rowErrorMessage("INVALID_CREDIT"),
        raw,
      };
    }

    // Debit/credit COLUMNS are stored as non-negative magnitudes (matches src/lib/db.ts's schema —
    // neither column is documented as ever negative). A negative value in the source is a formatting
    // quirk, not a distinct signal from the column identity itself (Debit vs Credit already conveys
    // direction) — normalized to its absolute value and flagged, never silently dropped.
    if (debitResult.satang !== null && debitResult.satang < 0) {
      debit = Math.abs(debitResult.satang);
      warning = "พบค่าติดลบในคอลัมน์ยอดถอน — ระบบปรับเป็นค่าสัมบูรณ์ให้อัตโนมัติ";
    } else {
      debit = debitResult.satang;
    }

    if (creditResult.satang !== null && creditResult.satang < 0) {
      credit = Math.abs(creditResult.satang);
      warning = warning || "พบค่าติดลบในคอลัมน์ยอดฝาก — ระบบปรับเป็นค่าสัมบูรณ์ให้อัตโนมัติ";
    } else {
      credit = creditResult.satang;
    }
  } else if (mapping.money.kind === "amount_with_direction") {
    const amountResult = parseMoneyToSatang(getCell(headerIndex, cells, mapping.money.amountColumn), false);
    if (amountResult.error) {
      return {
        rowNumber,
        category: "INVALID",
        errorCode: amountResult.error === "TOO_MANY_DECIMAL_PLACES" ? "TOO_MANY_DECIMAL_PLACES" : "INVALID_AMOUNT",
        message: rowErrorMessage(amountResult.error),
        raw,
      };
    }

    const directionRaw = (getCell(headerIndex, cells, mapping.money.directionColumn) || "").trim();
    const magnitude = Math.abs(amountResult.satang ?? 0);

    if (mapping.money.creditValues.some((v) => v.toLowerCase() === directionRaw.toLowerCase())) {
      credit = magnitude;
    } else if (mapping.money.debitValues.some((v) => v.toLowerCase() === directionRaw.toLowerCase())) {
      debit = magnitude;
    } else {
      return {
        rowNumber,
        category: "INVALID",
        errorCode: "INVALID_DIRECTION_VALUE",
        message: rowErrorMessage("INVALID_DIRECTION_VALUE"),
        raw,
      };
    }
  } else {
    // signed_amount
    const amountResult = parseMoneyToSatang(getCell(headerIndex, cells, mapping.money.amountColumn), false);
    if (amountResult.error) {
      return {
        rowNumber,
        category: "INVALID",
        errorCode: amountResult.error === "TOO_MANY_DECIMAL_PLACES" ? "TOO_MANY_DECIMAL_PLACES" : "INVALID_AMOUNT",
        message: rowErrorMessage(amountResult.error),
        raw,
      };
    }

    const value = amountResult.satang ?? 0;
    const isPositive = value >= 0;
    const meansCredit =
      (mapping.money.positiveMeans === "credit" && isPositive) ||
      (mapping.money.positiveMeans === "debit" && !isPositive);

    if (meansCredit) {
      credit = Math.abs(value);
    } else {
      debit = Math.abs(value);
    }
  }

  if (debit !== null && debit > 0 && credit !== null && credit > 0) {
    return {
      rowNumber,
      category: "INVALID",
      errorCode: "INVALID_DEBIT_CREDIT_COMBINATION",
      message: rowErrorMessage("INVALID_DEBIT_CREDIT_COMBINATION"),
      raw,
    };
  }

  const balanceResult = balanceRaw !== undefined ? parseMoneyToSatang(balanceRaw, true) : { satang: null, error: null };
  if (balanceResult.error) {
    // Balance is supplementary, not required — a malformed balance cell degrades to "no balance
    // recorded for this row" (a warning) rather than invalidating an otherwise-good transaction row.
    warning = warning || "ไม่สามารถอ่านยอดคงเหลือในแถวนี้ได้ — ข้ามยอดคงเหลือสำหรับแถวนี้";
  }

  const isInformationalRow =
    (debit === null || debit === 0) && (credit === null || credit === 0);

  if (isInformationalRow) {
    return {
      rowNumber,
      category: "INFORMATIONAL",
      message: "แถวนี้ไม่มีมูลค่าเงิน (เช่น ยอดยกมา) — จะไม่ถูกนำเข้าเป็นรายการธุรกรรม",
      raw,
    };
  }

  const amount = (credit ?? 0) - (debit ?? 0);

  const canonical: CanonicalStatementRow = {
    transactionDate: dateResult.isoDate,
    description,
    debit,
    credit,
    amount,
    balance: balanceResult.error ? null : balanceResult.satang,
    bankTransactionId,
    reference,
    duplicateFingerprint: "",
  };

  return {
    rowNumber,
    category: warning ? "WARNING" : "NEW",
    message: warning,
    canonical,
    raw,
  };
}

// ===== Header validation =====

export function validateHeader(header: string[]): { code: BankStatementFileErrorCode; message: string } | null {
  if (header.length === 0 || header.every((h) => !h.trim())) {
    return { code: "MISSING_HEADER", message: fileErrorMessage("MISSING_HEADER") };
  }

  const seen = new Set<string>();
  for (const name of header) {
    const key = name.trim();
    if (seen.has(key)) {
      return { code: "DUPLICATE_HEADER", message: fileErrorMessage("DUPLICATE_HEADER") };
    }
    seen.add(key);
  }

  return null;
}

// ===== Top-level orchestrator (still pure) =====

export interface ParseAndValidateStatementCsvResult {
  fatalError: { code: BankStatementFileErrorCode; message: string } | null;
  header: string[] | null;
  rows: ParsedRowResult[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    warnings: number;
    informational: number;
  };
}

// Ties together grammar parsing -> header validation -> per-row mapping+validation ->
// fingerprint computation -> summary counts. Deliberately does NOT check duplicates against the
// DB (that is src/lib/bankStatements.ts's job, STEP C.4 §12) — every row this function returns as
// "NEW" is only "new with respect to this file's own content," not yet "confirmed new against
// everything already imported."
export function parseAndValidateStatementCsv(
  fileText: string,
  bankAccountId: number,
  mapping: BankStatementColumnMapping,
  limits: CsvValidationLimits = DEFAULT_CSV_LIMITS
): ParseAndValidateStatementCsvResult {
  const parsed = parseCsvText(fileText, limits);

  if (parsed.fatalError || !parsed.rows) {
    return {
      fatalError: parsed.fatalError,
      header: null,
      rows: [],
      summary: { total: 0, valid: 0, invalid: 0, warnings: 0, informational: 0 },
    };
  }

  const [header, ...dataRows] = parsed.rows;
  const headerError = validateHeader(header);

  if (headerError) {
    return {
      fatalError: headerError,
      header: null,
      rows: [],
      summary: { total: 0, valid: 0, invalid: 0, warnings: 0, informational: 0 },
    };
  }

  const headerIndex = new Map<string, number>();
  header.forEach((name, idx) => headerIndex.set(name.trim(), idx));

  const requiredColumns = [mapping.dateColumn];
  const missingColumns = requiredColumns.filter((col) => !headerIndex.has(col));
  if (missingColumns.length > 0) {
    return {
      fatalError: {
        code: "REQUIRED_COLUMN_NOT_MAPPED",
        message: fileErrorMessage("REQUIRED_COLUMN_NOT_MAPPED"),
      },
      header: null,
      rows: [],
      summary: { total: 0, valid: 0, invalid: 0, warnings: 0, informational: 0 },
    };
  }

  const occurrenceCounts = new Map<string, number>();
  const rows: ParsedRowResult[] = [];

  let valid = 0;
  let invalid = 0;
  let warnings = 0;
  let informational = 0;

  dataRows.forEach((cells, idx) => {
    const rowNumber = idx + 2; // +1 for 1-based, +1 for the header row itself
    const result = parseStatementRow(headerIndex, header, cells, rowNumber, mapping);

    if (result.category === "NEW" || result.category === "WARNING") {
      if (result.category === "WARNING") warnings += 1;
      else valid += 1;

      if (result.canonical) {
        const groupKey = [
          result.canonical.transactionDate,
          result.canonical.amount,
          (result.canonical.description ?? "").trim(),
        ].join("|");
        const occurrenceIndex = occurrenceCounts.get(groupKey) ?? 0;
        occurrenceCounts.set(groupKey, occurrenceIndex + 1);

        const fingerprint = computeDuplicateFingerprint({
          bankAccountId,
          transactionDate: result.canonical.transactionDate,
          amount: result.canonical.amount,
          description: result.canonical.description,
          occurrenceIndex,
        });

        rows.push({
          ...result,
          canonical: { ...result.canonical, duplicateFingerprint: fingerprint },
        });
        return;
      }
    } else if (result.category === "INVALID") {
      invalid += 1;
    } else if (result.category === "INFORMATIONAL") {
      informational += 1;
    }

    rows.push(result);
  });

  return {
    fatalError: null,
    header,
    rows,
    summary: {
      total: dataRows.length,
      valid,
      invalid,
      warnings,
      informational,
    },
  };
}
