import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import db from "@/lib/db";
import {
  getBankStatementById,
  updateBankStatementStatus,
  createBankStatementTransaction,
  findBankStatementTransactionByBankId,
  findBankStatementTransactionByFingerprint,
  type BankStatementRow,
} from "@/lib/bankStatements";
import {
  parseAndValidateStatementCsv,
  computeDuplicateFingerprint,
  DEFAULT_CSV_LIMITS,
  type BankStatementColumnMapping,
  type ParsedRowResult,
} from "@/lib/bankStatementCsv";
// STEP E.6 — PDF branch, additive alongside the CSV path below. bankStatementCsv.ts itself is not
// imported any differently than before.
import { extractPdfText, pdfFileErrorMessage } from "@/lib/bankStatementPdf";
import { extractStatementRowsFromPdfText } from "@/lib/bankStatementPdfRows";
import { isKnownPdfLayoutId, getPdfStatementLayout } from "@/lib/bankStatementPdfLayouts";

export const runtime = "nodejs";

// STEP C.4 — confirm/commit. This is the ONLY place in the entire feature that ever creates a
// bank_statement_transactions row. Never trusts the client's preview state or any client-supplied
// parsed transaction data (STEP C.3 §11/§16's explicit "ห้ามให้ client ส่ง parsed transactions แล้ว
// server เชื่อทันที") — every canonical value inserted here is freshly recomputed in THIS request by
// re-reading and re-parsing the actual stored file server-side. The client may only supply: which
// statement to confirm (the URL id) and which specific duplicate-candidate row numbers it has
// decided to import anyway (overrideDuplicateRowNumbers) — never amount/date/description/fingerprint/
// bankTransactionId directly.

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

  const notFound: Record<string, string> = {
    BANK_STATEMENT_NOT_FOUND: "ไม่พบ Bank Statement นี้",
  };
  if (message in notFound) {
    return NextResponse.json({ success: false, error: notFound[message] }, { status: 404 });
  }

  const conflict: Record<string, string> = {
    STATEMENT_NOT_PREVIEW_READY: "Bank Statement นี้ไม่อยู่ในสถานะที่พร้อมยืนยันการนำเข้า",
    CONFIRM_ALREADY_IN_PROGRESS_OR_STALE: "คำขอนี้ถูกดำเนินการไปแล้วหรือหมดอายุ กรุณาอัปโหลดใหม่",
    FILE_HASH_MISMATCH: "ไฟล์ต้นฉบับถูกเปลี่ยนแปลงหลังจากตรวจสอบตัวอย่างแล้ว กรุณาอัปโหลดใหม่",
    PREVIEW_MISMATCH:
      "ผลการตรวจสอบไฟล์ไม่ตรงกับตัวอย่างที่เคยแสดงไว้ กรุณาอัปโหลดใหม่",
    SOURCE_FILE_UNREADABLE: "ไม่สามารถอ่านไฟล์ต้นฉบับได้ กรุณาอัปโหลดใหม่",
    // STEP C.6 — should not occur in practice (every statement created after this STEP always
    // persists a shape-valid mapping at creation time) — handled defensively, not assumed impossible.
    MAPPING_NOT_PERSISTED:
      "ไม่พบข้อมูลการตั้งค่าคอลัมน์ของ Bank Statement นี้ ไม่สามารถยืนยันการนำเข้าได้ กรุณาอัปโหลดใหม่",
    // STEP 2 (zero-valid-row guard) — see the two rowsToImport.length === 0 checks above.
    ZERO_VALID_ROWS_TO_IMPORT:
      "ไม่มีรายการที่ถูกต้องสำหรับนำเข้าในไฟล์นี้ ไม่สามารถยืนยันการนำเข้าได้",
  };
  if (message in conflict) {
    return NextResponse.json({ success: false, error: conflict[message] }, { status: 409 });
  }

  console.error("Bank statement confirm API error:", error);

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

// Duplicated intentionally from src/app/api/bank-statements/route.ts (same small-scale-duplication
// convention already used elsewhere in this codebase — e.g. maskAccountNumber()/toListItem() between
// the two bank-accounts route files, STEP B.6) rather than a shared module, per this STEP's "ห้ามทำ
// refactor ใหญ่" instruction.
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

// STEP C.4 §7/§12 — a duplicate-candidate row the user explicitly marks "import anyway" gets its
// fingerprint recomputed with an override marker folded into the hashed input, so it becomes
// deterministically distinct from the row it collided with — never bypasses the DB's unique index,
// just legitimately stops colliding with it. Only fingerprint-based candidates are overridable — a
// bank-provided bankTransactionId collision (findBankStatementTransactionByBankId) is a near-certain
// true duplicate (the bank itself assigned the same id) and is never overridable, matching STEP C.1's
// BANK_PROVIDED_IDENTIFIER being the strongest, most-trusted signal.
function overrideFingerprint(
  bankAccountId: number,
  row: ParsedRowResult & { canonical: NonNullable<ParsedRowResult["canonical"]> },
  rowNumber: number
): string {
  return computeDuplicateFingerprint({
    bankAccountId,
    transactionDate: row.canonical.transactionDate,
    amount: row.canonical.amount,
    description: `${row.canonical.description ?? ""} MANUAL_CONFIRMED_ROW_${rowNumber}`,
    occurrenceIndex: 0,
  });
}

// ===== STEP E.6 — PDF branch. Additive alongside the CSV path below; nothing in this section is
// called by, or changes the behavior of, the CSV path. =====
//
// CRITICAL SECURITY PROPERTY OF THIS FUNCTION (this STEP's audit finding — see
// src/lib/bankStatementPdfLayouts.ts's own header comment for the full reasoning): the actual
// row-extraction RULES used here come ONLY from PDF_STATEMENT_LAYOUTS, a fixed, developer-authored
// registry — NEVER from `statement.columnMapping` (the client's original, arbitrary-regex
// submission from STEP E.5's upload route) and NEVER from any regex/pattern field the confirm
// request body might contain. The request body may supply `layoutId` (a plain string, validated
// against the registry below) and `password` — nothing else from it is capable of influencing how a
// single byte of the PDF is interpreted. A request that also happens to include e.g. a `rowPattern`
// or `money` field alongside a valid `layoutId` has those fields silently ignored — they are never
// read.
async function handlePdfStatementConfirm(request: NextRequest, id: number, statement: BankStatementRow) {
  try {
    let body: unknown = {};
    const rawBody = await request.text();

    if (rawBody.trim()) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return NextResponse.json({ success: false, error: "Invalid request body (must be JSON)" }, { status: 400 });
      }

      if (!body || typeof body !== "object") {
        return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
      }
    }

    const bodyObj = body as Record<string, unknown>;

    // The ONLY source of truth for parsing rules — see this function's header comment above.
    const layoutIdRaw = bodyObj.layoutId;
    if (!isKnownPdfLayoutId(layoutIdRaw)) {
      return NextResponse.json({ success: false, error: "ไม่รู้จักรูปแบบ PDF (layoutId) ที่ระบุ" }, { status: 400 });
    }
    const layout = getPdfStatementLayout(layoutIdRaw)!;

    // Password lifecycle (docs/BANK_STATEMENT_PDF_IMPORT_POLICY.md §3): request-scope ONLY.
    // STEP E.1's decision explicitly accepted, as a deliberate trade-off, that the password is
    // never persisted anywhere — including across the upload -> confirm boundary — so it must be
    // supplied again here. Never assigned to a module-level variable, never logged, never included
    // in ANY response, never written to the database, never passed to updateBankStatementStatus()'s
    // errorSummary.
    const passwordRaw = bodyObj.password;
    const password = typeof passwordRaw === "string" && passwordRaw.length > 0 ? passwordRaw : undefined;

    const overrideRaw = bodyObj.overrideDuplicateRowNumbers;
    const overrideRowNumbers = new Set<number>(
      Array.isArray(overrideRaw) ? overrideRaw.filter((n): n is number => Number.isInteger(n)) : []
    );

    // Re-read the ACTUAL stored file from disk — same trusted-source principle as the CSV path
    // below, never trusting anything the client claims about the file's content.
    const filePath = path.join(process.cwd(), "public", statement.sourceFileUrl.replace(/^\/+/, ""));

    let buffer: Buffer;
    try {
      buffer = await readFile(filePath);
    } catch {
      updateBankStatementStatus(id, "FAILED", { errorSummary: "ไม่สามารถอ่านไฟล์ต้นฉบับได้" });
      throw new Error("SOURCE_FILE_UNREADABLE");
    }

    const recomputedHash = createHash("sha256").update(buffer).digest("hex");
    if (recomputedHash !== statement.sourceFileHash) {
      updateBankStatementStatus(id, "FAILED", {
        errorSummary: "ไฟล์ต้นฉบับถูกเปลี่ยนแปลงหลังจากตรวจสอบตัวอย่างแล้ว",
      });
      throw new Error("FILE_HASH_MISMATCH");
    }

    const extracted = await extractPdfText(buffer, password);

    if (extracted.error) {
      const message = pdfFileErrorMessage(extracted.error);
      updateBankStatementStatus(id, "FAILED", { errorSummary: message });

      return NextResponse.json({
        success: true,
        data: { statementId: id, status: "FAILED", fatalError: { code: extracted.error, message } },
      });
    }

    const reparsed = extractStatementRowsFromPdfText(extracted.pageLines ?? [], statement.bankAccountId, layout);

    // Same consistency guard as the CSV path's own PREVIEW_MISMATCH check below. Here it ALSO
    // catches the (expected, disclosed) case where the trusted registry layout used here produces
    // different counts than whatever client-submitted layout computed the original STEP E.5
    // preview — a client-influenced preview can never silently become what actually gets imported;
    // any discrepancy fails closed, exactly like a genuine CSV preview/confirm mismatch would.
    if (
      reparsed.summary.total !== statement.rowCountTotal ||
      reparsed.summary.valid !== statement.rowCountValid ||
      reparsed.summary.invalid !== statement.rowCountInvalid
    ) {
      updateBankStatementStatus(id, "FAILED", {
        errorSummary: "ผลการตรวจสอบไฟล์ไม่ตรงกับตัวอย่างที่เคยแสดงไว้",
      });
      throw new Error("PREVIEW_MISMATCH");
    }

    // Fresh duplicate re-check — identical logic/shape to the CSV path below.
    const bankAccountId = statement.bankAccountId;
    let duplicateCount = 0;
    const rowsToImport: Array<{
      rowNumber: number;
      canonical: NonNullable<ParsedRowResult["canonical"]>;
      raw: Record<string, string>;
    }> = [];

    for (const row of reparsed.rows) {
      if ((row.category !== "NEW" && row.category !== "WARNING") || !row.canonical) {
        continue;
      }

      const byBankId = row.canonical.bankTransactionId
        ? findBankStatementTransactionByBankId(bankAccountId, row.canonical.bankTransactionId)
        : undefined;

      if (byBankId) {
        duplicateCount += 1;
        continue;
      }

      const byFingerprint = findBankStatementTransactionByFingerprint(bankAccountId, row.canonical.duplicateFingerprint);

      if (byFingerprint) {
        if (overrideRowNumbers.has(row.rowNumber)) {
          rowsToImport.push({
            rowNumber: row.rowNumber,
            canonical: {
              ...row.canonical,
              duplicateFingerprint: overrideFingerprint(
                bankAccountId,
                row as ParsedRowResult & { canonical: NonNullable<ParsedRowResult["canonical"]> },
                row.rowNumber
              ),
            },
            raw: row.raw,
          });
        } else {
          duplicateCount += 1;
        }
        continue;
      }

      rowsToImport.push({ rowNumber: row.rowNumber, canonical: row.canonical, raw: row.raw });
    }

    // STEP 2 (zero-valid-row guard) — a statement whose fresh re-parse yields zero importable rows
    // must never transition to IMPORTED: that status implies "real transactions now exist for this
    // statement", which would be false (bank_statement_transactions would stay empty while the UI's
    // Reconciliation picker treats IMPORTED as "ready"). Checked here, before the commit transaction
    // even opens — mirrors the FILE_HASH_MISMATCH/PREVIEW_MISMATCH guards above (statement is still
    // PREVIEW_READY at this point, so this direct updateBankStatementStatus() call is safe, same
    // pattern as those).
    if (rowsToImport.length === 0) {
      updateBankStatementStatus(id, "FAILED", {
        errorSummary: "ไม่มีรายการที่ถูกต้องสำหรับนำเข้าในไฟล์นี้",
      });
      throw new Error("ZERO_VALID_ROWS_TO_IMPORT");
    }

    // Atomic, all-or-nothing commit — the exact same guard/transaction shape as the CSV path below.
    const commit = db.transaction(() => {
      const guardResult = db
        .prepare("UPDATE bank_statements SET status = 'IMPORTING', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'PREVIEW_READY'")
        .run(id);

      if (guardResult.changes !== 1) {
        throw new Error("CONFIRM_ALREADY_IN_PROGRESS_OR_STALE");
      }

      for (const { rowNumber, canonical, raw } of rowsToImport) {
        createBankStatementTransaction({
          bankStatementId: id,
          bankTransactionId: canonical.bankTransactionId,
          transactionDate: canonical.transactionDate,
          description: canonical.description,
          debit: canonical.debit,
          credit: canonical.credit,
          amount: canonical.amount,
          balance: canonical.balance,
          duplicateFingerprint: canonical.duplicateFingerprint,
          rawRowIndex: rowNumber,
          rawRowText: JSON.stringify(raw),
        });
      }

      updateBankStatementStatus(id, "IMPORTED", { rowCountDuplicate: duplicateCount });
    });

    commit();

    const finalStatement = getBankStatementById(id);

    return NextResponse.json({
      success: true,
      data: {
        statementId: id,
        status: finalStatement?.status ?? "IMPORTED",
        imported: rowsToImport.length,
        skippedDuplicates: duplicateCount,
      },
    });
  } catch (error) {
    return errorToResponse(error);
  }
}

// ===== End of STEP E.6 PDF branch. Everything below is the pre-STEP-E.6 CSV path. =====

export async function POST(request: NextRequest, context: RouteContext) {
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

    // Cheap early-exit check — NOT the real concurrency guard (that happens atomically inside the
    // db.transaction() below, since better-sqlite3 transaction callbacks must be synchronous and
    // everything above this point involves async file I/O that cannot live inside one).
    if (statement.status !== "PREVIEW_READY") {
      throw new Error("STATEMENT_NOT_PREVIEW_READY");
    }

    // STEP E.6 — format branch decision, from TRUSTED DB state only (statement.sourceFileType,
    // read above from the database, never from this request's body/headers/query string) — a
    // client cannot make a PDF statement take the CSV path (or a CSV statement take the PDF path)
    // by shaping their confirm request a certain way. Everything below this block, for a CSV
    // statement, is BYTE-FOR-BYTE UNCHANGED from before this STEP.
    if (statement.sourceFileType === "PDF") {
      return handlePdfStatementConfirm(request, id, statement);
    }

    // STEP C.6 — the request body now carries ONLY the user's review decisions
    // (overrideDuplicateRowNumbers), never parsing instructions. A body is optional (an empty
    // POST means "no overrides"); if one is sent it must be a JSON object, but any `mapping` field
    // in it is never read — the mapping this confirm uses is exclusively the one persisted on the
    // statement at upload time (see below), closing the STEP C.4/C.5 gap where a client-resubmitted
    // mapping could differ from what was actually previewed.
    let body: unknown = {};
    const rawBody = await request.text();

    if (rawBody.trim()) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return NextResponse.json(
          { success: false, error: "Invalid request body (must be JSON)" },
          { status: 400 }
        );
      }

      if (!body || typeof body !== "object") {
        return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
      }
    }

    // STEP C.6 — server-persisted mapping is the exclusive source of truth for re-parsing, never the
    // client's request body (which the mass-assignment-style code above deliberately never reads for
    // this). Re-validated defensively even though it was already shape-checked at upload time (never
    // trust even our own past JSON blindly, matching this codebase's general defensive-parsing
    // convention).
    if (!statement.columnMapping) {
      throw new Error("MAPPING_NOT_PERSISTED");
    }

    const mapping = validateMappingShape(JSON.parse(statement.columnMapping));
    if (!mapping) {
      throw new Error("MAPPING_NOT_PERSISTED");
    }

    const overrideRaw = (body as Record<string, unknown>).overrideDuplicateRowNumbers;
    const overrideRowNumbers = new Set<number>(
      Array.isArray(overrideRaw) ? overrideRaw.filter((n): n is number => Number.isInteger(n)) : []
    );

    // Re-read the ACTUAL stored file from disk — never trust anything the client claims about its
    // content. source_file_url is always a server-generated path under the protected
    // /generated/bank-statements/ prefix (STEP C.4 upload route) — never client-supplied here.
    const filePath = path.join(process.cwd(), "public", statement.sourceFileUrl.replace(/^\/+/, ""));

    let buffer: Buffer;
    try {
      buffer = await readFile(filePath);
    } catch {
      updateBankStatementStatus(id, "FAILED", { errorSummary: "ไม่สามารถอ่านไฟล์ต้นฉบับได้" });
      throw new Error("SOURCE_FILE_UNREADABLE");
    }

    const recomputedHash = createHash("sha256").update(buffer).digest("hex");
    if (recomputedHash !== statement.sourceFileHash) {
      updateBankStatementStatus(id, "FAILED", {
        errorSummary: "ไฟล์ต้นฉบับถูกเปลี่ยนแปลงหลังจากตรวจสอบตัวอย่างแล้ว",
      });
      throw new Error("FILE_HASH_MISMATCH");
    }

    const fileText = buffer.toString("utf8");
    const reparsed = parseAndValidateStatementCsv(
      fileText,
      statement.bankAccountId,
      mapping,
      DEFAULT_CSV_LIMITS
    );

    if (reparsed.fatalError) {
      updateBankStatementStatus(id, "FAILED", { errorSummary: reparsed.fatalError.message });
      return NextResponse.json({
        success: true,
        data: { statementId: id, status: "FAILED", fatalError: reparsed.fatalError },
      });
    }

    // STEP C.3 §11 — the strongest no-schema-change consistency check available: the freshly
    // recomputed total/valid/invalid counts must match what was persisted on this statement at
    // preview time. Any realistic mapping change or file swap changes which rows are valid/invalid,
    // so this reliably catches a preview/confirm mismatch without needing a persisted-mapping column
    // (which STEP C.4 is not permitted to add — no schema changes this STEP). This is a disclosed,
    // deliberate limitation, not a silent gap: documented here and in the STEP C.4 report.
    if (
      reparsed.summary.total !== statement.rowCountTotal ||
      reparsed.summary.valid !== statement.rowCountValid ||
      reparsed.summary.invalid !== statement.rowCountInvalid
    ) {
      updateBankStatementStatus(id, "FAILED", {
        errorSummary: "ผลการตรวจสอบไฟล์ไม่ตรงกับตัวอย่างที่เคยแสดงไว้",
      });
      throw new Error("PREVIEW_MISMATCH");
    }

    // Fresh duplicate re-check (STEP C.3 §11 — DB state may have changed since preview).
    const bankAccountId = statement.bankAccountId;
    let duplicateCount = 0;
    const rowsToImport: Array<{
      rowNumber: number;
      canonical: NonNullable<ParsedRowResult["canonical"]>;
      raw: Record<string, string>;
    }> = [];

    for (const row of reparsed.rows) {
      if ((row.category !== "NEW" && row.category !== "WARNING") || !row.canonical) {
        continue;
      }

      const byBankId = row.canonical.bankTransactionId
        ? findBankStatementTransactionByBankId(bankAccountId, row.canonical.bankTransactionId)
        : undefined;

      if (byBankId) {
        // Bank-provided ID collision — never overridable.
        duplicateCount += 1;
        continue;
      }

      const byFingerprint = findBankStatementTransactionByFingerprint(
        bankAccountId,
        row.canonical.duplicateFingerprint
      );

      if (byFingerprint) {
        if (overrideRowNumbers.has(row.rowNumber)) {
          rowsToImport.push({
            rowNumber: row.rowNumber,
            canonical: {
              ...row.canonical,
              duplicateFingerprint: overrideFingerprint(
                bankAccountId,
                row as ParsedRowResult & { canonical: NonNullable<ParsedRowResult["canonical"]> },
                row.rowNumber
              ),
            },
            raw: row.raw,
          });
        } else {
          duplicateCount += 1;
        }
        continue;
      }

      rowsToImport.push({ rowNumber: row.rowNumber, canonical: row.canonical, raw: row.raw });
    }

    // STEP 2 (zero-valid-row guard) — same rule and placement as the PDF branch above: never
    // transition to IMPORTED when there is nothing importable, checked before the commit transaction
    // opens (statement is still PREVIEW_READY here, matching FILE_HASH_MISMATCH/PREVIEW_MISMATCH's
    // own direct updateBankStatementStatus() pattern above).
    if (rowsToImport.length === 0) {
      updateBankStatementStatus(id, "FAILED", {
        errorSummary: "ไม่มีรายการที่ถูกต้องสำหรับนำเข้าในไฟล์นี้",
      });
      throw new Error("ZERO_VALID_ROWS_TO_IMPORT");
    }

    // Atomic, all-or-nothing commit. The FIRST statement inside this transaction is a
    // WHERE-status-guarded UPDATE, not the ordinary updateBankStatementStatus() helper — this is the
    // real double-click/concurrency guard (STEP C.3 §11's "server-side double-click safe"): two
    // concurrent confirm requests for the same statement both reach this point, but SQLite serializes
    // concurrent write transactions, so only one can win this UPDATE ... WHERE status = 'PREVIEW_READY'
    // (changes === 1); the loser sees changes === 0 and aborts before touching anything else. Nothing
    // about the async work above (file read, re-parse) can itself be inside this transaction —
    // better-sqlite3 transaction callbacks must be synchronous — so the guard is deliberately placed
    // as the first synchronous operation, not relied upon any earlier.
    const commit = db.transaction(() => {
      const guardResult = db
        .prepare("UPDATE bank_statements SET status = 'IMPORTING', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'PREVIEW_READY'")
        .run(id);

      if (guardResult.changes !== 1) {
        throw new Error("CONFIRM_ALREADY_IN_PROGRESS_OR_STALE");
      }

      for (const { rowNumber, canonical, raw } of rowsToImport) {
        createBankStatementTransaction({
          bankStatementId: id,
          bankTransactionId: canonical.bankTransactionId,
          transactionDate: canonical.transactionDate,
          description: canonical.description,
          debit: canonical.debit,
          credit: canonical.credit,
          amount: canonical.amount,
          balance: canonical.balance,
          duplicateFingerprint: canonical.duplicateFingerprint,
          rawRowIndex: rowNumber,
          rawRowText: JSON.stringify(raw),
        });
      }

      updateBankStatementStatus(id, "IMPORTED", {
        rowCountDuplicate: duplicateCount,
      });
    });

    commit();

    const finalStatement = getBankStatementById(id);

    return NextResponse.json({
      success: true,
      data: {
        statementId: id,
        status: finalStatement?.status ?? "IMPORTED",
        imported: rowsToImport.length,
        skippedDuplicates: duplicateCount,
      },
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
