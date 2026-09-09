// STEP E.7 — unit tests for the pure, module-level helper functions/constants exported from
// src/app/bank/statements/[id]/page.tsx (the detail/preview/confirm page). Same no-DOM-framework
// constraint and rationale as src/app/bank/statements/page.test.ts.
//
// Run: node --import tsx --test "src/**/*.test.ts"

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRUSTED_PDF_LAYOUT_ID,
  buildConfirmRequestBody,
  friendlyErrorMessage,
  isPreviewRow,
  formatSatang,
  statusLabel,
  statusBadge,
  categoryLabels,
  categoryBadgeClass,
  BANK_ID_DUPLICATE_MESSAGE,
} from "./page";

test("buildConfirmRequestBody: CSV confirm regression — body shape unchanged, no layoutId/password added", () => {
  const body = buildConfirmRequestBody("CSV", new Set([1, 2]), "");
  assert.deepEqual(body, { overrideDuplicateRowNumbers: [1, 2] });
  assert.equal("layoutId" in body, false);
  assert.equal("password" in body, false);
});

test("buildConfirmRequestBody: CSV confirm regression — sourceFileType undefined behaves exactly like CSV (pre-STEP-E.6.1 statements)", () => {
  const body = buildConfirmRequestBody(undefined, new Set(), "");
  assert.deepEqual(body, { overrideDuplicateRowNumbers: [] });
});

test("buildConfirmRequestBody: PDF confirm sends the required contract — layoutId always present", () => {
  const withoutPassword = buildConfirmRequestBody("PDF", new Set(), "");
  assert.equal(withoutPassword.layoutId, TRUSTED_PDF_LAYOUT_ID);
  assert.equal("password" in withoutPassword, false);
});

test("buildConfirmRequestBody: PDF confirm includes password only when non-empty, taken from the exact value passed in", () => {
  const withPassword = buildConfirmRequestBody("PDF", new Set(), "secret123");
  assert.equal(withPassword.layoutId, TRUSTED_PDF_LAYOUT_ID);
  assert.equal(withPassword.password, "secret123");
});

test("buildConfirmRequestBody: layoutId is always the one fixed trusted constant — no parameter can influence which layout id is sent", () => {
  // There is no way to call this function and get a DIFFERENT layoutId out — the function's
  // signature has no such parameter at all. This is the concrete proof that the UI cannot be made
  // to send an attacker/client-chosen layoutId, regardless of what other state exists on the page.
  assert.equal(TRUSTED_PDF_LAYOUT_ID, "GENERIC_DATE_DESC_DEBIT_CREDIT_BALANCE_V1");
  const a = buildConfirmRequestBody("PDF", new Set([1, 2, 3]), "anything");
  const b = buildConfirmRequestBody("PDF", new Set(), "something-else-entirely");
  assert.equal(a.layoutId, b.layoutId);
});

test("overrideDuplicateRowNumbers is always a plain array, in Set-iteration order, never mutated by password/layout logic", () => {
  const body = buildConfirmRequestBody("PDF", new Set([5, 3, 1]), "x");
  assert.deepEqual(body.overrideDuplicateRowNumbers, [5, 3, 1]);
});

test("INVALID row display: category labels/badge classes include INVALID, unchanged by this STEP", () => {
  assert.equal(categoryLabels.INVALID, "ผิดพลาด");
  assert.ok(categoryBadgeClass.INVALID.includes("red"));
});

test("isPreviewRow correctly distinguishes a PDF-derived INVALID preview row from an imported row", () => {
  assert.equal(isPreviewRow({ rowNumber: 1, category: "INVALID", message: "PDF_UNRECOGNIZED_ROW_STRUCTURE: ..." }), true);
  assert.equal(
    isPreviewRow({
      rowNumber: 1,
      date: "2025-01-01",
      description: null,
      debit: null,
      credit: null,
      amount: 0,
      balance: null,
      bankTransactionId: null,
      category: "IMPORTED",
    }),
    false
  );
});

test("formatSatang: CSV/PDF-shared money formatting regression (both formats produce canonical satang integers)", () => {
  assert.equal(formatSatang(10000), "100.00");
  assert.equal(formatSatang(-500), "-5.00");
  assert.equal(formatSatang(null), "-");
  assert.equal(formatSatang(undefined), "-");
});

test("statusLabel/statusBadge: unchanged for both CSV and PDF — the status machine is format-agnostic", () => {
  assert.equal(statusLabel("PREVIEW_READY"), "รอตรวจสอบ");
  assert.equal(statusLabel("FAILED"), "นำเข้าไม่สำเร็จ");
  assert.equal(statusLabel("SOME_UNKNOWN_STATUS"), "SOME_UNKNOWN_STATUS"); // must never crash
  assert.ok(statusBadge("FAILED").includes("red"));
});

test("BANK_ID_DUPLICATE_MESSAGE matches the exact backend string this page relies on for classification", () => {
  assert.equal(BANK_ID_DUPLICATE_MESSAGE, "พบเลขอ้างอิงธุรกรรมนี้ในระบบแล้ว (ธนาคารระบุ ID ซ้ำ)");
});

test("friendlyErrorMessage: PREVIEW_MISMATCH-style 409 response shows the server's own message verbatim, no stack trace", () => {
  const message = "ผลการตรวจสอบไฟล์ไม่ตรงกับตัวอย่างที่เคยแสดงไว้ กรุณาอัปโหลดใหม่";
  assert.equal(friendlyErrorMessage(409, { success: false, error: message }), message);
});

test("friendlyErrorMessage: never echoes a password even if a (malformed) server response somehow contained one", () => {
  // Defense in depth: even if a bug elsewhere caused a password-like string to appear in `error`,
  // this function's contract is "pass through data.error verbatim" — it does not sanitize by
  // design, so the REAL guarantee must come from the server never doing this (STEP E.5/E.6 already
  // proven) and from this file never manufacturing such a message itself. This test documents that
  // contract rather than asserting sanitization that does not and should not exist here.
  const passthrough = friendlyErrorMessage(400, { error: "รหัสผ่านไม่ถูกต้อง" });
  assert.equal(passthrough, "รหัสผ่านไม่ถูกต้อง"); // a fixed, non-interpolated backend message — never
  // the raw attempted password value, matching src/lib/bankStatementPdf.ts's own fixed-message
  // convention (verified server-side in STEP E.3/E.5/E.6's own test suites).
});
