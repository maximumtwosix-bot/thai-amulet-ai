// STEP E.3 — unit tests for src/lib/bankStatementPdf.ts only.
//
// This project has no test framework/convention installed at all (no jest/vitest/mocha, no `test`
// script, no existing *.test.ts anywhere) — confirmed by reading package.json and searching the
// repo before writing this file. Adding a test framework was treated the same as any other new
// dependency (not pre-approved), so this file uses only Node's own built-in `node:test` +
// `node:assert/strict` — zero new dependencies, runnable today via:
//
//   node --import tsx --test src/lib/__tests__/bankStatementPdf.test.ts
//
// (tsx is already a devDependency, used only as a loader here — nothing new installed for this.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPdfText } from "../bankStatementPdf";
import {
  buildTextPdf,
  buildMultiLineTextPdf,
  buildEncryptedTextPdf,
  buildCorruptedPdf,
  buildNonPdfBuffer,
} from "./pdfFixtures";

test("valid text-based PDF without password", async () => {
  const pdf = buildTextPdf(["Hello Bank Statement"]);
  const result = await extractPdfText(pdf);

  assert.equal(result.error, null);
  assert.equal(result.pageCount, 1);
  assert.equal(result.pageTexts?.length, 1);
  assert.ok(result.text?.includes("Hello Bank Statement"));
});

test("valid password-protected PDF with correct password", async () => {
  const pdf = buildEncryptedTextPdf("test1234", "Secret Balance 1234.56");
  const result = await extractPdfText(pdf, "test1234");

  assert.equal(result.error, null);
  assert.equal(result.pageCount, 1);
  assert.ok(result.text?.includes("Secret Balance 1234.56"));
});

test("wrong password on an encrypted PDF", async () => {
  const pdf = buildEncryptedTextPdf("test1234", "Secret Balance 1234.56");
  const result = await extractPdfText(pdf, "wrong-password");

  assert.equal(result.error, "INCORRECT_PASSWORD");
  assert.equal(result.text, null);
  assert.equal(result.pageTexts, null);
});

test("encrypted PDF opened with no password at all", async () => {
  const pdf = buildEncryptedTextPdf("test1234", "Secret Balance 1234.56");
  const result = await extractPdfText(pdf);

  assert.equal(result.error, "PASSWORD_REQUIRED");
  assert.equal(result.text, null);
});

test("malformed/corrupted PDF (valid magic bytes, garbage body)", async () => {
  const result = await extractPdfText(buildCorruptedPdf());

  assert.equal(result.error, "CORRUPTED_PDF");
  assert.equal(result.text, null);
});

test("non-PDF input (plain text file)", async () => {
  const result = await extractPdfText(buildNonPdfBuffer());

  assert.equal(result.error, "NOT_A_PDF");
  assert.equal(result.text, null);
});

test("multi-page PDF preserves page order and boundaries", async () => {
  const pdf = buildTextPdf(["Page One Content", "Page Two Content", "Page Three Content"]);
  const result = await extractPdfText(pdf);

  assert.equal(result.error, null);
  assert.equal(result.pageCount, 3);
  assert.deepEqual(
    result.pageTexts?.map((t) => t.includes("One") || t.includes("Two") || t.includes("Three")),
    [true, true, true]
  );
  assert.ok(result.pageTexts?.[0].includes("Page One Content"));
  assert.ok(result.pageTexts?.[1].includes("Page Two Content"));
  assert.ok(result.pageTexts?.[2].includes("Page Three Content"));
});

test("empty input buffer", async () => {
  const result = await extractPdfText(Buffer.alloc(0));

  assert.equal(result.error, "EMPTY_INPUT");
  assert.equal(result.text, null);
});

test("minimal PDF with a page but no text layer at all (simulated scan)", async () => {
  const pdf = buildTextPdf([null]);
  const result = await extractPdfText(pdf);

  assert.equal(result.error, "SCANNED_PDF_UNSUPPORTED");
  assert.equal(result.text, null);
});

test("password never appears in the result object, in any branch", async () => {
  const password = "super-secret-password-marker-XYZ";
  const encryptedPdf = buildEncryptedTextPdf(password, "Some Text");

  const results = await Promise.all([
    extractPdfText(encryptedPdf, password),
    extractPdfText(encryptedPdf, "wrong-one"),
    extractPdfText(encryptedPdf),
    extractPdfText(buildCorruptedPdf(), password),
    extractPdfText(buildNonPdfBuffer(), password),
  ]);

  for (const result of results) {
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes(password), `password leaked into result: ${serialized}`);
  }
});

test("pageLines reconstructs distinct lines in top-to-bottom order (STEP E.4)", async () => {
  const pdf = buildMultiLineTextPdf(["First transaction line", "Second transaction line", "Third transaction line"]);
  const result = await extractPdfText(pdf);

  assert.equal(result.error, null);
  assert.deepEqual(result.pageLines, [["First transaction line", "Second transaction line", "Third transaction line"]]);
});

test("password never appears in console output (log/warn/error), in any branch", async () => {
  const password = "super-secret-console-marker-ABC";
  const encryptedPdf = buildEncryptedTextPdf(password, "Some Text");

  const captured: string[] = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  const capture = (...args: unknown[]) => {
    captured.push(args.map((a) => String(a)).join(" "));
  };
  console.log = capture;
  console.warn = capture;
  console.error = capture;

  try {
    await extractPdfText(encryptedPdf, password);
    await extractPdfText(encryptedPdf, "wrong-one");
    await extractPdfText(encryptedPdf);
    await extractPdfText(buildCorruptedPdf(), password);
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  }

  const combined = captured.join("\n");
  assert.ok(!combined.includes(password), `password leaked into console output: ${combined}`);
});
