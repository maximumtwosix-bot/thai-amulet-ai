import db from "@/lib/db";
import { resolveTaxPeriod, type TaxPeriodType, type TaxSummaryParams } from "@/lib/taxSummary";

// Profit / Margin Reporting — STEP 37.
//
// Read-only aggregation, same "DATA ORGANIZATION layer only" nature as src/lib/taxSummary.ts (STEP
// 22) — no new table, no new column, no stored/derived financial data anywhere. Every number here
// is computed fresh from the same `transactions`/`orders`/`order_items` rows Finance/Tax already
// read. Reuses taxSummary.ts's resolveTaxPeriod() directly so this report's monthly/yearly/custom-
// range semantics are byte-for-byte identical to Finance/Tax's, per instructions.
//
// ===== WHY THIS IS A SEPARATE METRIC FROM FINANCE/TAX'S OWN TOTALS (READ BEFORE CHANGING) =====
// STEP 32 established a hard rule: cancelling an order must NEVER modify Finance/Tax totals or the
// order's linked transaction row. That rule is untouched by this file — nothing here writes
// anything, and GET /api/tax/summary's totalIncome/totalExpense still include every transaction
// regardless of order status, exactly as before.
//
// This STEP's own business rule (approved 2026-09-01) is different and explicit: a cancelled
// order's income must NOT count as "Revenue" in the *Profit* report specifically, because it was
// never actually money the shop kept — the sale did not happen. This is a new, separate metric
// (this file), not a change to the existing one — Finance's "รายรับรวม" and this report's "รายได้"
// are allowed to legitimately show different numbers for the same period, and the UI must make that
// difference obvious rather than silently disagree with Finance.
//
// ===== REVENUE =====
// SUM of income transactions in the period, EXCLUDING any whose linked order (if any) has
// status = 'cancelled'. Income with no order_id at all (e.g. manual OTHER_INCOME entries, or an
// AI-slip-confirmed payment never linked to an order) still counts — the cancelled-order carve-out
// only ever excludes order-linked income for a specifically cancelled order, per the business rule's
// own framing ("ออเดอร์ CANCELLED ... ห้ามนับเป็น Revenue").
//
// STEP 67 (approved 2026-09-02) — ALSO excludes an order whose delivery_status = 'returned' while
// status is still not 'cancelled' (i.e. a parcel that bounced back but the operator hasn't yet
// formally cancelled the order) — same underlying reasoning as the cancelled carve-out above: this
// was never actually revenue the shop kept. An already-cancelled order is unaffected by this
// addition (it's already excluded by the status check regardless of delivery_status). This rule is
// scoped to the Profit report ONLY, per approval — Finance/Tax's totalIncome, /orders' totalRevenue,
// and everything else deliberately still include it, exactly as before this STEP.
//
// ===== COGS =====
// SUM(order_items.cost * order_items.quantity) for orders whose own linked income transaction falls
// in the period AND whose status != 'cancelled' AND delivery_status != 'returned' (STEP 67, same
// carve-out as Revenue above — an order excluded from Revenue must also not contribute its item
// cost to COGS, or grossProfit would be distorted by counting cost without the matching revenue).
// Relies on STEP 34's duplicate-income guard (at most one income transaction can ever exist per
// order) to avoid double-counting an order's items if it somehow had two income rows — verified
// still enforced, not re-implemented here.
//
// ===== SHIPPING EXPENSE / COD-RETURN LOSS =====
// SUM of expense transactions by category in the period: `SHIPPING` → shippingExpense,
// `COD_FEE` + `RETURNED_PARCEL` → codReturnLoss. Both categories already existed on
// EXPENSE_CATEGORIES before this STEP (confirmed via audit) — nothing new was added. These are
// NOT required to be order-linked to be counted here (matching how Tax's own expenseByCategory
// breakdown already works, with zero order-awareness) — a general courier account fee, for example,
// may not be tied to one specific order.
//
// ===== OPERATING EXPENSES =====
// SUM of every other expense category (PRODUCT_PURCHASE, PACKAGING, FACEBOOK_ADS, FUEL, OTHER) —
// deliberately excludes SHIPPING/COD_FEE/RETURNED_PARCEL so they are never subtracted twice.
// PRODUCT_PURCHASE here is a genuinely different figure from COGS above (COGS = cost of items
// actually sold this period, from product.cost captured at sale time; PRODUCT_PURCHASE = cash spent
// restocking, which may not correspond to the same items or period) — both are shown, neither is
// netted against the other, since doing so would require an inventory-costing assumption this
// codebase has never made anywhere else.

const SHIPPING_CATEGORY = "SHIPPING";
const COD_RETURN_CATEGORIES = ["COD_FEE", "RETURNED_PARCEL"];

export interface ProfitSummaryResult {
  period: {
    type: TaxPeriodType;
    year: number | null;
    month: number | null;
    dateFrom: string;
    dateTo: string;
  };
  revenue: number;
  cogs: number;
  grossProfit: number;
  // null when revenue is 0 — a margin percentage is mathematically undefined at zero revenue, not
  // "0%". The UI must render this as N/A, never invent a number.
  grossMarginPercent: number | null;
  operatingExpenses: number;
  shippingExpense: number;
  codReturnLoss: number;
  netProfit: number;
  // transparency counters — not part of the profit formula itself, but let the UI/operator sanity-
  // check why this report's "revenue" differs from Finance's "รายรับรวม" for the same period.
  includedIncomeEntryCount: number;
  excludedCancelledOrderCount: number;
}

export function getProfitSummary(params: TaxSummaryParams): ProfitSummaryResult {
  const period = resolveTaxPeriod(params);
  const { dateFrom, dateTo } = period;

  const revenueRow = db
    .prepare(
      `
      SELECT COALESCE(SUM(t.amount), 0) AS total, COUNT(*) AS count
      FROM transactions t
      LEFT JOIN orders o ON o.id = t.order_id
      WHERE t.transaction_type = 'income'
        AND t.transaction_date BETWEEN ? AND ?
        AND (t.order_id IS NULL OR (o.status != 'cancelled' AND o.delivery_status != 'returned'))
      `
    )
    .get(dateFrom, dateTo) as { total: number; count: number };

  const cogsRow = db
    .prepare(
      `
      SELECT COALESCE(SUM(oi.cost * oi.quantity), 0) AS total
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN transactions t ON t.order_id = o.id AND t.transaction_type = 'income'
      WHERE o.status != 'cancelled'
        AND o.delivery_status != 'returned'
        AND t.transaction_date BETWEEN ? AND ?
      `
    )
    .get(dateFrom, dateTo) as { total: number };

  const excludedCancelledRow = db
    .prepare(
      `
      SELECT COUNT(DISTINCT o.id) AS count
      FROM transactions t
      JOIN orders o ON o.id = t.order_id
      WHERE t.transaction_type = 'income'
        AND t.transaction_date BETWEEN ? AND ?
        AND o.status = 'cancelled'
      `
    )
    .get(dateFrom, dateTo) as { count: number };

  const shippingRow = db
    .prepare(
      `
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM transactions
      WHERE transaction_type = 'expense'
        AND category = ?
        AND transaction_date BETWEEN ? AND ?
      `
    )
    .get(SHIPPING_CATEGORY, dateFrom, dateTo) as { total: number };

  const codReturnRow = db
    .prepare(
      `
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM transactions
      WHERE transaction_type = 'expense'
        AND category IN (${COD_RETURN_CATEGORIES.map(() => "?").join(", ")})
        AND transaction_date BETWEEN ? AND ?
      `
    )
    .get(...COD_RETURN_CATEGORIES, dateFrom, dateTo) as { total: number };

  const otherExpenseRow = db
    .prepare(
      `
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM transactions
      WHERE transaction_type = 'expense'
        AND category NOT IN (${[SHIPPING_CATEGORY, ...COD_RETURN_CATEGORIES].map(() => "?").join(", ")})
        AND transaction_date BETWEEN ? AND ?
      `
    )
    .get(SHIPPING_CATEGORY, ...COD_RETURN_CATEGORIES, dateFrom, dateTo) as { total: number };

  const revenue = revenueRow.total;
  const cogs = cogsRow.total;
  const grossProfit = revenue - cogs;
  const grossMarginPercent = revenue > 0 ? (grossProfit / revenue) * 100 : null;
  const operatingExpenses = otherExpenseRow.total;
  const shippingExpense = shippingRow.total;
  const codReturnLoss = codReturnRow.total;
  const netProfit = grossProfit - operatingExpenses - shippingExpense - codReturnLoss;

  return {
    period,
    revenue,
    cogs,
    grossProfit,
    grossMarginPercent,
    operatingExpenses,
    shippingExpense,
    codReturnLoss,
    netProfit,
    includedIncomeEntryCount: revenueRow.count,
    excludedCancelledOrderCount: excludedCancelledRow.count,
  };
}
