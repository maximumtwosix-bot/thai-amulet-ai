// Bank Statement PDF Import — STEP E.4 — PDF row extraction engine. Pure/deterministic logic only,
// same convention as src/lib/bankStatementCsv.ts (STEP C.4): every exported function is
// (input) -> (structured output) — no DB, no filesystem, no HTTP call, no session/env read, no
// clock, no AI/OCR/network call of any kind.
//
// Architecture (docs/BANK_STATEMENT_PDF_IMPORT_POLICY.md §6):
//   extracted PDF text (src/lib/bankStatementPdf.ts's `pageLines`)
//     -> PDF row extraction (THIS FILE — header/footer filtering, wrapped-description joining,
//        row-pattern matching, locale date normalization)
//     -> CanonicalStatementRow[] fed through the EXISTING, UNMODIFIED validation
//        (bankStatementCsv.ts's parseStatementRow()/computeDuplicateFingerprint())
//     -> ParsedRowResult[] — the exact same output shape CSV import already produces, so a future
//        preview/confirm layer (STEP E.5+) can treat PDF and CSV results identically.
//
// This file deliberately does NOT modify, does NOT re-implement, and does NOT parallel any part of
// bankStatementCsv.ts's validation: it calls parseStatementRow()/computeDuplicateFingerprint()
// directly, unchanged, importing only what it needs. Money-shape validation (comma-grouped amounts,
// max 2 decimal places, debit/credit-both-populated conflict), duplicate fingerprinting, and
// Christian-Era numeric date validation (leap years, real calendar dates) are 100% reused, never
// duplicated — the only genuinely NEW logic in this file is what bankStatementCsv.ts correctly does
// NOT do: Thai-locale row segmentation (headers/footers/wrapped lines) and Buddhist-Era / Thai
// month-name date normalization (see normalizePdfDateToIso() below).
//
// CRITICAL FINANCIAL SAFETY (per this STEP's explicit instruction): this module never guesses.
// Every row layout (which regex marks a transaction start, which regex extracts which field, which
// date format, which money strategy) is supplied EXPLICITLY by the caller via BankStatementPdfRowLayout
// — never auto-detected from content, matching this codebase's "explicit mapping only" convention
// established since STEP C.1 §3/§10 for CSV. A line/row this module cannot structurally prove is a
// transaction (or a continuation of one) is emitted as an INVALID ParsedRowResult with a fixed,
// non-sensitive diagnostic message — never silently dropped, never guessed at, never merged with an
// unrelated row. Money direction (debit vs. credit) is NEVER inferred from description text (e.g.
// the word "โอน") — only from the debit/credit column split, an explicit amount sign, or an
// explicit direction column, exactly mirroring bankStatementCsv.ts's own money-strategy contract.

import {
  parseStatementRow,
  computeDuplicateFingerprint,
  parseDateToIso,
  type BankStatementColumnMapping,
  type BankStatementMoneyStrategy,
  type BankStatementDateFormat,
  type ParsedRowResult,
} from "./bankStatementCsv";

// ===== Date formats — STEP E.4. Extends bankStatementCsv.ts's own (unmodified) CE-numeric formats
// with Buddhist-Era and Thai-month-name variants that file correctly does NOT support (STEP C.1 §5
// — no evidence-free guessing of a locale convention it had no evidence for at the time). This
// module normalizes those THREE new formats deterministically (fixed lookup table / fixed regex,
// never a guess) into a Christian-Era string, then still runs the result through the REAL, reused
// parseDateToIso() for the actual calendar-validity check (leap years, day-in-month bounds) — this
// file never re-implements that check itself. =====

export type BankStatementPdfDateFormat =
  | BankStatementDateFormat // "YYYY-MM-DD" | "DD/MM/YYYY" | "DD-MM-YYYY" | "YYYY/MM/DD" — passed
  // straight through to the real parseDateToIso(), unchanged, zero PDF-specific logic involved.
  | "DD/MM/BBBB" // Buddhist Era, 4-digit year, slash separator — e.g. "01/01/2568"
  | "DD-MM-BBBB" // Buddhist Era, 4-digit year, dash separator — e.g. "01-01-2568"
  | "D_MMMTHAI_BBBB" // day + Thai month name/abbreviation + 4-digit BE year — e.g.
  // "1 มกราคม 2568" or "1 ม.ค. 2568"
  | "DD-MM-YY"; // Christian Era, 2-digit year, dash separator — e.g. "01-06-26". Added for one
  // specific, structurally-audited bank layout whose real statement was directly confirmed by the
  // account holder reviewing it (era stated explicitly, not inferred from the digits by this
  // module) to use Christian Era. See TWO_DIGIT_YEAR_CENTURY_BASE below for the fixed, deliberate,
  // documented century policy this format uses — never a sliding pivot-year heuristic.

// Deliberately NOT supported (documented limitation, not a silent gap — same posture as STEP C.1's
// own documented MM/DD/YYYY non-support): 2-digit Buddhist-Era years (e.g. "01/01/68") remain
// unsupported for exactly the reason below — "DD-MM-YY" above does NOT reopen this ambiguity; it
// exists only because a specific caller externally and explicitly confirmed the era (Christian Era)
// for one specific bank layout, and this module still never infers CE vs. BE from the digits
// themselves. Which century a bare 2-digit year belongs to is a real, unresolvable ambiguity this
// module refuses to guess at, exactly the same reasoning STEP C.1 §5 used to reject MM/DD/YYYY. A
// caller with 2-digit-BE-year statements must not use "DD-MM-YY" — there is no fallback that guesses.
const CE_NUMERIC_FORMATS = new Set<BankStatementDateFormat>(["YYYY-MM-DD", "DD/MM/YYYY", "DD-MM-YYYY", "YYYY/MM/DD"]);

function isCeNumericFormat(format: BankStatementPdfDateFormat): format is BankStatementDateFormat {
  return CE_NUMERIC_FORMATS.has(format as BankStatementDateFormat);
}

// Full names and the common dot-abbreviated forms only (e.g. "มกราคม" / "ม.ค.") — deliberately
// excludes two-letter no-dot abbreviations (e.g. a bare "มค") as those are less standardized and
// more prone to accidental collision; a layout needing that exact form is not supported by this
// STEP rather than guessed at.
const THAI_MONTHS: Record<string, number> = {
  "มกราคม": 1,
  "ม.ค.": 1,
  "กุมภาพันธ์": 2,
  "ก.พ.": 2,
  "มีนาคม": 3,
  "มี.ค.": 3,
  "เมษายน": 4,
  "เม.ย.": 4,
  "พฤษภาคม": 5,
  "พ.ค.": 5,
  "มิถุนายน": 6,
  "มิ.ย.": 6,
  "กรกฎาคม": 7,
  "ก.ค.": 7,
  "สิงหาคม": 8,
  "ส.ค.": 8,
  "กันยายน": 9,
  "ก.ย.": 9,
  "ตุลาคม": 10,
  "ต.ค.": 10,
  "พฤศจิกายน": 11,
  "พ.ย.": 11,
  "ธันวาคม": 12,
  "ธ.ค.": 12,
};

// Sorted longest-first so e.g. a full month name is never partially shadowed by a shorter
// alternative earlier in the alternation.
const THAI_MONTH_ALTERNATION = Object.keys(THAI_MONTHS)
  .sort((a, b) => b.length - a.length)
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const THAI_MONTH_DATE_PATTERN = new RegExp(`^(\\d{1,2})\\s+(${THAI_MONTH_ALTERNATION})\\s+(\\d{4})$`);

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function extractBuddhistEraComponents(
  trimmed: string,
  format: BankStatementPdfDateFormat
): { day: number; month: number; year: number } | null {
  if (format === "DD/MM/BBBB") {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
    if (!m) return null;
    return { day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) };
  }

  if (format === "DD-MM-BBBB") {
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(trimmed);
    if (!m) return null;
    return { day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) };
  }

  if (format === "D_MMMTHAI_BBBB") {
    const m = THAI_MONTH_DATE_PATTERN.exec(trimmed);
    if (!m) return null;
    const month = THAI_MONTHS[m[2]];
    if (!month) return null;
    return { day: Number(m[1]), month, year: Number(m[3]) };
  }

  return null;
}

// Fixed, deliberate century policy for the "DD-MM-YY" format — Christian Era only, a single
// unconditional constant, never a sliding pivot-year heuristic and never inferred from any
// transaction data. A 2-digit year YY is always interpreted as (2000 + YY). Scoped to one specific,
// structurally-audited bank layout with a confirmed statement year (2026) — not a general-purpose
// rule for "any 2-digit CE year anywhere"; revisit explicitly (never silently) if a caller's
// statements are ever dated outside CE 2000-2099.
const TWO_DIGIT_YEAR_CENTURY_BASE = 2000;

function extractTwoDigitCeYearComponents(trimmed: string): { day: number; month: number; year: number } | null {
  const m = /^(\d{2})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!m) return null;
  return { day: Number(m[1]), month: Number(m[2]), year: TWO_DIGIT_YEAR_CENTURY_BASE + Number(m[3]) };
}

export interface NormalizePdfDateResult {
  isoDate: string | null;
  error: "INVALID_DATE" | null;
}

// The only date-parsing entry point of this module. Never guesses DD/MM vs MM/DD (this module
// offers no MM/DD format at all, same posture as bankStatementCsv.ts). Buddhist-Era conversion
// (year - 543) is pure arithmetic on an already-unambiguously-parsed 4-digit year — never a
// century guess.
export function normalizePdfDateToIso(raw: string, format: BankStatementPdfDateFormat): NormalizePdfDateResult {
  const trimmed = typeof raw === "string" ? raw.trim() : "";

  if (!trimmed) {
    return { isoDate: null, error: "INVALID_DATE" };
  }

  if (isCeNumericFormat(format)) {
    return parseDateToIso(trimmed, format);
  }

  if (format === "DD-MM-YY") {
    const twoDigitYearComponents = extractTwoDigitCeYearComponents(trimmed);
    if (!twoDigitYearComponents) {
      return { isoDate: null, error: "INVALID_DATE" };
    }

    const twoDigitYearDateText = `${pad2(twoDigitYearComponents.day)}-${pad2(twoDigitYearComponents.month)}-${String(
      twoDigitYearComponents.year
    ).padStart(4, "0")}`;

    // Same reused, unmodified calendar-validity check as every other branch below — this format
    // gets no special treatment beyond the fixed century conversion above.
    return parseDateToIso(twoDigitYearDateText, "DD-MM-YYYY");
  }

  const components = extractBuddhistEraComponents(trimmed, format);
  if (!components) {
    return { isoDate: null, error: "INVALID_DATE" };
  }

  const ceYear = components.year - 543;
  const ceDateText = `${pad2(components.day)}-${pad2(components.month)}-${String(ceYear).padStart(4, "0")}`;

  // The REAL calendar-validity check (day exists in this month, not a stray Feb 30, etc.) happens
  // here, inside the reused, unmodified parseDateToIso() — this function never re-implements it.
  return parseDateToIso(ceDateText, "DD-MM-YYYY");
}

// ===== Row layout — explicit only, never guessed (same principle as
// bankStatementCsv.ts's BankStatementColumnMapping). =====

// Fixed set of semantic field names this module recognizes. A layout's `rowPattern` MUST use these
// exact strings as its named capture groups (e.g. `(?<date>...)`, `(?<debit>...)`) — this is the
// one naming convention every layout must follow; a group this module doesn't recognize is simply
// ignored, and a recognized field with no corresponding named group in the pattern is treated as
// not present on that layout (never an error by itself).
const PDF_ROW_FIELDS = [
  "date",
  "description",
  "debit",
  "credit",
  "amount",
  "direction",
  "balance",
  "reference",
  "bankTransactionId",
] as const;

export interface BankStatementPdfRowLayout {
  // Matched against every trimmed, non-blank line from every page, BEFORE any row/continuation
  // logic runs. A line matching ANY pattern here is discarded outright — never treated as a
  // transaction start, never appended as continuation/description content. This is how a
  // bank's column-header row and page-footer disclaimer (both reprinted on every page) are
  // deterministically ignored (Section B) without ever risking a phantom transaction.
  repeatedHeaderPatterns: RegExp[];
  repeatedFooterPatterns: RegExp[];
  // Matched against a single trimmed line. TRUE means "this line begins a new transaction" — the
  // sole, explicit, structural signal this module uses to decide where one transaction ends and
  // the next begins (and therefore also which lines are wrapped-description continuations: any
  // line that is not noise and does not match this pattern). Typically "this line starts with a
  // date in the declared dateFormat" — but the caller controls this precisely, never guessed.
  transactionStartPattern: RegExp;
  // Applied to the FULLY reassembled row text (transaction-start line + any wrapped continuation
  // lines already joined with a single space). Must have a named group `date`; other PDF_ROW_FIELDS
  // names are optional per layout. A match failure here (or a match missing `date`) makes the row
  // INVALID — this module never falls back to a looser pattern or a partial guess.
  rowPattern: RegExp;
  dateFormat: BankStatementPdfDateFormat;
  // Reused UNCHANGED from bankStatementCsv.ts — a PDF layout's money shape (separate debit/credit
  // columns, a signed single amount, or an amount + explicit direction column) is described with
  // exactly the same type CSV mapping already uses. `debitColumn`/`creditColumn`/`amountColumn`/
  // `directionColumn` here must name one of PDF_ROW_FIELDS ("debit"/"credit"/"amount"/"direction").
  money: BankStatementMoneyStrategy;
  // Optional — used ONLY when a layout's money direction cannot come from a genuinely separate
  // physical column (there isn't one) but IS structurally signaled by an exact, closed-set LEADING
  // TOKEN of the `description` field itself (a specific, structurally-audited bank layout's
  // confirmed fact — never a general assumption applied to every layout). When present, this module
  // derives a synthetic "direction" cell value from `description`'s leading token BEFORE calling
  // parseStatementRow() — see classifyDescriptionLeadingToken() below. The layout's own `money` must
  // then be `{ kind: "amount_with_direction", directionColumn: "direction", ... }` so the existing,
  // completely UNMODIFIED fail-closed handling already in bankStatementCsv.ts (an unmatched value ->
  // INVALID_DIRECTION_VALUE) is what actually enforces safety — this field only supplies a
  // correctly-isolated token to compare against; it adds no new safety check of its own.
  // Matching is EXACT ONLY: the leading whitespace-delimited token of `description` must equal one
  // of these strings verbatim — never a substring/prefix/fuzzy match, and never derived from any
  // other part of the description's free text.
  descriptionDirectionTypes?: {
    creditTypes: string[];
    debitTypes: string[];
  };
}

function resetRegexState(pattern: RegExp): RegExp {
  // Defensive only: a caller-supplied RegExp with the `g` (or `y`) flag is stateful across
  // `.test()`/`.exec()` calls via `lastIndex`, which would silently corrupt every later match in
  // this module's line-by-line loop. Layout patterns are documented as never needing `g`/`y` (every
  // match here is against one whole line/row string, never a multi-match scan) — this just makes
  // an accidental `g` flag harmless instead of a subtle, hard-to-diagnose bug.
  if (pattern.global || pattern.sticky) {
    pattern.lastIndex = 0;
  }
  return pattern;
}

function matchesAny(line: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => resetRegexState(pattern).test(line));
}

// Escapes a literal string for safe inclusion in a regex alternation — same escaping convention
// already used by THAI_MONTH_ALTERNATION above.
function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Extracts and classifies ONLY the leading whitespace-delimited token of `description` against an
// exact, developer-authored closed set (BankStatementPdfRowLayout.descriptionDirectionTypes) —
// never a substring/prefix/fuzzy match, never based on any text beyond that leading token. Returns
// "" (never a guess) when the leading token is not an exact member of either set; callers pass that
// "" through to the existing amount_with_direction handling in bankStatementCsv.ts, which already
// fails an unmatched direction value closed as INVALID_DIRECTION_VALUE — this function adds no new
// safety behavior of its own, it only isolates the correct substring to compare.
//
// Alternatives are sorted longest-first (same reason as THAI_MONTH_ALTERNATION: a shorter token that
// happens to be a literal prefix of a longer, different token must never shadow it) and the match is
// anchored so the token must be followed by whitespace or end-of-string — this is what rules out a
// longer, unlisted word that merely starts with a listed token from being misclassified as that
// token. Thai script has no ASCII \b word-boundary semantics, so this whitespace lookahead is used
// instead of \b.
function classifyDescriptionLeadingToken(
  description: string,
  types: { creditTypes: string[]; debitTypes: string[] }
): string {
  const allTypes = [...types.creditTypes, ...types.debitTypes].sort((a, b) => b.length - a.length);
  if (allTypes.length === 0) return "";

  const alternation = allTypes.map(escapeRegExpLiteral).join("|");
  const leadingTokenPattern = new RegExp(`^(${alternation})(?=\\s|$)`);
  const match = leadingTokenPattern.exec(description.trim());

  return match ? match[1] : "";
}

// A lone "-" is a common PDF-typography placeholder for "no value in this column" on a printed Thai
// bank statement (an empty debit/credit/balance cell rendered as a dash rather than left visually
// blank). Normalized to a true empty string ONLY for money-shaped fields, so it flows into
// bankStatementCsv.ts's own parseMoneyToSatang(raw, allowEmpty=true) exactly like a genuinely blank
// CSV cell — never converted to "0", never treated as a value. A leading "+" on a signed `amount`
// field is stripped for the same reason it is accepted here at all: "+2,500.00" and "2,500.00"
// denote the identical quantity (explicit-positive is not information beyond the sign that is
// already the default for an unsigned positive number) — bankStatementCsv.ts's own money-shape
// regex has never accepted a leading "+" (only an optional leading "-"), so this reflects a real,
// pre-existing constraint of the reused validator, not a new one invented here.
function normalizeCellText(raw: string | undefined, fieldName: (typeof PDF_ROW_FIELDS)[number]): string {
  if (raw === undefined) return "";

  let text = raw.trim();

  if ((fieldName === "debit" || fieldName === "credit" || fieldName === "amount" || fieldName === "balance") && text === "-") {
    text = "";
  }

  if (fieldName === "amount" && text.startsWith("+")) {
    text = text.slice(1);
  }

  return text;
}

// Defensive safety limit (same spirit as bankStatementCsv.ts's maxRows/maxColumns/maxCellLength —
// generous for any realistic wrapped description, but never unbounded) against a pathological or
// misconfigured input where transactionStartPattern never matches again, which would otherwise
// accumulate the rest of the document into one ever-growing "row".
const MAX_CONTINUATION_LINES = 20;

export interface ExtractStatementRowsFromPdfResult {
  rows: ParsedRowResult[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    warnings: number;
    informational: number;
  };
}

// The main entry point of this module. `pageLines` is exactly
// src/lib/bankStatementPdf.ts's ExtractPdfTextResult.pageLines (one array of reconstructed lines
// per page, in reading order) — this function has no idea a PDF or pdfjs-dist exists; it only ever
// sees already-extracted line strings, keeping PDF decrypt/extract and row extraction fully
// separate (this STEP's explicit "PDF extraction และ row extraction ต้องแยกกัน" requirement).
export function extractStatementRowsFromPdfText(
  pageLines: string[][],
  bankAccountId: number,
  layout: BankStatementPdfRowLayout
): ExtractStatementRowsFromPdfResult {
  // Flattened across all pages BEFORE row/continuation logic runs, with noise (repeated
  // header/footer lines) already stripped — this is what lets a wrapped description continue
  // correctly across a page boundary (Section B) without the intervening footer/next-page-header
  // ever being mistaken for either a new transaction or part of the description, and without ever
  // creating a duplicate transaction merely because a page boundary fell in the middle of one.
  const allLines: string[] = [];

  for (const linesOnPage of pageLines) {
    for (const rawLine of linesOnPage) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;
      if (matchesAny(trimmed, layout.repeatedHeaderPatterns)) continue;
      if (matchesAny(trimmed, layout.repeatedFooterPatterns)) continue;
      allLines.push(trimmed);
    }
  }

  const rows: ParsedRowResult[] = [];
  const occurrenceCounts = new Map<string, number>();
  let valid = 0;
  let invalid = 0;
  let warnings = 0;
  let informational = 0;

  const transactionStart = resetRegexState(layout.transactionStartPattern);

  let i = 0;
  while (i < allLines.length) {
    const rowNumber = i + 1; // 1-based position within the noise-filtered line stream — see
    // BankStatementPdfRowLayout's docs for why this is not a literal PDF page/line number.
    const line = allLines[i];

    if (!transactionStart.test(line)) {
      // Never silently dropped: a non-noise line that is neither a recognized transaction start
      // nor consumed as a prior row's continuation (this branch only runs when i is not already
      // inside a continuation scan below) means this module cannot prove what this line is —
      // emitted as its own INVALID row for human review rather than guessed at or discarded.
      rows.push({
        rowNumber,
        category: "INVALID",
        message: "PDF_UNRECOGNIZED_LINE: ไม่สามารถระบุได้ว่าบรรทัดนี้เป็นส่วนหนึ่งของธุรกรรมใด",
        raw: { line },
      });
      invalid += 1;
      i += 1;
      continue;
    }

    let combined = line;
    let consumed = 1;

    while (
      i + consumed < allLines.length &&
      !transactionStart.test(allLines[i + consumed]) &&
      consumed <= MAX_CONTINUATION_LINES
    ) {
      combined += ` ${allLines[i + consumed]}`;
      consumed += 1;
    }

    if (consumed > MAX_CONTINUATION_LINES) {
      rows.push({
        rowNumber,
        category: "INVALID",
        message: "PDF_ROW_TOO_MANY_CONTINUATION_LINES: จำนวนบรรทัดต่อเนื่องของแถวนี้เกินขีดจำกัดที่กำหนด",
        raw: { line: combined },
      });
      invalid += 1;
      i += consumed;
      continue;
    }

    const match = resetRegexState(layout.rowPattern).exec(combined);

    if (!match || !match.groups?.date) {
      rows.push({
        rowNumber,
        category: "INVALID",
        message: "PDF_UNRECOGNIZED_ROW_STRUCTURE: ไม่สามารถจับคู่โครงสร้างแถวธุรกรรมกับรูปแบบที่กำหนดได้",
        raw: { line: combined },
      });
      invalid += 1;
      i += consumed;
      continue;
    }

    const groups = match.groups;
    const dateResult = normalizePdfDateToIso(groups.date, layout.dateFormat);

    if (!dateResult.isoDate) {
      rows.push({
        rowNumber,
        category: "INVALID",
        message: "PDF_INVALID_DATE: ไม่สามารถตีความวันที่ในแถวนี้ได้ หรือไม่ใช่วันที่จริง",
        raw: { line: combined },
      });
      invalid += 1;
      i += consumed;
      continue;
    }

    // Bank-specific direction override (see BankStatementPdfRowLayout.descriptionDirectionTypes'
    // own doc comment): only computed when a layout declares it — GENERIC_..., which does not
    // declare it, is completely unaffected and falls through to the existing
    // normalizeCellText(groups["direction"], "direction") behavior exactly as before (always "",
    // since GENERIC_...'s rowPattern has no "direction" named group at all).
    const directionOverride = layout.descriptionDirectionTypes
      ? classifyDescriptionLeadingToken(groups.description ?? "", layout.descriptionDirectionTypes)
      : undefined;

    const header = [...PDF_ROW_FIELDS];
    const headerIndex = new Map<string, number>(header.map((name, idx) => [name, idx]));
    const cells = header.map((name) => {
      if (name === "date") return dateResult.isoDate!;
      if (name === "direction" && directionOverride !== undefined) return directionOverride;
      return normalizeCellText(groups[name], name);
    });

    const mapping: BankStatementColumnMapping = {
      dateColumn: "date",
      dateFormat: "YYYY-MM-DD", // cells already carry the normalized ISO date — see comment above
      // normalizePdfDateToIso(). parseStatementRow() re-validating an already-valid ISO string here
      // is a harmless, cheap double-check, not redundant business logic of this module's own.
      descriptionColumn: "description",
      balanceColumn: "balance",
      bankTransactionIdColumn: "bankTransactionId",
      referenceColumn: "reference",
      money: layout.money,
    };

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

        rows.push({ ...result, canonical: { ...result.canonical, duplicateFingerprint: fingerprint } });
      } else {
        rows.push(result);
      }
    } else if (result.category === "INFORMATIONAL") {
      informational += 1;
      rows.push(result);
    } else {
      invalid += 1;
      rows.push(result);
    }

    i += consumed;
  }

  return {
    rows,
    summary: {
      total: rows.length,
      valid,
      invalid,
      warnings,
      informational,
    },
  };
}
