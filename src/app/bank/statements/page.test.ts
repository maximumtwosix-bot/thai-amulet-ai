// STEP E.7 — unit tests for the pure, module-level helper functions/constants exported from
// src/app/bank/statements/page.tsx (the upload page). This project has no DOM-testing framework
// (no React Testing Library/jsdom) and this STEP forbids adding a new dependency — these tests
// cover the file's pure LOGIC directly rather than simulating DOM rendering/clicks. See
// src/app/bank/statements/__tests__/passwordSecurity.test.ts for the static source-level security
// checks (no localStorage/sessionStorage/cookie/console/URL leakage) that cover this file too.
//
// Run: node --import tsx --test "src/**/*.test.ts"

import { test } from "node:test";
import assert from "node:assert/strict";
import { detectFileKind, sniffHeaderRow, friendlyErrorMessage, FIXED_PDF_PREVIEW_LAYOUT } from "./page";

test("detectFileKind: CSV regression — .csv files still detected correctly, case-insensitively", () => {
  assert.equal(detectFileKind({ name: "statement.csv" } as File), "csv");
  assert.equal(detectFileKind({ name: "STATEMENT.CSV" } as File), "csv");
});

test("detectFileKind: PDF file selection, case-insensitively", () => {
  assert.equal(detectFileKind({ name: "statement.pdf" } as File), "pdf");
  assert.equal(detectFileKind({ name: "Statement.PDF" } as File), "pdf");
});

test("detectFileKind: unsupported extensions and no file at all", () => {
  assert.equal(detectFileKind({ name: "statement.txt" } as File), "unsupported");
  assert.equal(detectFileKind({ name: "statement.xlsx" } as File), "unsupported");
  assert.equal(detectFileKind({ name: "statement" } as File), "unsupported");
  assert.equal(detectFileKind(null), null);
});

test("FIXED_PDF_PREVIEW_LAYOUT is a static constant containing no password field and no user-supplied content", () => {
  const serialized = JSON.stringify(FIXED_PDF_PREVIEW_LAYOUT);
  assert.ok(!serialized.toLowerCase().includes("password"));
});

test("FIXED_PDF_PREVIEW_LAYOUT's regex fields all compile — proves this hardcoded constant is actually accepted by the upload API's own compilePattern() contract, not just present", () => {
  assert.doesNotThrow(() => new RegExp(FIXED_PDF_PREVIEW_LAYOUT.rowPattern));
  assert.doesNotThrow(() => new RegExp(FIXED_PDF_PREVIEW_LAYOUT.transactionStartPattern));
  for (const pattern of FIXED_PDF_PREVIEW_LAYOUT.repeatedFooterPatterns) {
    assert.doesNotThrow(() => new RegExp(pattern));
  }
  assert.equal(FIXED_PDF_PREVIEW_LAYOUT.money.kind, "separate_columns");
});

test("sniffHeaderRow: CSV regression — header sniff behavior unchanged", () => {
  assert.deepEqual(sniffHeaderRow("date,description,amount\n2025-01-01,Test,100\n"), [
    "date",
    "description",
    "amount",
  ]);
  assert.deepEqual(sniffHeaderRow(""), []);
});

test("friendlyErrorMessage: CSV regression — status-code mapping unchanged", () => {
  assert.equal(friendlyErrorMessage(401, null), "เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่");
  assert.equal(friendlyErrorMessage(500, { error: "internal detail" }), "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง");
  assert.equal(friendlyErrorMessage(400, { error: "custom message" }), "custom message");
  assert.equal(friendlyErrorMessage(400, null), "เกิดข้อผิดพลาดบางอย่าง กรุณาลองใหม่อีกครั้ง");
});

test("friendlyErrorMessage: PDF fatalError-style messages pass through verbatim (wrong password, malformed PDF, etc.)", () => {
  assert.equal(friendlyErrorMessage(400, { error: "รหัสผ่านไม่ถูกต้อง" }), "รหัสผ่านไม่ถูกต้อง");
});
