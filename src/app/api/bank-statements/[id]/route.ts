import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import db from "@/lib/db";
import { getBankAccountById } from "@/lib/bankAccounts";
import {
  getBankStatementById,
  findBankStatementTransactionByBankId,
  findBankStatementTransactionByFingerprint,
  type BankStatementRow,
} from "@/lib/bankStatements";
import {
  parseAndValidateStatementCsv,
  DEFAULT_CSV_LIMITS,
  type BankStatementColumnMapping,
  type ParsedRowResult,
} from "@/lib/bankStatementCsv";
// STEP E.6.1 — PDF branch, additive alongside the CSV path below. bankStatementCsv.ts itself is not
// imported any differently than before, and validateMappingShape() (CSV-specific, below) is never
// called with PDF data.
import { extractPdfText, pdfFileErrorMessage } from "@/lib/bankStatementPdf";
import { extractStatementRowsFromPdfText } from "@/lib/bankStatementPdfRows";
import { isKnownPdfLayoutId, getPdfStatementLayout } from "@/lib/bankStatementPdfLayouts";

export const runtime = "nodejs";

// STEP C.6 — read-only detail + row-level review for one statement. This is what lets a
// PREVIEW_READY statement be reopened/reviewed after a refresh/browser-back/reopened tab (STEP C.5's
// audit finding, closed here): the row-level preview is never persisted (STEP C.2/C.4's design is
// deliberately unchanged — bank_statement_transactions stays exclusively "confirmed, immutable
// evidence"), so a PREVIEW_READY statement's rows are reconstructed on demand by re-reading the
// already-stored file and re-running the SAME pure, deterministic CSV engine against the NOW-PERSISTED
// mapping (STEP C.6's schema addition) — same file + same mapping always produces the same rows, so
// this is not a guess or an approximation, it is the exact same computation the original preview did.
// This route performs ZERO writes of any kind — no db.transaction(), no INSERT/UPDATE statement
// anywhere in this file — reading it can never advance, corrupt, or replay anything confirm owns.

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(idParam: string): number | null {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function errorToResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";

  if (message === "BANK_STATEMENT_NOT_FOUND") {
    return NextResponse.json({ success: false, error: "ไม่พบ Bank Statement นี้" }, { status: 404 });
  }

  if (message === "MAPPING_NOT_PERSISTED") {
    return NextResponse.json(
      {
        success: false,
        error: "ไม่พบข้อมูลการตั้งค่าคอลัมน์ของ Bank Statement นี้ ไม่สามารถแสดงตัวอย่างซ้ำได้",
      },
      { status: 409 }
    );
  }

  if (message === "SOURCE_FILE_UNREADABLE") {
    return NextResponse.json(
      { success: false, error: "ไม่สามารถอ่านไฟล์ต้นฉบับได้" },
      { status: 409 }
    );
  }

  console.error("Bank statement detail API error:", error);

  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

// STEP C.6 — same masking logic duplicated a third time (bank-accounts/route.ts,
// bank-accounts/[id]/route.ts, bank-statements/route.ts) — same established small-duplication
// convention, "ห้ามทำ large refactor" applies here too.
function maskAccountNumber(accountNumber: string): string {
  if (!accountNumber) return "••••";
  return `••••${accountNumber.slice(-4)}`;
}

function isValidDateFormat(value: unknown): value is BankStatementColumnMapping["dateFormat"] {
  return (
    value === "YYYY-MM-DD" ||
    value === "DD/MM/YYYY" ||
    value === "DD-MM-YYYY" ||
    value === "YYYY/MM/DD"
  );
}

// Same shape validator duplicated a third time (route.ts, [id]/confirm/route.ts) — used here
// DEFENSIVELY on the PERSISTED mapping (never trust even our own past JSON blindly, matching this
// codebase's general defensive-parsing convention elsewhere) before using it to re-parse.
function validateMappingShape(value: unknown): BankStatementColumnMapping | null {
  if (!value || typeof value !== "object") return null;
  const m = value as Record<string, unknown>;

  if (typeof m.dateColumn !== "string" || !m.dateColumn.trim()) return null;
  if (!isValidDateFormat(m.dateFormat)) return null;
  if (m.descriptionColumn !== undefined && typeof m.descriptionColumn !== "string") return null;
  if (m.balanceColumn !== undefined && typeof m.balanceColumn !== "string") return null;
  if (m.bankTransactionIdColumn !== undefined && typeof m.bankTransactionIdColumn !== "string") return null;
  if (m.referenceColumn !== undefined && typeof m.referenceColumn !== "string") return null;

  const money = m.money as Record<string, unknown> | undefined;
  if (!money || typeof money !== "object") return null;

  if (money.kind === "separate_columns") {
    if (typeof money.debitColumn !== "string" || typeof money.creditColumn !== "string") return null;
  } else if (money.kind === "amount_with_direction") {
    if (
      typeof money.amountColumn !== "string" ||
      typeof money.directionColumn !== "string" ||
      !Array.isArray(money.creditValues) ||
      !Array.isArray(money.debitValues) ||
      !money.creditValues.every((v) => typeof v === "string") ||
      !money.debitValues.every((v) => typeof v === "string")
    ) {
      return null;
    }
  } else if (money.kind === "signed_amount") {
    if (
      typeof money.amountColumn !== "string" ||
      (money.positiveMeans !== "credit" && money.positiveMeans !== "debit")
    ) {
      return null;
    }
  } else {
    return null;
  }

  return {
    dateColumn: m.dateColumn,
    dateFormat: m.dateFormat,
    descriptionColumn: m.descriptionColumn as string | undefined,
    balanceColumn: m.balanceColumn as string | undefined,
    bankTransactionIdColumn: m.bankTransactionIdColumn as string | undefined,
    referenceColumn: m.referenceColumn as string | undefined,
    money: money as BankStatementColumnMapping["money"],
  };
}

// Same duplicate-candidate reclassification as the other two route files — read-only, used here only
// to reconstruct what the ORIGINAL preview would have shown, never to write anything.
function classifyDuplicates(
  bankAccountId: number,
  rows: ParsedRowResult[]
): { rows: ParsedRowResult[]; duplicateCount: number } {
  let duplicateCount = 0;

  const classified = rows.map((row) => {
    if ((row.category !== "NEW" && row.category !== "WARNING") || !row.canonical) {
      return row;
    }

    if (row.canonical.bankTransactionId) {
      const existing = findBankStatementTransactionByBankId(bankAccountId, row.canonical.bankTransactionId);
      if (existing) {
        duplicateCount += 1;
        return {
          ...row,
          category: "DUPLICATE_CANDIDATE" as const,
          message: "พบเลขอ้างอิงธุรกรรมนี้ในระบบแล้ว (ธนาคารระบุ ID ซ้ำ)",
        };
      }
    }

    const existing = findBankStatementTransactionByFingerprint(
      bankAccountId,
      row.canonical.duplicateFingerprint
    );
    if (existing) {
      duplicateCount += 1;
      return {
        ...row,
        category: "DUPLICATE_CANDIDATE" as const,
        message: "รายการนี้มีลักษณะตรงกับรายการที่มีอยู่แล้วในระบบ",
      };
    }

    return row;
  });

  return { rows: classified as ParsedRowResult[], duplicateCount };
}

// STEP E.6.1 — never throws (unlike a bare JSON.parse() call) — used for the display-only `mapping`
// field below, for BOTH CSV and PDF statements alike (this column has always stored opaque JSON
// text for either format, src/lib/bankStatements.ts's own BankStatementRow.columnMapping comment).
// A statement whose stored text somehow isn't valid JSON now degrades to `mapping: null` instead of
// taking down the whole request with an uncaught exception — a pure robustness improvement with no
// behavior change for the (only-ever-seen-in-practice) valid-JSON case.
function safeJsonParseOrNull(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// STEP E.6.1 — the ONE entry in src/lib/bankStatementPdfLayouts.ts's trusted registry this read-only
// route will ever use to reconstruct a PDF statement's row-level preview. GET never accepts a
// client-supplied layoutId (there is no query-string or body channel for one that wouldn't repeat
// the exact "client chooses parsing rules" mistake STEP E.6 fixed for Confirm) — this is a fixed,
// compile-time-known constant, not configuration. isKnownPdfLayoutId() below is still checked
// explicitly rather than assumed, so a future rename/removal of this registry entry fails safely
// here instead of silently reading `undefined` from the registry map.
const DEFAULT_PDF_LAYOUT_ID = "GENERIC_DATE_DESC_DEBIT_CREDIT_BALANCE_V1";

// STEP C.6 §8 — plain offset/limit pagination, matching every other list function in this codebase
// (no cursor pagination exists anywhere here) and STEP C.4's own maxPreviewRows precedent for what
// "a page" of statement rows means. No new index added — IMPORTED rows are already served by
// idx_bank_statement_transactions_statement_id (STEP C.2); PREVIEW_READY rows involve no SQL query
// on the transaction table at all (pure in-memory re-parse + slice).
function parsePagination(searchParams: URLSearchParams): { page: number; pageSize: number } {
  const pageParam = Number(searchParams.get("page") || "1");
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const pageSizeParam = Number(searchParams.get("pageSize") || String(DEFAULT_CSV_LIMITS.maxPreviewRows));
  const pageSize =
    Number.isInteger(pageSizeParam) && pageSizeParam > 0
      ? Math.min(pageSizeParam, DEFAULT_CSV_LIMITS.maxPreviewRows)
      : DEFAULT_CSV_LIMITS.maxPreviewRows;

  return { page, pageSize };
}

// STEP E.6.1 — PDF branch of the PREVIEW_READY reconstruction. Read-only, same as the CSV branch it
// sits alongside: no db.transaction(), no INSERT/UPDATE anywhere in this function.
//
// CRITICAL DIFFERENCE FROM THE CSV BRANCH, BY NECESSITY: a GET request has no password (there is no
// query-string-password channel — docs/BANK_STATEMENT_PDF_IMPORT_POLICY.md §3 explicitly forbids
// one — and no established GET-with-body convention anywhere in this codebase), so this function can
// only ever call extractPdfText() WITHOUT a password. For an unencrypted PDF that is enough to fully
// reconstruct row-level detail, exactly like CSV. For a password-protected PDF, decryption fails
// with PASSWORD_REQUIRED — handled below by degrading gracefully to the already-persisted
// metadata/summary (computed and stored by the upload/confirm flow itself, genuinely trustworthy
// DB state, not a guess) with an empty row list and a `pdfRequiresPasswordForPreview` flag, rather
// than either (a) failing the whole request, or (b) inventing a way to obtain a password this
// endpoint was never meant to have. Row-level detail for an encrypted PDF remains available via
// Confirm (STEP E.6), which legitimately accepts a freshly-entered password for exactly this reason.
//
// Row extraction, when it does run, uses ONLY the trusted server-side registry
// (src/lib/bankStatementPdfLayouts.ts) — never `statement.columnMapping` (the client's original,
// arbitrary-regex STEP E.5 upload submission), matching STEP E.6's Confirm-route fix applied here to
// the read-only preview path as well. `mapping` in the returned shape is always `null` for a PDF
// statement — exposing the client's original raw regex there would misrepresent what actually
// governs this response.
async function buildPdfPreviewData(
  statement: BankStatementRow,
  base: Record<string, unknown>,
  page: number,
  pageSize: number
): Promise<Record<string, unknown>> {
  const emptyPagination = { page: 1, pageSize, total: 0, hasNext: false, hasPrevious: false };
  const persistedSummary = {
    total: statement.rowCountTotal,
    valid: statement.rowCountValid,
    invalid: statement.rowCountInvalid,
    duplicate: statement.rowCountDuplicate,
  };

  if (!isKnownPdfLayoutId(DEFAULT_PDF_LAYOUT_ID)) {
    // Defensive only — see DEFAULT_PDF_LAYOUT_ID's own comment for why this should be unreachable.
    // Fails safely with a fixed diagnostic rather than falling back to any looser interpretation.
    return {
      ...base,
      mapping: null,
      fatalError: {
        code: "PDF_LAYOUT_NOT_TRUSTED",
        message: "ไม่พบรูปแบบ PDF ที่เชื่อถือได้สำหรับแสดงตัวอย่างนี้",
      },
      summary: persistedSummary,
      pagination: emptyPagination,
      rows: [],
    };
  }

  const layout = getPdfStatementLayout(DEFAULT_PDF_LAYOUT_ID)!;

  const filePath = path.join(process.cwd(), "public", statement.sourceFileUrl.replace(/^\/+/, ""));

  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch {
    throw new Error("SOURCE_FILE_UNREADABLE");
  }

  const extracted = await extractPdfText(buffer, undefined);

  if (extracted.error === "PASSWORD_REQUIRED") {
    return {
      ...base,
      mapping: null,
      summary: persistedSummary,
      pagination: emptyPagination,
      rows: [],
      pdfRequiresPasswordForPreview: true,
    };
  }

  if (extracted.error) {
    // Any other extraction failure (e.g. the stored file changed after preview) — should not happen
    // in practice for an already-PREVIEW_READY statement; handled defensively, same posture as the
    // CSV branch's own reparsed.fatalError case just below this function's call site.
    return {
      ...base,
      mapping: null,
      fatalError: { code: extracted.error, message: pdfFileErrorMessage(extracted.error) },
      summary: persistedSummary,
      pagination: emptyPagination,
      rows: [],
    };
  }

  const reparsed = extractStatementRowsFromPdfText(extracted.pageLines ?? [], statement.bankAccountId, layout);
  const { rows: classifiedRows, duplicateCount } = classifyDuplicates(statement.bankAccountId, reparsed.rows);

  const total = classifiedRows.length;
  const pageStart = (page - 1) * pageSize;
  const pageRows = classifiedRows.slice(pageStart, pageStart + pageSize);

  return {
    ...base,
    mapping: null,
    summary: {
      total: reparsed.summary.total,
      valid: reparsed.summary.valid - duplicateCount >= 0 ? reparsed.summary.valid - duplicateCount : 0,
      invalid: reparsed.summary.invalid,
      duplicate: duplicateCount,
    },
    pagination: {
      page,
      pageSize,
      total,
      hasNext: page * pageSize < total,
      hasPrevious: page > 1,
    },
    rows: pageRows,
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json({ success: false, error: "Invalid bank statement ID" }, { status: 400 });
    }

    const statement = getBankStatementById(id);
    if (!statement) {
      throw new Error("BANK_STATEMENT_NOT_FOUND");
    }

    // STEP C.6 §6/§13 — bankAccountId used anywhere below is ALWAYS derived from the statement row
    // itself, never from any client-supplied parameter — there is none in this GET request to begin
    // with. This is a single-admin system (confirmed throughout STEP B/C — no per-user/per-account
    // privilege boundary exists anywhere else in this codebase either); the one authenticated admin
    // already has full legitimate access to every statement via GET /api/bank-statements regardless,
    // so there is no meaningful "cross-account" access to deny beyond what proxy.ts's session gate
    // already denies to an unauthenticated caller.
    const account = getBankAccountById(statement.bankAccountId);

    const { searchParams } = new URL(request.url);
    const { page, pageSize } = parsePagination(searchParams);

    // STEP C.6 §14 — sourceFileUrl/sourceFileHash are deliberately NEVER included in this response —
    // no filesystem/storage path exposure, matching this STEP's explicit instruction. If a future
    // step needs to let the user view/download the original file, that is a separate, explicit
    // decision — not silently added here.
    const base = {
      id: statement.id,
      bankAccountId: statement.bankAccountId,
      bankName: account?.bankName ?? null,
      accountName: account?.accountName ?? null,
      accountNumberMasked: account ? maskAccountNumber(account.accountNumber) : null,
      sourceFileName: statement.sourceFileName,
      // STEP E.6.1 addition — read from the statement row itself (trusted DB state, set once at
      // upload time by src/app/api/bank-statements/route.ts, STEP E.5), never from this request's
      // query string/body — there is no `sourceFileType` request parameter anywhere in this route
      // for a client to supply in the first place. Purely additive to this response shape: an
      // existing CSV consumer that doesn't look for this field is unaffected.
      sourceFileType: statement.sourceFileType,
      status: statement.status,
      statementPeriodFrom: statement.statementPeriodFrom,
      statementPeriodTo: statement.statementPeriodTo,
      errorSummary: statement.errorSummary,
      importedAt: statement.importedAt,
      createdAt: statement.createdAt,
      updatedAt: statement.updatedAt,
    };

    if (statement.status === "IMPORTED") {
      // Ground truth: the real, immutable, persisted rows. Paginated via a real SQL query — no
      // in-memory re-parse needed or performed for an already-imported statement.
      const totalRow = db
        .prepare("SELECT COUNT(*) AS c FROM bank_statement_transactions WHERE bank_statement_id = ?")
        .get(id) as { c: number };
      const total = totalRow.c;

      const rows = db
        .prepare(
          `
          SELECT id, raw_row_index, transaction_date, description, debit, credit, amount, balance,
                 bank_transaction_id
          FROM bank_statement_transactions
          WHERE bank_statement_id = ?
          ORDER BY raw_row_index ASC, id ASC
          LIMIT ? OFFSET ?
          `
        )
        .all(id, pageSize, (page - 1) * pageSize) as Array<{
        id: number;
        raw_row_index: number | null;
        transaction_date: string;
        description: string | null;
        debit: number | null;
        credit: number | null;
        amount: number;
        balance: number | null;
        bank_transaction_id: string | null;
      }>;

      return NextResponse.json({
        success: true,
        data: {
          ...base,
          mapping: safeJsonParseOrNull(statement.columnMapping),
          summary: {
            total: statement.rowCountTotal,
            valid: statement.rowCountValid,
            invalid: statement.rowCountInvalid,
            duplicate: statement.rowCountDuplicate,
          },
          pagination: {
            page,
            pageSize,
            total,
            hasNext: page * pageSize < total,
            hasPrevious: page > 1,
          },
          rows: rows.map((r) => ({
            // STEP D.7-blocker-fix — bank_statement_transactions.id, the real DB primary key,
            // exposed here for the first time. Named to match POST /api/reconciliation/suggest's
            // own `bankStatementTransactionId` request field exactly (src/app/api/reconciliation/
            // suggest/route.ts) — the only existing consumer this field is being added for — rather
            // than a generic `id`, so a client can pass this value straight through unchanged.
            // Deliberately NOT named `bankTransactionId` — that name is already taken on this same
            // row by the bank-provided reference string below and means something entirely
            // different (a nullable TEXT identifier from the source file, not this row's PK).
            bankStatementTransactionId: r.id,
            rowNumber: r.raw_row_index,
            date: r.transaction_date,
            description: r.description,
            debit: r.debit,
            credit: r.credit,
            amount: r.amount,
            balance: r.balance,
            bankTransactionId: r.bank_transaction_id,
            category: "IMPORTED" as const,
          })),
        },
      });
    }

    if (statement.status === "PREVIEW_READY") {
      // STEP E.6.1 — format branch decision, from TRUSTED DB state only (statement.sourceFileType,
      // read above from the database, never from this request's query string/body) — a client
      // cannot make a PDF statement take the CSV path (or vice versa) by shaping their request a
      // certain way. Everything below this block, for a CSV statement, is BYTE-FOR-BYTE UNCHANGED
      // from before this STEP.
      if (statement.sourceFileType === "PDF") {
        return NextResponse.json({
          success: true,
          data: await buildPdfPreviewData(statement, base, page, pageSize),
        });
      }

      // STEP C.6 — on-demand reconstruction, never a stored preview. Re-reads the same file confirm
      // itself re-reads, using the mapping persisted at upload time (STEP C.6's schema addition) —
      // no client input is used to interpret the file in any way, matching confirm's own
      // never-trust-the-client principle extended to this read-only endpoint.
      if (!statement.columnMapping) {
        throw new Error("MAPPING_NOT_PERSISTED");
      }

      const mapping = validateMappingShape(JSON.parse(statement.columnMapping));
      if (!mapping) {
        throw new Error("MAPPING_NOT_PERSISTED");
      }

      const filePath = path.join(process.cwd(), "public", statement.sourceFileUrl.replace(/^\/+/, ""));

      let buffer: Buffer;
      try {
        buffer = await readFile(filePath);
      } catch {
        throw new Error("SOURCE_FILE_UNREADABLE");
      }

      const fileText = buffer.toString("utf8");
      const reparsed = parseAndValidateStatementCsv(
        fileText,
        statement.bankAccountId,
        mapping,
        DEFAULT_CSV_LIMITS
      );

      if (reparsed.fatalError) {
        // Should not happen in practice (the same file+mapping already produced PREVIEW_READY once,
        // deterministically) — handled defensively rather than assumed impossible.
        return NextResponse.json({
          success: true,
          data: { ...base, mapping, fatalError: reparsed.fatalError, rows: [] },
        });
      }

      const { rows: classifiedRows, duplicateCount } = classifyDuplicates(
        statement.bankAccountId,
        reparsed.rows
      );

      const total = classifiedRows.length;
      const pageStart = (page - 1) * pageSize;
      const pageRows = classifiedRows.slice(pageStart, pageStart + pageSize);

      return NextResponse.json({
        success: true,
        data: {
          ...base,
          mapping,
          summary: {
            total: reparsed.summary.total,
            valid: reparsed.summary.valid - duplicateCount >= 0 ? reparsed.summary.valid - duplicateCount : 0,
            invalid: reparsed.summary.invalid,
            duplicate: duplicateCount,
          },
          pagination: {
            page,
            pageSize,
            total,
            hasNext: page * pageSize < total,
            hasPrevious: page > 1,
          },
          rows: pageRows,
        },
      });
    }

    // FAILED, UPLOADED, VALIDATING, IMPORTING, CANCELLED — metadata/summary only, from whatever was
    // last persisted; no row-level detail is meaningful or attempted for these states.
    return NextResponse.json({
      success: true,
      data: {
        ...base,
        mapping: safeJsonParseOrNull(statement.columnMapping),
        summary: {
          total: statement.rowCountTotal,
          valid: statement.rowCountValid,
          invalid: statement.rowCountInvalid,
          duplicate: statement.rowCountDuplicate,
        },
        pagination: { page: 1, pageSize, total: 0, hasNext: false, hasPrevious: false },
        rows: [],
      },
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
