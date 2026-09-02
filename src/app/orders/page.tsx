"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import {
  getAllowedNextStatuses,
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from "@/lib/orderStatus";
import { DELIVERY_STATUS_LABELS, type DeliveryStatus } from "@/lib/deliveryStatus";

type OrderListItem = {
  id: number;
  order_number: string;
  customer_id: number | null;
  customer_name: string | null;
  channel: string | null;
  payment_method: string | null;
  subtotal: number;
  shipping_fee: number;
  discount: number;
  total: number;
  status: string;
  // STEP 50 — surfaced read-only on the list, independent of `status` above (STEP 49). May be
  // absent/null on old client-cached responses; a safe "pending" fallback is used when rendering.
  delivery_status: DeliveryStatus | null;
  created_at: string;
  item_count: number;
  total_quantity: number;
};

function formatDate(value: string) {
  if (!value) return "-";

  const date = new Date(value.replace(" ", "T") + "Z");

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatCurrency(value: number) {
  return `฿${value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// STEP 59 — Bangkok "today" for the date picker's default value, computed via Intl with an
// explicit Asia/Bangkok timezone rather than trusting the browser's own local timezone setting
// (which could differ if an operator's device is set to a different zone) — this must always
// reflect the shop's actual business day, matching the same fixed UTC+7 reasoning the API's
// `date(o.created_at, '+7 hours')` filter uses server-side.
function todayBangkok(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";

  return `${year}-${month}-${day}`;
}

function formatDateThai(value: string): string {
  const date = new Date(`${value}T00:00:00+07:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("th-TH", { dateStyle: "long" });
}

// STEP 59 — "needs attention" (📋 ต้องดำเนินการ) is derived purely from the existing status enum:
// anything not yet in either terminal state (completed/cancelled, per src/lib/orderStatus.ts's
// ORDER_STATUS_TRANSITIONS). No new status value invented, no guessing.
type StatusFilter = "all" | "active" | "completed" | "cancelled";

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // STEP 59 — daily-operations date filter. "" means no date filter (show everything, up to the
  // existing 100-row cap) — the existing pre-STEP-59 behavior, reachable via "ทั้งหมด" below.
  const [selectedDate, setSelectedDate] = useState<string>(todayBangkok());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // STEP 59 — "✅ ยืนยันออเดอร์สำเร็จ" per row. Calls the EXISTING PATCH /api/orders/[id]/status
  // (STEP 32) — the exact same endpoint/flow Order Detail's own status buttons already use — never
  // a direct DB write from this page. confirmingId guards against double-submit per row.
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [confirmErrors, setConfirmErrors] = useState<Record<number, string>>({});

  async function loadOrders(date: string) {
    setLoading(true);
    setError("");

    try {
      const query = date
        ? `?limit=100&date=${encodeURIComponent(date)}`
        : "?limit=100";
      const response = await fetch(`/api/orders${query}`, {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถโหลดรายการออเดอร์ได้");
      }

      setOrders(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      console.error("Load orders error:", err);
      setError(
        err instanceof Error ? err.message : "ไม่สามารถโหลดรายการออเดอร์ได้"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  async function confirmComplete(orderId: number) {
    if (confirmingId !== null) return;

    setConfirmingId(orderId);
    setConfirmErrors((current) => {
      const next = { ...current };
      delete next[orderId];
      return next;
    });

    try {
      const response = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถยืนยันออเดอร์สำเร็จได้");
      }

      await loadOrders(selectedDate);
    } catch (err) {
      setConfirmErrors((current) => ({
        ...current,
        [orderId]: err instanceof Error ? err.message : "ไม่สามารถยืนยันออเดอร์สำเร็จได้",
      }));
    } finally {
      setConfirmingId(null);
    }
  }

  // Summary counts always reflect the current date filter's FULL breakdown, independent of which
  // status tab is currently selected — switching tabs only changes which rows the table shows.
  const activeCount = orders.filter(
    (o) => o.status !== "completed" && o.status !== "cancelled"
  ).length;
  const completedCount = orders.filter((o) => o.status === "completed").length;
  const cancelledCount = orders.filter((o) => o.status === "cancelled").length;

  const filteredOrders = orders.filter((o) => {
    if (statusFilter === "completed") return o.status === "completed";
    if (statusFilter === "cancelled") return o.status === "cancelled";
    if (statusFilter === "active") {
      return o.status !== "completed" && o.status !== "cancelled";
    }
    return true;
  });

  // STEP 59 — summary always reflects the FULL selected-date set (all statuses), independent of
  // the status tab currently shown below. totalOrders/activeCount/completedCount/cancelledCount are
  // all UNCHANGED from STEP 59 — every order in the date range is still counted in exactly one of
  // those buckets, cancelled included.
  const totalOrders = orders.length;

  // STEP 61 — per the STEP 60 audit finding, "ยอดขายรวม" summing every order.total regardless of
  // status silently counted cancelled orders as sales, unlike the Profit report (which already
  // excludes cancelled-order income by the same convention) and unlike Finance/Tax (which include
  // it but visibly flag it in red — this page had neither exclusion nor a flag). Fixed by excluding
  // status='cancelled' from the sum, matching the Profit report's existing rule — reuses the same
  // `orders` state already fetched, no new query, no new field.
  const totalRevenue = orders
    .filter((order) => order.status !== "cancelled")
    .reduce((sum, order) => sum + order.total, 0);

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🧾 ออเดอร์</h1>
            <p className="mt-1 text-sm text-slate-500">
              รายการคำสั่งซื้อทั้งหมดในระบบ
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/orders/new"
              className="w-fit rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
            >
              ➕ สร้างออเดอร์ใหม่
            </Link>

            <Link
              href="/"
              className="w-fit rounded-xl border bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              ← กลับหน้าแรก
            </Link>

            <LogoutButton />
          </div>
        </div>

        {/* STEP 59 — daily-operations date filter. Clearing (empty selectedDate) restores the
            exact pre-STEP-59 "show everything, up to 100 rows" behavior. */}
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm">
          <label className="text-sm font-medium text-slate-700">
            📅 วันที่:
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="ml-2 rounded-xl border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-300"
            />
          </label>

          {selectedDate && (
            <button
              type="button"
              onClick={() => setSelectedDate("")}
              className="rounded-xl border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              ดูทั้งหมด (ล้างวันที่)
            </button>
          )}

          {selectedDate && (
            <span className="text-xs text-slate-400">{formatDateThai(selectedDate)}</span>
          )}
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              {selectedDate ? "ออเดอร์วันนี้" : "จำนวนออเดอร์"}
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {totalOrders.toLocaleString()}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">ยอดขายรวม</p>
            <p className="mt-2 text-3xl font-bold text-emerald-600">
              {formatCurrency(totalRevenue)}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">📋 ต้องดำเนินการ</p>
            <p className="mt-2 text-3xl font-bold text-amber-600">
              {activeCount.toLocaleString()}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">✅ สำเร็จ</p>
            <p className="mt-2 text-3xl font-bold text-emerald-600">
              {completedCount.toLocaleString()}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">🚫 ยกเลิก</p>
            <p className="mt-2 text-3xl font-bold text-slate-400">
              {cancelledCount.toLocaleString()}
            </p>
          </div>
        </div>

        <section className="rounded-2xl border bg-white shadow-sm">
          <div className="border-b p-5">
            <h2 className="text-lg font-semibold text-slate-900">
              รายการออเดอร์
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              เรียงจากออเดอร์ล่าสุดไปเก่าสุด
            </p>

            {/* STEP 59 — status tabs, purely a client-side filter over the already date-filtered
                `orders` — no new API query param needed for this part. */}
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  { key: "all", label: "ทั้งหมด" },
                  { key: "active", label: "📋 ต้องดำเนินการ" },
                  { key: "completed", label: "✅ สำเร็จ" },
                  { key: "cancelled", label: "🚫 ยกเลิก" },
                ] as Array<{ key: StatusFilter; label: string }>
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium ${
                    statusFilter === tab.key
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">
              กำลังโหลดรายการออเดอร์...
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              {statusFilter === "active"
                ? "🎉 ไม่มีออเดอร์ที่ค้างดำเนินการ"
                : selectedDate
                  ? "ไม่มีออเดอร์สำหรับวันที่เลือก"
                  : "ยังไม่มีออเดอร์ในระบบ"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-4">เลขที่ออเดอร์</th>
                    <th className="p-4">วันที่</th>
                    <th className="p-4">ลูกค้า</th>
                    <th className="p-4">ช่องทาง</th>
                    <th className="p-4">จำนวนสินค้า</th>
                    <th className="p-4">ยอดรวม</th>
                    <th className="p-4">สถานะ</th>
                    <th className="p-4">สถานะการจัดส่ง</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>

                <tbody>
                  {filteredOrders.map((order) => {
                    // STEP 59 — reuses the EXISTING getAllowedNextStatuses() (src/lib/orderStatus.ts,
                    // STEP 32) — the button only appears when the existing transition graph actually
                    // allows moving this order to 'completed' (i.e. only from 'shipped' today); the
                    // backend re-validates this independently via the same updateOrderStatus() Order
                    // Detail's own status buttons already call, so this is never trusted client-side
                    // alone.
                    const canComplete = getAllowedNextStatuses(
                      order.status as OrderStatus
                    ).includes("completed");

                    return (
                      <tr key={order.id} className="border-t hover:bg-slate-50">
                        <td className="p-4 font-semibold text-slate-900">
                          {order.order_number}
                        </td>

                        <td className="p-4 whitespace-nowrap text-slate-500">
                          {formatDate(order.created_at)}
                        </td>

                        <td className="p-4 text-slate-700">
                          {order.customer_name || "-"}
                        </td>

                        <td className="p-4 text-slate-700">
                          {order.channel || "-"}
                        </td>

                        <td className="p-4 text-slate-700">
                          {order.total_quantity.toLocaleString()} ชิ้น
                          <span className="ml-1 text-xs text-slate-400">
                            ({order.item_count} รายการ)
                          </span>
                        </td>

                        <td className="p-4 font-semibold text-slate-900">
                          {formatCurrency(order.total)}
                        </td>

                        <td className="p-4">
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                            {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] || order.status}
                          </span>
                        </td>

                        <td className="p-4">
                          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                            {DELIVERY_STATUS_LABELS[order.delivery_status ?? "pending"]}
                          </span>
                          {/* STEP 65 — returned-but-not-cancelled warning, same condition/wording
                              as Order Detail (STEP 61) and Finance/Tax (STEP 63). Purely visual:
                              uses only order.status/order.delivery_status already returned by the
                              existing GET /api/orders response — no new field, no new API call, no
                              mutation. Hidden once the order is already cancelled. */}
                          {order.delivery_status === "returned" && order.status !== "cancelled" && (
                            <span className="ml-2 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                              ⚠️ พัสดุตีกลับ — ยังไม่ยกเลิก
                            </span>
                          )}
                        </td>

                        <td className="p-4">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {canComplete && (
                              <button
                                type="button"
                                onClick={() => confirmComplete(order.id)}
                                disabled={confirmingId === order.id}
                                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                              >
                                {confirmingId === order.id
                                  ? "กำลังยืนยัน..."
                                  : "✅ ยืนยันออเดอร์สำเร็จ"}
                              </button>
                            )}
                            <Link
                              href={`/orders/${order.id}`}
                              className="rounded-xl border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              ดูรายละเอียด →
                            </Link>
                          </div>
                          {confirmErrors[order.id] && (
                            <p className="mt-1 text-right text-xs text-red-600">
                              {confirmErrors[order.id]}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
