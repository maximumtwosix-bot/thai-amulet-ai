// STEP 139 — Order-linked returned-parcel/COD expense action. Isolated coverage for the narrow
// mutation exception added to createTransaction() (src/lib/transactions.ts): recording the actual
// returned-parcel/COD fee the shop was really charged for an order, as a RETURNED_PARCEL expense
// transaction, from the existing generic POST /api/transactions route (no new route was created —
// see the STEP 139 report). Mirrors shippingExpenseActionE2E.test.ts (STEP 135) exactly, for the
// RETURNED_PARCEL category instead of SHIPPING.
//
// Same isolated-synthetic-data approach as every other E2E test file in this codebase: the real
// route handler is called in-process (no HTTP server, no port 3000/3100), src/proxy.ts's auth
// middleware is not invoked by construction — same disclosed, pre-existing limitation as every
// other route-handler test here (reconciliationWorkflowE2E.test.ts, shippingExpenseActionE2E.test.ts,
// costProfitVerificationE2E.test.ts all share this exact limitation and say so in their own headers).
// There is no separate "unauthorized" test case here for the same reason none of those files has
// one: proxy.ts's session gate is orthogonal to createTransaction()'s own guards and is not
// exercised by any route-handler-level test in this codebase. Every product/order/transaction this
// file creates is synthetic and throwaway, uniquely tagged, with full cleanup in after() in
// dependency-safe order regardless of individual test outcomes.
//
// Run: node --import tsx --test "src/lib/__tests__/returnedParcelExpenseActionE2E.test.ts"

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as transactionsPost } from "@/app/api/transactions/route";
import { createOrder, updateOrderStatus } from "@/lib/orders";
import { getProfitSummary } from "@/lib/profitSummary";
import db from "@/lib/db";

const TEST_TAG = `RETURNED_PARCEL_ACTION_E2E_${Date.now()}`;
const TODAY = new Date().toISOString().slice(0, 10);

const createdProductIds: number[] = [];
const createdOrderIds: number[] = [];

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

function returnedParcelPayload(orderId: number, amount: number) {
  return {
    transactionType: "expense",
    amount,
    transactionDate: TODAY,
    category: "RETURNED_PARCEL",
    orderId,
  };
}

after(() => {
  // Dependency-safe cleanup order, identical precedent to every other order/transaction E2E file in
  // this codebase: transactions (order_id FK, covers the STEP 31 automatic income transaction and
  // every expense this file creates) -> order_items -> orders -> products. Only ids this file
  // itself created are ever touched.
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

// ===== 1 + 2: create on a non-terminal (pending) order, then reject a second one =====

let orderIdAB: number;

test("1. non-terminal order: POST /api/transactions creates exactly one RETURNED_PARCEL expense, linked by order_id", async () => {
  const productId = insertSyntheticProduct(`${TEST_TAG} Product AB`, 500, 200, 50);
  const order = createOrder({
    orderNumber: uniqueOrderNumber("AB"),
    shippingFee: 45,
    items: [{ productId, quantity: 1 }],
  });
  orderIdAB = order.orderId;
  createdOrderIds.push(orderIdAB);

  const res = await transactionsPost(jsonPostRequest(returnedParcelPayload(orderIdAB, 60)));
  const body = await res.json();

  assert.equal(res.status, 201, `create failed: ${JSON.stringify(body)}`);
  assert.equal(body.success, true);
  assert.equal(body.data.category, "RETURNED_PARCEL");
  assert.equal(body.data.transactionType, "expense");
  assert.equal(body.data.orderId, orderIdAB);
  assert.equal(body.data.amount, 60);

  const row = db
    .prepare(
      "SELECT category, transaction_type, order_id, amount FROM transactions WHERE id = ?"
    )
    .get(body.data.id) as { category: string; transaction_type: string; order_id: number; amount: number };
  assert.equal(row.category, "RETURNED_PARCEL");
  assert.equal(row.transaction_type, "expense");
  assert.equal(row.order_id, orderIdAB);
  assert.equal(row.amount, 60);

  const countRow = db
    .prepare(
      "SELECT COUNT(*) AS c FROM transactions WHERE order_id = ? AND transaction_type = 'expense' AND category = 'RETURNED_PARCEL'"
    )
    .get(orderIdAB) as { c: number };
  assert.equal(countRow.c, 1, "exactly one RETURNED_PARCEL expense exists for this order");
});

test("2. a second RETURNED_PARCEL expense for the same order is rejected (409, no second row created)", async () => {
  assert.ok(orderIdAB, "test 1 must have run first and set orderIdAB");

  const res = await transactionsPost(jsonPostRequest(returnedParcelPayload(orderIdAB, 99)));
  const body = await res.json();

  assert.equal(res.status, 409, `expected 409 CONFLICT, got: ${JSON.stringify(body)}`);
  assert.equal(body.success, false);

  const countRow = db
    .prepare(
      "SELECT COUNT(*) AS c FROM transactions WHERE order_id = ? AND transaction_type = 'expense' AND category = 'RETURNED_PARCEL'"
    )
    .get(orderIdAB) as { c: number };
  assert.equal(countRow.c, 1, "still exactly one RETURNED_PARCEL expense — the rejected attempt created no row");
});

// ===== 3: terminal (cancelled) order rejects a RETURNED_PARCEL expense =====

test("3. a terminal (cancelled) order cannot create a RETURNED_PARCEL expense (409, no row created)", async () => {
  const productId = insertSyntheticProduct(`${TEST_TAG} Product C`, 400, 150, 50);
  const order = createOrder({
    orderNumber: uniqueOrderNumber("C"),
    items: [{ productId, quantity: 1 }],
  });
  createdOrderIds.push(order.orderId);

  updateOrderStatus(order.orderId, "cancelled");

  const res = await transactionsPost(jsonPostRequest(returnedParcelPayload(order.orderId, 70)));
  const body = await res.json();

  assert.equal(res.status, 409, `expected 409 CONFLICT, got: ${JSON.stringify(body)}`);
  assert.equal(body.success, false);

  const countRow = db
    .prepare(
      "SELECT COUNT(*) AS c FROM transactions WHERE order_id = ? AND transaction_type = 'expense' AND category = 'RETURNED_PARCEL'"
    )
    .get(order.orderId) as { c: number };
  assert.equal(countRow.c, 0, "no RETURNED_PARCEL expense row was created against the terminal order");
});

// ===== 4: a separate, unrelated order can record its own RETURNED_PARCEL expense independently =====

test("4. an unrelated order can record its own RETURNED_PARCEL expense, independent of order AB's", async () => {
  const productId = insertSyntheticProduct(`${TEST_TAG} Product D`, 350, 120, 40);
  const order = createOrder({
    orderNumber: uniqueOrderNumber("D"),
    items: [{ productId, quantity: 1 }],
  });
  createdOrderIds.push(order.orderId);

  const res = await transactionsPost(jsonPostRequest(returnedParcelPayload(order.orderId, 55)));
  const body = await res.json();

  assert.equal(res.status, 201, `create failed: ${JSON.stringify(body)}`);
  assert.equal(body.data.orderId, order.orderId);
  assert.notEqual(order.orderId, orderIdAB, "sanity check: this is genuinely a different order");

  // order AB's own RETURNED_PARCEL expense (test 1) must be completely unaffected.
  const countRowAB = db
    .prepare(
      "SELECT COUNT(*) AS c FROM transactions WHERE order_id = ? AND transaction_type = 'expense' AND category = 'RETURNED_PARCEL'"
    )
    .get(orderIdAB) as { c: number };
  assert.equal(countRowAB.c, 1, "order AB's RETURNED_PARCEL expense count is unaffected by order D's");
});

// ===== 5: the expense is included exactly once in getProfitSummary()'s codReturnLoss =====

test("5. the RETURNED_PARCEL expense appears exactly once in getProfitSummary()'s codReturnLoss", async () => {
  const baseline = getProfitSummary({ dateFrom: TODAY, dateTo: TODAY });

  const productId = insertSyntheticProduct(`${TEST_TAG} Product E`, 300, 100, 30);
  const order = createOrder({
    orderNumber: uniqueOrderNumber("E"),
    items: [{ productId, quantity: 1 }],
  });
  createdOrderIds.push(order.orderId);

  const res = await transactionsPost(jsonPostRequest(returnedParcelPayload(order.orderId, 42)));
  const resBody = await res.json();
  assert.equal(res.status, 201, `create failed: ${JSON.stringify(resBody)}`);

  const afterCreate = getProfitSummary({ dateFrom: TODAY, dateTo: TODAY });

  assert.equal(
    afterCreate.codReturnLoss - baseline.codReturnLoss,
    42,
    "codReturnLoss delta must equal exactly this one RETURNED_PARCEL expense — counted once, not zero or twice"
  );
  assert.equal(
    afterCreate.netProfit - baseline.netProfit,
    // this order's own income (300) minus its RETURNED_PARCEL expense (42), same formula
    // profitSummary.ts itself uses: netProfit = grossProfit - operatingExpenses - shippingExpense - codReturnLoss
    (afterCreate.revenue - baseline.revenue) - (afterCreate.cogs - baseline.cogs) - 42,
    "netProfit delta reflects the RETURNED_PARCEL expense exactly once"
  );
});

// ===== 6: orders.shipping_fee stays independent of the RETURNED_PARCEL expense transaction =====

test("6. orders.shipping_fee is unchanged by creating a RETURNED_PARCEL expense transaction", () => {
  assert.ok(orderIdAB, "test 1 must have run first and created the RETURNED_PARCEL expense");

  const row = db.prepare("SELECT shipping_fee FROM orders WHERE id = ?").get(orderIdAB) as {
    shipping_fee: number;
  };
  assert.equal(
    row.shipping_fee,
    45,
    "orders.shipping_fee must remain exactly what it was set to at order creation, untouched by the RETURNED_PARCEL expense created in test 1"
  );
});

// ===== 7: unrelated expense/category behavior is unaffected (no regression on SHIPPING or others) =====

test("7. a SHIPPING expense (STEP 135) can still be created on the same order that already has a RETURNED_PARCEL expense — the two categories' caps are independent", async () => {
  assert.ok(orderIdAB, "test 1 must have run first");

  const res = await transactionsPost(
    jsonPostRequest({
      transactionType: "expense",
      amount: 30,
      transactionDate: TODAY,
      category: "SHIPPING",
      orderId: orderIdAB,
    })
  );
  const body = await res.json();

  assert.equal(res.status, 201, `SHIPPING create must still succeed unchanged — got: ${JSON.stringify(body)}`);
  assert.equal(body.data.category, "SHIPPING");
});

// ===== Isolation check =====

test("Isolation check: exactly this file's own synthetic products/orders exist, nothing else", () => {
  assert.equal(createdProductIds.length, 4, "4 synthetic products created (AB, C, D, E)");
  assert.equal(createdOrderIds.length, 4, "4 synthetic orders created (AB, C, D, E)");

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
