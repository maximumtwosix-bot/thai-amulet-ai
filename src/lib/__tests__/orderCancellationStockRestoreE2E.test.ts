// STEP 137 — Order cancellation inventory restore. Isolated regression coverage for the
// inventory-drift gap the STEP 136 audit flagged: cancelling an order (src/lib/orders.ts
// updateOrderStatus()) previously never restored the stock that same order's own creation deducted
// (STEP 32's original, explicitly-approved scope). This file verifies the STEP 137 fix: cancellation
// now restores exactly the deducted quantity, exactly once, without touching unrelated products,
// order-item cost snapshots, or the terminal-status/transition guards.
//
// Same isolated-synthetic-data approach as costProfitVerificationE2E.test.ts (STEP 125/126): direct
// in-process library calls (no HTTP server), synthetic products/orders only, uniquely tagged, full
// cleanup in after() in dependency-safe order regardless of individual test outcomes.
//
// Run: node --import tsx --test "src/lib/__tests__/orderCancellationStockRestoreE2E.test.ts"

import { test, after } from "node:test";
import assert from "node:assert/strict";
import db from "@/lib/db";
import { createOrder, updateOrderStatus } from "@/lib/orders";

const TEST_TAG = `CANCEL_RESTORE_E2E_${Date.now()}`;

const createdProductIds: number[] = [];
const createdOrderIds: number[] = [];

// No createProduct() library function exists in this codebase (same finding documented in
// costProfitVerificationE2E.test.ts) — mirrors that same raw-INSERT shape.
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

function getStock(productId: number): number {
  const row = db.prepare("SELECT stock FROM products WHERE id = ?").get(productId) as {
    stock: number;
  };
  return row.stock;
}

function countMovements(orderId: number, movementType: string): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS c FROM inventory_movements WHERE reference_type = 'order' AND reference_id = ? AND movement_type = ?"
    )
    .get(orderId, movementType) as { c: number };
  return row.c;
}

after(() => {
  // Dependency-safe cleanup order, same precedent as costProfitVerificationE2E.test.ts: transactions
  // (order_id FK, covers the STEP 31 automatic income transaction) -> order_items -> inventory
  // movements -> orders -> products. Only ids this file itself created are ever touched.
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

// ===== Main scenario: create -> deduct -> cancel -> restore -> re-cancel rejected =====

let orderId: number;
let productA: number;
let productB: number;
let unrelatedProduct: number;

test("1-2-3. creating a (2-item) order deducts stock and records 'sale' inventory movements", () => {
  productA = insertSyntheticProduct(`${TEST_TAG} Product A`, 500, 200, 50);
  productB = insertSyntheticProduct(`${TEST_TAG} Product B`, 300, 100, 20);
  unrelatedProduct = insertSyntheticProduct(`${TEST_TAG} Unrelated Product`, 400, 150, 30);

  const order = createOrder({
    orderNumber: uniqueOrderNumber("MAIN"),
    items: [
      { productId: productA, quantity: 5 },
      { productId: productB, quantity: 3 },
    ],
  });
  orderId = order.orderId;
  createdOrderIds.push(orderId);

  assert.equal(getStock(productA), 45, "product A stock deducted by 5 at order creation");
  assert.equal(getStock(productB), 17, "product B stock deducted by 3 at order creation");
  assert.equal(getStock(unrelatedProduct), 30, "unrelated product stock untouched by order creation");

  assert.equal(countMovements(orderId, "sale"), 2, "one 'sale' movement per order item");
  assert.equal(countMovements(orderId, "return"), 0, "no 'return' movement yet");
});

test("4-5. cancelling the order restores exactly the deducted quantity, exactly once", () => {
  assert.ok(orderId, "previous test must have run first and set orderId");

  const costBefore = db
    .prepare("SELECT product_id, cost FROM order_items WHERE order_id = ? ORDER BY product_id")
    .all(orderId) as Array<{ product_id: number; cost: number }>;

  const result = updateOrderStatus(orderId, "cancelled");
  assert.equal(result.status, "cancelled");

  assert.equal(getStock(productA), 50, "product A stock restored to its pre-order level");
  assert.equal(getStock(productB), 20, "product B stock restored to its pre-order level");

  assert.equal(countMovements(orderId, "sale"), 2, "the original 'sale' movements are untouched");
  assert.equal(countMovements(orderId, "return"), 2, "exactly one 'return' movement per order item");

  const returnMovements = db
    .prepare(
      "SELECT product_id, quantity_change FROM inventory_movements WHERE reference_type = 'order' AND reference_id = ? AND movement_type = 'return' ORDER BY product_id"
    )
    .all(orderId) as Array<{ product_id: number; quantity_change: number }>;
  assert.deepEqual(
    returnMovements,
    [
      { product_id: productA, quantity_change: 5 },
      { product_id: productB, quantity_change: 3 },
    ],
    "restored quantities exactly match the originally deducted quantities"
  );

  const costAfter = db
    .prepare("SELECT product_id, cost FROM order_items WHERE order_id = ? ORDER BY product_id")
    .all(orderId) as Array<{ product_id: number; cost: number }>;
  assert.deepEqual(costAfter, costBefore, "order_items.cost snapshot is untouched by cancellation");
});

test("6. a repeated cancellation attempt on the already-cancelled order is rejected and restores nothing again", () => {
  assert.ok(orderId, "test 4-5 must have run first");

  assert.throws(
    () => updateOrderStatus(orderId, "cancelled"),
    (err: unknown) => err instanceof Error && err.message === "INVALID_STATUS_TRANSITION",
    "cancelling an already-cancelled order must be rejected, not silently re-applied"
  );

  assert.equal(getStock(productA), 50, "product A stock unchanged by the rejected re-cancel attempt");
  assert.equal(getStock(productB), 20, "product B stock unchanged by the rejected re-cancel attempt");
  assert.equal(countMovements(orderId, "return"), 2, "still exactly one 'return' movement per item — no double restore");
});

test("7. an unrelated product's stock is unaffected by this order's entire lifecycle", () => {
  assert.equal(getStock(unrelatedProduct), 30, "unrelated product stock never changed by creation, cancellation, or the rejected re-cancel");
});

// ===== A separate order to prove an invalid transition (never reaching 'cancelled' at all) never
// restores anything, distinguishing "invalid transition" from "already cancelled" above. =====

test("6b. an invalid, non-cancellation transition never restores stock either", () => {
  const productC = insertSyntheticProduct(`${TEST_TAG} Product C`, 250, 90, 10);
  const order = createOrder({
    orderNumber: uniqueOrderNumber("INVALID"),
    items: [{ productId: productC, quantity: 2 }],
  });
  createdOrderIds.push(order.orderId);

  assert.equal(getStock(productC), 8, "sanity check: stock deducted at creation");

  // pending -> completed is NOT a valid direct transition per ORDER_STATUS_TRANSITIONS
  // (pending's own list is only ["paid", "cancelled"]).
  assert.throws(
    () => updateOrderStatus(order.orderId, "completed"),
    (err: unknown) => err instanceof Error && err.message === "INVALID_STATUS_TRANSITION"
  );

  assert.equal(getStock(productC), 8, "stock unchanged by the rejected, non-cancellation transition");
  assert.equal(countMovements(order.orderId, "return"), 0, "no 'return' movement was ever created");
});

// ===== Isolation check =====

test("Isolation check: exactly this file's own synthetic products/orders exist, nothing else", () => {
  assert.equal(createdProductIds.length, 4, "4 synthetic products created (A, B, Unrelated, C)");
  assert.equal(createdOrderIds.length, 2, "2 synthetic orders created (MAIN, INVALID)");

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
