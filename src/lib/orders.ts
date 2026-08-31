import db from "./db";
import { decreaseStockForSale } from "./inventory";

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

    return {
      orderId,
      orderNumber: input.orderNumber.trim(),
      total,
      items: preparedItems,
    };
  });

  return transaction();
}
