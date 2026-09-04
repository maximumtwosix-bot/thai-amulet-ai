import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { getBankAccountById } from "@/lib/bankAccounts";
import {
  createBankStatement,
  updateBankStatementStatus,
  findBankStatementByFileHash,
  findOverlappingImportedStatements,
  findBankStatementTransactionByBankId,
  findBankStatementTransactionByFingerprint,
  listBankStatements,
  type BankStatementRow,
} from "@/lib/bankStatements";
import {
  parseAndValidateStatementCsv,
  DEFAULT_CSV_LIMITS,
  fileErrorMessage,
  type BankStatementColumnMapping,
  type ParsedRowResult,
} from "@/lib/bankStatementCsv";

export const runtime = "nodejs";

// STEP C.4 — upload + preview, combined into one request (preview requires the parsed upload; there
// is no separate "just upload" step). Auth is NOT re-checked here — src/proxy.ts already gates
// "/api/bank-statements" (added in STEP C.2), same convention as every other admin API in this
// codebase.
//
// Upload != Import: this route NEVER creates a bank_statement_transactions row and NEVER transitions
// a statement to IMPORTED — it only creates the BankStatement metadata row and walks it through
// UPLOADED -> VALIDATING -> PREVIEW_READY (or -> FAILED on a fatal file error), exactly matching
// STEP C.2's lifecycle design. The actual import happens only via [id]/confirm/route.ts.

const ALLOWED_CSV_EXTENSIONS = new Set([".csv"]);
// CSV MIME types are notoriously inconsistent across browsers/OSes — this allowlist is intentionally
// a little permissive; the real gate is structural (does it actually parse as well-formed CSV?),
// exactly as STEP C.3 §13 concluded (magic-byte detection doesn't transfer to plain-text CSV the way
// it does for images in src/app/api/transactions/[id]/attachments/route.ts).
const ALLOWED_CSV_MIME_TYPES = new Set([
  "text/csv",
  "application/vnd.ms-excel",
  "application/csv",
  "text/plain",
  // Many clients (including curl with no explicit --form-type, and some browsers/OSes for a less
  // common extension) fall back to this generic type when they can't determine one — accepted here
  // because, per STEP C.3 §13's conclusion, the real content gate for CSV is structural (does it
  // actually parse as well-formed CSV?), not the declared MIME type; a non-CSV file with a .csv
  // extension and this MIME type still fails at the fatal-file-error parse check below.
  "application/octet-stream",
]);

function errorToResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";

  if (message === "BANK_ACCOUNT_NOT_FOUND") {
    return NextResponse.json({ success: false, error: "ไม่พบบัญชีธนาคารนี้" }, { status: 404 });
  }

  console.error("Bank statements upload API error:", error);

  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

function isValidDateFormat(value: unknown): value is BankStatementColumnMapping["dateFormat"] {
  return (
    value === "YYYY-MM-DD" ||
    value === "DD/MM/YYYY" ||
    value === "DD-MM-YYYY" ||
    value === "YYYY/MM/DD"
  );
}

// STEP C.4 — the mapping is always explicit, supplied by the caller — never auto-detected (STEP C.3
// §4/§10's explicit "ห้ามทำ magic mapping" instruction). This validates only the SHAPE of the mapping
// (correct fields, correct types) — it does not know or care whether the named columns actually exist
// in a given file; that is checked later by parseAndValidateStatementCsv() against the real header.
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

// STEP C.4 §12/§14 — reclassifies NEW/WARNING rows to DUPLICATE_CANDIDATE using the DB lookups
// src/lib/bankStatements.ts provides. Mutates nothing — read-only, used identically by both preview
// (this file) and confirm's fresh re-check ([id]/confirm/route.ts).
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

// STEP C.6 — same masking logic as src/app/api/bank-accounts/route.ts's maskAccountNumber(),
// duplicated here rather than shared (same small-scale-duplication convention already used twice in
// this codebase — the two bank-accounts route files, STEP B.6; and the two bank-statements route
// files, STEP C.4 — per this STEP's "ห้ามทำ large refactor" instruction).
function maskAccountNumber(accountNumber: string): string {
  if (!accountNumber) return "••••";

  return `••••${accountNumber.slice(-4)}`;
}

// STEP C.6 — response DTO built explicitly field-by-field, never spreading the raw BankStatementRow
// or BankAccountRow. Deliberately excludes sourceFileUrl/sourceFileHash (no filesystem/storage path
// exposure — this STEP's explicit "GET metadata ไม่เปิด file path" instruction) and columnMapping
// (internal parsing configuration, not needed for a list view — available via GET /[id] only, where
// it's actually used to reconstruct a preview).
function toListItem(statement: BankStatementRow, account: { bankName: string; accountName: string; accountNumber: string } | undefined) {
  return {
    id: statement.id,
    bankAccountId: statement.bankAccountId,
    bankName: account?.bankName ?? null,
    accountName: account?.accountName ?? null,
    accountNumberMasked: account ? maskAccountNumber(account.accountNumber) : null,
    sourceFileName: statement.sourceFileName,
    status: statement.status,
    statementPeriodFrom: statement.statementPeriodFrom,
    statementPeriodTo: statement.statementPeriodTo,
    rowCountTotal: statement.rowCountTotal,
    rowCountValid: statement.rowCountValid,
    rowCountInvalid: statement.rowCountInvalid,
    rowCountDuplicate: statement.rowCountDuplicate,
    createdAt: statement.createdAt,
    updatedAt: statement.updatedAt,
  };
}

// STEP C.6 — list statements. Read-only, no side effects. Filters mirror listBankStatements()'s own
// (bankAccountId, status) — no pagination added (STEP C.6 audit §5: a shop realistically has single/
// double-digit statements per account per year; listBankStatements()'s existing `limit` default is
// already generous — adding page/pageSize here would be over-engineering a list that will not
// realistically grow large, unlike the per-statement TRANSACTION list in GET /[id], which does need
// it). Search is intentionally not offered — filtering by bankAccountId/status covers the only
// safe, necessary cases; there is no "search full account number" capability anywhere, by design.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const bankAccountIdParam = searchParams.get("bankAccountId");
    let bankAccountId: number | undefined;

    if (bankAccountIdParam !== null && bankAccountIdParam !== "") {
      const parsed = Number(bankAccountIdParam);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        return NextResponse.json(
          { success: false, error: "Invalid bankAccountId" },
          { status: 400 }
        );
      }

      bankAccountId = parsed;
    }

    const status = searchParams.get("status") || undefined;

    const limitParam = searchParams.get("limit");
    let limit: number | undefined;

    if (limitParam !== null && limitParam !== "") {
      const parsedLimit = Number(limitParam);

      if (!Number.isInteger(parsedLimit) || parsedLimit <= 0 || parsedLimit > 500) {
        return NextResponse.json(
          { success: false, error: "Invalid limit. Must be an integer between 1 and 500" },
          { status: 400 }
        );
      }

      limit = parsedLimit;
    }

    const statements = listBankStatements({ bankAccountId, status, limit });

    // STEP C.6 — one lookup per distinct account rather than per row (a shop has few accounts;
    // avoids N identical queries when many statements share the same account).
    const accountCache = new Map<number, ReturnType<typeof getBankAccountById>>();

    function getAccountCached(id: number) {
      if (!accountCache.has(id)) {
        accountCache.set(id, getBankAccountById(id));
      }
      return accountCache.get(id);
    }

    const data = statements.map((s) => toListItem(s, getAccountCached(s.bankAccountId)));

    return NextResponse.json({ success: true, data, count: data.length });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    let formData: FormData;

    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body (must be FormData)" },
        { status: 400 }
      );
    }

    const bankAccountIdRaw = formData.get("bankAccountId");
    const bankAccountId = Number(bankAccountIdRaw);

    if (!Number.isInteger(bankAccountId) || bankAccountId <= 0) {
      return NextResponse.json({ success: false, error: "Invalid bankAccountId" }, { status: 400 });
    }

    const bankAccount = getBankAccountById(bankAccountId);
    if (!bankAccount) {
      return NextResponse.json({ success: false, error: "ไม่พบบัญชีธนาคารนี้" }, { status: 404 });
    }

    const mappingRaw = formData.get("mapping");
    let mappingParsed: unknown;
    try {
      mappingParsed = typeof mappingRaw === "string" ? JSON.parse(mappingRaw) : null;
    } catch {
      return NextResponse.json(
        { success: false, error: "mapping ต้องเป็น JSON ที่ถูกต้อง" },
        { status: 400 }
      );
    }

    const mapping = validateMappingShape(mappingParsed);
    if (!mapping) {
      return NextResponse.json(
        { success: false, error: "การตั้งค่าคอลัมน์ (mapping) ไม่ถูกต้องหรือไม่ครบถ้วน" },
        { status: 400 }
      );
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "กรุณาเลือกไฟล์" }, { status: 400 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ success: false, error: "ไฟล์ว่างเปล่า" }, { status: 400 });
    }

    if (file.size > DEFAULT_CSV_LIMITS.maxFileSizeBytes) {
      return NextResponse.json(
        { success: false, error: fileErrorMessage("FILE_TOO_LARGE") },
        { status: 400 }
      );
    }

    const extension = path.extname(file.name).toLowerCase();
    if (extension && !ALLOWED_CSV_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { success: false, error: "รองรับเฉพาะไฟล์นามสกุล .csv เท่านั้น" },
        { status: 400 }
      );
    }

    const declaredMime = file.type.split(";")[0].trim().toLowerCase();
    if (declaredMime && !ALLOWED_CSV_MIME_TYPES.has(declaredMime)) {
      return NextResponse.json(
        { success: false, error: "ชนิดไฟล์ไม่รองรับ — กรุณาอัปโหลดไฟล์ CSV" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sourceFileHash = createHash("sha256").update(buffer).digest("hex");

    // STEP C.4 §8/C.1 Decision 5 — proactive file-level duplicate check, before creating anything,
    // so an already-imported file gets a clear answer instead of a raw creation failure.
    const existingStatement = findBankStatementByFileHash(bankAccountId, sourceFileHash);
    if (existingStatement) {
      return NextResponse.json({
        success: true,
        data: {
          alreadyImported: true,
          existingStatementId: existingStatement.id,
          existingStatementStatus: existingStatement.status,
        },
      });
    }

    // STEP C.3 §11/§14 — file is written to its permanent protected location at upload time (not
    // kept in a separate temp area): an abandoned, never-confirmed BankStatement row is a low-cost
    // inert record, not a cleanup problem this STEP needs to solve. Filename is never derived from
    // the client-supplied original name (path-traversal-resistant by construction — the on-disk name
    // is always a fresh randomUUID()); the original filename is kept only as display metadata
        // (bank_statements.source_file_name).
    const uploadedAt = new Date();
    const year = String(uploadedAt.getUTCFullYear());
    const month = String(uploadedAt.getUTCMonth() + 1).padStart(2, "0");
    const storageDir = path.join(
      process.cwd(),
      "public",
      "generated",
      "bank-statements",
      String(bankAccountId),
      year,
      month
    );

    await mkdir(storageDir, { recursive: true });

    const storedFileName = `${randomUUID()}.csv`;
    const storedFilePath = path.join(storageDir, storedFileName);
    await writeFile(storedFilePath, buffer);

    const sourceFileUrl = `/generated/bank-statements/${bankAccountId}/${year}/${month}/${storedFileName}`;

    const statement = createBankStatement({
      bankAccountId,
      sourceFileName: file.name,
      sourceFileHash,
      sourceFileUrl,
      columnMapping: JSON.stringify(mapping),
    });

    updateBankStatementStatus(statement.id, "VALIDATING");

    const fileText = buffer.toString("utf8");
    const parsed = parseAndValidateStatementCsv(fileText, bankAccountId, mapping, DEFAULT_CSV_LIMITS);

    if (parsed.fatalError) {
      updateBankStatementStatus(statement.id, "FAILED", {
        errorSummary: parsed.fatalError.message,
      });

      return NextResponse.json({
        success: true,
        data: {
          statementId: statement.id,
          status: "FAILED",
          fatalError: parsed.fatalError,
        },
      });
    }

    const { rows: classifiedRows, duplicateCount } = classifyDuplicates(bankAccountId, parsed.rows);

    const importableDates = classifiedRows
      .filter((r) => r.canonical)
      .map((r) => r.canonical!.transactionDate)
      .sort();
    const periodFrom = importableDates[0] ?? null;
    const periodTo = importableDates[importableDates.length - 1] ?? null;

    const overlapping = findOverlappingImportedStatements(bankAccountId, periodFrom, periodTo);

    const updatedStatement = updateBankStatementStatus(statement.id, "PREVIEW_READY", {
      statementPeriodFrom: periodFrom,
      statementPeriodTo: periodTo,
      rowCountTotal: parsed.summary.total,
      rowCountValid: parsed.summary.valid,
      rowCountInvalid: parsed.summary.invalid,
      rowCountDuplicate: duplicateCount,
    });

    // STEP C.3 §10/§14 — full row-level detail capped; remaining rows are already reflected in the
    // summary counts, never silently dropped from the counts, only from the detailed listing.
    const rowsForPreview = classifiedRows.slice(0, DEFAULT_CSV_LIMITS.maxPreviewRows);

    return NextResponse.json({
      success: true,
      data: {
        statementId: updatedStatement.id,
        status: updatedStatement.status,
        statementPeriodFrom: updatedStatement.statementPeriodFrom,
        statementPeriodTo: updatedStatement.statementPeriodTo,
        overlappingStatementWarning: overlapping.length > 0,
        overlappingStatementIds: overlapping.map((s) => s.id),
        summary: {
          total: parsed.summary.total,
          valid: parsed.summary.valid - duplicateCount >= 0 ? parsed.summary.valid - duplicateCount : 0,
          invalid: parsed.summary.invalid,
          duplicates: duplicateCount,
          warnings: parsed.summary.warnings,
          informational: parsed.summary.informational,
        },
        rowsShown: rowsForPreview.length,
        rowsTotal: classifiedRows.length,
        rows: rowsForPreview,
      },
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
