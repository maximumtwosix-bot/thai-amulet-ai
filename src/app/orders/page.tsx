"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import { ORDER_STATUS_LABELS } from "@/lib/orderStatus";

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

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadOrders() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/orders?limit=100", {
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
    loadOrders();
  }, []);

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);

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

        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">จำนวนออเดอร์</p>
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
        </div>

        <section className="rounded-2xl border bg-white shadow-sm">
          <div className="border-b p-5">
            <h2 className="text-lg font-semibold text-slate-900">
              รายการออเดอร์
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              เรียงจากออเดอร์ล่าสุดไปเก่าสุด
            </p>
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
          ) : orders.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              ยังไม่มีออเดอร์ในระบบ
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-4">เลขที่ออเดอร์</th>
                    <th className="p-4">วันที่</th>
                    <th className="p-4">ลูกค้า</th>
                    <th className="p-4">ช่องทาง</th>
                    <th className="p-4">จำนวนสินค้า</th>
                    <th className="p-4">ยอดรวม</th>
                    <th className="p-4">สถานะ</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>

                <tbody>
                  {orders.map((order) => (
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
                        <Link
                          href={`/orders/${order.id}`}
                          className="rounded-xl border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          ดูรายละเอียด →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
