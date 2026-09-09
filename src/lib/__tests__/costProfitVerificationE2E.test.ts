// Cost/Profit verification — isolated coverage for the two existing mechanisms identified by the
// STEP 125 read-only audit, both of which had ZERO automated test coverage before this file:
//   1. createOrder() (src/lib/orders.ts) — order_items.cost is snapshotted from products.cost at
//      order-creation time and must never change afterward, even if the product's current cost is
//      later edited.
//   2. getProfitSummary() (src/lib/profitSummary.ts) — period-level Revenue / COGS / gross profit,
//      including the STEP 67 rule that a cancelled order's revenue/COGS must be excluded.
//
// Same isolated-synthetic-data approach proven by STEP 122's reconciliationWorkflowE2E.test.ts:
// direct in-process function/DB calls (no HTTP server), uniquely-tagged throwaway records only,
// full cleanup in after() in dependency-safe order. No real customer/order/product/bank data is
// read or written.
//
// getProfitSummary() is a live aggregate over the REAL database — production (port 3000, PID
// confirmed listening during this session) may be creating real orders concurrently. To make this
// test correct regardless of any real activity happening on the same calendar day, every profit
// assertion is DELTA-based: a baseline getProfitSummary() call is taken immediately before creating
// synthetic data, and only the incremental change is asserted — never an absolute value. This is
// deliberate and required for correctness against a live, shared database; it is not a weaker test.
//
// Run: node --import tsx --test "src/lib/__tests__/costProfitVerificationE2E.test.ts"

import { test, after } from "node:test";
import assert from "node:assert/strict";
import db from "@/lib/db";
import { createOrder, updateOrderStatus } from "@/lib/orders";
import { getProfitSummary } from "@/lib/profitSummary";

const TEST_TAG = `COSTPROFIT_E2E_${Date.now()}`;
const TODAY = new Date().toISOString().slice(0, 10);

const createdProductIds: number[] = [];
const createdOrderIds: number[] = [];

// No createProduct() library function exists in this codebase (confirmed during the STEP 126
// pre-implementation audit — product creation is inlined directly in
// src/app/api/products/route.ts's POST handler as a raw INSERT). This mirrors that exact INSERT
// shape for the columns this test needs; unused nullable columns (model/master/year/description/
// category) are left at their schema defaults (NULL), matching the same convention.
function insertSyntheticProduct(name: string, price: number, cost: number, stock: number): number {
  const result = db
    .prepare(`INSERT INTO products (name, price, cost, stock, status) VALUES (?, ?, ?, ?, 'active')`)
    .run(name, price, cost, stock);
  const id = Number(result.lastInsertRowid);
  createdProductIds.push(id);
  return id;
}

function uniqueOrderNumber(suffix: string): string {
  return `${TEST_TAG}-${suffix}-${Math.random().toString(36).slice(2, 8)}`;
}

after(() => {
  // Dependency-safe cleanup order (this schema's foreign_keys pragma is ON, confirmed per the STEP
  // B.7 audit precedent documented in src/lib/db.ts): transactions (order_id FK) -> order_items
  // (order_id + product_id FK) -> inventory_movements (product_id FK) -> orders -> products. Only
  // ids this file itself created (createdOrderIds/createdProductIds) are ever touched — no real
  // record is read or written by this cleanup.
  for (const orderId of createdOrderIds) {
    db.prepare("DELETE FROM transactions WHERE order_id = ?").run(orderId);
  }
  for (const orderId of createdOrderIds) {
    db.prepare("DELETE FROM order_items WHERE order_id = ?").run(orderId);
  }
  for (const productId of createdProductIds) {
    db.prepare("DELETE FROM inventory_movements WHERE product_id = ?").run(productId);
  }
  for (const orderId of createdOrderIds) {
    db.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
  }
  for (const productId of createdProductIds) {
    db.prepare("DELETE FROM products WHERE id = ?").run(productId);
  }
});

// ===== TEST 1 — order_items.cost snapshot behavior (src/lib/orders.ts createOrder(), lines ~99-218) =====

test("1a. order_items.cost snapshots product.cost at order-creation time (quantity = 1)", () => {
  const productId = insertSyntheticProduct(`${TEST_TAG} Product A`, 1000, 400, 50);

  const result = createOrder({
    orderNumber: uniqueOrderNumber("A"),
    items: [{ productId, quantity: 1 }],
  });
  createdOrderIds.push(result.orderId);

  assert.equal(result.items[0].price, 1000);
  assert.equal(result.items[0].cost, 400);

  const row = db
    .prepare("SELECT cost, price, quantity FROM order_items WHERE order_id = ?")
    .get(result.orderId) as { cost: number; price: number; quantity: number };
  assert.equal(row.cost, 400);
  assert.equal(row.price, 1000);
  assert.equal(row.quantity, 1);
});

test("1b. order_items.cost remains the original snapshot after product.cost is edited later", () => {
  const productId = insertSyntheticProduct(`${TEST_TAG} Product B`, 800, 300, 50);

  const result = createOrder({
    orderNumber: uniqueOrderNumber("B"),
    items: [{ productId, quantity: 1 }],
  });
  createdOrderIds.push(result.orderId);

  const before = db
    .prepare("SELECT cost FROM order_items WHERE order_id = ?")
    .get(result.orderId) as { cost: number };
  assert.equal(before.cost, 300);

  // Simulate the product's current cost changing after the order was already placed — the exact
  // scenario the STEP 125 audit flagged as the critical invariant to verify.
  db.prepare("UPDATE products SET cost = ? WHERE id = ?").run(999, productId);

  const currentProductCost = db
    .prepare("SELECT cost FROM products WHERE id = ?")
    .get(productId) as { cost: number };
  assert.equal(currentProductCost.cost, 999, "sanity check: the product's current cost DID change");

  const after = db
    .prepare("SELECT cost FROM order_items WHERE order_id = ?")
    .get(result.orderId) as { cost: number };
  assert.equal(
    after.cost,
    300,
    "order_items.cost must remain the original snapshot (300), never the product's new cost (999)"
  );
});

test("1c. quantity > 1 — cost is stored per unit, matching profitSummary.ts's cost*quantity formula", () => {
  const productId = insertSyntheticProduct(`${TEST_TAG} Product C`, 500, 200, 50);

  const result = createOrder({
    orderNumber: uniqueOrderNumber("C"),
    items: [{ productId, quantity: 3 }],
  });
  createdOrderIds.push(result.orderId);

  assert.equal(result.items[0].quantity, 3);
  assert.equal(result.items[0].cost, 200, "cost is per-unit, not pre-multiplied by quantity");

  const row = db
    .prepare("SELECT cost, quantity FROM order_items WHERE order_id = ?")
    .get(result.orderId) as { cost: number; quantity: number };
  assert.equal(
    row.cost * row.quantity,
    600,
    "total line-item COGS = unit cost * quantity, the exact formula getProfitSummary() uses"
  );
});

// ===== TEST 2 — getProfitSummary() Revenue/COGS/Profit (src/lib/profitSummary.ts) =====

test("2. getProfitSummary() Revenue/COGS/grossProfit deltas match a newly created order exactly", () => {
  const baseline = getProfitSummary({ dateFrom: TODAY, dateTo: TODAY });

  const productId = insertSyntheticProduct(`${TEST_TAG} Product D`, 1000, 400, 50);
  const result = createOrder({
    orderNumber: uniqueOrderNumber("D"),
    items: [{ productId, quantity: 1 }],
  });
  createdOrderIds.push(result.orderId);

  const afterCreate = getProfitSummary({ dateFrom: TODAY, dateTo: TODAY });

  const revenueDelta = afterCreate.revenue - baseline.revenue;
  const cogsDelta = afterCreate.cogs - baseline.cogs;
  const grossProfitDelta = afterCreate.grossProfit - baseline.grossProfit;

  assert.equal(revenueDelta, 1000, "revenue delta must equal this order's total (selling price 1000 x qty 1)");
  assert.equal(cogsDelta, 400, "COGS delta must equal cost*quantity (400 x 1)");
  assert.equal(grossProfitDelta, 600, "gross profit delta = revenue delta (1000) - COGS delta (400) = 600");
});

// ===== TEST 3 — cancellation exclusion, STEP 67 semantics (src/lib/profitSummary.ts lines 32-38) =====

test("3. a cancelled order is excluded from Revenue and COGS in getProfitSummary() (STEP 67)", () => {
  const baseline = getProfitSummary({ dateFrom: TODAY, dateTo: TODAY });

  const productId = insertSyntheticProduct(`${TEST_TAG} Product E`, 700, 250, 50);
  const result = createOrder({
    orderNumber: uniqueOrderNumber("E"),
    items: [{ productId, quantity: 1 }],
  });
  createdOrderIds.push(result.orderId);

  const afterCreate = getProfitSummary({ dateFrom: TODAY, dateTo: TODAY });
  assert.equal(
    afterCreate.revenue - baseline.revenue,
    700,
    "before cancellation, this order's revenue IS counted"
  );
  assert.equal(afterCreate.cogs - baseline.cogs, 250, "before cancellation, this order's COGS IS counted");

  // pending -> cancelled is a valid transition per src/lib/orderStatus.ts's ORDER_STATUS_TRANSITIONS.
  updateOrderStatus(result.orderId, "cancelled");

  const afterCancel = getProfitSummary({ dateFrom: TODAY, dateTo: TODAY });
  assert.equal(
    afterCancel.revenue - baseline.revenue,
    0,
    "after cancellation, this order's revenue must be excluded (STEP 67)"
  );
  assert.equal(
    afterCancel.cogs - baseline.cogs,
    0,
    "after cancellation, this order's COGS must be excluded (STEP 67)"
  );
});

// ===== Isolation check — confirms exactly this file's own synthetic records exist before cleanup =====

test("Isolation check: exactly this file's own synthetic products/orders exist, nothing else", () => {
  assert.equal(createdProductIds.length, 5, "5 synthetic products created (A, B, C, D, E)");
  assert.equal(createdOrderIds.length, 5, "5 synthetic orders created (A, B, C, D, E)");

  const productCountRow = db
    .prepare(
      `SELECT COUNT(*) AS c FROM products WHERE id IN (${createdProductIds.map(() => "?").join(",")})`
    )
    .get(...createdProductIds) as { c: number };
  assert.equal(productCountRow.c, createdProductIds.length);

  const orderCountRow = db
    .prepare(
      `SELECT COUNT(*) AS c FROM orders WHERE id IN (${createdOrderIds.map(() => "?").join(",")})`
    )
    .get(...createdOrderIds) as { c: number };
  assert.equal(orderCountRow.c, createdOrderIds.length);
});
