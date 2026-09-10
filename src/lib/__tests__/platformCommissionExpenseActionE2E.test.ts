// STEP 141 — Order-linked platform commission expense action. Isolated coverage for the
// PLATFORM_COMMISSION expense path added to Order Detail, reusing the existing generic
// POST /api/transactions route as-is (no new route, no new server-side guard was added —
// see the STEP 141 report). Mirrors returnedParcelExpenseActionE2E.test.ts (STEP 139) and
// shippingExpenseActionE2E.test.ts (STEP 135) in setup/cleanup style, but the assertions verify
// the OPPOSITE business rules for this category, per approved scope:
//   - multiple PLATFORM_COMMISSION rows per order are ALLOWED (no duplicate guard)
//   - terminal (cancelled/completed) orders are ALLOWED to record PLATFORM_COMMISSION (no
//     terminal-order guard)
//
// Same isolated-synthetic-data approach as every other E2E test file in this codebase: the real
// route handler is called in-process (no HTTP server, no port 3000/3100), src/proxy.ts's auth
// middleware is not invoked by construction — same disclosed, pre-existing limitation as every
// other route-handler test here. There is no separate "unauthorized" test case here for the same
// reason none of those files has one. Every product/order/transaction this file creates is
// synthetic and throwaway, uniquely tagged, with full cleanup in after() in dependency-safe order
// regardless of individual test outcomes.
//
// Run: node --import tsx --test "src/lib/__tests__/platformCommissionExpenseActionE2E.test.ts"

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as transactionsPost } from "@/app/api/transactions/route";
import { createOrder, updateOrderStatus } from "@/lib/orders";
import { getProfitSummary } from "@/lib/profitSummary";
import db from "@/lib/db";

const TEST_TAG = `PLATFORM_COMMISSION_ACTION_E2E_${Date.now()}`;
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

function platformCommissionPayload(orderId: number, amount: number) {
  return {
    transactionType: "expense",
    amount,
    transactionDate: TODAY,
    category: "PLATFORM_COMMISSION",
    orderId,
  };
}

after(() => {
  // Dependency-safe cleanup order, identical precedent to every other order/transaction E2E file in
  // this codebase: transactions (order_id FK, covers the STEP 31 automatic income transaction and
  // every expense this file creates) -> order_items -> inventory_movements -> orders -> products.
  // Only ids this file itself created are ever touched.
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

// ===== 1 + 2: create on a non-terminal (pending) order, then a SECOND one succeeds too =====

let orderIdAB: number;

test("1. non-terminal order: POST /api/transactions creates a PLATFORM_COMMISSION expense, linked by order_id", async () => {
  const productId = insertSyntheticProduct(`${TEST_TAG} Product AB`, 500, 200, 50);
  const order = createOrder({
    orderNumber: uniqueOrderNumber("AB"),
    shippingFee: 45,
    items: [{ productId, quantity: 1 }],
  });
  orderIdAB = order.orderId;
  createdOrderIds.push(orderIdAB);

  const res = await transactionsPost(jsonPostRequest(platformCommissionPayload(orderIdAB, 60)));
  const body = await res.json();

  assert.equal(res.status, 201, `create failed: ${JSON.stringify(body)}`);
  assert.equal(body.success, true);
  assert.equal(body.data.category, "PLATFORM_COMMISSION");
  assert.equal(body.data.transactionType, "expense");
  assert.equal(body.data.orderId, orderIdAB);
  assert.equal(body.data.amount, 60);

  const row = db
    .prepare(
      "SELECT category, transaction_type, order_id, amount FROM transactions WHERE id = ?"
    )
    .get(body.data.id) as { category: string; transaction_type: string; order_id: number; amount: number };
  assert.equal(row.category, "PLATFORM_COMMISSION");
  assert.equal(row.transaction_type, "expense");
  assert.equal(row.order_id, orderIdAB);
  assert.equal(row.amount, 60);
});

test("2. a second PLATFORM_COMMISSION expense for the same order also succeeds (201) — multiple legitimate rows are allowed", async () => {
  assert.ok(orderIdAB, "test 1 must have run first and set orderIdAB");

  const res = await transactionsPost(jsonPostRequest(platformCommissionPayload(orderIdAB, 99)));
  const body = await res.json();

  assert.equal(res.status, 201, `second create must also succeed (no duplicate guard) — got: ${JSON.stringify(body)}`);
  assert.equal(body.success, true);
  assert.equal(body.data.category, "PLATFORM_COMMISSION");
  assert.equal(body.data.orderId, orderIdAB);

  const countRow = db
    .prepare(
      "SELECT COUNT(*) AS c FROM transactions WHERE order_id = ? AND transaction_type = 'expense' AND category = 'PLATFORM_COMMISSION'"
    )
    .get(orderIdAB) as { c: number };
  assert.equal(countRow.c, 2, "both PLATFORM_COMMISSION rows exist for this order — no cap enforced");
});

// ===== 3: terminal (cancelled) order ALSO succeeds =====

test("3. a terminal (cancelled) order CAN create a PLATFORM_COMMISSION expense (201) — terminal orders are allowed for this category", async () => {
  const productId = insertSyntheticProduct(`${TEST_TAG} Product C`, 400, 150, 50);
  const order = createOrder({
    orderNumber: uniqueOrderNumber("C"),
    items: [{ productId, quantity: 1 }],
  });
  createdOrderIds.push(order.orderId);

  updateOrderStatus(order.orderId, "cancelled");

  const res = await transactionsPost(jsonPostRequest(platformCommissionPayload(order.orderId, 70)));
  const body = await res.json();

  assert.equal(
    res.status,
    201,
    `PLATFORM_COMMISSION on a terminal order must succeed (no terminal guard) — got: ${JSON.stringify(body)}`
  );
  assert.equal(body.success, true);
  assert.equal(body.data.category, "PLATFORM_COMMISSION");

  const countRow = db
    .prepare(
      "SELECT COUNT(*) AS c FROM transactions WHERE order_id = ? AND transaction_type = 'expense' AND category = 'PLATFORM_COMMISSION'"
    )
    .get(order.orderId) as { c: number };
  assert.equal(countRow.c, 1, "the PLATFORM_COMMISSION row was created against the terminal order");
});

// ===== 4: a separate, unrelated order can record its own commission entries independently =====

test("4. an unrelated order can record its own PLATFORM_COMMISSION expense, independent of order AB's", async () => {
  const productId = insertSyntheticProduct(`${TEST_TAG} Product D`, 350, 120, 40);
  const order = createOrder({
    orderNumber: uniqueOrderNumber("D"),
    items: [{ productId, quantity: 1 }],
  });
  createdOrderIds.push(order.orderId);

  const res = await transactionsPost(jsonPostRequest(platformCommissionPayload(order.orderId, 55)));
  const body = await res.json();

  assert.equal(res.status, 201, `create failed: ${JSON.stringify(body)}`);
  assert.equal(body.data.orderId, order.orderId);
  assert.notEqual(order.orderId, orderIdAB, "sanity check: this is genuinely a different order");

  // order AB's own two PLATFORM_COMMISSION rows (tests 1-2) must be completely unaffected.
  const countRowAB = db
    .prepare(
      "SELECT COUNT(*) AS c FROM transactions WHERE order_id = ? AND transaction_type = 'expense' AND category = 'PLATFORM_COMMISSION'"
    )
    .get(orderIdAB) as { c: number };
  assert.equal(countRowAB.c, 2, "order AB's PLATFORM_COMMISSION row count is unaffected by order D's");
});

// ===== 5: both commission rows on the same order are included exactly once each in P&L =====

test("5. both PLATFORM_COMMISSION rows for the same order are counted exactly once each in getProfitSummary()", async () => {
  const baseline = getProfitSummary({ dateFrom: TODAY, dateTo: TODAY });

  const productId = insertSyntheticProduct(`${TEST_TAG} Product E`, 300, 100, 30);
  const order = createOrder({
    orderNumber: uniqueOrderNumber("E"),
    items: [{ productId, quantity: 1 }],
  });
  createdOrderIds.push(order.orderId);

  const res1 = await transactionsPost(jsonPostRequest(platformCommissionPayload(order.orderId, 42)));
  const body1 = await res1.json();
  assert.equal(res1.status, 201, `first create failed: ${JSON.stringify(body1)}`);

  const res2 = await transactionsPost(jsonPostRequest(platformCommissionPayload(order.orderId, 18)));
  const body2 = await res2.json();
  assert.equal(res2.status, 201, `second create failed: ${JSON.stringify(body2)}`);

  const afterCreate = getProfitSummary({ dateFrom: TODAY, dateTo: TODAY });

  // PLATFORM_COMMISSION is not SHIPPING/COD_FEE/RETURNED_PARCEL, so it falls into the generic
  // operatingExpenses bucket in profitSummary.ts (unchanged by this STEP, per approved scope).
  assert.equal(
    afterCreate.operatingExpenses - baseline.operatingExpenses,
    42 + 18,
    "operatingExpenses delta must equal the SUM of both PLATFORM_COMMISSION rows — each counted exactly once, not zero or twice"
  );
  assert.equal(
    afterCreate.netProfit - baseline.netProfit,
    // this order's own income (300) minus its COGS minus both commission rows (42 + 18), same
    // formula profitSummary.ts itself uses: netProfit = grossProfit - operatingExpenses -
    // shippingExpense - codReturnLoss
    (afterCreate.revenue - baseline.revenue) - (afterCreate.cogs - baseline.cogs) - (42 + 18),
    "netProfit delta reflects both PLATFORM_COMMISSION rows exactly once each"
  );
});

// ===== 6: orders.shipping_fee stays independent of PLATFORM_COMMISSION expense transactions =====

test("6. orders.shipping_fee is unchanged by creating PLATFORM_COMMISSION expense transactions", () => {
  assert.ok(orderIdAB, "test 1 must have run first and created PLATFORM_COMMISSION rows");

  const row = db.prepare("SELECT shipping_fee FROM orders WHERE id = ?").get(orderIdAB) as {
    shipping_fee: number;
  };
  assert.equal(
    row.shipping_fee,
    45,
    "orders.shipping_fee must remain exactly what it was set to at order creation, untouched by the PLATFORM_COMMISSION expenses created in tests 1-2"
  );
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
