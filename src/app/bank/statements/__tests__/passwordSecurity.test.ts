// STEP E.7 — static source-level security checks for both Bank Statement PDF UI pages.
//
// This project has no DOM-testing framework (no React Testing Library/jsdom) and this STEP forbids
// adding one — a real browser-storage/console/network assertion (e.g. "does this component ever
// actually call localStorage.setItem") cannot be exercised through rendering. Reading the two
// source files as plain text and asserting the FORBIDDEN APIs/patterns never appear in them at all
// is a legitimate, repeatable, CI-friendly substitute for exactly what this STEP's "SECURITY AUDIT"
// section asks to verify (localStorage / sessionStorage / cookie / console.log / URL leakage of the
// PDF password) — if the API is never actually called anywhere in the file, the component
// categorically cannot use it, regardless of what interaction path a real browser test might take.
// Checks look for actual API-usage syntax (a trailing `.` — e.g. `localStorage.setItem`), not the
// bare word, since this file's OWN explanatory comments legitimately discuss these APIs by name.
//
// Run: node --import tsx --test "src/**/*.test.ts"

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const FILES: Array<[string, string]> = [
  ["upload page", path.join(process.cwd(), "src", "app", "bank", "statements", "page.tsx")],
  ["detail/confirm page", path.join(process.cwd(), "src", "app", "bank", "statements", "[id]", "page.tsx")],
];

// Extracts one function's full body (balanced-brace scan from its opening `{` to the matching
// closing `}`) given the exact text of its signature/start — robust regardless of how long the
// function is or how many comments it contains, unlike a fixed-length slice.
function extractFunctionBody(source: string, functionStartMarker: string): string {
  const markerIndex = source.indexOf(functionStartMarker);
  assert.ok(markerIndex >= 0, `marker not found: ${functionStartMarker}`);

  const openBraceIndex = source.indexOf("{", markerIndex);
  assert.ok(openBraceIndex >= 0, `no opening brace found after: ${functionStartMarker}`);

  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(openBraceIndex, i + 1);
    }
  }

  throw new Error(`unbalanced braces scanning from: ${functionStartMarker}`);
}

for (const [label, filePath] of FILES) {
  const source = readFileSync(filePath, "utf8");

  test(`${label}: never actually calls localStorage`, () => {
    assert.ok(!/localStorage\s*\./.test(source), `${label} must never call a localStorage method`);
  });

  test(`${label}: never actually calls sessionStorage`, () => {
    assert.ok(!/sessionStorage\s*\./.test(source), `${label} must never call a sessionStorage method`);
  });

  test(`${label}: never references document.cookie`, () => {
    assert.ok(!source.includes("document.cookie"), `${label} must never touch cookies`);
  });

  test(`${label}: contains no console.* call at all`, () => {
    assert.ok(
      !/console\.(log|warn|error|info|debug|trace)\s*\(/.test(source),
      `${label} must never call console.* (verified: this file has none today, STEP E.7)`
    );
  });

  test(`${label}: no fetch() URL ever references the password state or embeds a "password=" query param`, () => {
    const fetchCalls = source.match(/fetch\(\s*(`[^`]*`|"[^"]*"|'[^']*')/g) ?? [];
    assert.ok(fetchCalls.length > 0, `${label} should have at least one fetch() call to check`);
    for (const call of fetchCalls) {
      assert.ok(!call.includes("pdfPassword"), `${label}: fetch URL references pdfPassword: ${call}`);
      assert.ok(!/password\s*=/i.test(call), `${label}: fetch URL embeds a password query param: ${call}`);
    }
  });

  test(`${label}: any password input is a real type="password" field, never plaintext text/type="text"`, () => {
    if (!source.includes("pdfPassword")) return; // this file has no password field at all — fine
    const inputBlocks = source.match(/<input[^>]*id="[^"]*password[^"]*"[\s\S]*?\/>/gi) ?? [];
    assert.ok(inputBlocks.length > 0, `${label} references pdfPassword but has no password input to check`);
    for (const block of inputBlocks) {
      assert.ok(/type="password"/.test(block), `${label}: password input is not type="password": ${block}`);
    }
  });
}

test("upload page: onFileChange clears the password state (a password typed for a previous file must never linger)", () => {
  const source = readFileSync(FILES[0][1], "utf8");
  const body = extractFunctionBody(source, "async function onFileChange");
  assert.ok(body.includes('setPdfPassword("")'), "onFileChange must clear pdfPassword");
});

test("upload page: submitUpload's finally block clears the password state after every attempt", () => {
  const source = readFileSync(FILES[0][1], "utf8");
  const body = extractFunctionBody(source, "async function submitUpload");
  // "finally {" (the exact keyword-plus-brace syntax), not the bare word "finally" — this file's
  // own explanatory comments legitimately use the word "finally" in backticks/prose before the
  // real keyword appears.
  const finallyBody = extractFunctionBody(body, "finally {");
  assert.ok(finallyBody.includes('setPdfPassword("")'), "submitUpload's finally block must clear pdfPassword");
});

test("detail/confirm page: submitConfirm's finally block clears the password state after every attempt", () => {
  const source = readFileSync(FILES[1][1], "utf8");
  const body = extractFunctionBody(source, "async function submitConfirm");
  // "finally {" (the exact keyword-plus-brace syntax), not the bare word "finally" — this file's
  // own explanatory comments legitimately use the word "finally" in backticks/prose before the
  // real keyword appears.
  const finallyBody = extractFunctionBody(body, "finally {");
  assert.ok(finallyBody.includes('setPdfPassword("")'), "submitConfirm's finally block must clear pdfPassword");
});
