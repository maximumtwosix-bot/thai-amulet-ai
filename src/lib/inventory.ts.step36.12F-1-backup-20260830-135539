import db from "./db";

export type StockMovementType =
  | "initial"
  | "purchase_in"
  | "sale"
  | "return"
  | "adjustment";

export interface StockAdjustmentInput {
  productId: number;
  quantityChange: number;
  note?: string | null;
  referenceType?: string | null;
  referenceId?: number | null;
  movementType?: StockMovementType;
}

export interface StockAdjustmentResult {
  productId: number;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  movementId: number;
}

export interface SaleStockInput {
  productId: number;
  quantity: number;
  orderId: number;
  note?: string | null;
}

export type SaleStockResult = StockAdjustmentResult;

export function decreaseStockForSale(
  input: SaleStockInput
): SaleStockResult {
  const { productId, quantity, orderId, note = null } = input;

  if (!Number.isInteger(productId) || productId <= 0) {
    throw new Error("Invalid product ID");
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("quantity must be a positive integer");
  }

  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error("Invalid order ID");
  }

  const result = adjustProductStock({
    productId,
    quantityChange: -quantity,
    note,
    referenceType: "order",
    referenceId: orderId,
    movementType: "sale",
  });

  return result;
}
export function adjustProductStock(
  input: StockAdjustmentInput
): StockAdjustmentResult {
  const {
    productId,
    quantityChange,
    note = null,
    referenceType = "manual",
    referenceId = null,
    movementType = "adjustment",
  } = input;

  if (!Number.isInteger(productId) || productId <= 0) {
    throw new Error("Invalid product ID");
  }

  if (!Number.isInteger(quantityChange) || quantityChange === 0) {
    throw new Error("quantityChange must be a non-zero integer");
  }

  if (referenceId !== null && !Number.isInteger(referenceId)) {
    throw new Error("Invalid reference ID");
  }

  const allowedMovementTypes: StockMovementType[] = [
    "initial",
    "purchase_in",
    "sale",
    "return",
    "adjustment",
  ];

  if (!allowedMovementTypes.includes(movementType)) {
    throw new Error("Invalid movement type");
  }

  const transaction = db.transaction(() => {
    const product = db
      .prepare(
        `
        SELECT id, stock
        FROM products
        WHERE id = ?
      `
      )
      .get(productId) as
      | { id: number; stock: number }
      | undefined;

    if (!product) {
      throw new Error("PRODUCT_NOT_FOUND");
    }

    const quantityBefore = product.stock;
    const quantityAfter = quantityBefore + quantityChange;

    if (quantityAfter < 0) {
      throw new Error("INSUFFICIENT_STOCK");
    }

    const updateResult = db
      .prepare(
        `
        UPDATE products
        SET
          stock = stock + ?,
          status = CASE
            WHEN stock + ? > 0 THEN 'active'
            ELSE 'out_of_stock'
          END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND stock + ? >= 0
      `
      )
      .run(
        quantityChange,
        quantityChange,
        productId,
        quantityChange
      );

    if (updateResult.changes !== 1) {
      throw new Error("STOCK_UPDATE_FAILED");
    }

    const movementResult = db
      .prepare(
        `
        INSERT INTO inventory_movements (
          product_id,
          movement_type,
          quantity_change,
          quantity_before,
          quantity_after,
          reference_type,
          reference_id,
          note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        productId,
        movementType,
        quantityChange,
        quantityBefore,
        quantityAfter,
        referenceType,
        referenceId,
        note
      );

    return {
      productId,
      quantityChange,
      quantityBefore,
      quantityAfter,
      movementId: Number(movementResult.lastInsertRowid),
    };
  });

  return transaction();
}


