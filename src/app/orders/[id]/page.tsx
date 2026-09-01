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

// STEP 38 — order-linked transactions, read-only visibility. Local label maps duplicated rather
// than imported from @/lib/transactions (touches server-only db.ts / better-sqlite3) — same
// Client Component constraint already documented in finance/page.tsx and tax/page.tsx, same fix.
const expenseCategoryLabels: Record<string, string> = {
  PRODUCT_PURCHASE: "ซื้อสินค้าเข้าสต็อก",
  SHIPPING: "ค่าขนส่งจริงที่ร้านจ่าย",
  COD_FEE: "ค่าธรรมเนียม COD",
  RETURNED_PARCEL: "พัสดุตีกลับ",
  PACKAGING: "บรรจุภัณฑ์ / กล่อง",
  FACEBOOK_ADS: "ค่าโฆษณา Facebook / Meta",
  FUEL: "ค่าน้ำมัน",
  OTHER: "อื่นๆ",
};

const incomeCategoryLabels: Record<string, string> = {
  PRODUCT_SALE: "ขายสินค้า",
  OTHER_INCOME: "รายรับอื่นๆ",
};

function categoryLabel(type: "income" | "expense", category: string): string {
  if (type === "income") {
    return incomeCategoryLabels[category] || category;
  }
  return expenseCategoryLabels[category] || category;
}

type OrderTransaction = {
  id: number;
  transactionType: "income" | "expense";
  amount: number;
  transactionDate: string;
  category: string;
  description: string | null;
  paymentMethod: string | null;
  notes: string | null;
  linkedOrderStatus: OrderStatus | null;
};

type AttachmentInfo = {
  loaded: boolean;
  hasAttachment: boolean;
  fileUrl: string | null;
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

  // STEP 38 — order-linked transactions, read-only. Fetched via the existing
  // GET /api/transactions?orderId= filter (src/lib/transactions.ts listTransactions()) — no new API
  // route needed. Attachment presence fetched per-transaction via the existing
  // GET /api/transactions/[id]/attachments endpoint (same one Finance already uses), not
  // duplicated/reimplemented here.
  const [orderTransactions, setOrderTransactions] = useState<OrderTransaction[] | null>(null);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsError, setTransactionsError] = useState("");
  const [attachments, setAttachments] = useState<Record<number, AttachmentInfo>>({});

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

  // STEP 38 — order-linked transactions + their attachment presence. Separate effect/loading state
  // from the order load above so a failure here never blocks the order itself from rendering.
  useEffect(() => {
    if (!orderId) return;

    let cancelled = false;

    async function loadOrderTransactions() {
      setTransactionsLoading(true);
      setTransactionsError("");

      try {
        const response = await fetch(`/api/transactions?orderId=${orderId}`, {
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok || !data?.success) {
          throw new Error(data?.error || "ไม่สามารถโหลดธุรกรรมที่เกี่ยวข้องได้");
        }

        if (cancelled) return;

        const rows: OrderTransaction[] = data.data;
        setOrderTransactions(rows);

        // Fetch attachment presence for each transaction in parallel, reusing the existing
        // Finance attachments endpoint as-is (list only — no upload/delete on this read-only page).
        const results = await Promise.all(
          rows.map(async (t) => {
            try {
              const attachmentResponse = await fetch(`/api/transactions/${t.id}/attachments`, {
                cache: "no-store",
              });
              const attachmentData = await attachmentResponse.json();

              if (!attachmentResponse.ok || !attachmentData?.success) {
                return [t.id, { loaded: true, hasAttachment: false, fileUrl: null }] as const;
              }

              const items: Array<{ fileUrl: string }> = attachmentData.data;

              return [
                t.id,
                {
                  loaded: true,
                  hasAttachment: items.length > 0,
                  fileUrl: items.length > 0 ? items[0].fileUrl : null,
                },
              ] as const;
            } catch {
              return [t.id, { loaded: true, hasAttachment: false, fileUrl: null }] as const;
            }
          })
        );

        if (cancelled) return;

        setAttachments(Object.fromEntries(results));
      } catch (err) {
        if (cancelled) return;
        setTransactionsError(
          err instanceof Error ? err.message : "ไม่สามารถโหลดธุรกรรมที่เกี่ยวข้องได้"
        );
        setOrderTransactions(null);
      } finally {
        if (!cancelled) {
          setTransactionsLoading(false);
        }
      }
    }

    loadOrderTransactions();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // STEP 38 — shipping/COD breakdown, derived read-only from orderTransactions. N/A (never 0, never
  // guessed) whenever no linked transaction of that category exists — order.shipping_fee (the
  // customer-facing fee, a plain orders column) is the only one of the four always known.
  function sumByCategory(category: string): number | null {
    if (!orderTransactions) return null;
    const matches = orderTransactions.filter(
      (t) => t.transactionType === "expense" && t.category === category
    );
    if (matches.length === 0) return null;
    return matches.reduce((sum, t) => sum + t.amount, 0);
  }

  const actualShippingExpense = sumByCategory("SHIPPING");
  const returnShippingExpense = sumByCategory("RETURNED_PARCEL");
  const codFee = sumByCategory("COD_FEE");

  const totalIncome = (orderTransactions ?? [])
    .filter((t) => t.transactionType === "income")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = (orderTransactions ?? [])
    .filter((t) => t.transactionType === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

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

            <section className="mt-6 rounded-2xl border bg-white shadow-sm">
              <div className="border-b p-5">
                <h2 className="text-lg font-semibold text-slate-900">
                  🚚 สรุปค่าจัดส่ง
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  แยกระหว่างเงินที่เรียกเก็บจากลูกค้ากับต้นทุนจริงที่ร้านจ่าย — ตัวเลขมาจากข้อมูลจริงใน
                  ระบบเท่านั้น แสดง N/A เมื่อไม่มีข้อมูล
                </p>
              </div>

              <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">ค่าส่งที่เรียกเก็บจากลูกค้า</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {formatCurrency(order.shipping_fee)}
                  </p>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">ค่าขนส่งจริงที่ร้านจ่าย</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {transactionsLoading
                      ? "..."
                      : actualShippingExpense === null
                        ? "N/A"
                        : formatCurrency(actualShippingExpense)}
                  </p>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">ค่าเสียหายจากพัสดุตีกลับ</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {transactionsLoading
                      ? "..."
                      : returnShippingExpense === null
                        ? "N/A"
                        : formatCurrency(returnShippingExpense)}
                  </p>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">ค่าธรรมเนียม COD</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {transactionsLoading ? "..." : codFee === null ? "N/A" : formatCurrency(codFee)}
                  </p>
                </div>
              </div>
            </section>

            <section className="mt-6 rounded-2xl border bg-white shadow-sm">
              <div className="border-b p-5">
                <h2 className="text-lg font-semibold text-slate-900">
                  💳 ธุรกรรมที่เกี่ยวข้องกับออเดอร์
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  รายการนี้เป็นข้อมูลอ่านอย่างเดียว — ไม่สามารถแก้ไข/ลบธุรกรรมจากหน้านี้ได้
                </p>
              </div>

              {transactionsError && (
                <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {transactionsError}
                </div>
              )}

              {transactionsLoading ? (
                <p className="p-5 text-sm text-slate-500">กำลังโหลดข้อมูล...</p>
              ) : !orderTransactions || orderTransactions.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">
                  ยังไม่มีธุรกรรมที่ผูกกับออเดอร์นี้
                </p>
              ) : (
                <>
                  <div className="divide-y">
                    {orderTransactions.map((t) => {
                      const attachment = attachments[t.id];

                      return (
                        <div key={t.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <span
                              className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${
                                t.transactionType === "income"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-red-50 text-red-700"
                              }`}
                            >
                              {t.transactionType === "income" ? "รายได้" : "ค่าใช้จ่าย"}
                            </span>
                            <p className="mt-2 text-sm font-semibold text-slate-900">
                              {categoryLabel(t.transactionType, t.category)}
                            </p>
                            {t.description && (
                              <p className="mt-1 text-xs text-slate-500">{t.description}</p>
                            )}
                            <p className="mt-1 text-xs text-slate-400">{t.transactionDate}</p>
                            {t.linkedOrderStatus && (
                              <p className="mt-1 text-xs text-slate-500">
                                สถานะออเดอร์: {ORDER_STATUS_LABELS[t.linkedOrderStatus] || t.linkedOrderStatus}
                              </p>
                            )}
                            <p className="mt-1 text-xs text-slate-500">
                              {attachment?.loaded
                                ? attachment.hasAttachment
                                  ? (
                                    <>
                                      📎 มีหลักฐานแนบ —{" "}
                                      <a
                                        href={attachment.fileUrl ?? "#"}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-amber-700 underline hover:text-amber-900"
                                      >
                                        ดูหลักฐาน
                                      </a>
                                    </>
                                  )
                                  : "ไม่มีหลักฐานแนบ"
                                : "กำลังตรวจสอบหลักฐาน..."}
                            </p>
                          </div>

                          <p
                            className={`text-lg font-bold ${
                              t.transactionType === "income" ? "text-emerald-600" : "text-red-600"
                            }`}
                          >
                            {t.transactionType === "income" ? "+" : "-"}
                            {formatCurrency(t.amount)}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-2 border-t bg-slate-50 p-5 text-sm">
                    <div className="flex justify-between text-slate-600">
                      <span>รายได้รวม</span>
                      <span className="font-semibold text-emerald-600">
                        {formatCurrency(totalIncome)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>ค่าใช้จ่ายรวม</span>
                      <span className="font-semibold text-red-600">
                        {formatCurrency(totalExpense)}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
