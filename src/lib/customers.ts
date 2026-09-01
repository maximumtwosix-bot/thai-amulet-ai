import db from "./db";

// STEP 36 — Customer management. Reuses the customers table as-is (id, name, phone, address,
// district, province, postal_code, created_at — schema already existed before this STEP, confirmed
// via audit; no notes/updated_at column exists, so none is invented here). Same toRow()/CRUD-layer
// convention as src/lib/transactions.ts and src/lib/orders.ts.

export type CustomerRow = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  district: string | null;
  province: string | null;
  postalCode: string | null;
  createdAt: string;
};

type DbRow = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  district: string | null;
  province: string | null;
  postal_code: string | null;
  created_at: string;
};

function toRow(row: DbRow): CustomerRow {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    district: row.district,
    province: row.province,
    postalCode: row.postal_code,
    createdAt: row.created_at,
  };
}

function getById(id: number): CustomerRow | undefined {
  const row = db.prepare("SELECT * FROM customers WHERE id = ?").get(id) as DbRow | undefined;

  return row ? toRow(row) : undefined;
}

export function getCustomerById(id: number): CustomerRow | undefined {
  return getById(id);
}

// STEP 36 — exported so createOrder() (src/lib/orders.ts) can verify a customerId actually
// references a real row before writing it into orders.customer_id, the same rigor
// assertProductExists()/assertOrderExists() already apply to productId/orderId. customerId has
// existed as a CreateOrderInput field since before this STEP but was never validated, because
// nothing ever supplied it (src/app/orders/new/page.tsx never sent one) until now.
export function assertCustomerExists(customerId: number): void {
  if (!getById(customerId)) {
    throw new Error("CUSTOMER_NOT_FOUND");
  }
}

export interface CreateCustomerInput {
  name: string;
  phone?: string | null;
  address?: string | null;
  district?: string | null;
  province?: string | null;
  postalCode?: string | null;
}

export function createCustomer(input: CreateCustomerInput): CustomerRow {
  const name = typeof input.name === "string" ? input.name.trim() : "";

  if (!name) {
    throw new Error("INVALID_CUSTOMER_NAME");
  }

  const result = db
    .prepare(
      `
      INSERT INTO customers (name, phone, address, district, province, postal_code)
      VALUES (?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      name,
      input.phone?.trim() || null,
      input.address?.trim() || null,
      input.district?.trim() || null,
      input.province?.trim() || null,
      input.postalCode?.trim() || null
    );

  const row = getById(Number(result.lastInsertRowid));

  if (!row) {
    throw new Error("CUSTOMER_CREATE_FAILED");
  }

  return row;
}

export interface ListCustomersFilters {
  search?: string;
  limit?: number;
}

// STEP 36 — search matches name OR phone (substring, case-insensitive via SQLite's default LIKE
// collation for ASCII; Thai names are matched by exact substring since SQLite LIKE doesn't
// case-fold non-ASCII, which is fine here since Thai script has no case). Intentionally simple —
// no fuzzy matching — matching this codebase's existing search conventions elsewhere.
export function listCustomers(filters: ListCustomersFilters = {}): CustomerRow[] {
  const conditions: string[] = [];
  const params: Array<string> = [];

  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push("(name LIKE ? OR phone LIKE ?)");
    params.push(term, term);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 100;

  const rows = db
    .prepare(
      `
      SELECT * FROM customers
      ${whereClause}
      ORDER BY name ASC
      LIMIT ?
      `
    )
    .all(...params, limit) as DbRow[];

  return rows.map(toRow);
}

export interface UpdateCustomerInput {
  name?: string;
  phone?: string | null;
  address?: string | null;
  district?: string | null;
  province?: string | null;
  postalCode?: string | null;
}

export function updateCustomer(id: number, input: UpdateCustomerInput): CustomerRow {
  const existing = getById(id);

  if (!existing) {
    throw new Error("CUSTOMER_NOT_FOUND");
  }

  const nextName = input.name !== undefined ? input.name.trim() : existing.name;

  if (!nextName) {
    throw new Error("INVALID_CUSTOMER_NAME");
  }

  const nextPhone = input.phone === undefined ? existing.phone : input.phone?.trim() || null;
  const nextAddress = input.address === undefined ? existing.address : input.address?.trim() || null;
  const nextDistrict =
    input.district === undefined ? existing.district : input.district?.trim() || null;
  const nextProvince =
    input.province === undefined ? existing.province : input.province?.trim() || null;
  const nextPostalCode =
    input.postalCode === undefined ? existing.postalCode : input.postalCode?.trim() || null;

  db.prepare(
    `
    UPDATE customers
    SET name = ?, phone = ?, address = ?, district = ?, province = ?, postal_code = ?
    WHERE id = ?
    `
  ).run(nextName, nextPhone, nextAddress, nextDistrict, nextProvince, nextPostalCode, id);

  const row = getById(id);

  if (!row) {
    throw new Error("CUSTOMER_UPDATE_FAILED");
  }

  return row;
}
