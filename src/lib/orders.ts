import db from "./db";
import { decreaseStockForSale } from "./inventory";
import { createTransaction, isValidSalesChannel } from "./transactions";
import { isValidOrderStatus, isValidOrderStatusTransition, type OrderStatus } from "./orderStatus";

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
        input.customerId ?? null,
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
