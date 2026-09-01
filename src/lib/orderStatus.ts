// STEP 32 — Order status: plain types/constants only, zero imports.
//
// Split out of src/lib/orders.ts specifically so this can be imported by BOTH server code
// (orders.ts, the status API route) AND Client Components (src/app/orders/page.tsx,
// src/app/orders/[id]/page.tsx) — orders.ts itself imports "./db" (better-sqlite3), which cannot be
// imported from a Client Component (confirmed failure: "Module not found: Can't resolve 'fs'" — see
// the identical constraint already documented in src/app/finance/page.tsx's header comment, which
// works around it by duplicating constants locally; this file exists so order status doesn't need
// that duplication and there is genuinely one shared definition, per this STEP's requirement).

export type OrderStatus = "pending" | "paid" | "shipped" | "completed" | "cancelled";

export const ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "paid",
  "shipped",
  "completed",
  "cancelled",
];

export function isValidOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as string[]).includes(value);
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "⏳ รอดำเนินการ",
  paid: "✅ ชำระแล้ว",
  shipped: "🚚 จัดส่งแล้ว",
  completed: "✅ สำเร็จ",
  cancelled: "🚫 ยกเลิก",
};

// Approved STEP 32 transition graph (2026-09-01): linear forward progression
// pending → paid → shipped → completed, with cancellation allowed from pending/paid/shipped only.
// completed and cancelled are both terminal — empty target lists, no outgoing transitions at all,
// including no self-transition (so re-submitting the same status is correctly rejected as an
// invalid transition, not silently treated as a no-op success).
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["paid", "cancelled"],
  paid: ["shipped", "cancelled"],
  shipped: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function isValidOrderStatusTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

export function getAllowedNextStatuses(from: OrderStatus): OrderStatus[] {
  return ORDER_STATUS_TRANSITIONS[from];
}
