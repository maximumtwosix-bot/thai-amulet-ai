// STEP 49 — Delivery status: plain types/constants only, zero imports.
//
// Split out the same way src/lib/orderStatus.ts is (STEP 32) so this can be imported by BOTH
// server code (src/lib/orderDelivery.ts, the delivery API route) AND Client Components
// (src/app/orders/[id]/page.tsx) — importing "./db" (better-sqlite3) from a Client Component fails
// ("Module not found: Can't resolve 'fs'").
//
// Deliberately independent of OrderStatus (src/lib/orderStatus.ts) — approved 2026-09-01. No
// automatic sync in either direction, no shared transition graph, no shared column. An order's
// delivery_status can be any of the 4 values below regardless of its orders.status, and vice versa.

export type DeliveryStatus = "pending" | "shipping" | "shipped" | "returned";

export const DELIVERY_STATUSES: DeliveryStatus[] = [
  "pending",
  "shipping",
  "shipped",
  "returned",
];

export function isValidDeliveryStatus(value: string): value is DeliveryStatus {
  return (DELIVERY_STATUSES as string[]).includes(value);
}

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: "⏳ รอจัดส่ง",
  shipping: "🚚 กำลังจัดส่ง",
  shipped: "📦 จัดส่งถึงแล้ว",
  returned: "↩️ ตีกลับ",
};

// STEP 49 (approved 2026-09-01) — operator can freely change delivery_status to any of the 4
// values, no strict transition graph like ORDER_STATUS_TRANSITIONS (src/lib/orderStatus.ts).
// Logistics correction (e.g. mis-clicked status) should not be blocked; this is operational
// metadata, not a financial record where irreversibility matters.
