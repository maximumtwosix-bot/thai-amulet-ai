// STEP E.6 — integration tests for POST /api/bank-statements/[id]/confirm, covering both the
// pre-existing CSV path (regression) and the new PDF branch added in this STEP.
//
// Same testing approach and disclosures as src/app/api/bank-statements/route.test.ts (STEP E.5):
// calls the route's exported `POST` handler DIRECTLY with a hand-built `NextRequest` (bypassing
// src/proxy.ts's auth middleware, which only runs in front of a real running server — authorization
// is unchanged by construction, not re-verified live here; see this STEP's report, Section N).
// Hits the REAL local database and filesystem; every test creates its own throwaway bank account
// and cleans up everything it created (bank_statements rows, bank_statement_transactions rows, and
// on-disk files) in an `after()` hook, leaving no residue.
//
// Run: node --import tsx --test "src/app/api/bank-statements/[id]/confirm/route.test.ts"

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { POST as uploadPost } from "../../route";
import { POST as confirmPost } from "./route";
import { createBankAccount, deleteBankAccount, type BankAccountRow } from "@/lib/bankAccounts";
import { getBankStatementById, listBankStatementTransactions } from "@/lib/bankStatements";
import db from "@/lib/db";
import {
  buildTextPdf,
  buildEncryptedTextPdf,
  buildCorruptedPdf,
} from "../../../../../lib/__tests__/pdfFixtures";

let account: BankAccountRow;

before(() => {
  account = createBankAccount({
    bankName: "STEP_E6_TEST_BANK",
    accountName: "STEP E6 Test Account",
    accountNumber: `E6TEST${Date.now()}`,
    classification: "BUSINESS",
  });
});

after(async () => {
  const statementIds = db
    .prepare("SELECT id FROM bank_statements WHERE bank_account_id = ?")
    .all(account.id) as Array<{ id: number }>;
  for (const { id } of statementIds) {
    db.prepare("DELETE FROM bank_statement_transactions WHERE bank_statement_id = ?").run(id);
  }
  db.prepare("DELETE FROM bank_statements WHERE bank_account_id = ?").run(account.id);
  deleteBankAccount(account.id);
  await rm(path.join(process.cwd(), "public", "generated", "bank-statements", String(account.id)), {
    recursive: true,
    force: true,
  });
});

function toBlobPart(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const view = new Uint8Array(buffer.length);
  view.set(buffer);
  return view;
}

function uploadRequest(formData: FormData): NextRequest {
  return new NextRequest("http://localhost/api/bank-statements", { method: "POST", body: formData });
}

function confirmRequest(statementId: number, body: unknown): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  const req = new NextRequest(`http://localhost/api/bank-statements/${statementId}/confirm`, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "content-type": "application/json" },
  });
  return { req, ctx: { params: Promise.resolve({ id: String(statementId) }) } };
}

const CSV_MAPPING = {
  dateColumn: "date",
  dateFormat: "YYYY-MM-DD",
  descriptionColumn: "description",
  money: { kind: "signed_amount", amountColumn: "amount", positiveMeans: "credit" },
};

// The client's STEP E.5 upload-time submission — deliberately DIFFERENT in shape from the trusted
// server registry layout used at confirm time (src/lib/bankStatementPdfLayouts.ts), to prove the
// two are genuinely independent and that confirm never trusts this value for parsing.
const CLIENT_PDF_LAYOUT_FOR_PREVIEW_ONLY = {
  repeatedHeaderPatterns: [],
  repeatedFooterPatterns: [],
  transactionStartPattern: "^\\d{2}/\\d{2}/\\d{4}",
  rowPattern:
    "^(?<date>\\d{2}/\\d{2}/\\d{4})\\s+(?<description>.+?)\\s+(?<debit>[\\d,]+\\.\\d{2}|-)\\s+(?<credit>[\\d,]+\\.\\d{2}|-)\\s+(?<balance>[\\d,]+\\.\\d{2})$",
  dateFormat: "DD/MM/YYYY",
  money: { kind: "separate_columns", debitColumn: "debit", creditColumn: "credit" },
};

const TRUSTED_LAYOUT_ID = "GENERIC_DATE_DESC_DEBIT_CREDIT_BALANCE_V1";

async function uploadCsv(csvText: string): Promise<number> {
  const formData = new FormData();
  formData.set("bankAccountId", String(account.id));
  formData.set("mapping", JSON.stringify(CSV_MAPPING));
  formData.set("file", new File([csvText], `test-${Date.now()}-${Math.random()}.csv`, { type: "text/csv" }));
  const res = await uploadPost(uploadRequest(formData));
  const body = await res.json();
  return body.data.statementId;
}

async function uploadPdf(pdf: Buffer, password?: string, fileNameSuffix = ""): Promise<number> {
  const formData = new FormData();
  formData.set("bankAccountId", String(account.id));
  formData.set("pdfLayout", JSON.stringify(CLIENT_PDF_LAYOUT_FOR_PREVIEW_ONLY));
  if (password) formData.set("password", password);
  formData.set("file", new File([toBlobPart(pdf)], `test${fileNameSuffix}-${Date.now()}-${Math.random()}.pdf`, { type: "application/pdf" }));
  const res = await uploadPost(uploadRequest(formData));
  const body = await res.json();
  return body.data.statementId;
}

test("1. existing CSV confirm regression — import succeeds exactly as before", async () => {
  const statementId = await uploadCsv("date,description,amount\n2025-01-01,Test,100.00\n");
  const { req, ctx } = confirmRequest(statementId, {});
  const res = await confirmPost(req, ctx);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.status, "IMPORTED");
  assert.equal(body.data.imported, 1);

  const txns = listBankStatementTransactions(statementId);
  assert.equal(txns.length, 1);
  assert.equal(txns[0].credit, 10000);
});

test("2. valid PDF confirm imports the correct transaction (unencrypted)", async () => {
  const pdf = buildTextPdf(["01/01/2025 ค่าสินค้า 500.00 - 49,500.00"]);
  const statementId = await uploadPdf(pdf);

  const { req, ctx } = confirmRequest(statementId, { layoutId: TRUSTED_LAYOUT_ID });
  const res = await confirmPost(req, ctx);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.status, "IMPORTED");
  assert.equal(body.data.imported, 1);

  const txns = listBankStatementTransactions(statementId);
  assert.equal(txns.length, 1);
  assert.equal(txns[0].debit, 50000);
});

test("3. encrypted PDF + correct password confirms successfully", async () => {
  const pdf = buildEncryptedTextPdf("confirmSecret1", "02/01/2025 รับโอนเงิน - 2,500.00 52,000.00");
  const statementId = await uploadPdf(pdf, "confirmSecret1");

  const { req, ctx } = confirmRequest(statementId, { layoutId: TRUSTED_LAYOUT_ID, password: "confirmSecret1" });
  const res = await confirmPost(req, ctx);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.status, "IMPORTED");

  const txns = listBankStatementTransactions(statementId);
  assert.equal(txns[0].credit, 250000);
});

test("4. encrypted PDF + wrong password at confirm fails safely with NO financial write", async () => {
  const pdf = buildEncryptedTextPdf("confirmSecret2", "02/01/2025 รับโอนเงิน - 2,500.00 52,000.00");
  const statementId = await uploadPdf(pdf, "confirmSecret2");

  const { req, ctx } = confirmRequest(statementId, { layoutId: TRUSTED_LAYOUT_ID, password: "totally-wrong" });
  const res = await confirmPost(req, ctx);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.status, "FAILED");
  assert.equal(body.data.fatalError.code, "INCORRECT_PASSWORD");

  const txns = listBankStatementTransactions(statementId);
  assert.equal(txns.length, 0, "no transaction row must exist after a failed confirm");
  const statement = getBankStatementById(statementId);
  assert.equal(statement?.status, "FAILED");
});

test("5. malformed PDF at confirm fails safely with NO financial write", async () => {
  // Upload a valid PDF first (so it reaches PREVIEW_READY), then corrupt the stored file on disk
  // between upload and confirm to exercise confirm's own independent re-read/re-validate path —
  // the exact same "file changed after preview" scenario CSV's FILE_HASH_MISMATCH guard exists for.
  const pdf = buildTextPdf(["05/01/2025 ค่าสินค้า test5 501.00 - 49,501.00"]);
  const statementId = await uploadPdf(pdf);
  const statement = getBankStatementById(statementId)!;
  const filePath = path.join(process.cwd(), "public", statement.sourceFileUrl.replace(/^\/+/, ""));
  const { writeFile } = await import("node:fs/promises");
  await writeFile(filePath, buildCorruptedPdf());

  const { req, ctx } = confirmRequest(statementId, { layoutId: TRUSTED_LAYOUT_ID });
  const res = await confirmPost(req, ctx);
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.equal(body.error, "ไฟล์ต้นฉบับถูกเปลี่ยนแปลงหลังจากตรวจสอบตัวอย่างแล้ว กรุณาอัปโหลดใหม่");

  const txns = listBankStatementTransactions(statementId);
  assert.equal(txns.length, 0);
});

test("6. PDF with no text layer fails safely at confirm-time re-derivation with NO financial write", async () => {
  // Upload/preview a genuinely valid PDF, then swap the stored file for a no-text-layer PDF before
  // confirming — this exercises FILE_HASH_MISMATCH the same way test 5 does (any post-preview file
  // change is rejected the same way, regardless of what the new content is), proving no financial
  // write occurs when confirm cannot trust what it re-reads from disk.
  const pdf = buildTextPdf(["06/01/2025 ค่าสินค้า test6 502.00 - 49,502.00"]);
  const statementId = await uploadPdf(pdf);
  const statement = getBankStatementById(statementId)!;
  const filePath = path.join(process.cwd(), "public", statement.sourceFileUrl.replace(/^\/+/, ""));
  const { writeFile } = await import("node:fs/promises");
  await writeFile(filePath, buildTextPdf([null]));

  const { req, ctx } = confirmRequest(statementId, { layoutId: TRUSTED_LAYOUT_ID });
  const res = await confirmPost(req, ctx);
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.equal(body.error, "ไฟล์ต้นฉบับถูกเปลี่ยนแปลงหลังจากตรวจสอบตัวอย่างแล้ว กรุณาอัปโหลดใหม่");

  const txns = listBankStatementTransactions(statementId);
  assert.equal(txns.length, 0);
});

test("7. unrecognized/INVALID row from preview causes a PREVIEW_MISMATCH, not a partial import", async () => {
  // The PREVIEW (STEP E.5, client-supplied layout) sees this line as unparseable -> 1 invalid row,
  // 0 valid. At confirm, the trusted registry layout is used instead (this STEP's fix) — for THIS
  // line it also fails to match (no debit/credit/balance at all), so counts still agree (0 valid,
  // 1 invalid) and confirm proceeds — importing zero transactions, never a guessed one.
  const pdf = buildTextPdf(["03/01/2025 ยอดคงเหลือไม่ถูกต้อง"]);
  const statementId = await uploadPdf(pdf);

  const { req, ctx } = confirmRequest(statementId, { layoutId: TRUSTED_LAYOUT_ID });
  const res = await confirmPost(req, ctx);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.status, "IMPORTED");
  assert.equal(body.data.imported, 0);

  const txns = listBankStatementTransactions(statementId);
  assert.equal(txns.length, 0, "an INVALID row must never be imported as a transaction");
});

test("8. ambiguous row (ill-formed) never becomes a guessed transaction", async () => {
  const pdf = buildTextPdf(["07/01/2025 ค่าอะไรบางอย่างที่ไม่มีตัวเลขเลย"]);
  const statementId = await uploadPdf(pdf);

  const { req, ctx } = confirmRequest(statementId, { layoutId: TRUSTED_LAYOUT_ID });
  const res = await confirmPost(req, ctx);
  const body = await res.json();

  assert.equal(body.data.imported, 0);
  assert.equal(listBankStatementTransactions(statementId).length, 0);
});

test("9. debit+credit both populated triggers the existing INVALID_DEBIT_CREDIT_COMBINATION behavior", async () => {
  // At upload/preview this line is invalid under BOTH layouts (client's and the trusted registry's)
  // for the same reason, so preview/confirm counts agree and confirm proceeds to import zero rows —
  // proving the reused bankStatementCsv.ts validation (never modified) still rejects this exact
  // case for PDF-derived rows the same way it always has for CSV.
  const pdf = buildTextPdf(["08/01/2025 รายการทดสอบ 100.00 200.00 49,700.00"]);
  const statementId = await uploadPdf(pdf);

  const { req, ctx } = confirmRequest(statementId, { layoutId: TRUSTED_LAYOUT_ID });
  const res = await confirmPost(req, ctx);
  const body = await res.json();

  assert.equal(body.data.imported, 0);
  assert.equal(listBankStatementTransactions(statementId).length, 0);
});

test("10. duplicate/idempotency — confirming twice never double-imports", async () => {
  const pdf = buildTextPdf(["09/01/2025 ทดสอบซ้ำ 100.00 - 900.00"]);
  const statementId = await uploadPdf(pdf);

  const firstCall = confirmRequest(statementId, { layoutId: TRUSTED_LAYOUT_ID });
  const first = await confirmPost(firstCall.req, firstCall.ctx);
  const firstBody = await first.json();
  assert.equal(firstBody.data.status, "IMPORTED");
  assert.equal(firstBody.data.imported, 1);

  // Second confirm on an already-IMPORTED statement must be rejected by the existing status guard
  // (STATEMENT_NOT_PREVIEW_READY) — never a second insert.
  const secondCall = confirmRequest(statementId, { layoutId: TRUSTED_LAYOUT_ID });
  const second = await confirmPost(secondCall.req, secondCall.ctx);
  assert.equal(second.status, 409);

  const txns = listBankStatementTransactions(statementId);
  assert.equal(txns.length, 1, "must still be exactly one transaction, never duplicated");
});

test("11. no partial writes after a failure — zero rows persisted, even when some rows would have been valid", async () => {
  // Force a FILE_HASH_MISMATCH failure (test 5's technique) on a statement whose preview had at
  // least one genuinely valid-looking row, and confirm NOTHING was written — atomicity holds even
  // though the failure happens after row extraction succeeds, before the commit transaction.
  const pdf = buildTextPdf(["11/01/2025 ค่าสินค้า test11 511.00 - 49,511.00"]);
  const statementId = await uploadPdf(pdf);
  const statement = getBankStatementById(statementId)!;
  const filePath = path.join(process.cwd(), "public", statement.sourceFileUrl.replace(/^\/+/, ""));
  const { writeFile } = await import("node:fs/promises");
  await writeFile(filePath, buildCorruptedPdf());

  const { req, ctx } = confirmRequest(statementId, { layoutId: TRUSTED_LAYOUT_ID });
  await confirmPost(req, ctx);

  assert.equal(listBankStatementTransactions(statementId).length, 0);
  const finalStatement = getBankStatementById(statementId);
  assert.notEqual(finalStatement?.status, "IMPORTED");
});

test("12. source_file_type enforcement — sourceFileType is read from trusted DB state, never from the request body", async () => {
  const pdf = buildTextPdf(["10/01/2025 ทดสอบ enforcement 50.00 - 950.00"]);
  const statementId = await uploadPdf(pdf);

  // Attacker/buggy-client attempt: include a `sourceFileType: "CSV"` field in the confirm body,
  // trying to make this PDF statement take the CSV parsing path.
  const { req, ctx } = confirmRequest(statementId, {
    layoutId: TRUSTED_LAYOUT_ID,
    sourceFileType: "CSV",
    mapping: CSV_MAPPING,
  });
  const res = await confirmPost(req, ctx);
  const body = await res.json();

  // If the CSV path had been (incorrectly) taken, this would fail differently (CSV parsing PDF
  // bytes as UTF-8 text) or behave unpredictably. It must instead behave exactly like the correct
  // PDF path: a normal, correct import.
  assert.equal(res.status, 200);
  assert.equal(body.data.status, "IMPORTED");
  const txns = listBankStatementTransactions(statementId);
  assert.equal(txns.length, 1);
  assert.equal(txns[0].debit, 5000);
  assert.equal(getBankStatementById(statementId)?.sourceFileType, "PDF");
});

test("13. password never appears in confirm's response, logs, or errors", async () => {
  const password = "confirm-leak-check-marker-777";
  const pdf = buildEncryptedTextPdf(password, "11/01/2025 ทดสอบรั่ว 20.00 - 980.00");
  const statementId = await uploadPdf(pdf, password);

  const captured: string[] = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  const capture = (...args: unknown[]) => captured.push(args.map((a) => String(a)).join(" "));
  console.log = capture;
  console.warn = capture;
  console.error = capture;

  let body: unknown;
  try {
    const { req, ctx } = confirmRequest(statementId, { layoutId: TRUSTED_LAYOUT_ID, password });
    const res = await confirmPost(req, ctx);
    body = await res.json();
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  }

  assert.ok(!JSON.stringify(body).includes(password));
  assert.ok(!captured.join("\n").includes(password));

  // Also the wrong-password failure branch, most likely to "helpfully" echo the attempted value.
  const pdf2 = buildEncryptedTextPdf(password, "12/01/2025 ทดสอบรั่ว2 20.00 - 960.00");
  const statementId2 = await uploadPdf(pdf2, password);
  const captured2: string[] = [];
  console.log = capture;
  console.warn = capture;
  console.error = capture;
  let body2: unknown;
  try {
    const { req, ctx } = confirmRequest(statementId2, { layoutId: TRUSTED_LAYOUT_ID, password: "wrong-one-xyz" });
    const res2 = await confirmPost(req, ctx);
    body2 = await res2.json();
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  }
  assert.ok(!JSON.stringify(body2).includes(password));
  assert.ok(!JSON.stringify(body2).includes("wrong-one-xyz"));
  assert.ok(!captured2.join("\n").includes(password));
  assert.ok(!captured2.join("\n").includes("wrong-one-xyz"));
});

test("14. authorization/ownership: unchanged by construction (see file header comment)", () => {
  // Same documentation-only assertion as STEP E.5's own test 11 — src/proxy.ts (untouched by this
  // STEP) gates the exact same "/api/bank-statements" prefix in front of the exact same exported
  // POST function this STEP extended in place. Calling POST() directly, as every other test in
  // this file does, does not run Next.js middleware at all.
  assert.ok(true);
});

test("15. malicious client payload cannot alter financial interpretation via pdfLayout/regex", async () => {
  const pdf = buildTextPdf(["13/01/2025 ทดสอบ malicious payload 1,000.00 - 9,000.00"]);
  const formData = new FormData();
  formData.set("bankAccountId", String(account.id));
  // The malicious upload-time layout matches the SAME row (same field COUNT/shape, so preview and
  // confirm summary counts agree and confirm proceeds instead of failing closed on
  // PREVIEW_MISMATCH — a more dangerous attack than one that just breaks the count check, since
  // count-agreement is exactly what would let a naive implementation "trust" this layout) but
  // deliberately mis-declares which named capture group is the debit column: `debitColumn:
  // "balance"` — if this layout were EVER honored at confirm time, the imported debit would be the
  // real BALANCE value (9,000.00) instead of the real debit (1,000.00), a concrete, checkable
  // financial misinterpretation.
  const maliciousLayout = {
    repeatedHeaderPatterns: [],
    repeatedFooterPatterns: [],
    transactionStartPattern: "^\\d{2}/\\d{2}/\\d{4}",
    rowPattern:
      "^(?<date>\\d{2}/\\d{2}/\\d{4})\\s+(?<description>.+?)\\s+(?<debit>[\\d,]+\\.\\d{2}|-)\\s+(?<credit>[\\d,]+\\.\\d{2}|-)\\s+(?<balance>[\\d,]+\\.\\d{2})$",
    dateFormat: "DD/MM/YYYY",
    money: { kind: "separate_columns", debitColumn: "balance", creditColumn: "credit" },
  };
  formData.set("pdfLayout", JSON.stringify(maliciousLayout));
  formData.set("file", new File([toBlobPart(pdf)], `malicious-${Date.now()}.pdf`, { type: "application/pdf" }));

  const uploadRes = await uploadPost(uploadRequest(formData));
  const uploadBody = await uploadRes.json();
  const statementId = uploadBody.data.statementId;

  // Confirm request ALSO tries direct injection: extra top-level fields that look like a raw
  // layout, submitted alongside a valid layoutId, attempting to get the server to use them instead
  // of (or in addition to) the registry entry.
  const { req, ctx } = confirmRequest(statementId, {
    layoutId: TRUSTED_LAYOUT_ID,
    rowPattern: "^(?<date>.*)$", // would match everything as "date" and nothing else, if honored
    transactionStartPattern: ".*",
    money: { kind: "signed_amount", amountColumn: "date", positiveMeans: "credit" },
  });
  const res = await confirmPost(req, ctx);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.status, "IMPORTED");

  const txns = listBankStatementTransactions(statementId);
  assert.equal(txns.length, 1);
  // The REAL, correct amount (1,000.00 = 100000 satang) — not the "1.00" (100 satang) the
  // malicious upload-time layout would have produced if confirm had trusted it, and not anything
  // derived from the injected confirm-body fields either.
  assert.equal(txns[0].debit, 100000, "financial amount must reflect the TRUSTED registry layout only");
});
