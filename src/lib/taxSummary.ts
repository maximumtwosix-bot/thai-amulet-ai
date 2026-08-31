import db from "@/lib/db";

// Tax Preparation / Reporting — STEP 22.
//
// This is a DATA ORGANIZATION layer only — it sums real transaction rows so a shop owner (or their
// accountant) can review income/expense by period, channel, and category, and export that for
// bookkeeping. It does NOT calculate Thai tax owed, VAT, deductions, or any legal figure — there is
// no rate table, no threshold logic, nothing tax-law-specific anywhere in this file. Every number
// returned is a direct sum of real `transactions.amount` values for the requested period.
//
// Deliberately reuses the existing `transactions` table as-is (per instructions) — no new table,
// no duplicated/derived financial data stored anywhere. Every call here is a read-only aggregation
// computed fresh from the same source of truth STEP 20's CRUD writes to.

export type TaxPeriodType = "monthly" | "yearly" | "range";

export interface TaxSummaryParams {
  year?: number;
  month?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface CategoryTotal {
  category: string;
  total: number;
  count: number;
}

export interface ChannelTotal {
  salesChannel: string;
  total: number;
  count: number;
}

export interface MonthTotal {
  month: string; // "YYYY-MM"
  income: number;
  expense: number;
  net: number;
}

export interface TaxSummaryTransaction {
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
}

export interface TaxSummaryResult {
  period: {
    type: TaxPeriodType;
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
  transactions: TaxSummaryTransaction[];
}

const UNSPECIFIED_CHANNEL_LABEL = "ไม่ระบุช่องทาง";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function lastDayOfMonth(year: number, month: number): number {
  // month is 1-indexed here; new Date(year, month, 0) gives the last day of that 1-indexed month
  return new Date(year, month, 0).getDate();
}

/**
 * แปลง params (year เดี่ยว / year+month / dateFrom+dateTo) เป็นช่วงวันที่จริง (inclusive ทั้งสองด้าน)
 * — ห้าม throw error ที่เป็น raw ให้ caller (route) จัดการแปลงเป็น 400 เอง
 */
export function resolveTaxPeriod(params: TaxSummaryParams): {
  type: TaxPeriodType;
  year: number | null;
  month: number | null;
  dateFrom: string;
  dateTo: string;
} {
  if (params.dateFrom && params.dateTo) {
    if (Number.isNaN(Date.parse(params.dateFrom)) || Number.isNaN(Date.parse(params.dateTo))) {
      throw new Error("INVALID_DATE_RANGE");
    }

    if (params.dateFrom > params.dateTo) {
      throw new Error("INVALID_DATE_RANGE_ORDER");
    }

    return {
      type: "range",
      year: null,
      month: null,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    };
  }

  if (params.year === undefined) {
    throw new Error("YEAR_REQUIRED");
  }

  if (!Number.isInteger(params.year) || params.year < 2000 || params.year > 2100) {
    throw new Error("INVALID_YEAR");
  }

  if (params.month !== undefined) {
    if (!Number.isInteger(params.month) || params.month < 1 || params.month > 12) {
      throw new Error("INVALID_MONTH");
    }

    const dateFrom = `${params.year}-${pad2(params.month)}-01`;
    const dateTo = `${params.year}-${pad2(params.month)}-${pad2(lastDayOfMonth(params.year, params.month))}`;

    return { type: "monthly", year: params.year, month: params.month, dateFrom, dateTo };
  }

  return {
    type: "yearly",
    year: params.year,
    month: null,
    dateFrom: `${params.year}-01-01`,
    dateTo: `${params.year}-12-31`,
  };
}

// ใช้ query param parsing ร่วมกันทั้ง /api/tax/summary และ /api/tax/export — parse เป็น
// number/undefined เท่านั้น แล้วให้ resolveTaxPeriod() ตรวจความถูกต้องจริงอีกชั้นเสมอ (ห้ามเชื่อ
// query string ตรงๆ)
export function parseTaxSummaryParams(searchParams: URLSearchParams): TaxSummaryParams {
  const yearParam = searchParams.get("year");
  const monthParam = searchParams.get("month");
  const dateFromParam = searchParams.get("dateFrom");
  const dateToParam = searchParams.get("dateTo");

  const params: TaxSummaryParams = {};

  if (yearParam !== null && yearParam !== "") {
    params.year = Number(yearParam);
  }

  if (monthParam !== null && monthParam !== "") {
    params.month = Number(monthParam);
  }

  if (dateFromParam) {
    params.dateFrom = dateFromParam;
  }

  if (dateToParam) {
    params.dateTo = dateToParam;
  }

  return params;
}

export function getTaxSummary(params: TaxSummaryParams): TaxSummaryResult {
  const period = resolveTaxPeriod(params);
  const { dateFrom, dateTo } = period;

  const totalsByType = db
    .prepare(
      `
      SELECT transaction_type, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
      FROM transactions
      WHERE transaction_date BETWEEN ? AND ?
      GROUP BY transaction_type
      `
    )
    .all(dateFrom, dateTo) as Array<{ transaction_type: string; total: number; count: number }>;

  let totalIncome = 0;
  let totalExpense = 0;
  let transactionCount = 0;

  for (const row of totalsByType) {
    transactionCount += row.count;
    if (row.transaction_type === "income") totalIncome = row.total;
    if (row.transaction_type === "expense") totalExpense = row.total;
  }

  const channelRows = db
    .prepare(
      `
      SELECT sales_channel, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
      FROM transactions
      WHERE transaction_type = 'income' AND transaction_date BETWEEN ? AND ?
      GROUP BY sales_channel
      ORDER BY total DESC
      `
    )
    .all(dateFrom, dateTo) as Array<{ sales_channel: string | null; total: number; count: number }>;

  const incomeBySalesChannel: ChannelTotal[] = channelRows.map((row) => ({
    salesChannel: row.sales_channel || UNSPECIFIED_CHANNEL_LABEL,
    total: row.total,
    count: row.count,
  }));

  const categoryRows = db
    .prepare(
      `
      SELECT category, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
      FROM transactions
      WHERE transaction_type = 'expense' AND transaction_date BETWEEN ? AND ?
      GROUP BY category
      ORDER BY total DESC
      `
    )
    .all(dateFrom, dateTo) as Array<{ category: string; total: number; count: number }>;

  const expenseByCategory: CategoryTotal[] = categoryRows.map((row) => ({
    category: row.category,
    total: row.total,
    count: row.count,
  }));

  const monthlyRows = db
    .prepare(
      `
      SELECT substr(transaction_date, 1, 7) AS ym, transaction_type, COALESCE(SUM(amount), 0) AS total
      FROM transactions
      WHERE transaction_date BETWEEN ? AND ?
      GROUP BY ym, transaction_type
      `
    )
    .all(dateFrom, dateTo) as Array<{ ym: string; transaction_type: string; total: number }>;

  const monthlyMap = new Map<string, { income: number; expense: number }>();

  // เติมทุกเดือนในช่วงให้ครบ (แม้ไม่มี transaction เลยในเดือนนั้น) เพื่อให้ UI แสดงกราฟ/ตารางต่อเนื่อง
  // ไม่มีช่องว่างที่ทำให้เข้าใจผิดว่าไม่มีข้อมูล — คำนวณจาก dateFrom/dateTo จริงเสมอ ไม่ hardcode ปี
  const startCursor = new Date(`${dateFrom.slice(0, 7)}-01T00:00:00Z`);
  const endCursor = new Date(`${dateTo.slice(0, 7)}-01T00:00:00Z`);

  for (
    let cursor = new Date(startCursor);
    cursor.getTime() <= endCursor.getTime();
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  ) {
    const ym = `${cursor.getUTCFullYear()}-${pad2(cursor.getUTCMonth() + 1)}`;
    monthlyMap.set(ym, { income: 0, expense: 0 });
  }

  for (const row of monthlyRows) {
    const entry = monthlyMap.get(row.ym) ?? { income: 0, expense: 0 };

    if (row.transaction_type === "income") entry.income = row.total;
    if (row.transaction_type === "expense") entry.expense = row.total;

    monthlyMap.set(row.ym, entry);
  }

  const monthlyBreakdown: MonthTotal[] = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { income, expense }]) => ({
      month,
      income,
      expense,
      net: income - expense,
    }));

  const transactionRows = db
    .prepare(
      `
      SELECT
        t.id,
        t.transaction_type,
        t.amount,
        t.transaction_date,
        t.category,
        t.description,
        t.sales_channel,
        t.product_id,
        t.order_id,
        t.payment_method,
        t.notes,
        (SELECT COUNT(*) FROM transaction_attachments ta WHERE ta.transaction_id = t.id) AS attachment_count
      FROM transactions t
      WHERE t.transaction_date BETWEEN ? AND ?
      ORDER BY t.transaction_date DESC, t.id DESC
      `
    )
    .all(dateFrom, dateTo) as Array<{
    id: number;
    transaction_type: string;
    amount: number;
    transaction_date: string;
    category: string;
    description: string | null;
    sales_channel: string | null;
    product_id: number | null;
    order_id: number | null;
    payment_method: string | null;
    notes: string | null;
    attachment_count: number;
  }>;

  const transactions: TaxSummaryTransaction[] = transactionRows.map((row) => ({
    id: row.id,
    transactionType: row.transaction_type as "income" | "expense",
    amount: row.amount,
    transactionDate: row.transaction_date,
    category: row.category,
    description: row.description,
    salesChannel: row.sales_channel,
    productId: row.product_id,
    orderId: row.order_id,
    paymentMethod: row.payment_method,
    notes: row.notes,
    hasAttachment: row.attachment_count > 0,
  }));

  return {
    period,
    totalIncome,
    totalExpense,
    netIncome: totalIncome - totalExpense,
    transactionCount,
    incomeBySalesChannel,
    expenseByCategory,
    monthlyBreakdown,
    transactions,
  };
}
