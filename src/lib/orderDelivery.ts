import db from "./db";
import { isValidDeliveryStatus, type DeliveryStatus } from "./deliveryStatus";

// STEP 49 — order fulfillment tracking (approved 2026-09-01). Deliberately a separate file from
// src/lib/orders.ts: createOrder() and updateOrderStatus() are unmodified by this STEP, zero diff
// risk to the financially-critical STEP 31/32 code. This module only ever reads/writes
// orders.carrier / orders.tracking_number / orders.delivery_status — never orders.status,
// transactions, inventory_movements, or products.stock.

export interface OrderDeliveryUpdateInput {
  carrier?: string | null;
  trackingNumber?: string | null;
  deliveryStatus?: string;
}

export interface OrderDeliveryResult {
  id: number;
  orderNumber: string;
  carrier: string | null;
  trackingNumber: string | null;
  deliveryStatus: DeliveryStatus;
}

type OrderDeliveryRow = {
  id: number;
  order_number: string;
  carrier: string | null;
  tracking_number: string | null;
  delivery_status: string;
};

function mapRow(row: OrderDeliveryRow): OrderDeliveryResult {
  return {
    id: row.id,
    orderNumber: row.order_number,
    carrier: row.carrier,
    trackingNumber: row.tracking_number,
    // existing.delivery_status is always a recognized DeliveryStatus in practice (the column
    // defaults to 'pending' and this function is the only writer, itself gated by
    // isValidDeliveryStatus() below) — but re-checked defensively so an unrecognized stored value
    // never gets silently cast to DeliveryStatus.
    deliveryStatus: isValidDeliveryStatus(row.delivery_status)
      ? row.delivery_status
      : "pending",
  };
}

// STEP 49 (approved 2026-09-01) — carrier/trackingNumber are freely-editable free text (no fixed
// carrier list requested), trimmed and capped to a sane length. Empty string is normalized to null
// (matches this codebase's existing convention for optional text columns, e.g. orders.channel).
const MAX_TEXT_LENGTH = 200;

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;

  const trimmed = value.trim();

  if (!trimmed) return null;

  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw new Error("INVALID_DELIVERY_TEXT_TOO_LONG");
  }

  return trimmed;
}

export function getOrderDelivery(orderId: number): OrderDeliveryResult {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error("INVALID_ORDER_ID");
  }

  const existing = db
    .prepare(
      "SELECT id, order_number, carrier, tracking_number, delivery_status FROM orders WHERE id = ?"
    )
    .get(orderId) as OrderDeliveryRow | undefined;

  if (!existing) {
    throw new Error("ORDER_NOT_FOUND");
  }

  return mapRow(existing);
}

// STEP 49 (approved 2026-09-01) — free operator changes between all 4 delivery statuses, no
// transition graph (unlike updateOrderStatus() in src/lib/orders.ts). Never creates a transaction,
// never cancels the order, never touches inventory — approved scope explicitly excludes all of
// that. Uses an explicit column list in the UPDATE (never a blind full-row write) so this can never
// collaterally touch status/total/subtotal/shipping_fee/discount/customer_id/etc.
export function updateOrderDelivery(
  orderId: number,
  input: OrderDeliveryUpdateInput
): OrderDeliveryResult {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error("INVALID_ORDER_ID");
  }

  const existing = db
    .prepare(
      "SELECT id, order_number, carrier, tracking_number, delivery_status FROM orders WHERE id = ?"
    )
    .get(orderId) as OrderDeliveryRow | undefined;

  if (!existing) {
    throw new Error("ORDER_NOT_FOUND");
  }

  const nextCarrier =
    input.carrier === undefined ? existing.carrier : normalizeOptionalText(input.carrier);

  const nextTrackingNumber =
    input.trackingNumber === undefined
      ? existing.tracking_number
      : normalizeOptionalText(input.trackingNumber);

  let nextDeliveryStatus: DeliveryStatus;

  if (input.deliveryStatus === undefined) {
    nextDeliveryStatus = isValidDeliveryStatus(existing.delivery_status)
      ? existing.delivery_status
      : "pending";
  } else {
    if (!isValidDeliveryStatus(input.deliveryStatus)) {
      throw new Error("INVALID_DELIVERY_STATUS");
    }
    nextDeliveryStatus = input.deliveryStatus;
  }

  db.prepare(
    "UPDATE orders SET carrier = ?, tracking_number = ?, delivery_status = ? WHERE id = ?"
  ).run(nextCarrier, nextTrackingNumber, nextDeliveryStatus, orderId);

  return {
    id: existing.id,
    orderNumber: existing.order_number,
    carrier: nextCarrier,
    trackingNumber: nextTrackingNumber,
    deliveryStatus: nextDeliveryStatus,
  };
}
