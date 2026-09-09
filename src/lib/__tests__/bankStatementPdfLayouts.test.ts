// STEP E.6.1 — unit tests for src/lib/bankStatementPdfLayouts.ts. Small and focused: this registry
// is consumed by both the Confirm route (STEP E.6) and the GET detail route (STEP E.6.1) as the sole
// source of trusted PDF parsing rules — these tests cover its own contract directly, independent of
// either route.

import { test } from "node:test";
import assert from "node:assert/strict";
import { isKnownPdfLayoutId, getPdfStatementLayout, PDF_STATEMENT_LAYOUTS } from "../bankStatementPdfLayouts";

test("isKnownPdfLayoutId accepts a real registry entry", () => {
  assert.equal(isKnownPdfLayoutId("GENERIC_DATE_DESC_DEBIT_CREDIT_BALANCE_V1"), true);
});

test("isKnownPdfLayoutId rejects an unknown/untrusted id — never guessed, never approximated", () => {
  assert.equal(isKnownPdfLayoutId("ATTACKER_SUPPLIED_LAYOUT"), false);
  assert.equal(isKnownPdfLayoutId(""), false);
  assert.equal(isKnownPdfLayoutId(123), false);
  assert.equal(isKnownPdfLayoutId(null), false);
  assert.equal(isKnownPdfLayoutId(undefined), false);
  // Prototype-pollution-style probe — a bare object's own inherited properties (e.g. "toString")
  // must never be mistaken for a registered layout id.
  assert.equal(isKnownPdfLayoutId("toString"), false);
  assert.equal(isKnownPdfLayoutId("constructor"), false);
});

test("getPdfStatementLayout returns undefined (not a guessed default) for an unknown id", () => {
  assert.equal(getPdfStatementLayout("ATTACKER_SUPPLIED_LAYOUT"), undefined);
});

test("getPdfStatementLayout returns a real, fully-specified layout for a known id", () => {
  const layout = getPdfStatementLayout("GENERIC_DATE_DESC_DEBIT_CREDIT_BALANCE_V1");
  assert.ok(layout);
  assert.ok(layout.transactionStartPattern instanceof RegExp);
  assert.ok(layout.rowPattern instanceof RegExp);
  assert.equal(layout.dateFormat, "DD/MM/YYYY");
  assert.equal(layout.money.kind, "separate_columns");
});

test("SA1500_V1 is registered with the expected shape (amount_with_direction, DD-MM-YY, no direction column in rowPattern)", () => {
  assert.equal(isKnownPdfLayoutId("SA1500_V1"), true);

  const layout = getPdfStatementLayout("SA1500_V1");
  assert.ok(layout);
  assert.equal(layout.dateFormat, "DD-MM-YY");
  assert.equal(layout.money.kind, "amount_with_direction");
  assert.ok(layout.descriptionDirectionTypes);
  // The rowPattern's physical field order must never include a standalone "direction" named group —
  // direction comes only from classifying description's leading token, never from a fake column.
  assert.equal(/\(\?<direction>/.test(layout.rowPattern.source), false);
  assert.ok(/\(\?<description>/.test(layout.rowPattern.source));
});

test("SA1500_V1's closed-set direction config has no token in both credit and debit sets (authoring-time invariant)", () => {
  const layout = getPdfStatementLayout("SA1500_V1");
  assert.ok(layout?.descriptionDirectionTypes);

  const { creditTypes, debitTypes } = layout.descriptionDirectionTypes;
  const overlap = creditTypes.filter((t) => debitTypes.includes(t));
  assert.deepEqual(overlap, [], "no transaction-type token may be classified as both CREDIT and DEBIT");
});

test("the registry has at least one entry and every entry is well-formed", () => {
  const ids = Object.keys(PDF_STATEMENT_LAYOUTS);
  assert.ok(ids.length >= 1);

  for (const id of ids) {
    const layout = PDF_STATEMENT_LAYOUTS[id];
    assert.ok(layout.transactionStartPattern instanceof RegExp, `${id}.transactionStartPattern`);
    assert.ok(layout.rowPattern instanceof RegExp, `${id}.rowPattern`);
    assert.ok(Array.isArray(layout.repeatedHeaderPatterns), `${id}.repeatedHeaderPatterns`);
    assert.ok(Array.isArray(layout.repeatedFooterPatterns), `${id}.repeatedFooterPatterns`);
  }
});
