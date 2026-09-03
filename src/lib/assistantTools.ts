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

// STEP 71 — the ONLY entry point the chat route may use to run a tool. An unrecognized tool name
// is rejected here, not silently ignored or passed through — this is the whitelist enforcement
// point itself, not just documentation of intent.
export function executeAssistantTool(name: string, args: unknown): unknown {
  if (name === "get_orders") {
    const params = (args && typeof args === "object" ? args : {}) as GetOrdersToolParams;
    return getOrdersForAssistant(params);
  }

  throw new Error(`UNKNOWN_TOOL: ${name}`);
}
