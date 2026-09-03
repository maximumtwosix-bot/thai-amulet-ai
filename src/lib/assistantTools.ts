import db from "./db";
import {
  isValidOrderStatus,
  isValidOrderStatusTransition,
  ORDER_STATUSES,
  getAllowedNextStatuses,
} from "./orderStatus";
import { getTaxSummary } from "./taxSummary";
import { getProfitSummary, type ProfitSummaryResult } from "./profitSummary";
import { updateOrderStatus } from "./orders";

// STEP 71 — first Local AI Assistant tool: read-only order lookups. This is the security boundary
// the STEP 68 audit recommended: "the AI never receives a raw DB connection... it can only invoke
// a small, explicitly-coded set of wrapper functions." Every exported function here THROUGH STEP 75
// was a plain SELECT — no INSERT/UPDATE/DELETE statement existed anywhere in this file. The chat
// route (src/app/api/assistant/chat/route.ts) may call ONLY executeAssistantTool() below, never
// build or run a query of its own — the model itself never sees SQL, only fixed, named tools.
//
// STEP 76 — the read-only invariant above is deliberately narrowed, not dropped: this file now
// contains exactly ONE write path (updateOrderStatusForAssistant, below). It does not run its own
// UPDATE — it resolves an order_number to an id via a plain SELECT, then calls the EXISTING
// updateOrderStatus() (src/lib/orders.ts, STEP 32), the same function PATCH /api/orders/[id]/status
// (the Order Detail page's status buttons) already calls. The status state machine
// (pending→paid→shipped→completed, cancellation from pending/paid/shipped only, completed/cancelled
// both terminal) lives ONLY in src/lib/orderStatus.ts and is neither re-implemented nor loosened
// here. Every other tool in this file remains read-only.

export interface AssistantToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export const ASSISTANT_TOOLS: AssistantToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_orders",
      description:
        "Get a list of recent orders from the shop's database. Can filter by creation date and/or order status. Returns order number, customer name, channel, order status, delivery status, total amount, creation date, and item count. Read-only — never modifies anything.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description:
              "Filter to orders created on this date (Bangkok time), format YYYY-MM-DD. Omit to search all dates.",
          },
          status: {
            type: "string",
            description: "Filter by order status.",
            enum: ["pending", "paid", "shipped", "completed", "cancelled"],
          },
          limit: {
            type: "integer",
            description: "Maximum number of orders to return. Default 10, capped at 20.",
          },
        },
        required: [],
      },
    },
  },
  // STEP 72 — Products tool. Fields chosen deliberately: name/category/price/cost/stock/status are
  // exactly what a shop-management assistant needs (stock checks, pricing/margin questions,
  // availability). `cost` is included because this route is only reachable by an already-
  // authenticated shop operator (STEP 70's session gate) who can already see every one of these
  // fields on the existing /products page — there is no NEW exposure here, only the same admin-only
  // data reused through a different interface. `description` is deliberately EXCLUDED: it's a long
  // marketing blurb (see Product 47's real description, hundreds of characters) that would waste
  // context/tokens on this CPU-bound model for no assistant-relevant benefit. `model`/`master`/
  // `year` (amulet-specific attributes) and timestamps are also excluded — not needed for the
  // narrow "check stock/price/availability" use case this first Products tool targets.
  {
    type: "function",
    function: {
      name: "get_products",
      description:
        "Get a list of products from the shop's inventory. Can filter by search term (partial match on product name) and/or exact category. Returns product name, category, price, cost, stock quantity, and status. Read-only — never modifies anything.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Search term to match against the product name (partial match). Omit to search all products.",
          },
          category: {
            type: "string",
            description: "Filter to products in exactly this category. Omit to search all categories.",
          },
          limit: {
            type: "integer",
            description: "Maximum number of products to return. Default 10, capped at 20.",
          },
        },
        required: [],
      },
    },
  },
  // STEP 72 — Customers tool. PRIVACY DECISION (documented per instructions): only `name` and
  // `phone` are exposed — `address`/`district`/`province`/`postal_code` are deliberately EXCLUDED.
  // Rationale: name/phone are what "who is this customer / find customer X" assistant questions
  // actually need (matches this codebase's own existing customer-search convention,
  // src/lib/customers.ts's listCustomers(): "search matches name OR phone"). Full physical address
  // is materially more sensitive (a real person's home location) and isn't needed for the kind of
  // summary/lookup question this first Customers tool is meant to answer — narrowing this now is a
  // deliberate choice, not an oversight, and can be revisited later with explicit approval if a
  // real shop-assistant use case needs it (e.g. a future shipping-focused tool).
  {
    type: "function",
    function: {
      name: "get_customers",
      description:
        "Search for customers by name or phone number. Returns ONLY customer name and phone number — address and other personal details are never exposed by this tool, for privacy. Read-only — never modifies anything.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Search term to match against the customer's name or phone number (partial match). Omit to list recent customers.",
          },
          limit: {
            type: "integer",
            description: "Maximum number of customers to return. Default 10, capped at 20.",
          },
        },
        required: [],
      },
    },
  },
  // STEP 73 — Sales tool. Deliberately a SEPARATE metric from get_finance_summary/get_profit_summary
  // below — see this codebase's own STEP 60/61 finding that "ยอดขายรวม" (order revenue, sum of
  // order.total excluding cancelled orders) is NOT the same number as Finance's totalIncome (includes
  // cancelled income) or Profit's revenue (excludes cancelled AND returned-not-cancelled income). The
  // description below and the `metricDefinition` field on every response exist specifically so the
  // model has the disambiguating language available verbatim, rather than guessing which of three
  // legitimately-different "sales" numbers a question like "ยอดขายวันนี้เท่าไร" wants.
  {
    type: "function",
    function: {
      name: "get_sales_summary",
      description:
        "Get order-based sales revenue summary (sum of order totals), matching the /orders page's 'ยอดขายรวม' figure. Excludes cancelled orders by default. This is a DIFFERENT number from Finance income (get_finance_summary) and Profit revenue (get_profit_summary) — those apply different rules for cancelled/returned orders. Read-only — never modifies anything.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description:
              "Filter to orders created on this date (Bangkok time), format YYYY-MM-DD. Omit to include all dates.",
          },
          status: {
            type: "string",
            description:
              "Filter to orders with exactly this status. When set, overrides the default cancelled-order exclusion.",
            enum: ["pending", "paid", "shipped", "completed", "cancelled"],
          },
          includeCancelled: {
            type: "boolean",
            description: "Include cancelled orders in the total. Default false (cancelled orders excluded, matching the /orders page).",
          },
        },
        required: [],
      },
    },
  },
  // STEP 73 — Finance + Tax shared tool (approved: ONE tool, not two — the Finance and Tax pages
  // already compute identical totals via the same getTaxSummary()). Summary/breakdown fields only —
  // deliberately never returns the raw per-transaction list or its free-text description/notes
  // fields, per approval ("Do NOT expose raw transaction rows" / "Do NOT expose free-text
  // descriptions/notes"). Date-range validation (max 366 days inclusive) happens in
  // getFinanceSummaryForAssistant() below, BEFORE getTaxSummary() is ever called — malformed or
  // oversized ranges never reach the real calculation function.
  {
    type: "function",
    function: {
      name: "get_finance_summary",
      description:
        "Get income/expense totals for a period — the same figures shown on both the Finance and Tax pages (they are identical). Returns totalIncome, totalExpense, netIncome, income-by-channel, expense-by-category, and a monthly breakdown. totalIncome includes cancelled-order income (never reversed) — this differs from get_sales_summary and get_profit_summary. Does NOT calculate tax liability/VAT — only reports existing recorded income/expense. Read-only — never modifies anything.",
      parameters: {
        type: "object",
        properties: {
          year: {
            type: "integer",
            description: "Year to report on (e.g. 2026). Omit together with month/dateFrom/dateTo to default to the current year.",
          },
          month: {
            type: "integer",
            description: "Month (1-12) within `year` to narrow the report to. Omit to report the whole year.",
          },
          dateFrom: {
            type: "string",
            description: "Start date (YYYY-MM-DD) for a custom range. Must be provided together with dateTo. Maximum range is 366 days.",
          },
          dateTo: {
            type: "string",
            description: "End date (YYYY-MM-DD) for a custom range. Must be provided together with dateFrom. Maximum range is 366 days.",
          },
        },
        required: [],
      },
    },
  },
  // STEP 73 — Profit tool. Thin pass-through of the existing getProfitSummary() (src/lib/
  // profitSummary.ts) — the STEP 67 business rule (excludes cancelled orders AND
  // returned-but-not-cancelled orders from revenue/COGS) is NOT altered here, only reported. Same
  // 366-day range validation as get_finance_summary, enforced before getProfitSummary() is called.
  {
    type: "function",
    function: {
      name: "get_profit_summary",
      description:
        "Get profit figures for a period: revenue, COGS, gross profit, gross margin %, operating expenses, shipping expense, COD-return loss, and net profit. This revenue figure EXCLUDES cancelled orders AND returned-but-not-cancelled orders — a stricter rule than get_sales_summary or get_finance_summary, so it is normal for this number to be smaller than those. Read-only — never modifies anything.",
      parameters: {
        type: "object",
        properties: {
          year: {
            type: "integer",
            description: "Year to report on (e.g. 2026). Omit together with month/dateFrom/dateTo to default to the current year.",
          },
          month: {
            type: "integer",
            description: "Month (1-12) within `year` to narrow the report to. Omit to report the whole year.",
          },
          dateFrom: {
            type: "string",
            description: "Start date (YYYY-MM-DD) for a custom range. Must be provided together with dateTo. Maximum range is 366 days.",
          },
          dateTo: {
            type: "string",
            description: "End date (YYYY-MM-DD) for a custom range. Must be provided together with dateFrom. Maximum range is 366 days.",
          },
        },
        required: [],
      },
    },
  },
  // STEP 73 — Inventory summary. Whole-catalog snapshot, no filters needed. Reuses the exact
  // "out"/"low"/"ok" stock-level thresholds already established in src/app/inventory/page.tsx's
  // getStockLevel() (stock<=0 → out; stock<=low_stock_threshold → low; else ok) — no new business
  // rule invented.
  {
    type: "function",
    function: {
      name: "get_inventory_summary",
      description:
        "Get a whole-catalog stock snapshot: total product count, how many are active, how many are out of stock, how many are low stock (at or below their configured threshold), and total stock units across all products. Read-only — never modifies anything.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  // STEP 73 — Inventory movements. Same audit-trail data as GET /api/inventory/movements, but with a
  // much smaller cap (default 10, hard max 20) than that route's own 500-row cap — deliberately NOT
  // inherited, per approval, since a large movement dump would waste this CPU-bound model's context.
  {
    type: "function",
    function: {
      name: "get_inventory_movements",
      description:
        "Get recent inventory stock movements (stock in/out history), optionally filtered to one product. Returns product name, movement type, quantity change, stock before/after, and when it happened. Read-only — never modifies anything and never creates or restores stock.",
      parameters: {
        type: "object",
        properties: {
          productId: {
            type: "integer",
            description: "Restrict to movements for this product ID only. Omit to see movements across all products.",
          },
          limit: {
            type: "integer",
            description: "Maximum number of movements to return. Default 10, capped at 20.",
          },
        },
        required: [],
      },
    },
  },
  // STEP 76 — the ONE write tool in this file. Deliberately targets an order by its human-facing
  // order_number (the identifier every other tool and the UI itself shows) rather than the numeric
  // database id, which the model is never given — this avoids the model ever having to guess or
  // fabricate an id. Only the status field is writable; items, prices, shipping, discount, and
  // customer stay immutable through this tool (matching the API surface — those each have their own
  // separate PATCH endpoints, none exposed to the assistant).
  {
    type: "function",
    function: {
      name: "update_order_status",
      description:
        "WRITE ACTION — can change an order's status in the database, unlike every other tool here, but ONLY after explicit confirmation. Call it WITHOUT confirm (or with confirm=false) first — this is a PREVIEW that returns the current status, the requested status, and a note that confirmation is required, and does NOT write anything. Describe that preview to the user and get their explicit go-ahead. Only call it again with confirm=true, after that go-ahead, to actually apply the change — any other value (omitted, false, null, a string, anything not exactly true) is treated as NOT confirmed and will only preview, never write. Allowed transitions: pending→paid, pending→cancelled, paid→shipped, paid→cancelled, shipped→completed, shipped→cancelled. 'completed' and 'cancelled' are final and cannot be changed again. Use get_orders first to confirm the order number and its current status before calling this.",
      parameters: {
        type: "object",
        properties: {
          orderNumber: {
            type: "string",
            description: "The order's order number, exactly as returned by get_orders (e.g. its order_number field). Not the numeric id.",
          },
          status: {
            type: "string",
            description: "The new status to set.",
            enum: ["pending", "paid", "shipped", "completed", "cancelled"],
          },
          confirm: {
            type: "boolean",
            description: "Set to exactly true only after the user has explicitly confirmed the change shown in a prior preview call. Omit or set false to preview only — no database write occurs.",
          },
        },
        required: ["orderNumber", "status"],
      },
    },
  },
];

export interface GetOrdersToolParams {
  date?: string;
  status?: string;
  limit?: number;
}

export interface AssistantOrderRow {
  order_number: string;
  customer_name: string | null;
  channel: string | null;
  status: string;
  delivery_status: string;
  total: number;
  created_at: string;
  item_count: number;
}

const MAX_LIMIT = 20;
const DEFAULT_LIMIT = 10;

// STEP 59's exact Bangkok-timezone-correct date filter, reused here so the assistant's notion of
// "today"/"a given date" matches the Orders page's exactly (fixed +7 hours, no DST in Thailand).
export function getOrdersForAssistant(params: GetOrdersToolParams): AssistantOrderRow[] {
  let limit = DEFAULT_LIMIT;

  if (params.limit !== undefined) {
    const parsed = Number(params.limit);
    if (Number.isInteger(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  const conditions: string[] = [];
  const args: Array<string | number> = [];

  if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    conditions.push("date(o.created_at, '+7 hours') = ?");
    args.push(params.date);
  }

  if (params.status && isValidOrderStatus(params.status)) {
    conditions.push("o.status = ?");
    args.push(params.status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `
      SELECT
        o.order_number,
        c.name AS customer_name,
        o.channel,
        o.status,
        o.delivery_status,
        o.total,
        o.created_at,
        COUNT(oi.id) AS item_count
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      ${whereClause}
      GROUP BY o.id
      ORDER BY o.id DESC
      LIMIT ?
      `
    )
    .all(...args, limit) as AssistantOrderRow[];

  return rows;
}

// ===== STEP 72 — Products tool =====

export interface GetProductsToolParams {
  search?: string;
  category?: string;
  limit?: number;
}

export interface AssistantProductRow {
  id: number;
  name: string;
  category: string | null;
  price: number;
  cost: number;
  stock: number;
  status: string;
}

export function getProductsForAssistant(params: GetProductsToolParams): AssistantProductRow[] {
  let limit = DEFAULT_LIMIT;

  if (params.limit !== undefined) {
    const parsed = Number(params.limit);
    if (Number.isInteger(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  const conditions: string[] = [];
  const args: Array<string | number> = [];

  if (params.search && params.search.trim()) {
    conditions.push("name LIKE ?");
    args.push(`%${params.search.trim()}%`);
  }

  if (params.category && params.category.trim()) {
    conditions.push("category = ?");
    args.push(params.category.trim());
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `
      SELECT id, name, category, price, cost, stock, status
      FROM products
      ${whereClause}
      ORDER BY id DESC
      LIMIT ?
      `
    )
    .all(...args, limit) as AssistantProductRow[];

  return rows;
}

// ===== STEP 72 — Customers tool =====

export interface GetCustomersToolParams {
  search?: string;
  limit?: number;
}

export interface AssistantCustomerRow {
  name: string;
  phone: string | null;
}

// Reuses the exact same "name OR phone" search convention as src/lib/customers.ts's
// listCustomers() (STEP 36) — deliberately a SEPARATE, narrower SELECT (only name/phone, see the
// privacy comment on the tool definition above), not a call to listCustomers() itself, so the
// field-exposure decision stays explicit and auditable in this one file.
export function getCustomersForAssistant(params: GetCustomersToolParams): AssistantCustomerRow[] {
  let limit = DEFAULT_LIMIT;

  if (params.limit !== undefined) {
    const parsed = Number(params.limit);
    if (Number.isInteger(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  const conditions: string[] = [];
  const args: Array<string> = [];

  if (params.search && params.search.trim()) {
    const term = `%${params.search.trim()}%`;
    conditions.push("(name LIKE ? OR phone LIKE ?)");
    args.push(term, term);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `
      SELECT name, phone
      FROM customers
      ${whereClause}
      ORDER BY name ASC
      LIMIT ?
      `
    )
    .all(...args, limit) as AssistantCustomerRow[];

  return rows;
}

// ===== STEP 73 — Sales / Finance / Profit / Inventory tools =====

// Shared by get_finance_summary and get_profit_summary — enforced HERE, in the wrapper, before
// getTaxSummary()/getProfitSummary() (src/lib/taxSummary.ts, src/lib/profitSummary.ts) are ever
// called, per approval ("Do not modify shared Finance/Tax/Profit calculation functions solely to add
// this limit" / "Prefer enforcing the limit inside the assistant tool wrapper"). A malformed date or
// an out-of-range dateFrom/dateTo never reaches those real calculation functions — this either
// returns a validated params object or a clear { error } to report back to the model, never throws.
const MAX_DATE_RANGE_DAYS = 366;

type ValidatedPeriodParams =
  | { ok: true; year?: number; month?: number; dateFrom?: string; dateTo?: string }
  | { ok: false; error: string };

function validateFinanceOrProfitPeriodParams(params: {
  year?: number;
  month?: number;
  dateFrom?: string;
  dateTo?: string;
}): ValidatedPeriodParams {
  const hasRange = params.dateFrom !== undefined || params.dateTo !== undefined;

  if (hasRange) {
    if (
      typeof params.dateFrom !== "string" ||
      typeof params.dateTo !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(params.dateFrom) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(params.dateTo)
    ) {
      return {
        ok: false,
        error: "dateFrom and dateTo must both be provided together, in YYYY-MM-DD format.",
      };
    }

    const fromTime = Date.parse(params.dateFrom);
    const toTime = Date.parse(params.dateTo);

    if (Number.isNaN(fromTime) || Number.isNaN(toTime)) {
      return { ok: false, error: "dateFrom or dateTo is not a valid calendar date." };
    }

    if (params.dateFrom > params.dateTo) {
      return { ok: false, error: "dateFrom must not be after dateTo." };
    }

    const rangeDays = Math.round((toTime - fromTime) / 86_400_000) + 1;

    if (rangeDays > MAX_DATE_RANGE_DAYS) {
      return {
        ok: false,
        error: `Date range too large (${rangeDays} days). Maximum allowed range is ${MAX_DATE_RANGE_DAYS} days — please narrow the range.`,
      };
    }

    return { ok: true, dateFrom: params.dateFrom, dateTo: params.dateTo };
  }

  // No explicit range — year(+month) path. A full year is at most 366 days and a month is at most
  // 31, so neither needs the range check above. Defaults to the current year when the model supplies
  // nothing at all, rather than letting getTaxSummary()/getProfitSummary() throw a raw YEAR_REQUIRED.
  const year =
    typeof params.year === "number" && Number.isInteger(params.year)
      ? params.year
      : new Date().getFullYear();

  if (year < 2000 || year > 2100) {
    return { ok: false, error: "year must be an integer between 2000 and 2100." };
  }

  if (params.month !== undefined) {
    const month = Number(params.month);

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return { ok: false, error: "month must be an integer between 1 and 12." };
    }

    return { ok: true, year, month };
  }

  return { ok: true, year };
}

export interface GetSalesSummaryToolParams {
  date?: string;
  status?: string;
  includeCancelled?: boolean;
}

export interface AssistantSalesSummaryResult {
  orderCount: number;
  totalRevenue: number;
  averageOrderValue: number | null;
  filters: { date: string | null; status: string | null; includeCancelled: boolean };
  metricDefinition: string;
}

// Mirrors src/app/orders/page.tsx's "ยอดขายรวม" calculation exactly (STEP 61: SUM(order.total)
// excluding status='cancelled' by default) — no new business rule invented, just the same rule
// computed server-side via SQL instead of client-side over an already-fetched order list.
export function getSalesSummaryForAssistant(
  params: GetSalesSummaryToolParams
): AssistantSalesSummaryResult {
  const conditions: string[] = [];
  const args: Array<string> = [];

  let dateFilter: string | null = null;

  if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    dateFilter = params.date;
    conditions.push("date(o.created_at, '+7 hours') = ?");
    args.push(dateFilter);
  }

  let statusFilter: string | null = null;
  const includeCancelled = params.includeCancelled === true;

  if (params.status && isValidOrderStatus(params.status)) {
    // An explicit status filter always takes precedence over the default cancelled-order exclusion
    // below — if the caller specifically asks for cancelled orders, they get exactly that.
    statusFilter = params.status;
    conditions.push("o.status = ?");
    args.push(statusFilter);
  } else if (!includeCancelled) {
    conditions.push("o.status != 'cancelled'");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS orderCount, COALESCE(SUM(o.total), 0) AS totalRevenue
      FROM orders o
      ${whereClause}
      `
    )
    .get(...args) as { orderCount: number; totalRevenue: number };

  return {
    orderCount: row.orderCount,
    totalRevenue: row.totalRevenue,
    averageOrderValue: row.orderCount > 0 ? row.totalRevenue / row.orderCount : null,
    filters: { date: dateFilter, status: statusFilter, includeCancelled },
    metricDefinition:
      "Order revenue (sum of order.total), matching the /orders page's 'ยอดขายรวม' figure. Excludes cancelled orders by default. This is NOT Finance income, NOT Tax income, and NOT the Profit report's revenue — those are separate figures with different cancelled/returned-order rules.",
  };
}

export interface GetFinanceSummaryToolParams {
  year?: number;
  month?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface AssistantFinanceSummaryResult {
  period: { type: string; year: number | null; month: number | null; dateFrom: string; dateTo: string };
  totalIncome: number;
  totalExpense: number;
  netIncome: number;
  transactionCount: number;
  incomeBySalesChannel: Array<{ salesChannel: string; total: number; count: number }>;
  expenseByCategory: Array<{ category: string; total: number; count: number }>;
  monthlyBreakdown: Array<{ month: string; income: number; expense: number; net: number }>;
  metricDefinition: string;
}

// Finance + Tax shared tool (approved: ONE tool, not two — both pages already read identical numbers
// from getTaxSummary()). Deliberately builds a NEW result object rather than returning
// getTaxSummary()'s result as-is, so the raw `transactions` array (with free-text description/notes)
// can never leak through this tool, per approval.
export function getFinanceSummaryForAssistant(
  params: GetFinanceSummaryToolParams
): AssistantFinanceSummaryResult | { error: string } {
  const validated = validateFinanceOrProfitPeriodParams(params);

  if (!validated.ok) {
    return { error: validated.error };
  }

  const summary = getTaxSummary(validated);

  return {
    period: summary.period,
    totalIncome: summary.totalIncome,
    totalExpense: summary.totalExpense,
    netIncome: summary.netIncome,
    transactionCount: summary.transactionCount,
    incomeBySalesChannel: summary.incomeBySalesChannel,
    expenseByCategory: summary.expenseByCategory,
    monthlyBreakdown: summary.monthlyBreakdown,
    metricDefinition:
      "Finance/Tax income and expense totals (identical figures shown on both the Finance and Tax pages). totalIncome includes cancelled-order income (never reversed) — this differs from get_sales_summary (excludes cancelled) and get_profit_summary (excludes cancelled and returned-not-cancelled). Does not calculate tax liability, VAT, or any legal figure — only reports recorded income/expense.",
  };
}

// Profit tool — thin pass-through of the existing getProfitSummary() (src/lib/profitSummary.ts). The
// STEP 67 business rule (excludes cancelled orders AND returned-but-not-cancelled orders from
// revenue/COGS) lives entirely in that function and is not altered here, only reported.
export function getProfitSummaryForAssistant(
  params: GetFinanceSummaryToolParams
): (ProfitSummaryResult & { metricDefinition: string }) | { error: string } {
  const validated = validateFinanceOrProfitPeriodParams(params);

  if (!validated.ok) {
    return { error: validated.error };
  }

  const summary = getProfitSummary(validated);

  return {
    ...summary,
    metricDefinition:
      "Profit report figures — revenue here EXCLUDES cancelled orders AND returned-but-not-cancelled orders, a stricter rule than get_sales_summary or get_finance_summary. It is normal and expected for this revenue to be smaller than those two.",
  };
}

export interface AssistantInventorySummaryResult {
  totalProducts: number;
  activeCount: number;
  outOfStockCount: number;
  lowStockCount: number;
  totalStockUnits: number;
}

// Reuses the exact "out"/"low"/"ok" stock-level thresholds already established in
// src/app/inventory/page.tsx's getStockLevel() (stock<=0 -> out; stock<=low_stock_threshold -> low;
// else ok) — no new business rule invented.
export function getInventorySummaryForAssistant(): AssistantInventorySummaryResult {
  const row = db
    .prepare(
      `
      SELECT
        COUNT(*) AS totalProducts,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS activeCount,
        SUM(CASE WHEN stock <= 0 THEN 1 ELSE 0 END) AS outOfStockCount,
        SUM(CASE WHEN stock > 0 AND stock <= low_stock_threshold THEN 1 ELSE 0 END) AS lowStockCount,
        COALESCE(SUM(stock), 0) AS totalStockUnits
      FROM products
      `
    )
    .get() as AssistantInventorySummaryResult;

  return {
    totalProducts: row.totalProducts,
    activeCount: row.activeCount ?? 0,
    outOfStockCount: row.outOfStockCount ?? 0,
    lowStockCount: row.lowStockCount ?? 0,
    totalStockUnits: row.totalStockUnits,
  };
}

export interface GetInventoryMovementsToolParams {
  productId?: number;
  limit?: number;
}

export interface AssistantInventoryMovementRow {
  productId: number;
  productName: string;
  movementType: string;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  referenceType: string | null;
  createdAt: string;
}

// Same audit-trail query as GET /api/inventory/movements, but with a much smaller cap (default 10,
// hard max 20 via the existing DEFAULT_LIMIT/MAX_LIMIT constants) than that route's own 500-row cap —
// deliberately NOT inherited, per approval. `note` (free text) is deliberately excluded from the
// output, same conservative privacy stance as get_finance_summary's exclusion of transaction notes.
export function getInventoryMovementsForAssistant(
  params: GetInventoryMovementsToolParams
): AssistantInventoryMovementRow[] {
  let limit = DEFAULT_LIMIT;

  if (params.limit !== undefined) {
    const parsed = Number(params.limit);
    if (Number.isInteger(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  let productId: number | null = null;

  if (params.productId !== undefined) {
    const parsed = Number(params.productId);
    if (Number.isInteger(parsed) && parsed > 0) {
      productId = parsed;
    }
  }

  const whereClause = productId !== null ? "WHERE im.product_id = ?" : "";
  const args: Array<number> = productId !== null ? [productId, limit] : [limit];

  const rows = db
    .prepare(
      `
      SELECT
        im.product_id AS productId,
        p.name AS productName,
        im.movement_type AS movementType,
        im.quantity_change AS quantityChange,
        im.quantity_before AS quantityBefore,
        im.quantity_after AS quantityAfter,
        im.reference_type AS referenceType,
        im.created_at AS createdAt
      FROM inventory_movements im
      INNER JOIN products p ON p.id = im.product_id
      ${whereClause}
      ORDER BY im.id DESC
      LIMIT ?
      `
    )
    .all(...args) as AssistantInventoryMovementRow[];

  return rows;
}

// ===== STEP 76/77 — Order status write tool =====
//
// STEP 77 — added an explicit confirm contract, enforced HERE at the tool layer, not through prompt
// instructions a model could ignore or a client the model could talk past. A call is treated as
// confirmed if and ONLY IF params.confirm is the exact boolean `true` (see the strict `=== true`
// check below) — omitted, null, false, a string, a number, or anything else all fall through to the
// SAME preview branch. That preview branch returns before ever calling updateOrderStatus(), so there
// is exactly one place in this function capable of writing, and exactly one gate in front of it.

export interface UpdateOrderStatusToolParams {
  orderNumber?: string;
  status?: string;
  confirm?: unknown;
}

export type UpdateOrderStatusToolResult =
  | { success: true; orderNumber: string; previousStatus: string; newStatus: string }
  | {
      requiresConfirmation: true;
      orderNumber: string;
      currentStatus: string;
      requestedStatus: string;
      message: string;
    }
  | { error: string };

export function updateOrderStatusForAssistant(
  params: UpdateOrderStatusToolParams
): UpdateOrderStatusToolResult {
  const orderNumber = typeof params.orderNumber === "string" ? params.orderNumber.trim() : "";

  if (!orderNumber) {
    return { error: "orderNumber is required." };
  }

  const status = typeof params.status === "string" ? params.status : "";

  if (!status || !isValidOrderStatus(status)) {
    return { error: `status must be one of: ${ORDER_STATUSES.join(", ")}.` };
  }

  // Plain SELECT, same as every other tool's lookup — nothing below this point writes unless the
  // confirm gate further down is passed.
  const existing = db
    .prepare("SELECT id, status FROM orders WHERE order_number = ?")
    .get(orderNumber) as { id: number; status: string } | undefined;

  if (!existing) {
    return { error: `No order found with order number "${orderNumber}".` };
  }

  if (!isValidOrderStatus(existing.status)) {
    return {
      error: `Order "${orderNumber}" has an unrecognized stored status and cannot be changed through this tool.`,
    };
  }

  // Same transition rule updateOrderStatus() itself enforces (src/lib/orderStatus.ts, STEP 32),
  // checked here too and BEFORE the confirm gate — an invalid or terminal-status request is rejected
  // at preview time already, rather than being "confirmable" and only failing on a second call.
  if (!isValidOrderStatusTransition(existing.status, status)) {
    const allowed = getAllowedNextStatuses(existing.status);

    return {
      error:
        allowed.length > 0
          ? `Cannot change order "${orderNumber}" from "${existing.status}" to "${status}". Allowed next status(es): ${allowed.join(", ")}.`
          : `Order "${orderNumber}" is already in a final status ("${existing.status}") and cannot be changed.`,
    };
  }

  // STEP 77 confirmation gate. Strict identity check against the literal boolean `true` — every
  // other value falls through to the preview branch, which performs no write, no matter how many
  // times the model calls this tool for the same order.
  const confirmed = params.confirm === true;

  if (!confirmed) {
    return {
      requiresConfirmation: true,
      orderNumber,
      currentStatus: existing.status,
      requestedStatus: status,
      message: `This will change order "${orderNumber}" from "${existing.status}" to "${status}". No change has been made yet. Confirm with the user, then call update_order_status again with confirm=true to apply it.`,
    };
  }

  try {
    const result = updateOrderStatus(existing.id, status);
    return {
      success: true,
      orderNumber: result.orderNumber,
      previousStatus: existing.status,
      newStatus: result.status,
    };
  } catch (error) {
    // Defensive only — order existence, status validity, and transition legality are all already
    // validated above, so updateOrderStatus() should not throw here in normal operation.
    console.error("Assistant tool update_order_status error:", error);
    return { error: "Failed to update the order status." };
  }
}

// STEP 71/72 — the ONLY entry point the chat route may use to run a tool. An unrecognized tool
// name is rejected here, not silently ignored or passed through — this is the whitelist
// enforcement point itself, not just documentation of intent. Adding a new tool means adding a new
// branch here explicitly — there is no generic "look up a function by name" dispatch that could be
// tricked into running something unintended.
export function executeAssistantTool(name: string, args: unknown): unknown {
  if (name === "get_orders") {
    const params = (args && typeof args === "object" ? args : {}) as GetOrdersToolParams;
    return getOrdersForAssistant(params);
  }

  if (name === "get_products") {
    const params = (args && typeof args === "object" ? args : {}) as GetProductsToolParams;
    return getProductsForAssistant(params);
  }

  if (name === "get_customers") {
    const params = (args && typeof args === "object" ? args : {}) as GetCustomersToolParams;
    return getCustomersForAssistant(params);
  }

  // STEP 73
  if (name === "get_sales_summary") {
    const params = (args && typeof args === "object" ? args : {}) as GetSalesSummaryToolParams;
    return getSalesSummaryForAssistant(params);
  }

  if (name === "get_finance_summary") {
    const params = (args && typeof args === "object" ? args : {}) as GetFinanceSummaryToolParams;
    return getFinanceSummaryForAssistant(params);
  }

  if (name === "get_profit_summary") {
    const params = (args && typeof args === "object" ? args : {}) as GetFinanceSummaryToolParams;
    return getProfitSummaryForAssistant(params);
  }

  if (name === "get_inventory_summary") {
    return getInventorySummaryForAssistant();
  }

  if (name === "get_inventory_movements") {
    const params = (args && typeof args === "object" ? args : {}) as GetInventoryMovementsToolParams;
    return getInventoryMovementsForAssistant(params);
  }

  // STEP 76
  if (name === "update_order_status") {
    const params = (args && typeof args === "object" ? args : {}) as UpdateOrderStatusToolParams;
    return updateOrderStatusForAssistant(params);
  }

  throw new Error(`UNKNOWN_TOOL: ${name}`);
}
