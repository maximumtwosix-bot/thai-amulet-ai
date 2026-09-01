// Income & Expense — STEP 19 — schema-foundation constants only.
//
// This file intentionally contains NO database access and NO insert/update/delete functions.
// It exists purely so the `transactions` table's TEXT columns (transaction_type/category/
// sales_channel) have one authoritative, typed list of allowed values to import from, matching
// this codebase's existing convention (StockMovementType in inventory.ts, AiCostOperation in
// costLedger.ts) of validating enum-like TEXT columns in the TS layer rather than with SQL CHECK
// constraints. The actual read/write logic (recordTransaction(), etc.) belongs to STEP 20.

export type TransactionType = "income" | "expense";

export const TRANSACTION_TYPES: TransactionType[] = ["income", "expense"];

export function isValidTransactionType(value: string): value is TransactionType {
  return (TRANSACTION_TYPES as string[]).includes(value);
}

export type ExpenseCategory =
  | "PRODUCT_PURCHASE"
  | "SHIPPING"
  | "COD_FEE"
  | "RETURNED_PARCEL"
  | "PACKAGING"
  | "FACEBOOK_ADS"
  | "FUEL"
  | "OTHER";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "PRODUCT_PURCHASE",
  "SHIPPING",
  "COD_FEE",
  "RETURNED_PARCEL",
  "PACKAGING",
  "FACEBOOK_ADS",
  "FUEL",
  "OTHER",
];

export function isValidExpenseCategory(value: string): value is ExpenseCategory {
  return (EXPENSE_CATEGORIES as string[]).includes(value);
}

export type IncomeCategory = "PRODUCT_SALE" | "OTHER_INCOME";

export const INCOME_CATEGORIES: IncomeCategory[] = ["PRODUCT_SALE", "OTHER_INCOME"];

export function isValidIncomeCategory(value: string): value is IncomeCategory {
  return (INCOME_CATEGORIES as string[]).includes(value);
}

export type TransactionCategory = ExpenseCategory | IncomeCategory;

export function isValidTransactionCategory(
  type: TransactionType,
  value: string
): value is TransactionCategory {
  return type === "income" ? isValidIncomeCategory(value) : isValidExpenseCategory(value);
}

// Business sales channel — deliberately separate from the existing social-platform enums
// (SocialPlatform in video-studio/page.tsx: facebook/reels/instagram/tiktok, used for content
// posting) since this represents where a *sale* happened, not where content was *posted*. Kept
// as a plain string union (not a DB-backed table) per instructions — extensible by adding a value
// here later, same pattern as the category lists above.
export type SalesChannel =
  | "facebook"
  | "tiktok_shop"
  | "shopee"
  | "lazada"
  | "line"
  | "walk_in"
  | "other";

export const SALES_CHANNELS: SalesChannel[] = [
  "facebook",
  "tiktok_shop",
  "shopee",
  "lazada",
  "line",
  "walk_in",
  "other",
];

export function isValidSalesChannel(value: string): value is SalesChannel {
  return (SALES_CHANNELS as string[]).includes(value);
}

// ===== STEP 20 — CRUD layer =====
// Reuses the STEP 19 schema/constants above. Row mapping (snake_case DB → camelCase TS) follows
// the same toRow() convention as src/lib/costLedger.ts. productId/orderId are validated against
// products/orders when provided (same rigor as createOrder() in src/lib/orders.ts) rather than
// trusted blindly, since these are manually entered via a UI form and typos are plausible —
// unlike ai_cost_ledger's recordAiGeneration(), which trusts an already-validated route context.

import db from "./db";
import {
  deleteAllAttachmentsForTransaction,
  type TransactionAttachment,
} from "./transactionAttachments";
import { type OrderStatus } from "./orderStatus";

export type TransactionRow = {
  id: number;
  transactionType: TransactionType;
  amount: number;
  transactionDate: string;
  category: string;
  description: string | null;
  salesChannel: SalesChannel | null;
  productId: number | null;
  orderId: number | null;
  paymentMethod: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // STEP 34 — populated only when the row came from a query that joins `orders` (currently
  // listTransactions() and getTaxSummary() in taxSummary.ts, the two functions that feed the
  // Finance/Tax list views). getById()/createTransaction()/updateTransaction() never join, so these
  // are always null on rows returned from those — nothing currently reads this field from those
  // paths, so that's harmless, but worth knowing if a future caller needs it there too.
  linkedOrderStatus: OrderStatus | null;
  linkedOrderNumber: string | null;
};

type DbRow = {
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
  created_at: string;
  updated_at: string;
  linked_order_status?: string | null;
  linked_order_number?: string | null;
};

function toRow(row: DbRow): TransactionRow {
  return {
    id: row.id,
    transactionType: row.transaction_type as TransactionType,
    amount: row.amount,
    transactionDate: row.transaction_date,
    category: row.category,
    description: row.description,
    salesChannel: row.sales_channel as SalesChannel | null,
    productId: row.product_id,
    orderId: row.order_id,
    paymentMethod: row.payment_method,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    linkedOrderStatus: (row.linked_order_status ?? null) as OrderStatus | null,
    linkedOrderNumber: row.linked_order_number ?? null,
  };
}

function getById(id: number): TransactionRow | undefined {
  const row = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id) as
    | DbRow
    | undefined;

  return row ? toRow(row) : undefined;
}

// STEP 21 — exported so the attachments routes can verify a transaction exists before allowing an
// upload/list/delete of its evidence files, without duplicating the SELECT query.
export function getTransactionById(id: number): TransactionRow | undefined {
  return getById(id);
}

function assertProductExists(productId: number): void {
  const product = db.prepare("SELECT id FROM products WHERE id = ?").get(productId);

  if (!product) {
    throw new Error("PRODUCT_NOT_FOUND");
  }
}

function assertOrderExists(orderId: number): void {
  const order = db.prepare("SELECT id FROM orders WHERE id = ?").get(orderId);

  if (!order) {
    throw new Error("ORDER_NOT_FOUND");
  }
}

function isValidDateString(value: string): boolean {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));
}

export interface CreateTransactionInput {
  transactionType: string;
  amount: number;
  transactionDate: string;
  category: string;
  description?: string | null;
  salesChannel?: string | null;
  productId?: number | null;
  orderId?: number | null;
  paymentMethod?: string | null;
  notes?: string | null;
}

export function createTransaction(input: CreateTransactionInput): TransactionRow {
  if (!isValidTransactionType(input.transactionType)) {
    throw new Error("INVALID_TRANSACTION_TYPE");
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("INVALID_AMOUNT");
  }

  if (!isValidDateString(input.transactionDate)) {
    throw new Error("INVALID_TRANSACTION_DATE");
  }

  if (!isValidTransactionCategory(input.transactionType, input.category)) {
    throw new Error("INVALID_CATEGORY");
  }

  if (
    input.salesChannel !== undefined &&
    input.salesChannel !== null &&
    !isValidSalesChannel(input.salesChannel)
  ) {
    throw new Error("INVALID_SALES_CHANNEL");
  }

  const productId =
    input.productId === undefined || input.productId === null ? null : Number(input.productId);

  if (productId !== null) {
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new Error("INVALID_PRODUCT_ID");
    }

    assertProductExists(productId);
  }

  const orderId =
    input.orderId === undefined || input.orderId === null ? null : Number(input.orderId);

  if (orderId !== null) {
    if (!Number.isInteger(orderId) || orderId <= 0) {
      throw new Error("INVALID_ORDER_ID");
    }

    assertOrderExists(orderId);
  }

  // STEP 34 — duplicate-income-per-order guard: reject a second income transaction against an
  // order that already has one. The check + insert are wrapped in one db.transaction() so they're
  // atomic even under concurrent requests — better-sqlite3 automatically uses a SAVEPOINT instead
  // of BEGIN/COMMIT when a transaction() function is invoked from inside another already-open one
  // (documented nested-transaction support), which is exactly what happens when this runs from
  // inside createOrder()'s db.transaction() (src/lib/orders.ts, STEP 31) — so this check is a
  // correct, safe no-op on that automatic happy path: a brand-new order can never already have an
  // income transaction, since nothing else in the codebase creates one except this same function.
  // Only income transactions with a set orderId are checked — an order can still have any number of
  // *expense* transactions linked to it (e.g. a return-shipping cost), which this does not restrict.
  const insert = db.transaction(() => {
    if (input.transactionType === "income" && orderId !== null) {
      const existingIncome = db
        .prepare(
          "SELECT id FROM transactions WHERE order_id = ? AND transaction_type = 'income' LIMIT 1"
        )
        .get(orderId);

      if (existingIncome) {
        throw new Error("DUPLICATE_ORDER_INCOME");
      }
    }

    return db
      .prepare(
        `
        INSERT INTO transactions (
          transaction_type, amount, transaction_date, category, description,
          sales_channel, product_id, order_id, payment_method, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        input.transactionType,
        input.amount,
        input.transactionDate,
        input.category,
        input.description?.trim() || null,
        input.salesChannel || null,
        productId,
        orderId,
        input.paymentMethod?.trim() || null,
        input.notes?.trim() || null
      );
  });

  const result = insert();

  const row = getById(Number(result.lastInsertRowid));

  if (!row) {
    throw new Error("TRANSACTION_CREATE_FAILED");
  }

  return row;
}

export interface ListTransactionsFilters {
  transactionType?: string;
  category?: string;
  salesChannel?: string;
  productId?: number;
  orderId?: number;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export function listTransactions(filters: ListTransactionsFilters = {}): TransactionRow[] {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters.transactionType) {
    conditions.push("t.transaction_type = ?");
    params.push(filters.transactionType);
  }

  if (filters.category) {
    conditions.push("t.category = ?");
    params.push(filters.category);
  }

  if (filters.salesChannel) {
    conditions.push("t.sales_channel = ?");
    params.push(filters.salesChannel);
  }

  if (filters.productId !== undefined) {
    conditions.push("t.product_id = ?");
    params.push(filters.productId);
  }

  if (filters.orderId !== undefined) {
    conditions.push("t.order_id = ?");
    params.push(filters.orderId);
  }

  if (filters.dateFrom) {
    conditions.push("t.transaction_date >= ?");
    params.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    conditions.push("t.transaction_date <= ?");
    params.push(filters.dateTo);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 100;

  // STEP 34 — LEFT JOIN orders so Finance can show the linked order's current status (e.g. flag a
  // cancelled order's income clearly) without a schema change or a second round-trip per row.
  // Display-only: nothing here changes which rows are returned or their amount/type/category, so
  // Finance/Tax totals are unaffected by this join, exactly as required.
  const rows = db
    .prepare(
      `
      SELECT t.*, o.status AS linked_order_status, o.order_number AS linked_order_number
      FROM transactions t
      LEFT JOIN orders o ON o.id = t.order_id
      ${whereClause}
      ORDER BY t.transaction_date DESC, t.id DESC
      LIMIT ?
      `
    )
    .all(...params, limit) as DbRow[];

  return rows.map(toRow);
}

export interface UpdateTransactionInput {
  transactionType?: string;
  amount?: number;
  transactionDate?: string;
  category?: string;
  description?: string | null;
  salesChannel?: string | null;
  productId?: number | null;
  orderId?: number | null;
  paymentMethod?: string | null;
  notes?: string | null;
}

export function updateTransaction(id: number, input: UpdateTransactionInput): TransactionRow {
  const existing = getById(id);

  if (!existing) {
    throw new Error("TRANSACTION_NOT_FOUND");
  }

  const nextType = input.transactionType ?? existing.transactionType;

  if (!isValidTransactionType(nextType)) {
    throw new Error("INVALID_TRANSACTION_TYPE");
  }

  const nextAmount = input.amount ?? existing.amount;

  if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
    throw new Error("INVALID_AMOUNT");
  }

  const nextDate = input.transactionDate ?? existing.transactionDate;

  if (!isValidDateString(nextDate)) {
    throw new Error("INVALID_TRANSACTION_DATE");
  }

  const nextCategory = input.category ?? existing.category;

  if (!isValidTransactionCategory(nextType, nextCategory)) {
    throw new Error("INVALID_CATEGORY");
  }

  const nextSalesChannel =
    input.salesChannel === undefined ? existing.salesChannel : input.salesChannel;

  if (nextSalesChannel !== null && nextSalesChannel !== undefined && !isValidSalesChannel(nextSalesChannel)) {
    throw new Error("INVALID_SALES_CHANNEL");
  }

  const nextProductId =
    input.productId === undefined ? existing.productId : input.productId;

  if (nextProductId !== null) {
    if (!Number.isInteger(nextProductId) || nextProductId <= 0) {
      throw new Error("INVALID_PRODUCT_ID");
    }

    assertProductExists(nextProductId);
  }

  const nextOrderId = input.orderId === undefined ? existing.orderId : input.orderId;

  if (nextOrderId !== null) {
    if (!Number.isInteger(nextOrderId) || nextOrderId <= 0) {
      throw new Error("INVALID_ORDER_ID");
    }

    assertOrderExists(nextOrderId);
  }

  const nextDescription =
    input.description === undefined ? existing.description : input.description?.trim() || null;

  const nextPaymentMethod =
    input.paymentMethod === undefined
      ? existing.paymentMethod
      : input.paymentMethod?.trim() || null;

  const nextNotes = input.notes === undefined ? existing.notes : input.notes?.trim() || null;

  db.prepare(
    `
    UPDATE transactions
    SET
      transaction_type = ?,
      amount = ?,
      transaction_date = ?,
      category = ?,
      description = ?,
      sales_channel = ?,
      product_id = ?,
      order_id = ?,
      payment_method = ?,
      notes = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `
  ).run(
    nextType,
    nextAmount,
    nextDate,
    nextCategory,
    nextDescription,
    nextSalesChannel || null,
    nextProductId,
    nextOrderId,
    nextPaymentMethod,
    nextNotes,
    id
  );

  const row = getById(id);

  if (!row) {
    throw new Error("TRANSACTION_UPDATE_FAILED");
  }

  return row;
}

// STEP 21 — คืน attachment rows ที่ถูกลบไปด้วย (ถ้ามี) ให้ caller (route) เอา fileUrl แต่ละไฟล์ไปลบ
// ไฟล์จริงบนดิสก์ต่อแบบ best-effort เหมือน pattern เดิมของ deleteProductMedia — กัน orphaned rows/
// files เมื่อลบ transaction ที่มีไฟล์แนบอยู่
//
// STEP 34 — deleting a transaction that's linked to an order (orderId set — whether auto-created by
// STEP 31 or manually linked via the Finance form) now requires the caller to pass
// confirmOrderLinked: true, or this throws ORDER_LINKED_CONFIRMATION_REQUIRED instead of deleting
// anything. This is enforced HERE, at the one function every deletion path goes through — not only
// in the UI — so a direct API call can never delete an order-linked transaction by accident; the
// UI's confirm() dialog is additional UX protection on top of this, not a replacement for it.
// Unlinked transactions (orderId null) are completely unaffected — deleted exactly as before.
export function deleteTransaction(
  id: number,
  options?: { confirmOrderLinked?: boolean }
): TransactionAttachment[] {
  const existing = getById(id);

  if (!existing) {
    throw new Error("TRANSACTION_NOT_FOUND");
  }

  if (existing.orderId !== null && options?.confirmOrderLinked !== true) {
    throw new Error("ORDER_LINKED_CONFIRMATION_REQUIRED");
  }

  const deletedAttachments = deleteAllAttachmentsForTransaction(id);

  db.prepare("DELETE FROM transactions WHERE id = ?").run(id);

  return deletedAttachments;
}
