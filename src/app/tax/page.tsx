"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/orderStatus";

// Local label maps — deliberately duplicated rather than imported from @/lib/transactions or
// @/lib/taxSummary (both touch server-only db.ts / better-sqlite3). This is a Client Component;
// importing either would break the page the same way it did for finance/page.tsx in STEP 20
// ("Module not found: Can't resolve 'fs'"). Category/channel values already arrive as plain strings
// in the API response, so only display labels are needed here, not the validation types themselves.
const expenseCategoryLabels: Record<string, string> = {
  PRODUCT_PURCHASE: "ซื้อสินค้าเข้าสต็อก",
  SHIPPING: "ค่าจัดส่ง",
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

const salesChannelLabels: Record<string, string> = {
  facebook: "Facebook",
  tiktok_shop: "TikTok Shop",
  shopee: "Shopee",
  lazada: "Lazada",
  line: "LINE",
  walk_in: "หน้าร้าน",
  other: "อื่นๆ",
};

const monthLabels = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

function categoryLabel(type: "income" | "expense", category: string): string {
  if (type === "income") {
    return incomeCategoryLabels[category] || category;
  }
  return expenseCategoryLabels[category] || category;
}

function channelLabel(channel: string): string {
  return salesChannelLabels[channel] || channel;
}

function formatCurrency(value: number): string {
  return `฿${value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("th-TH", { dateStyle: "medium" });
}

function monthKeyLabel(ym: string): string {
  const [year, month] = ym.split("-");
  const monthIndex = Number(month) - 1;
  return `${monthLabels[monthIndex] || month} ${year}`;
}

type ChannelTotal = { salesChannel: string; total: number; count: number };
type CategoryTotal = { category: string; total: number; count: number };
type MonthTotal = { month: string; income: number; expense: number; net: number };

type SummaryTransaction = {
  id: number;
  transactionType: "income" | "expense";
  amount: number;
  transactionDate: string;
  category: string;
  description: string | null;
  salesChannel: string | null;
  productId: number | null;
  orderId: number | null;
  paymentMethod: string | null;
  notes: string | null;
  hasAttachment: boolean;
  // STEP 34 — display-only, from getTaxSummary()'s order-status join; null unless orderId is set.
  linkedOrderStatus: OrderStatus | null;
  linkedOrderNumber: string | null;
};

type TaxSummary = {
  period: {
    type: "monthly" | "yearly" | "range";
    year: number | null;
    month: number | null;
    dateFrom: string;
    dateTo: string;
  };
  totalIncome: number;
  totalExpense: number;
  netIncome: number;
  transactionCount: number;
  incomeBySalesChannel: ChannelTotal[];
  expenseByCategory: CategoryTotal[];
  monthlyBreakdown: MonthTotal[];
  transactions: SummaryTransaction[];
};

// STEP 37 — Profit/Margin. Deliberately a SEPARATE type/fetch from TaxSummary above, not merged
// into it — "revenue" here excludes cancelled-order income (this STEP's own business rule), while
// TaxSummary's totalIncome above intentionally still includes it (STEP 32's rule: cancellation must
// never change Finance/Tax totals). The two numbers are allowed to legitimately differ for the same
// period — the UI below explains why rather than silently disagreeing with the summary above it.
type ProfitSummary = {
  period: {
    type: "monthly" | "yearly" | "range";
    year: number | null;
    month: number | null;
    dateFrom: string;
    dateTo: string;
  };
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPercent: number | null;
  operatingExpenses: number;
  shippingExpense: number;
  codReturnLoss: number;
  netProfit: number;
  includedIncomeEntryCount: number;
  excludedCancelledOrderCount: number;
};

function formatPercent(value: number | null): string {
  if (value === null) return "N/A";
  return `${value.toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear + 1 - i);

export default function TaxPage() {
  const [viewMode, setViewMode] = useState<"monthly" | "yearly">("monthly");
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const [summary, setSummary] = useState<TaxSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // STEP 37 — separate loading/error state from the tax summary above; deliberately not merged into
  // one useEffect so a failure in either fetch doesn't block the other from rendering.
  const [profitSummary, setProfitSummary] = useState<ProfitSummary | null>(null);
  const [profitLoading, setProfitLoading] = useState(true);
  const [profitError, setProfitError] = useState("");

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ year: String(year) });
    if (viewMode === "monthly") {
      params.set("month", String(month));
    }
    return params.toString();
  }, [viewMode, year, month]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/tax/summary?${queryString}`, { cache: "no-store" });
        const data = await response.json();

        if (!response.ok || !data?.success) {
          throw new Error(data?.error || "ไม่สามารถโหลดสรุปภาษีได้");
        }

        if (!cancelled) {
          setSummary(data.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "ไม่สามารถโหลดสรุปภาษีได้");
          setSummary(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [queryString]);

  // STEP 37 — profit/margin fetch, reusing the exact same queryString (identical monthly/yearly/
  // custom-range date semantics as the tax summary fetch above).
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setProfitLoading(true);
      setProfitError("");

      try {
        const response = await fetch(`/api/profit/summary?${queryString}`, { cache: "no-store" });
        const data = await response.json();

        if (!response.ok || !data?.success) {
          throw new Error(data?.error || "ไม่สามารถโหลดสรุปกำไรได้");
        }

        if (!cancelled) {
          setProfitSummary(data.data);
        }
      } catch (err) {
        if (!cancelled) {
          setProfitError(err instanceof Error ? err.message : "ไม่สามารถโหลดสรุปกำไรได้");
          setProfitSummary(null);
        }
      } finally {
        if (!cancelled) {
          setProfitLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [queryString]);

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">📑 สรุปภาษี / รายรับ-รายจ่าย</h1>
            <p className="mt-1 text-sm text-slate-500">
              จัดระเบียบรายรับ-รายจ่ายตามช่วงเวลา สำหรับใช้ต่อในการทำบัญชี/ยื่นภาษี
              (ระบบนี้ไม่คำนวณภาษีที่ต้องชำระให้ — เป็นการจัดข้อมูลเท่านั้น)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="w-fit rounded-xl border bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              ← กลับหน้าแรก
            </Link>
            <LogoutButton />
          </div>
        </div>

        <section className="mb-6 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">มุมมอง</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode("monthly")}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                    viewMode === "monthly"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  รายเดือน
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("yearly")}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                    viewMode === "yearly"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  รายปี
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">ปี</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {viewMode === "monthly" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">เดือน</label>
                <select
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className="rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                >
                  {monthLabels.map((label, index) => (
                    <option key={label} value={index + 1}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <a
              href={`/api/tax/export?${queryString}`}
              className="ml-auto rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
            >
              ⬇️ ส่งออก CSV
            </a>
          </div>
        </section>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
            กำลังโหลดข้อมูล...
          </div>
        ) : summary ? (
          <>
            <div className="mb-6 grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">รายรับรวม</p>
                <p className="mt-2 text-2xl font-bold text-emerald-600">
                  {formatCurrency(summary.totalIncome)}
                </p>
              </div>
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">รายจ่ายรวม</p>
                <p className="mt-2 text-2xl font-bold text-red-600">
                  {formatCurrency(summary.totalExpense)}
                </p>
              </div>
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">สุทธิ</p>
                <p
                  className={`mt-2 text-2xl font-bold ${summary.netIncome >= 0 ? "text-emerald-600" : "text-red-600"}`}
                >
                  {formatCurrency(summary.netIncome)}
                </p>
              </div>
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">จำนวนรายการ</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {summary.transactionCount.toLocaleString()}
                </p>
              </div>
            </div>

            <section className="mb-6 rounded-2xl border bg-white shadow-sm">
              <div className="border-b p-5">
                <h2 className="text-lg font-semibold text-slate-900">
                  💰 กำไร / อัตรากำไร (Profit / Margin)
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  รายได้ที่นี่ไม่รวมออเดอร์ที่ยกเลิก (cancelled) — จึงอาจต่างจาก
                  &quot;รายรับรวม&quot; ด้านบน ซึ่งยังคงรวมทุกรายการตามกฎเดิม (STEP 32) โดยไม่แก้ไข
                </p>
              </div>

              {profitError && (
                <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {profitError}
                </div>
              )}

              {profitLoading ? (
                <p className="p-5 text-sm text-slate-500">กำลังโหลดข้อมูล...</p>
              ) : profitSummary ? (
                <div className="p-5">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">รายได้ (Revenue)</p>
                      <p className="mt-1 text-xl font-bold text-emerald-600">
                        {formatCurrency(profitSummary.revenue)}
                      </p>
                    </div>
                    <div className="rounded-xl border bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">ต้นทุนขาย (COGS)</p>
                      <p className="mt-1 text-xl font-bold text-red-600">
                        {formatCurrency(profitSummary.cogs)}
                      </p>
                    </div>
                    <div className="rounded-xl border bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">กำไรขั้นต้น (Gross Profit)</p>
                      <p
                        className={`mt-1 text-xl font-bold ${profitSummary.grossProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}
                      >
                        {formatCurrency(profitSummary.grossProfit)}
                      </p>
                    </div>
                    <div className="rounded-xl border bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">อัตรากำไรขั้นต้น (Gross Margin)</p>
                      <p className="mt-1 text-xl font-bold text-slate-900">
                        {formatPercent(profitSummary.grossMarginPercent)}
                      </p>
                    </div>
                    <div className="rounded-xl border bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">ค่าใช้จ่ายดำเนินงาน (Operating)</p>
                      <p className="mt-1 text-xl font-bold text-red-600">
                        {formatCurrency(profitSummary.operatingExpenses)}
                      </p>
                    </div>
                    <div className="rounded-xl border bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">ค่าจัดส่ง (Shipping)</p>
                      <p className="mt-1 text-xl font-bold text-red-600">
                        {formatCurrency(profitSummary.shippingExpense)}
                      </p>
                    </div>
                    <div className="rounded-xl border bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">ขาดทุนจาก COD / ตีกลับ</p>
                      <p className="mt-1 text-xl font-bold text-red-600">
                        {formatCurrency(profitSummary.codReturnLoss)}
                      </p>
                    </div>
                    <div className="rounded-xl border bg-slate-900 p-4">
                      <p className="text-xs text-slate-300">กำไรสุทธิ (Net Profit)</p>
                      <p
                        className={`mt-1 text-xl font-bold ${profitSummary.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {formatCurrency(profitSummary.netProfit)}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-xs text-slate-400">
                    นับรายรับ {profitSummary.includedIncomeEntryCount.toLocaleString()} รายการ ·
                    ไม่นับออเดอร์ที่ยกเลิก {profitSummary.excludedCancelledOrderCount.toLocaleString()}{" "}
                    ออเดอร์เป็นรายได้
                  </p>
                </div>
              ) : (
                <p className="p-5 text-sm text-slate-500">ไม่สามารถโหลดข้อมูลกำไรได้</p>
              )}
            </section>

            <div className="mb-6 grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border bg-white shadow-sm">
                <div className="border-b p-5">
                  <h2 className="text-lg font-semibold text-slate-900">
                    รายรับตามช่องทางการขาย
                  </h2>
                </div>

                {summary.incomeBySalesChannel.length === 0 ? (
                  <p className="p-5 text-sm text-slate-500">ไม่มีรายรับในช่วงนี้</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {summary.incomeBySalesChannel.map((c) => (
                        <tr key={c.salesChannel} className="border-t">
                          <td className="p-4 text-slate-700">{channelLabel(c.salesChannel)}</td>
                          <td className="p-4 text-slate-400">{c.count} รายการ</td>
                          <td className="p-4 text-right font-semibold text-emerald-600">
                            {formatCurrency(c.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section className="rounded-2xl border bg-white shadow-sm">
                <div className="border-b p-5">
                  <h2 className="text-lg font-semibold text-slate-900">รายจ่ายตามหมวดหมู่</h2>
                </div>

                {summary.expenseByCategory.length === 0 ? (
                  <p className="p-5 text-sm text-slate-500">ไม่มีรายจ่ายในช่วงนี้</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {summary.expenseByCategory.map((c) => (
                        <tr key={c.category} className="border-t">
                          <td className="p-4 text-slate-700">
                            {categoryLabel("expense", c.category)}
                          </td>
                          <td className="p-4 text-slate-400">{c.count} รายการ</td>
                          <td className="p-4 text-right font-semibold text-red-600">
                            {formatCurrency(c.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </div>

            {viewMode === "yearly" && (
              <section className="mb-6 rounded-2xl border bg-white shadow-sm">
                <div className="border-b p-5">
                  <h2 className="text-lg font-semibold text-slate-900">สรุปรายเดือน</h2>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="p-4">เดือน</th>
                        <th className="p-4">รายรับ</th>
                        <th className="p-4">รายจ่าย</th>
                        <th className="p-4">สุทธิ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.monthlyBreakdown.map((m) => (
                        <tr key={m.month} className="border-t">
                          <td className="p-4 text-slate-700">{monthKeyLabel(m.month)}</td>
                          <td className="p-4 text-emerald-600">{formatCurrency(m.income)}</td>
                          <td className="p-4 text-red-600">{formatCurrency(m.expense)}</td>
                          <td
                            className={`p-4 font-semibold ${m.net >= 0 ? "text-emerald-600" : "text-red-600"}`}
                          >
                            {formatCurrency(m.net)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="rounded-2xl border bg-white shadow-sm">
              <div className="border-b p-5">
                <h2 className="text-lg font-semibold text-slate-900">รายการในช่วงนี้</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {summary.period.dateFrom} ถึง {summary.period.dateTo}
                </p>
              </div>

              {summary.transactions.length === 0 ? (
                <p className="p-10 text-center text-sm text-slate-500">ไม่มีรายการในช่วงนี้</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="p-4">วันที่</th>
                        <th className="p-4">ประเภท</th>
                        <th className="p-4">หมวดหมู่</th>
                        <th className="p-4">รายละเอียด</th>
                        <th className="p-4">ออเดอร์ที่เกี่ยวข้อง</th>
                        <th className="p-4">จำนวนเงิน</th>
                        <th className="p-4">ไฟล์แนบ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.transactions.map((t) => (
                        <tr key={t.id} className="border-t hover:bg-slate-50">
                          <td className="p-4 whitespace-nowrap text-slate-500">
                            {formatDate(t.transactionDate)}
                          </td>
                          <td className="p-4">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                t.transactionType === "income"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-red-50 text-red-700"
                              }`}
                            >
                              {t.transactionType === "income" ? "รายรับ" : "รายจ่าย"}
                            </span>
                          </td>
                          <td className="p-4 text-slate-700">
                            {categoryLabel(t.transactionType, t.category)}
                          </td>
                          <td className="p-4 max-w-xs text-slate-600">{t.description || "-"}</td>
                          <td className="p-4">
                            {/* STEP 34 — display-only order status flag; never affects any total
                                on this page. Cancelled shown in red so it's obvious the amount to
                                the right still counts toward รายรับรวม/สุทธิ per the STEP 32 rule
                                that cancellation never changes Finance/Tax totals. */}
                            {t.orderId ? (
                              <span
                                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                                  t.linkedOrderStatus === "cancelled"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                #{t.orderId}
                                {t.linkedOrderStatus
                                  ? ` (${ORDER_STATUS_LABELS[t.linkedOrderStatus]})`
                                  : ""}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td
                            className={`p-4 font-semibold ${
                              t.transactionType === "income" ? "text-emerald-600" : "text-red-600"
                            }`}
                          >
                            {t.transactionType === "income" ? "+" : "-"}
                            {formatCurrency(t.amount)}
                          </td>
                          <td className="p-4 text-center">{t.hasAttachment ? "📎" : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
