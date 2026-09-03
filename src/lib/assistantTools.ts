import db from "./db";
import { isValidOrderStatus } from "./orderStatus";

// STEP 71 — first Local AI Assistant tool: read-only order lookups. This is the security boundary
// the STEP 68 audit recommended: "the AI never receives a raw DB connection... it can only invoke
// a small, explicitly-coded set of wrapper functions." Every exported function here is a plain
// SELECT — no INSERT/UPDATE/DELETE statement exists anywhere in this file, and none ever will
// (that's the whole point of this file existing separately from src/lib/orders.ts). The chat route
// (src/app/api/assistant/chat/route.ts) may call ONLY executeAssistantTool() below, never build or
// run a query of its own — the model itself never sees SQL, only this fixed, named tool.

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

  throw new Error(`UNKNOWN_TOOL: ${name}`);
}
