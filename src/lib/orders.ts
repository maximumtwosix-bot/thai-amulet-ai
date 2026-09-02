import db from "./db";
import { decreaseStockForSale } from "./inventory";
import {
  createTransaction,
  isValidPaymentMethod,
  isValidSalesChannel,
  updateTransaction,
} from "./transactions";
import {
  getAllowedNextStatuses,
  isValidOrderStatus,
  isValidOrderStatusTransition,
  type OrderStatus,
} from "./orderStatus";
import { assertCustomerExists } from "./customers";

// STEP 31 — orders.channel (e.g. the "manual" default every order from src/app/orders/new/page.tsx
// currently gets, since that form never sends a channel at all) is free TEXT, not validated against
// transactions.salesChannel's fixed enum (facebook/tiktok_shop/shopee/lazada/line/walk_in/other).
// Passing an unrecognized channel straight into createTransaction() would throw
// INVALID_SALES_CHANNEL and roll back the whole order — so only a recognized value is forwarded;
// anything else (including "manual") becomes null (matches createTransaction()'s existing "optional,
// no sales channel recorded" meaning for null, which already applies to every existing manual
// Finance entry with no channel selected).
function mapOrderChannelToSalesChannel(channel: string | null): string | null {
  if (!channel) return null;
  return isValidSalesChannel(channel) ? channel : null;
}

export interface CreateOrderItemInput {
  productId: number;
  quantity: number;
  price?: number;
  cost?: number;
}

export interface CreateOrderInput {
  orderNumber: string;
  customerId?: number | null;
  channel?: string | null;
  paymentMethod?: string | null;
  shippingFee?: number;
  discount?: number;
  items: CreateOrderItemInput[];
}

export interface CreateOrderResult {
  orderId: number;
  orderNumber: string;
  total: number;
  items: Array<{
    productId: number;
    quantity: number;
    price: number;
    cost: number;
  }>;
}

export function createOrder(
  input: CreateOrderInput
): CreateOrderResult {
  if (!input.orderNumber?.trim()) {
    throw new Error("INVALID_ORDER_NUMBER");
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("ORDER_ITEMS_REQUIRED");
  }

  const shippingFee = Number(input.shippingFee ?? 0);
  const discount = Number(input.discount ?? 0);

  if (!Number.isFinite(shippingFee) || shippingFee < 0) {
    throw new Error("INVALID_SHIPPING_FEE");
  }

  if (!Number.isFinite(discount) || discount < 0) {
    throw new Error("INVALID_DISCOUNT");
  }

  const transaction = db.transaction(() => {
    let subtotal = 0;

    const preparedItems = input.items.map((item) => {
      if (
        !Number.isInteger(item.productId) ||
        item.productId <= 0
      ) {
        throw new Error("INVALID_PRODUCT_ID");
      }

      if (
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        throw new Error("INVALID_QUANTITY");
      }

      const product = db
        .prepare(`
          SELECT id, name, price, cost, stock
          FROM products
          WHERE id = ?
        `)
        .get(item.productId) as
        | {
            id: number;
            name: string;
            price: number;
            cost: number;
            stock: number;
          }
        | undefined;

      if (!product) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      const price = Number(item.price ?? product.price ?? 0);
      const cost = Number(item.cost ?? product.cost ?? 0);

      if (!Number.isFinite(price) || price < 0) {
        throw new Error("INVALID_PRICE");
      }

      if (!Number.isFinite(cost) || cost < 0) {
        throw new Error("INVALID_COST");
      }

      subtotal += price * item.quantity;

      return {
        productId: product.id,
        quantity: item.quantity,
        price,
        cost,
      };
    });

    const total = subtotal + shippingFee - discount;

    if (total < 0) {
      throw new Error("INVALID_ORDER_TOTAL");
    }

    // STEP 36 — customerId has existed as a CreateOrderInput field since before this STEP but was
    // never validated (nothing ever supplied it — src/app/orders/new/page.tsx never sent one until
    // now). Validated with the same rigor as productId/orderId elsewhere in this function: a bad
    // reference must fail the whole order atomically, not silently write a dangling customer_id.
    const customerId =
      input.customerId === undefined || input.customerId === null
        ? null
        : Number(input.customerId);

    if (customerId !== null) {
      if (!Number.isInteger(customerId) || customerId <= 0) {
        throw new Error("INVALID_CUSTOMER_ID");
      }

      assertCustomerExists(customerId);
    }

    const orderResult = db
      .prepare(`
        INSERT INTO orders (
          order_number,
          customer_id,
          channel,
          payment_method,
          subtotal,
          shipping_fee,
          discount,
          total,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `)
      .run(
        input.orderNumber.trim(),
        customerId,
        input.channel ?? null,
        input.paymentMethod ?? null,
        subtotal,
        shippingFee,
        discount,
        total
      );

    const orderId = Number(orderResult.lastInsertRowid);

    for (const item of preparedItems) {
      const movement = decreaseStockForSale({
        productId: item.productId,
        quantity: item.quantity,
        orderId,
        note: `Order ${input.orderNumber.trim()}`,
      });

      if (movement.quantityAfter < 0) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      db.prepare(`
        INSERT INTO order_items (
          order_id,
          product_id,
          quantity,
          price,
          cost
        )
        VALUES (?, ?, ?, ?, ?)
      `).run(
        orderId,
        item.productId,
        item.quantity,
        item.price,
        item.cost
      );
    }

    // STEP 31 — automatically record the order's revenue as an income transaction, inside this same
    // db.transaction() callback so it is atomic with the order/items/stock-deduction above: if this
    // throws, better-sqlite3 rolls back everything (order, items, stock, inventory_movements) exactly
    // as it already does for any other error in this function — there is no code path where an order
    // exists without its income transaction, or vice versa. Uses `total` (subtotal + shippingFee -
    // discount — the server-computed, authoritative revenue figure), never a client-submitted value.
    //
    // total === 0 is skipped (not an error) — createOrder() has always allowed a zero-total order
    // (e.g. a fully-discounted/promotional order; only total < 0 is rejected above), but
    // createTransaction() requires amount > 0. Recording "$0 income" isn't meaningful, and skipping
    // it here preserves that pre-existing STEP 27 behavior instead of turning it into a new failure.
    if (total > 0) {
      createTransaction({
        transactionType: "income",
        amount: total,
        transactionDate: new Date().toISOString().slice(0, 10),
        category: "PRODUCT_SALE",
        description: `รายรับจากออเดอร์ ${input.orderNumber.trim()}`,
        salesChannel: mapOrderChannelToSalesChannel(input.channel ?? null),
        // Not set to a single order_item's product — transactions.product_id is a single nullable
        // FK and orders routinely have multiple line items, so there is no one product that could
        // represent a multi-item order; orderId (below) already gives full traceability via
        // order_items. Left null uniformly (not just for multi-item orders) so behavior doesn't
        // silently differ by item count.
        productId: null,
        orderId,
        paymentMethod: input.paymentMethod ?? null,
        notes: `สร้างอัตโนมัติจากออเดอร์ ${input.orderNumber.trim()} (STEP 31)`,
      });
    }

    return {
      orderId,
      orderNumber: input.orderNumber.trim(),
      total,
      items: preparedItems,
    };
  });

  return transaction();
}

// STEP 32 — order status workflow. Approved scope: this function ONLY ever writes orders.status.
// It never touches transactions, inventory_movements, products.stock, or customers — not even for
// the "cancelled" target status. Reversing the STEP 31 automatic income transaction, restoring
// stock, or creating a refund transaction on cancellation are all explicitly out of scope for this
// STEP (approved 2026-09-01) and are not implemented here.
export interface OrderStatusUpdateResult {
  id: number;
  orderNumber: string;
  status: OrderStatus;
}

export function updateOrderStatus(orderId: number, nextStatus: string): OrderStatusUpdateResult {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error("INVALID_ORDER_ID");
  }

  if (!isValidOrderStatus(nextStatus)) {
    throw new Error("INVALID_STATUS");
  }

  const existing = db
    .prepare("SELECT id, order_number, status FROM orders WHERE id = ?")
    .get(orderId) as { id: number; order_number: string; status: string } | undefined;

  if (!existing) {
    throw new Error("ORDER_NOT_FOUND");
  }

  // existing.status should always be a recognized OrderStatus in practice (createOrder() only ever
  // writes 'pending', and this function is the only other writer, itself gated by
  // isValidOrderStatus() above) — but re-checked defensively rather than trusting the DB value
  // blindly, so an unrecognized stored value fails closed as an invalid transition instead of
  // throwing an uncontrolled TypeScript/runtime error.
  if (
    !isValidOrderStatus(existing.status) ||
    !isValidOrderStatusTransition(existing.status, nextStatus)
  ) {
    throw new Error("INVALID_STATUS_TRANSITION");
  }

  // Repeating the exact same status is also rejected here — every status's transition list
  // (src/lib/orderStatus.ts) intentionally excludes itself as a valid target, so a duplicate/
  // replayed PATCH request for a status the order has already reached fails the check above with
  // INVALID_STATUS_TRANSITION rather than silently no-op-succeeding or double-applying anything.
  db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(nextStatus, orderId);

  return { id: existing.id, orderNumber: existing.order_number, status: nextStatus };
}

// STEP 53 — price-only correction for existing order_items. Approved scope (2026-09-02): edits
// ONLY order_items.price for line items that already exist on this order. quantity and product_id
// are never read from the input type below and never written by this function — there is no code
// path here capable of changing either. No inventory_movements row is created and products.stock is
// never touched (only decreaseStockForSale(), called exclusively from createOrder() above, does
// that). Reuses updateTransaction() (STEP 40, src/lib/transactions.ts) as-is to reconcile the STEP
// 31 auto-created income transaction, rather than duplicating its validation/update logic.
export interface UpdateOrderItemPriceInput {
  orderItemId: number;
  price: number;
}

export interface UpdateOrderItemPricesResult {
  orderId: number;
  subtotal: number;
  total: number;
  items: Array<{
    id: number;
    productId: number;
    quantity: number;
    price: number;
    cost: number;
  }>;
  linkedIncomeTransactionId: number | null;
}

export function updateOrderItemPrices(
  orderId: number,
  items: UpdateOrderItemPriceInput[]
): UpdateOrderItemPricesResult {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error("INVALID_ORDER_ID");
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("ORDER_ITEMS_REQUIRED");
  }

  // Fail fast on malformed input before touching the DB, same style as createOrder() above.
  for (const item of items) {
    if (!Number.isInteger(item.orderItemId) || item.orderItemId <= 0) {
      throw new Error("INVALID_ORDER_ITEM_ID");
    }

    if (!Number.isFinite(item.price) || item.price < 0) {
      throw new Error("INVALID_PRICE");
    }
  }

  const run = db.transaction(() => {
    const order = db
      .prepare("SELECT id, status, shipping_fee, discount FROM orders WHERE id = ?")
      .get(orderId) as
      | { id: number; status: string; shipping_fee: number; discount: number }
      | undefined;

    if (!order) {
      throw new Error("ORDER_NOT_FOUND");
    }

    // Terminal-status guard — same convention already used to hide the status-change buttons on
    // Order Detail (getAllowedNextStatuses(order.status).length === 0 means completed/cancelled;
    // pending/paid/shipped all still have at least one allowed next status and remain editable).
    // Enforced here server-side regardless of what the client UI shows/hides.
    if (isValidOrderStatus(order.status) && getAllowedNextStatuses(order.status).length === 0) {
      throw new Error("ORDER_TERMINAL_STATUS");
    }

    type OrderItemRow = {
      id: number;
      product_id: number;
      quantity: number;
      price: number;
      cost: number;
    };

    const existingItems = db
      .prepare("SELECT id, product_id, quantity, price, cost FROM order_items WHERE order_id = ?")
      .all(orderId) as OrderItemRow[];

    const existingIds = new Set(existingItems.map((row) => row.id));

    // Ownership check — every submitted orderItemId must belong to THIS order. Checked for the
    // whole batch before any UPDATE runs, so a request that references even one foreign/nonexistent
    // item fails atomically instead of partially applying.
    for (const item of items) {
      if (!existingIds.has(item.orderItemId)) {
        throw new Error("ORDER_ITEM_NOT_FOUND");
      }
    }

    for (const item of items) {
      // `AND order_id = ?` is redundant given the ownership check above (both read the same table
      // in the same transaction), but kept as defense-in-depth so this statement can never affect a
      // row outside this order even if the check above were ever changed.
      db.prepare("UPDATE order_items SET price = ? WHERE id = ? AND order_id = ?").run(
        item.price,
        item.orderItemId,
        orderId
      );
    }

    // Recompute from the live order_items rows (not from the submitted `items` array alone), so any
    // item NOT included in this request still contributes its unchanged price/quantity correctly.
    const refreshedItems = db
      .prepare("SELECT id, product_id, quantity, price, cost FROM order_items WHERE order_id = ?")
      .all(orderId) as OrderItemRow[];

    // Same formula as createOrder() above: subtotal = Σ(price × quantity), total = subtotal +
    // shipping_fee − discount. shipping_fee/discount are read from the existing order row, never
    // from the request — this endpoint has no way to change either.
    const subtotal = refreshedItems.reduce((sum, row) => sum + row.price * row.quantity, 0);
    const total = subtotal + order.shipping_fee - order.discount;

    if (total < 0) {
      throw new Error("INVALID_ORDER_TOTAL");
    }

    const linkedIncome = db
      .prepare(
        "SELECT id FROM transactions WHERE order_id = ? AND transaction_type = 'income' ORDER BY id ASC LIMIT 1"
      )
      .get(orderId) as { id: number } | undefined;

    // updateTransaction() requires amount > 0 (same rule createTransaction() already enforces) — a
    // price edit that would drop an order with an existing linked income transaction to a total of
    // 0 (or, already excluded above, negative) is rejected outright rather than silently leaving
    // that transaction's amount stale/out of sync with the order.
    if (linkedIncome && total <= 0) {
      throw new Error("LINKED_INCOME_REQUIRES_POSITIVE_TOTAL");
    }

    db.prepare("UPDATE orders SET subtotal = ?, total = ? WHERE id = ?").run(
      subtotal,
      total,
      orderId
    );

    // STEP 53 — reconcile the STEP 31 auto-created income transaction so Finance reflects the
    // corrected total. Nests safely inside this db.transaction() via better-sqlite3's SAVEPOINT
    // support, the same nesting createTransaction() already relies on when called from inside
    // createOrder()'s transaction above. If this throws, everything above (order_items, orders)
    // rolls back too, since it's all one outer transaction.
    if (linkedIncome) {
      updateTransaction(linkedIncome.id, { amount: total });
    }

    return {
      orderId,
      subtotal,
      total,
      items: refreshedItems.map((row) => ({
        id: row.id,
        productId: row.product_id,
        quantity: row.quantity,
        price: row.price,
        cost: row.cost,
      })),
      linkedIncomeTransactionId: linkedIncome?.id ?? null,
    };
  });

  return run();
}

// STEP 54 — shipping fee / discount correction on an existing order. Approved scope (2026-09-02,
// Option C): edits ONLY orders.shipping_fee and orders.discount. Never accepts subtotal, total,
// order_items, quantity, unit_price, or product_id — the input type below has no such fields, and
// this function has no code path capable of writing any of them. subtotal is always recomputed live
// from order_items (same as updateOrderItemPrices() above), never accepted from the caller. Reuses
// the exact same terminal-status guard, total formula, and updateTransaction()-based Finance sync
// STEP 53 already established — no new mechanism invented.
export interface UpdateOrderShippingAndDiscountInput {
  shippingFee?: number;
  discount?: number;
}

export interface UpdateOrderShippingAndDiscountResult {
  orderId: number;
  shippingFee: number;
  discount: number;
  subtotal: number;
  total: number;
  linkedIncomeTransactionId: number | null;
}

export function updateOrderShippingAndDiscount(
  orderId: number,
  input: UpdateOrderShippingAndDiscountInput
): UpdateOrderShippingAndDiscountResult {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error("INVALID_ORDER_ID");
  }

  const run = db.transaction(() => {
    const order = db
      .prepare("SELECT id, status, shipping_fee, discount FROM orders WHERE id = ?")
      .get(orderId) as
      | { id: number; status: string; shipping_fee: number; discount: number }
      | undefined;

    if (!order) {
      throw new Error("ORDER_NOT_FOUND");
    }

    // Same terminal-status guard as updateOrderItemPrices() (STEP 53) — completed/cancelled orders
    // cannot have their financial summary edited, enforced here regardless of what the client shows.
    if (isValidOrderStatus(order.status) && getAllowedNextStatuses(order.status).length === 0) {
      throw new Error("ORDER_TERMINAL_STATUS");
    }

    // Undefined means "keep the current value" — matches updateCustomer()/updateTransaction()'s
    // existing "undefined = unchanged" convention elsewhere in this codebase.
    const nextShippingFee =
      input.shippingFee === undefined ? order.shipping_fee : Number(input.shippingFee);
    const nextDiscount = input.discount === undefined ? order.discount : Number(input.discount);

    if (!Number.isFinite(nextShippingFee) || nextShippingFee < 0) {
      throw new Error("INVALID_SHIPPING_FEE");
    }

    if (!Number.isFinite(nextDiscount) || nextDiscount < 0) {
      throw new Error("INVALID_DISCOUNT");
    }

    // subtotal is always recomputed live from order_items — never accepted from the caller, same
    // rule updateOrderItemPrices() (STEP 53) already enforces for the identical reason.
    const items = db
      .prepare("SELECT quantity, price FROM order_items WHERE order_id = ?")
      .all(orderId) as Array<{ quantity: number; price: number }>;

    const subtotal = items.reduce((sum, row) => sum + row.price * row.quantity, 0);
    const total = subtotal + nextShippingFee - nextDiscount;

    if (total < 0) {
      throw new Error("INVALID_ORDER_TOTAL");
    }

    const linkedIncome = db
      .prepare(
        "SELECT id FROM transactions WHERE order_id = ? AND transaction_type = 'income' ORDER BY id ASC LIMIT 1"
      )
      .get(orderId) as { id: number } | undefined;

    // Same guard as updateOrderItemPrices() (STEP 53) — a shipping/discount edit that would leave
    // an order with an existing linked income transaction at total <= 0 is rejected outright rather
    // than silently leaving that transaction's amount stale/out of sync.
    if (linkedIncome && total <= 0) {
      throw new Error("LINKED_INCOME_REQUIRES_POSITIVE_TOTAL");
    }

    db.prepare(
      "UPDATE orders SET shipping_fee = ?, discount = ?, subtotal = ?, total = ? WHERE id = ?"
    ).run(nextShippingFee, nextDiscount, subtotal, total, orderId);

    // Reconcile the STEP 31 auto-created income transaction, same reused mechanism as STEP 53 —
    // nests safely inside this db.transaction() via better-sqlite3's SAVEPOINT support.
    if (linkedIncome) {
      updateTransaction(linkedIncome.id, { amount: total });
    }

    return {
      orderId,
      shippingFee: nextShippingFee,
      discount: nextDiscount,
      subtotal,
      total,
      linkedIncomeTransactionId: linkedIncome?.id ?? null,
    };
  });

  return run();
}

// STEP 55 — order channel (sales channel) correction. Approved scope (2026-09-02): edits ONLY
// orders.channel, restricted to the 7 valid SALES_CHANNELS values (isValidSalesChannel()) — no
// arbitrary free text, unlike orders.channel's original permissive TEXT column. Never touches
// order_items, quantity, unit price, subtotal, shipping_fee, discount, total, stock, or
// inventory_movements. Reuses the exact terminal-status guard and updateTransaction()-based Finance
// sync STEP 53/54 already established. Per approval, the linked income transaction's sales_channel
// is always resynced to the new channel whenever a linked transaction exists.
export interface UpdateOrderChannelResult {
  orderId: number;
  channel: string;
  linkedIncomeTransactionId: number | null;
}

export function updateOrderChannel(orderId: number, channel: string): UpdateOrderChannelResult {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error("INVALID_ORDER_ID");
  }

  if (typeof channel !== "string" || !isValidSalesChannel(channel)) {
    throw new Error("INVALID_CHANNEL");
  }

  const run = db.transaction(() => {
    const order = db
      .prepare("SELECT id, status FROM orders WHERE id = ?")
      .get(orderId) as { id: number; status: string } | undefined;

    if (!order) {
      throw new Error("ORDER_NOT_FOUND");
    }

    // Same terminal-status guard as updateOrderItemPrices()/updateOrderShippingAndDiscount()
    // (STEP 53/54) — completed/cancelled orders cannot have their channel edited, enforced here
    // regardless of what the client shows.
    if (isValidOrderStatus(order.status) && getAllowedNextStatuses(order.status).length === 0) {
      throw new Error("ORDER_TERMINAL_STATUS");
    }

    db.prepare("UPDATE orders SET channel = ? WHERE id = ?").run(channel, orderId);

    const linkedIncome = db
      .prepare(
        "SELECT id FROM transactions WHERE order_id = ? AND transaction_type = 'income' ORDER BY id ASC LIMIT 1"
      )
      .get(orderId) as { id: number } | undefined;

    // Per approval — always resync the linked income transaction's sales_channel when one exists,
    // so Order and Finance never disagree on which channel this sale came from. `channel` here is
    // already guaranteed valid (checked above), so it is passed straight through — no need to
    // re-derive via mapOrderChannelToSalesChannel(), which exists only to *tolerate* an invalid/
    // legacy value at order-creation time; this function rejects those outright instead.
    if (linkedIncome) {
      updateTransaction(linkedIncome.id, { salesChannel: channel });
    }

    return {
      orderId,
      channel,
      linkedIncomeTransactionId: linkedIncome?.id ?? null,
    };
  });

  return run();
}

// STEP 56 — order payment method correction. Approved scope (2026-09-02): edits ONLY
// orders.payment_method, restricted to the 2 valid PAYMENT_METHODS values (isValidPaymentMethod())
// — no arbitrary free text. Never touches order_items, quantity, unit price, subtotal,
// shipping_fee, discount, total, channel, carrier, tracking_number, delivery_status, stock, or
// inventory_movements, and never modifies customer data. Reuses the exact terminal-status guard and
// updateTransaction()-based Finance sync pattern STEP 53/54/55 already established. Per approval,
// the linked income transaction's payment_method is always resynced to the new value whenever a
// linked transaction exists.
export interface UpdateOrderPaymentMethodResult {
  orderId: number;
  paymentMethod: string;
  linkedIncomeTransactionId: number | null;
}

export function updateOrderPaymentMethod(
  orderId: number,
  paymentMethod: string
): UpdateOrderPaymentMethodResult {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error("INVALID_ORDER_ID");
  }

  if (typeof paymentMethod !== "string" || !isValidPaymentMethod(paymentMethod)) {
    throw new Error("INVALID_PAYMENT_METHOD");
  }

  const run = db.transaction(() => {
    const order = db
      .prepare("SELECT id, status FROM orders WHERE id = ?")
      .get(orderId) as { id: number; status: string } | undefined;

    if (!order) {
      throw new Error("ORDER_NOT_FOUND");
    }

    // Same terminal-status guard as updateOrderItemPrices()/updateOrderShippingAndDiscount()/
    // updateOrderChannel() (STEP 53/54/55) — completed/cancelled orders cannot have their payment
    // method edited, enforced here regardless of what the client shows.
    if (isValidOrderStatus(order.status) && getAllowedNextStatuses(order.status).length === 0) {
      throw new Error("ORDER_TERMINAL_STATUS");
    }

    db.prepare("UPDATE orders SET payment_method = ? WHERE id = ?").run(paymentMethod, orderId);

    const linkedIncome = db
      .prepare(
        "SELECT id FROM transactions WHERE order_id = ? AND transaction_type = 'income' ORDER BY id ASC LIMIT 1"
      )
      .get(orderId) as { id: number } | undefined;

    // Per approval — always resync the linked income transaction's payment_method when one exists,
    // so Order and Finance never disagree on how this sale was paid. `paymentMethod` here is
    // already guaranteed valid (checked above), so it is passed straight through.
    if (linkedIncome) {
      updateTransaction(linkedIncome.id, { paymentMethod });
    }

    return {
      orderId,
      paymentMethod,
      linkedIncomeTransactionId: linkedIncome?.id ?? null,
    };
  });

  return run();
}
