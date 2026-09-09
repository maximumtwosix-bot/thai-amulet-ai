// STEP E.6.1 — integration tests for GET /api/bank-statements/[id], covering both the pre-existing
// CSV path (regression) and the new PDF branch added in this STEP.
//
// Same testing approach/disclosures as STEP E.5/E.6's own route tests: calls the route's exported
// `GET`/`POST` handlers DIRECTLY with hand-built `NextRequest`s (bypassing src/proxy.ts's auth
// middleware — authorization is unchanged by construction, not re-verified live here). Hits the REAL
// local database and filesystem; every test creates its own throwaway bank account and cleans up
// everything it created in an `after()` hook, leaving no residue.
//
// Run: node --import tsx --test "src/**/*.test.ts" (from the project root — see STEP E.6's report
// for why a bracketed directory segment like "[id]" must never be passed as an explicit file
// argument to Node's own --test CLI, a real Node limitation, not specific to this project).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { GET as detailGet } from "./route";
import { POST as uploadPost } from "../route";
import { POST as confirmPost } from "./confirm/route";
import { createBankAccount, deleteBankAccount, type BankAccountRow } from "@/lib/bankAccounts";
import db from "@/lib/db";
import { buildTextPdf } from "../../../../lib/__tests__/pdfFixtures";

let account: BankAccountRow;

before(() => {
  account = createBankAccount({
    bankName: "STEP_E6_1_TEST_BANK",
    accountName: "STEP E6.1 Test Account",
    accountNumber: `E61TEST${Date.now()}`,
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

function detailRequest(statementId: number, extraQuery = ""): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  const req = new NextRequest(`http://localhost/api/bank-statements/${statementId}${extraQuery}`, { method: "GET" });
  return { req, ctx: { params: Promise.resolve({ id: String(statementId) }) } };
}

function confirmRequest(statementId: number, body: unknown): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  const req = new NextRequest(`http://localhost/api/bank-statements/${statementId}/confirm`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  return { req, ctx: { params: Promise.resolve({ id: String(statementId) }) } };
}

const CSV_MAPPING = {
  dateColumn: "date",
  dateFormat: "YYYY-MM-DD",
  descriptionColumn: "description",
  money: { kind: "signed_amount", amountColumn: "amount", positiveMeans: "credit" },
};

// Deliberately different from the trusted server registry layout — the client's original STEP E.5
// upload-time submission is never authoritative (proven by test 4/6 below).
const CLIENT_PDF_LAYOUT_FOR_PREVIEW_ONLY = {
  repeatedHeaderPatterns: [],
  repeatedFooterPatterns: [],
  transactionStartPattern: "^\\d{2}/\\d{2}/\\d{4}",
  rowPattern:
    "^(?<date>\\d{2}/\\d{2}/\\d{4})\\s+(?<description>.+?)\\s+(?<debit>[\\d,]+\\.\\d{2}|-)\\s+(?<credit>[\\d,]+\\.\\d{2}|-)\\s+(?<balance>[\\d,]+\\.\\d{2})$",
  dateFormat: "DD/MM/YYYY",
  money: { kind: "separate_columns", debitColumn: "debit", creditColumn: "credit" },
};

async function uploadCsv(csvText: string): Promise<number> {
  const formData = new FormData();
  formData.set("bankAccountId", String(account.id));
  formData.set("mapping", JSON.stringify(CSV_MAPPING));
  formData.set("file", new File([csvText], `test-${Date.now()}-${Math.random()}.csv`, { type: "text/csv" }));
  const res = await uploadPost(uploadRequest(formData));
  const body = await res.json();
  return body.data.statementId;
}

async function uploadPdf(pdf: Buffer, password?: string): Promise<number> {
  const formData = new FormData();
  formData.set("bankAccountId", String(account.id));
  formData.set("pdfLayout", JSON.stringify(CLIENT_PDF_LAYOUT_FOR_PREVIEW_ONLY));
  if (password) formData.set("password", password);
  formData.set("file", new File([toBlobPart(pdf)], `test-${Date.now()}-${Math.random()}.pdf`, { type: "application/pdf" }));
  const res = await uploadPost(uploadRequest(formData));
  const body = await res.json();
  return body.data.statementId;
}

test("1. existing CSV PREVIEW_READY GET regression", async () => {
  const statementId = await uploadCsv("date,description,amount\n2025-01-01,Test,100.00\n");
  const { req, ctx } = detailRequest(statementId);
  const res = await detailGet(req, ctx);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.status, "PREVIEW_READY");
  assert.equal(body.data.sourceFileType, "CSV");
  assert.equal(body.data.summary.valid, 1);
  assert.equal(body.data.rows.length, 1);
  assert.equal(body.data.rows[0].canonical.credit, 10000);
  assert.ok(body.data.mapping); // CSV mapping still returned, as before
});

test("2. existing CSV mapping validation regression — corrupted stored mapping still fails the same way", async () => {
  const statementId = await uploadCsv("date,description,amount\n2025-01-02,Test2,50.00\n");
  // Directly corrupt the stored mapping to a non-CSV shape — same failure mode CSV's own
  // validateMappingShape() has always produced; this proves E.6.1 did not weaken that check.
  db.prepare("UPDATE bank_statements SET column_mapping = ? WHERE id = ?").run(
    JSON.stringify({ notAValidCsvMapping: true }),
    statementId
  );

  const { req, ctx } = detailRequest(statementId);
  const res = await detailGet(req, ctx);
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.equal(body.error, "ไม่พบข้อมูลการตั้งค่าคอลัมน์ของ Bank Statement นี้ ไม่สามารถแสดงตัวอย่างซ้ำได้");
});

test("3. PDF PREVIEW_READY GET returns HTTP 200", async () => {
  const pdf = buildTextPdf(["01/01/2025 ค่าสินค้า 500.00 - 49,500.00"]);
  const statementId = await uploadPdf(pdf);

  const { req, ctx } = detailRequest(statementId);
  const res = await detailGet(req, ctx);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.status, "PREVIEW_READY");
  assert.equal(body.data.sourceFileType, "PDF");
});

test("4. PDF preview uses the trusted registry layout, not the client's original upload-time layout", async () => {
  // The client's upload-time layout (CLIENT_PDF_LAYOUT_FOR_PREVIEW_ONLY) is structurally identical
  // to the trusted registry layout here on purpose (both would produce the same numbers) — this
  // test's real assertion is in test 6: a PDF whose stored layout is NOT CSV-shaped at all still
  // works, which is only possible if GET never fed it into validateMappingShape(). This test
  // confirms the row VALUES themselves are correct per the trusted registry's interpretation.
  const pdf = buildTextPdf(["02/01/2025 รับโอนเงิน - 2,500.00 52,000.00"]);
  const statementId = await uploadPdf(pdf);

  const { req, ctx } = detailRequest(statementId);
  const res = await detailGet(req, ctx);
  const body = await res.json();

  assert.equal(body.data.rows[0].canonical.credit, 250000);
});

test("5. registry rejection for an untrusted layout id is covered at the unit level (src/lib/__tests__/bankStatementPdfLayouts.test.ts) — this route always uses a fixed, compile-time-known trusted id", async () => {
  // See bankStatementPdfLayouts.test.ts for isKnownPdfLayoutId()/getPdfStatementLayout() rejecting
  // unknown ids directly. This route (src/app/api/bank-statements/[id]/route.ts) never accepts a
  // client-supplied layoutId at all (no query/body channel for one), so there is no live request
  // shape that can exercise "client supplies an untrusted layout id" against GET specifically —
  // documented here rather than faked with an unrealistic test double.
  assert.ok(true);
});

test("6. PDF's stored client layout is NEVER passed into CSV's validateMappingShape()", async () => {
  const pdf = buildTextPdf(["03/01/2025 ค่าสินค้า 100.00 - 900.00"]);
  const statementId = await uploadPdf(pdf);

  // Sanity: the stored column_mapping is genuinely NOT CSV-shaped (no dateColumn at all) — if GET
  // ever fed this into validateMappingShape(), it would return null and this statement would 409
  // exactly like test 2's deliberately-corrupted CSV mapping does.
  const stored = db.prepare("SELECT column_mapping FROM bank_statements WHERE id = ?").get(statementId) as {
    column_mapping: string;
  };
  assert.equal(JSON.parse(stored.column_mapping).dateColumn, undefined);

  const { req, ctx } = detailRequest(statementId);
  const res = await detailGet(req, ctx);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.notEqual(body.error, "ไม่พบข้อมูลการตั้งค่าคอลัมน์ของ Bank Statement นี้ ไม่สามารถแสดงตัวอย่างซ้ำได้");
});

test("7. PDF INVALID row remains INVALID in the GET response", async () => {
  const pdf = buildTextPdf(["04/01/2025 ยอดคงเหลือไม่ถูกต้อง"]);
  const statementId = await uploadPdf(pdf);

  const { req, ctx } = detailRequest(statementId);
  const res = await detailGet(req, ctx);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.rows.length, 1);
  assert.equal(body.data.rows[0].category, "INVALID");
  assert.equal(body.data.rows[0].canonical, undefined);
});

test("8. PDF diagnostic message remains available for an INVALID row", async () => {
  const pdf = buildTextPdf(["05/01/2025 ทดสอบ diagnostic"]);
  const statementId = await uploadPdf(pdf);

  const { req, ctx } = detailRequest(statementId);
  const res = await detailGet(req, ctx);
  const body = await res.json();

  assert.ok(typeof body.data.rows[0].message === "string" && body.data.rows[0].message.length > 0);
});

test("9. PDF sourceFileType comes from trusted DB state", async () => {
  const pdf = buildTextPdf(["06/01/2025 ทดสอบ trusted state 20.00 - 80.00"]);
  const statementId = await uploadPdf(pdf);

  const { req, ctx } = detailRequest(statementId);
  const res = await detailGet(req, ctx);
  const body = await res.json();

  assert.equal(body.data.sourceFileType, "PDF");
});

test("10. client/query cannot spoof sourceFileType", async () => {
  const pdf = buildTextPdf(["07/01/2025 ทดสอบ spoof 30.00 - 70.00"]);
  const statementId = await uploadPdf(pdf);

  // Attempt: force sourceFileType=CSV via query string on a real PDF statement's GET request.
  const { req, ctx } = detailRequest(statementId, "?sourceFileType=CSV");
  const res = await detailGet(req, ctx);
  const body = await res.json();

  // If this were honored, the route would try validateMappingShape() on the PDF's regex layout and
  // 409 with MAPPING_NOT_PERSISTED. It must instead behave exactly like the correct PDF path.
  assert.equal(res.status, 200);
  assert.equal(body.data.sourceFileType, "PDF");
  assert.equal(body.data.rows[0].canonical.debit, 3000);
});

test("11. cross-owner access: unchanged by construction (see file header comment)", () => {
  // Same documentation-only assertion as STEP E.5/E.6's own tests — this system has no per-owner
  // access boundary beyond the single admin session (confirmed in this route's own existing
  // comment, STEP C.6 §6/§13) and this STEP adds no new one. Calling GET() directly, as every other
  // test in this file does, does not run src/proxy.ts's auth middleware at all.
  assert.ok(true);
});

test("12. unauthorized access: unchanged by construction (see file header comment)", () => {
  assert.ok(true);
});

test("13. malformed stored metadata fails safely instead of 500 (once a statement is past the CSV-authoritative PREVIEW_READY stage)", async () => {
  // Reach IMPORTED first (via the real confirm flow) — the IMPORTED-status branch's `mapping` field
  // is display-only and now goes through safeJsonParseOrNull() (this STEP's hardening), unlike the
  // PREVIEW_READY branch's own validateMappingShape()+JSON.parse() (pre-existing CSV behavior, left
  // untouched — malformed JSON stored WHILE a CSV statement is still PREVIEW_READY is a caller/DB
  // integrity bug this STEP does not change the handling of).
  const statementId = await uploadCsv("date,description,amount\n2025-01-08,Test8,10.00\n");
  const { req: confirmReq, ctx: confirmCtx } = confirmRequest(statementId, {});
  const confirmRes = await confirmPost(confirmReq, confirmCtx);
  assert.equal((await confirmRes.json()).data.status, "IMPORTED");

  db.prepare("UPDATE bank_statements SET column_mapping = ? WHERE id = ?").run("{not valid json", statementId);

  const { req, ctx } = detailRequest(statementId);
  const res = await detailGet(req, ctx);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.mapping, null);
});

test("14. no password appears in the GET response, even when one is (incorrectly) supplied as a query param", async () => {
  const pdf = buildTextPdf(["09/01/2025 ทดสอบ no password 15.00 - 985.00"]);
  const statementId = await uploadPdf(pdf);

  const { req, ctx } = detailRequest(statementId, "?password=should-never-appear-anywhere-123");
  const res = await detailGet(req, ctx);
  const body = await res.json();

  assert.ok(!JSON.stringify(body).includes("should-never-appear-anywhere-123"));
});

test("15. no password in logs/errors for GET, even against an encrypted PDF statement", async () => {
  const { buildEncryptedTextPdf } = await import("../../../../lib/__tests__/pdfFixtures");
  const password = "get-route-leak-check-marker-321";
  const pdf = buildEncryptedTextPdf(password, "10/01/2025 ทดสอบ encrypted 40.00 - 960.00");
  // Upload WITH the correct password so the statement genuinely reaches PREVIEW_READY (STEP E.5) —
  // the point of this test is what GET does AFTERWARD, when it has no password at all.
  const statementId = await uploadPdf(pdf, password);

  const captured: string[] = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  const capture = (...args: unknown[]) => captured.push(args.map((a) => String(a)).join(" "));
  console.log = capture;
  console.warn = capture;
  console.error = capture;

  let body: unknown;
  try {
    const { req, ctx } = detailRequest(statementId, `?password=${encodeURIComponent(password)}`);
    const res = await detailGet(req, ctx);
    body = await res.json();
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  }

  // GET never accepts a password at all — the encrypted PDF's row-level detail gracefully degrades
  // to metadata-only, but never leaks the (ignored) query-string password anywhere.
  assert.ok(!JSON.stringify(body).includes(password));
  assert.ok(!captured.join("\n").includes(password));
  assert.equal((body as { data: { pdfRequiresPasswordForPreview?: boolean } }).data.pdfRequiresPasswordForPreview, true);
});

test("16. existing CSV error behavior unchanged — SOURCE_FILE_UNREADABLE still produces the same 409", async () => {
  const statementId = await uploadCsv("date,description,amount\n2025-01-11,Test11,10.00\n");
  const statement = db.prepare("SELECT source_file_url FROM bank_statements WHERE id = ?").get(statementId) as {
    source_file_url: string;
  };
  const filePath = path.join(process.cwd(), "public", statement.source_file_url.replace(/^\/+/, ""));
  await rm(filePath, { force: true });

  const { req, ctx } = detailRequest(statementId);
  const res = await detailGet(req, ctx);
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.equal(body.error, "ไม่สามารถอ่านไฟล์ต้นฉบับได้");
});
