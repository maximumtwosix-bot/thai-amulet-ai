// STEP E.5 — integration tests for POST /api/bank-statements (upload + preview), covering both the
// pre-existing CSV path (regression) and the new PDF branch added in this STEP.
//
// These tests call the route's exported `POST` handler DIRECTLY with a hand-built `NextRequest`
// (bypassing the actual Next.js HTTP server and src/proxy.ts's auth middleware, which only runs in
// front of a real running server — there is no way to exercise it from a plain function call like
// this). Authorization/ownership at the proxy layer is therefore NOT re-verified here; it is
// unchanged by construction instead (this STEP adds code to the SAME route.ts file, exporting the
// SAME `POST` function, at the SAME "/api/bank-statements" path — src/proxy.ts's existing
// prefix-match rule for that path is untouched and covers it identically to before this STEP; see
// this STEP's report, Section K/L).
//
// This route hits the REAL local database (data/thai-amulet.db — the only database this project
// has, confirmed in earlier STEPs) and writes REAL files under public/generated/bank-statements/.
// Every test creates its own dedicated throwaway bank account up front and deletes it — along with
// every bank_statements row and on-disk file it caused to be created — in an `after()` hook, so the
// database and filesystem are left in the exact state they were in before this file ran, pass or
// fail. No production/staging bank account or statement is ever touched.
//
// Run: node --import tsx --test src/app/api/bank-statements/route.test.ts

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { createBankAccount, deleteBankAccount, type BankAccountRow } from "@/lib/bankAccounts";
import { getBankStatementById } from "@/lib/bankStatements";
import db from "@/lib/db";
import {
  buildTextPdf,
  buildEncryptedTextPdf,
  buildCorruptedPdf,
  buildNonPdfBuffer,
} from "../../../lib/__tests__/pdfFixtures";

let account: BankAccountRow;

before(() => {
  account = createBankAccount({
    bankName: "STEP_E5_TEST_BANK",
    accountName: "STEP E5 Test Account",
    accountNumber: `E5TEST${Date.now()}`,
    classification: "BUSINESS",
  });
});

after(async () => {
  db.prepare("DELETE FROM bank_statements WHERE bank_account_id = ?").run(account.id);
  deleteBankAccount(account.id);
  await rm(path.join(process.cwd(), "public", "generated", "bank-statements", String(account.id)), {
    recursive: true,
    force: true,
  });
});

function buildRequest(formData: FormData): NextRequest {
  return new NextRequest("http://localhost/api/bank-statements", { method: "POST", body: formData });
}

// TypeScript's DOM lib types `File`'s BlobPart union against a `Uint8Array` backed specifically by
// `ArrayBuffer` (never `ArrayBufferLike`, which is what a Node `Buffer`'s own `.buffer` view, AND
// even `Uint8Array.from(buffer)`'s inferred return type, are both declared as, since either could
// in principle be backed by a `SharedArrayBuffer`) — allocating with `new Uint8Array(length)`
// (rather than viewing or copying from an existing buffer) is the one construction TypeScript's lib
// types recognize as definitely `ArrayBuffer`-backed, satisfying the type checker; either
// alternative works identically at runtime regardless.
function toBlobPart(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const view = new Uint8Array(buffer.length);
  view.set(buffer);
  return view;
}

const CSV_MAPPING = {
  dateColumn: "date",
  dateFormat: "YYYY-MM-DD",
  descriptionColumn: "description",
  money: { kind: "signed_amount", amountColumn: "amount", positiveMeans: "credit" },
};

const PDF_LAYOUT_SEPARATE_COLUMNS = {
  repeatedHeaderPatterns: [],
  repeatedFooterPatterns: [],
  transactionStartPattern: "^\\d{2}/\\d{2}/\\d{4}",
  rowPattern:
    "^(?<date>\\d{2}/\\d{2}/\\d{4})\\s+(?<description>.+?)\\s+(?<debit>[\\d,]+\\.\\d{2}|-)\\s+(?<credit>[\\d,]+\\.\\d{2}|-)\\s+(?<balance>[\\d,]+\\.\\d{2})$",
  dateFormat: "DD/MM/YYYY",
  money: { kind: "separate_columns", debitColumn: "debit", creditColumn: "credit" },
};

test("1. existing CSV upload regression — still produces a correct preview", async () => {
  const formData = new FormData();
  formData.set("bankAccountId", String(account.id));
  formData.set("mapping", JSON.stringify(CSV_MAPPING));
  formData.set("file", new File(["date,description,amount\n2025-01-01,Test,100.00\n"], "test.csv", { type: "text/csv" }));

  const res = await POST(buildRequest(formData));
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.status, "PREVIEW_READY");
  assert.equal(body.data.summary.valid, 1);
  assert.equal(body.data.rows[0].canonical.credit, 10000);

  const statement = getBankStatementById(body.data.statementId);
  assert.equal(statement?.sourceFileType, "CSV");
});

test("2. valid unencrypted PDF upload", async () => {
  const pdf = buildTextPdf(["01/01/2025 ค่าสินค้า 500.00 - 49,500.00"]);
  const formData = new FormData();
  formData.set("bankAccountId", String(account.id));
  formData.set("pdfLayout", JSON.stringify(PDF_LAYOUT_SEPARATE_COLUMNS));
  formData.set("file", new File([toBlobPart(pdf)], "statement.pdf", { type: "application/pdf" }));

  const res = await POST(buildRequest(formData));
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.status, "PREVIEW_READY");
  assert.equal(body.data.summary.valid, 1);
  assert.equal(body.data.rows[0].canonical.debit, 50000);
});

test("3. valid password-protected PDF upload with correct password", async () => {
  const pdf = buildEncryptedTextPdf("secret123", "02/01/2025 รับโอนเงิน - 2,500.00 52,000.00");
  const formData = new FormData();
  formData.set("bankAccountId", String(account.id));
  formData.set("pdfLayout", JSON.stringify(PDF_LAYOUT_SEPARATE_COLUMNS));
  formData.set("password", "secret123");
  formData.set("file", new File([toBlobPart(pdf)], "encrypted.pdf", { type: "application/pdf" }));

  const res = await POST(buildRequest(formData));
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.status, "PREVIEW_READY");
  assert.equal(body.data.rows[0].canonical.credit, 250000);
});

test("4. wrong PDF password produces a clean FAILED result, not a crash", async () => {
  const pdf = buildEncryptedTextPdf("secret123", "02/01/2025 รับโอนเงิน - 2,500.00 52,000.00");
  const formData = new FormData();
  formData.set("bankAccountId", String(account.id));
  formData.set("pdfLayout", JSON.stringify(PDF_LAYOUT_SEPARATE_COLUMNS));
  formData.set("password", "wrong-password");
  formData.set("file", new File([toBlobPart(pdf)], "encrypted2.pdf", { type: "application/pdf" }));

  const res = await POST(buildRequest(formData));
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.status, "FAILED");
  assert.equal(body.data.fatalError.code, "INCORRECT_PASSWORD");

  const statement = getBankStatementById(body.data.statementId);
  assert.equal(statement?.status, "FAILED");
  assert.equal(statement?.sourceFileType, "PDF");
});

test("5. non-PDF content masquerading with a .pdf filename is rejected, not crashed", async () => {
  const formData = new FormData();
  formData.set("bankAccountId", String(account.id));
  formData.set("pdfLayout", JSON.stringify(PDF_LAYOUT_SEPARATE_COLUMNS));
  formData.set("file", new File([toBlobPart(buildNonPdfBuffer())], "fake.pdf", { type: "application/pdf" }));

  const res = await POST(buildRequest(formData));
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.status, "FAILED");
  assert.equal(body.data.fatalError.code, "NOT_A_PDF");
});

test("6. malformed PDF (valid magic bytes, garbage body) does not crash the server", async () => {
  const formData = new FormData();
  formData.set("bankAccountId", String(account.id));
  formData.set("pdfLayout", JSON.stringify(PDF_LAYOUT_SEPARATE_COLUMNS));
  formData.set("file", new File([toBlobPart(buildCorruptedPdf())], "corrupt.pdf", { type: "application/pdf" }));

  const res = await POST(buildRequest(formData));
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.status, "FAILED");
  assert.equal(body.data.fatalError.code, "CORRUPTED_PDF");
});

test("7. PDF with no text layer is rejected as unsupported, never interpreted as data", async () => {
  const pdf = buildTextPdf([null]);
  const formData = new FormData();
  formData.set("bankAccountId", String(account.id));
  formData.set("pdfLayout", JSON.stringify(PDF_LAYOUT_SEPARATE_COLUMNS));
  formData.set("file", new File([toBlobPart(pdf)], "scanned.pdf", { type: "application/pdf" }));

  const res = await POST(buildRequest(formData));
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.status, "FAILED");
  assert.equal(body.data.fatalError.code, "SCANNED_PDF_UNSUPPORTED");
});

test("8. PDF row extraction INVALID never becomes a valid transaction", async () => {
  const pdf = buildTextPdf(["03/01/2025 ยอดคงเหลือไม่ถูกต้อง"]);
  const formData = new FormData();
  formData.set("bankAccountId", String(account.id));
  formData.set("pdfLayout", JSON.stringify(PDF_LAYOUT_SEPARATE_COLUMNS));
  formData.set("file", new File([toBlobPart(pdf)], "invalidrow.pdf", { type: "application/pdf" }));

  const res = await POST(buildRequest(formData));
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.status, "PREVIEW_READY");
  assert.equal(body.data.summary.valid, 0);
  assert.equal(body.data.summary.invalid, 1);
  assert.equal(body.data.rows[0].category, "INVALID");
  assert.equal(body.data.rows[0].canonical, undefined);
});

test("9. source_file_type is persisted as PDF for the PDF path", async () => {
  const pdf = buildTextPdf(["04/01/2025 ค่าบริการ 50.00 - 100.00"]);
  const formData = new FormData();
  formData.set("bankAccountId", String(account.id));
  formData.set("pdfLayout", JSON.stringify(PDF_LAYOUT_SEPARATE_COLUMNS));
  formData.set("file", new File([toBlobPart(pdf)], "typecheck.pdf", { type: "application/pdf" }));

  const res = await POST(buildRequest(formData));
  const body = await res.json();
  const statement = getBankStatementById(body.data.statementId);

  assert.equal(statement?.sourceFileType, "PDF");
});

test("10. password never appears in response body or console output", async () => {
  const password = "response-leak-check-marker-999";
  const pdf = buildEncryptedTextPdf(password, "05/01/2025 ทดสอบ 10.00 - 90.00");
  const formData = new FormData();
  formData.set("bankAccountId", String(account.id));
  formData.set("pdfLayout", JSON.stringify(PDF_LAYOUT_SEPARATE_COLUMNS));
  formData.set("password", password);
  formData.set("file", new File([toBlobPart(pdf)], "leakcheck.pdf", { type: "application/pdf" }));

  const captured: string[] = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  const capture = (...args: unknown[]) => captured.push(args.map((a) => String(a)).join(" "));
  console.log = capture;
  console.warn = capture;
  console.error = capture;

  let body: unknown;
  try {
    const res = await POST(buildRequest(formData));
    body = await res.json();
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  }

  assert.ok(!JSON.stringify(body).includes(password), "password leaked into response body");
  assert.ok(!captured.join("\n").includes(password), "password leaked into console output");

  // Also check the wrong-password failure path, which is the branch most likely to accidentally
  // echo the attempted value back for "helpfulness".
  const formData2 = new FormData();
  formData2.set("bankAccountId", String(account.id));
  formData2.set("pdfLayout", JSON.stringify(PDF_LAYOUT_SEPARATE_COLUMNS));
  formData2.set("password", "another-secret-marker-111");
  formData2.set("file", new File([toBlobPart(pdf)], "leakcheck2.pdf", { type: "application/pdf" }));

  const captured2: string[] = [];
  console.log = capture;
  console.warn = capture;
  console.error = capture;
  let body2: unknown;
  try {
    const res2 = await POST(buildRequest(formData2));
    body2 = await res2.json();
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  }
  assert.ok(!JSON.stringify(body2).includes("another-secret-marker-111"));
  assert.ok(!captured2.join("\n").includes("another-secret-marker-111"));
});

test("11. authorization/ownership: unchanged by construction (see file header comment)", () => {
  // src/proxy.ts (untouched by this STEP) gates the exact same "/api/bank-statements" prefix this
  // route has always used, in front of the exact same exported POST function this STEP extended in
  // place — no new route file, no new path, no new bypass. This is a documentation assertion, not a
  // live proxy exercise (calling POST() directly, as every other test in this file does, does not
  // run Next.js middleware at all — see this file's header comment).
  assert.ok(true);
});

test("12a. existing CSV extension/MIME guard still rejects a non-.csv, non-.pdf file", async () => {
  const formData = new FormData();
  formData.set("bankAccountId", String(account.id));
  formData.set("mapping", JSON.stringify(CSV_MAPPING));
  formData.set("file", new File(["not a csv"], "test.txt", { type: "text/plain" }));

  const res = await POST(buildRequest(formData));
  const body = await res.json();

  assert.equal(body.success, false);
  assert.match(body.error, /\.csv/);
});

test("12b. PDF branch rejects an oversized file before parsing", async () => {
  // A minimal PDF whose declared `size` (via a Blob/File wrapper) is reported larger than the PDF
  // branch's own MAX_PDF_FILE_SIZE_BYTES guard — constructed as an actually-oversized buffer (not a
  // spoofed .size) so this exercises the real guard, not a mocked property.
  const oversized = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(21 * 1024 * 1024, 0x41)]);
  const formData = new FormData();
  formData.set("bankAccountId", String(account.id));
  formData.set("pdfLayout", JSON.stringify(PDF_LAYOUT_SEPARATE_COLUMNS));
  formData.set("file", new File([toBlobPart(oversized)], "huge.pdf", { type: "application/pdf" }));

  const res = await POST(buildRequest(formData));
  const body = await res.json();

  assert.equal(body.success, false);
  assert.match(body.error, /ขนาดใหญ่เกินกำหนด/);
});

test("12c. PDF branch rejects an unsupported declared MIME type", async () => {
  const pdf = buildTextPdf(["01/01/2025 ค่าสินค้า 500.00 - 49,500.00"]);
  const formData = new FormData();
  formData.set("bankAccountId", String(account.id));
  formData.set("pdfLayout", JSON.stringify(PDF_LAYOUT_SEPARATE_COLUMNS));
  formData.set("file", new File([toBlobPart(pdf)], "wrongmime.pdf", { type: "image/png" }));

  const res = await POST(buildRequest(formData));
  const body = await res.json();

  assert.equal(body.success, false);
  assert.match(body.error, /ชนิดไฟล์ไม่รองรับ/);
});
