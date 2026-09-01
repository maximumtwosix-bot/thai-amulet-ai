"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ORDER_STATUS_LABELS,
  getAllowedNextStatuses,
  type OrderStatus,
} from "@/lib/orderStatus";

type OrderItem = {
  id: number;
  product_id: number;
  product_name: string | null;
  quantity: number;
  price: number;
  cost: number;
};

type OrderDetail = {
  id: number;
  order_number: string;
  customer_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_district: string | null;
  customer_province: string | null;
  customer_postal_code: string | null;
  channel: string | null;
  payment_method: string | null;
  subtotal: number;
  shipping_fee: number;
  discount: number;
  total: number;
  status: OrderStatus;
  created_at: string;
  items: OrderItem[];
  // STEP 31 — id of the automatically-created income transaction for this order, or null (every
  // order created before STEP 31, including historical order id 1, is null — not backfilled)
  linkedIncomeTransactionId: number | null;
};

function formatDate(value: string) {
  if (!value) return "-";

  const date = new Date(value.replace(" ", "T") + "Z");

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

function formatCurrency(value: number) {
  return `฿${value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params?.id;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  // STEP 32 — order status workflow. Separate from `error` above (page-load failure) since this is
  // a distinct, later action against an already-loaded order.
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");

  async function changeStatus(nextStatus: OrderStatus) {
    // กันการกดซ้ำระหว่างที่ยังอัปเดตอยู่ (เหมือน pattern submitting/saving ที่ใช้อยู่แล้วในหน้าอื่นๆ)
    if (updatingStatus || !order) return;

    setUpdatingStatus(true);
    setStatusError("");

    try {
      const response = await fetch(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถเปลี่ยนสถานะออเดอร์ได้");
      }

      setOrder((current) => (current ? { ...current, status: nextStatus } : current));
    } catch (err) {
      setStatusError(
        err instanceof Error ? err.message : "ไม่สามารถเปลี่ยนสถานะออเดอร์ได้"
      );
    } finally {
      setUpdatingStatus(false);
    }
  }

  useEffect(() => {
    if (!orderId) return;

    let cancelled = false;

    async function loadOrder() {
      setLoading(true);
      setError("");
      setNotFound(false);

      try {
        const response = await fetch(`/api/orders/${orderId}`, {
          cache: "no-store",
        });

        const data = await response.json();

        if (cancelled) return;

        if (response.status === 404) {
          setNotFound(true);
          return;
        }

        if (!response.ok || !data?.success) {
          throw new Error(data?.error || "ไม่สามารถโหลดข้อมูลออเดอร์ได้");
        }

        setOrder(data.data);
      } catch (err) {
        if (cancelled) return;
        console.error("Load order detail error:", err);
        setError(
          err instanceof Error ? err.message : "ไม่สามารถโหลดข้อมูลออเดอร์ได้"
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadOrder();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <Link
            href="/orders"
            className="w-fit rounded-xl border bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            ← กลับไปรายการออเดอร์
          </Link>
        </div>

        {loading ? (
          <div className="rounded-2xl border bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
            กำลังโหลดข้อมูลออเดอร์...
          </div>
        ) : notFound ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-10 text-center text-sm text-red-700 shadow-sm">
            ไม่พบออเดอร์ที่ต้องการ
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-10 text-center text-sm text-red-700 shadow-sm">
            {error}
          </div>
        ) : order ? (
          <>
            <div className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">
                    {order.order_number}
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    {formatDate(order.created_at)}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-fit rounded-full bg-amber-50 px-4 py-1.5 text-sm font-medium text-amber-700">
                      {ORDER_STATUS_LABELS[order.status] || order.status}
                    </span>

                    {order.linkedIncomeTransactionId ? (
                      <span className="w-fit rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-700">
                        ✅ บันทึกรายรับแล้ว (#{order.linkedIncomeTransactionId})
                      </span>
                    ) : (
                      <span className="w-fit rounded-full bg-slate-100 px-4 py-1.5 text-sm font-medium text-slate-500">
                        ยังไม่มีรายรับที่บันทึกไว้
                      </span>
                    )}
                  </div>

                  {/* STEP 32 — only shows buttons for statuses actually reachable from the current
                      one (src/lib/orderStatus.ts's transition table); nothing renders once the
                      order reaches a terminal status (completed/cancelled) */}
                  {getAllowedNextStatuses(order.status).length > 0 && (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="text-xs text-slate-400">เปลี่ยนสถานะ:</span>
                      {getAllowedNextStatuses(order.status).map((next) => (
                        <button
                          key={next}
                          type="button"
                          onClick={() => changeStatus(next)}
                          disabled={updatingStatus}
                          className="rounded-xl border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          {updatingStatus ? "กำลังบันทึก..." : ORDER_STATUS_LABELS[next]}
                        </button>
                      ))}
                    </div>
                  )}

                  {statusError && (
                    <p className="text-xs text-red-600">{statusError}</p>
                  )}
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    ลูกค้า
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    {order.customer_name || "ไม่มีข้อมูลลูกค้า"}
                  </p>
                  {order.customer_phone && (
                    <p className="text-sm text-slate-500">{order.customer_phone}</p>
                  )}
                  {(order.customer_address ||
                    order.customer_district ||
                    order.customer_province) && (
                    <p className="text-sm text-slate-500">
                      {[
                        order.customer_address,
                        order.customer_district,
                        order.customer_province,
                        order.customer_postal_code,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    ช่องทาง / การชำระเงิน
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    {order.channel || "-"}
                  </p>
                  <p className="text-sm text-slate-500">
                    {order.payment_method || "-"}
                  </p>
                </div>
              </div>
            </div>

            <section className="rounded-2xl border bg-white shadow-sm">
              <div className="border-b p-5">
                <h2 className="text-lg font-semibold text-slate-900">
                  รายการสินค้า
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="p-4">สินค้า</th>
                      <th className="p-4">จำนวน</th>
                      <th className="p-4">ราคา/ชิ้น</th>
                      <th className="p-4">รวม</th>
                    </tr>
                  </thead>

                  <tbody>
                    {order.items.map((item) => (
                      <tr key={item.id} className="border-t hover:bg-slate-50">
                        <td className="p-4">
                          <div className="font-semibold text-slate-900">
                            {item.product_name || `สินค้ารหัส ${item.product_id}`}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            Product ID: {item.product_id}
                          </div>
                        </td>
                        <td className="p-4 text-slate-700">{item.quantity}</td>
                        <td className="p-4 text-slate-700">
                          {formatCurrency(item.price)}
                        </td>
                        <td className="p-4 font-semibold text-slate-900">
                          {formatCurrency(item.price * item.quantity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2 border-t p-5 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>ยอดรวมสินค้า</span>
                  <span>{formatCurrency(order.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>ค่าจัดส่ง</span>
                  <span>{formatCurrency(order.shipping_fee)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>ส่วนลด</span>
                  <span>-{formatCurrency(order.discount)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 text-base font-bold text-slate-900">
                  <span>ยอดรวมสุทธิ</span>
                  <span>{formatCurrency(order.total)}</span>
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
