// STEP 135 — Order-linked shipping expense action. Isolated coverage for the narrow mutation
// exception added to createTransaction() (src/lib/transactions.ts): recording the actual carrier
// shipping cost for an order as a SHIPPING expense transaction, from the existing generic
// POST /api/transactions route (no new route was created — see the STEP 135 report).
//
// Same isolated-synthetic-data approach as costProfitVerificationE2E.test.ts (STEP 125/126) and
// reconciliationWorkflowE2E.test.ts (STEP 121): the real route handler is called in-process (no HTTP
// server, no port 3000/3100), src/proxy.ts's auth middleware is not invoked by construction (same
// disclosed, pre-existing limitation as every other route-handler test in this codebase). Every
// product/order/transaction this file creates is synthetic and throwaway, uniquely tagged, with full
// cleanup in after() in dependency-safe order regardless of individual test outcomes.
//
// Run: node --import tsx --test "src/lib/__tests__/shippingExpenseActionE2E.test.ts"

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as transactionsPost } from "@/app/api/transactions/route";
import { createOrder, updateOrderStatus } from "@/lib/orders";
import db from "@/lib/db";

const TEST_TAG = `SHIPPING_ACTION_E2E_${Date.now()}`;
const TODAY = new Date().toISOString().slice(0, 10);

const createdProductIds: number[] = [];
const createdOrderIds: number[] = [];

// No createProduct() library function exists in this codebase (same finding as the STEP 126
// pre-implementation audit that costProfitVerificationE2E.test.ts documents) — mirrors that same
// raw-INSERT shape.
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

function jsonPostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/transactions", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function shippingExpensePayload(orderId: number, amount: number) {
  return {
    transactionType: "expense",
    amount,
    transactionDate: TODAY,
    category: "SHIPPING",
    orderId,
  };
}

after(() => {
  // Dependency-safe cleanup order, identical to costProfitVerificationE2E.test.ts's precedent:
  // transactions (order_id FK, covers both the STEP 31 automatic income transaction and every
  // SHIPPING/other expense this file creates) -> order_items -> inventory_movements -> orders ->
  // products. Only ids this file itself created are ever touched.
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

// ===== A + B: create on a non-terminal (pending) order, then reject a second one =====

let orderIdAB: number;

test("A. non-terminal order: POST /api/transactions creates exactly one SHIPPING expense, linked by order_id, category SHIPPING", async () => {
  const productId = insertSyntheticProduct(`${TEST_TAG} Product AB`, 500, 200, 50);
  const order = createOrder({
    orderNumber: uniqueOrderNumber("AB"),
    shippingFee: 45,
    items: [{ productId, quantity: 1 }],
  });
  orderIdAB = order.orderId;
  createdOrderIds.push(orderIdAB);

  const res = await transactionsPost(jsonPostRequest(shippingExpensePayload(orderIdAB, 60)));
  const body = await res.json();

  assert.equal(res.status, 201, `create failed: ${JSON.stringify(body)}`);
  assert.equal(body.success, true);
  assert.equal(body.data.category, "SHIPPING");
  assert.equal(body.data.transactionType, "expense");
  assert.equal(body.data.orderId, orderIdAB);
  assert.equal(body.data.amount, 60);

  const row = db
    .prepare(
      "SELECT category, transaction_type, order_id, amount FROM transactions WHERE id = ?"
    )
    .get(body.data.id) as { category: string; transaction_type: string; order_id: number; amount: number };
  assert.equal(row.category, "SHIPPING");
  assert.equal(row.transaction_type, "expense");
  assert.equal(row.order_id, orderIdAB);
  assert.equal(row.amount, 60);

  const countRow = db
    .prepare(
      "SELECT COUNT(*) AS c FROM transactions WHERE order_id = ? AND transaction_type = 'expense' AND category = 'SHIPPING'"
    )
    .get(orderIdAB) as { c: number };
  assert.equal(countRow.c, 1, "exactly one SHIPPING expense exists for this order");
});

test("B. a second SHIPPING expense for the same order is rejected (409, no second row created)", async () => {
  assert.ok(orderIdAB, "test A must have run first and set orderIdAB");

  const res = await transactionsPost(jsonPostRequest(shippingExpensePayload(orderIdAB, 99)));
  const body = await res.json();

  assert.equal(res.status, 409, `expected 409 CONFLICT, got: ${JSON.stringify(body)}`);
  assert.equal(body.success, false);

  const countRow = db
    .prepare(
      "SELECT COUNT(*) AS c FROM transactions WHERE order_id = ? AND transaction_type = 'expense' AND category = 'SHIPPING'"
    )
    .get(orderIdAB) as { c: number };
  assert.equal(countRow.c, 1, "still exactly one SHIPPING expense — the rejected attempt created no row");
});

// ===== C: terminal (cancelled) order rejects a SHIPPING expense =====

test("C. a terminal (cancelled) order cannot create a SHIPPING expense (409, no row created)", async () => {
  const productId = insertSyntheticProduct(`${TEST_TAG} Product C`, 400, 150, 50);
  const order = createOrder({
    orderNumber: uniqueOrderNumber("C"),
    items: [{ productId, quantity: 1 }],
  });
  createdOrderIds.push(order.orderId);

  // pending -> cancelled is a valid transition per src/lib/orderStatus.ts's ORDER_STATUS_TRANSITIONS,
  // and cancelled has an empty transition list (terminal).
  updateOrderStatus(order.orderId, "cancelled");

  const res = await transactionsPost(jsonPostRequest(shippingExpensePayload(order.orderId, 70)));
  const body = await res.json();

  assert.equal(res.status, 409, `expected 409 CONFLICT, got: ${JSON.stringify(body)}`);
  assert.equal(body.success, false);

  const countRow = db
    .prepare(
      "SELECT COUNT(*) AS c FROM transactions WHERE order_id = ? AND transaction_type = 'expense' AND category = 'SHIPPING'"
    )
    .get(order.orderId) as { c: number };
  assert.equal(countRow.c, 0, "no SHIPPING expense row was created against the terminal order");
});

// ===== D: orders.shipping_fee stays independent of the SHIPPING expense transaction =====

test("D. orders.shipping_fee is unchanged by creating a SHIPPING expense transaction", () => {
  assert.ok(orderIdAB, "test A must have run first and created the SHIPPING expense");

  const row = db.prepare("SELECT shipping_fee FROM orders WHERE id = ?").get(orderIdAB) as {
    shipping_fee: number;
  };
  assert.equal(
    row.shipping_fee,
    45,
    "orders.shipping_fee must remain exactly what it was set to at order creation, untouched by the SHIPPING expense created in test A"
  );
});

// ===== E: unrelated expense behavior is unaffected (no regression) =====

test("E1. a non-SHIPPING expense can still be created freely on the same order that already has a SHIPPING expense (only SHIPPING is capped at one)", async () => {
  assert.ok(orderIdAB, "test A must have run first");

  const res = await transactionsPost(
    jsonPostRequest({
      transactionType: "expense",
      amount: 20,
      transactionDate: TODAY,
      category: "PACKAGING",
      orderId: orderIdAB,
    })
  );
  const body = await res.json();

  assert.equal(res.status, 201, `create failed: ${JSON.stringify(body)}`);
  assert.equal(body.data.category, "PACKAGING");
});

test("E2. a non-SHIPPING expense can still be created on a terminal (cancelled) order (the terminal guard is scoped to SHIPPING only)", async () => {
  const productId = insertSyntheticProduct(`${TEST_TAG} Product E2`, 300, 100, 50);
  const order = createOrder({
    orderNumber: uniqueOrderNumber("E2"),
    items: [{ productId, quantity: 1 }],
  });
  createdOrderIds.push(order.orderId);

  updateOrderStatus(order.orderId, "cancelled");

  // STEP 139 — RETURNED_PARCEL (used here originally) now has its own terminal-order guard, so it
  // is no longer a valid "unrestricted" control category for this assertion. COD_FEE is used
  // instead — still a plain, unguarded expense category as of STEP 139 — to preserve this test's
  // original intent (proving the SHIPPING terminal guard doesn't over-apply to sibling categories)
  // without asserting something that would now be false for RETURNED_PARCEL specifically.
  const res = await transactionsPost(
    jsonPostRequest({
      transactionType: "expense",
      amount: 15,
      transactionDate: TODAY,
      category: "COD_FEE",
      orderId: order.orderId,
    })
  );
  const body = await res.json();

  assert.equal(
    res.status,
    201,
    `COD_FEE on a terminal order must still succeed unchanged — got: ${JSON.stringify(body)}`
  );
  assert.equal(body.data.category, "COD_FEE");
});

// ===== Isolation check =====

test("Isolation check: exactly this file's own synthetic products/orders exist, nothing else", () => {
  assert.equal(createdProductIds.length, 3, "3 synthetic products created (AB, C, E2)");
  assert.equal(createdOrderIds.length, 3, "3 synthetic orders created (AB, C, E2)");

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
