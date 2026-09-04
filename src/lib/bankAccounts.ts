// Bank Account — STEP B.2 — CRUD + validation layer for the `bank_accounts` table added in STEP
// B.1 (src/lib/db.ts). Standalone entity: no relation to transactions/orders/customers yet (per the
// STEP B audit and STEP B.1's schema comments, wiring transactions.bank_account_id is explicitly
// deferred until STEP C/D's BankStatement/Reconciliation shape is known). This file does NOT touch
// transactions.payment_method or any other existing table — reuses the same toRow()/DbRow/CRUD
// convention as src/lib/customers.ts and src/lib/transactions.ts.
//
// No API route, no UI, no masking here — masking of accountNumber is display-only and belongs to a
// future API layer (STEP B.3+), exactly as documented on the bank_accounts table itself. Every
// function here returns the real, unmasked row.

import db from "./db";

export type BankAccountClassification = "BUSINESS" | "PERSONAL" | "MIXED";

export const BANK_ACCOUNT_CLASSIFICATIONS: BankAccountClassification[] = [
  "BUSINESS",
  "PERSONAL",
  "MIXED",
];

export function isValidBankAccountClassification(
  value: string
): value is BankAccountClassification {
  return (BANK_ACCOUNT_CLASSIFICATIONS as string[]).includes(value);
}

export type BankAccountType = "SAVINGS" | "CURRENT" | "OTHER";

export const BANK_ACCOUNT_TYPES: BankAccountType[] = ["SAVINGS", "CURRENT", "OTHER"];

export function isValidBankAccountType(value: string): value is BankAccountType {
  return (BANK_ACCOUNT_TYPES as string[]).includes(value);
}

export type BankAccountRow = {
  id: number;
  bankName: string;
  accountName: string;
  accountNumber: string;
  accountType: BankAccountType | null;
  currency: string;
  classification: BankAccountClassification;
  purpose: string | null;
  isActive: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: number;
  bank_name: string;
  account_name: string;
  account_number: string;
  account_type: string | null;
  currency: string;
  classification: string;
  purpose: string | null;
  is_active: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

function toRow(row: DbRow): BankAccountRow {
  return {
    id: row.id,
    bankName: row.bank_name,
    accountName: row.account_name,
    accountNumber: row.account_number,
    accountType: row.account_type as BankAccountType | null,
    currency: row.currency,
    classification: row.classification as BankAccountClassification,
    purpose: row.purpose,
    isActive: row.is_active === 1,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getById(id: number): BankAccountRow | undefined {
  const row = db.prepare("SELECT * FROM bank_accounts WHERE id = ?").get(id) as
    | DbRow
    | undefined;

  return row ? toRow(row) : undefined;
}

export function getBankAccountById(id: number): BankAccountRow | undefined {
  return getById(id);
}

// รวมการตรวจ SQLITE_CONSTRAINT_UNIQUE จาก idx_bank_accounts_bank_account_number (STEP B.1) ไว้ที่
// เดียว — พึ่งพา DB-level unique constraint จริง (เช่นเดียวกับ orders.order_number UNIQUE) แทนการ
// SELECT เช็คซ้ำก่อน INSERT ซึ่งจะมี race condition ได้ ตรงกับ pattern ที่มีอยู่แล้วใน
// src/app/api/products/route.ts ที่จับ error.code === "SQLITE_CONSTRAINT_FOREIGNKEY"
function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

function normalizeRequiredText(value: unknown, errorCode: string): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw new Error(errorCode);
  }

  return text;
}

function normalizeOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// STEP B.6 — resource-abuse guard only, NOT a business format rule: no digit-only requirement, no
// dash/space policy, no per-bank length is imposed here (per this STEP's explicit scope — the STEP
// B.6 audit found "no length cap anywhere" as a distinct gap from "no format validation", and only
// the length guard was approved). 64 characters is comfortably generous for every real-world account-
// number shape this app might see (Thai bank accounts: ~10-15 digits, sometimes dash-formatted;
// IBAN: max 34 characters) while still rejecting pathological (multi-KB+) input. Runs on the
// already-trimmed value (after normalizeRequiredText), so it measures the real stored length, not
// incidental whitespace. Never logs the value itself — only its length is inspected.
const MAX_ACCOUNT_NUMBER_LENGTH = 64;

function assertAccountNumberLength(accountNumber: string): void {
  if (accountNumber.length > MAX_ACCOUNT_NUMBER_LENGTH) {
    throw new Error("ACCOUNT_NUMBER_TOO_LONG");
  }
}

export interface CreateBankAccountInput {
  bankName: string;
  accountName: string;
  accountNumber: string;
  accountType?: string | null;
  currency?: string | null;
  classification: string;
  purpose?: string | null;
  note?: string | null;
}

// STEP B.2 — สร้างบัญชีใหม่ เริ่มต้น isActive เสมอ (การ deactivate ทำผ่าน updateBankAccount()
// เท่านั้น ไม่มี flag ให้สร้างบัญชีแบบ inactive ตั้งแต่แรก เพราะไม่มี use case ใน roadmap ปัจจุบัน)
// classification ไม่มี default ใดๆ — ต้องระบุมาเสมอ ตรงตาม NOT NULL ไม่มี DEFAULT ที่ STEP B.1
// กำหนดไว้ใน schema เพื่อห้าม auto-assume BUSINESS/PERSONAL
export function createBankAccount(input: CreateBankAccountInput): BankAccountRow {
  const bankName = normalizeRequiredText(input.bankName, "INVALID_BANK_NAME");
  const accountName = normalizeRequiredText(input.accountName, "INVALID_ACCOUNT_NAME");
  const accountNumber = normalizeRequiredText(input.accountNumber, "INVALID_ACCOUNT_NUMBER");
  assertAccountNumberLength(accountNumber);

  const classification = typeof input.classification === "string" ? input.classification : "";

  if (!isValidBankAccountClassification(classification)) {
    throw new Error("INVALID_CLASSIFICATION");
  }

  const accountType = normalizeOptionalText(input.accountType);

  if (accountType !== null && !isValidBankAccountType(accountType)) {
    throw new Error("INVALID_ACCOUNT_TYPE");
  }

  const currency = normalizeOptionalText(input.currency) || "THB";
  const purpose = normalizeOptionalText(input.purpose);
  const note = normalizeOptionalText(input.note);

  let result;

  try {
    result = db
      .prepare(
        `
        INSERT INTO bank_accounts (
          bank_name, account_name, account_number, account_type, currency,
          classification, purpose, note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        bankName,
        accountName,
        accountNumber,
        accountType,
        currency,
        classification,
        purpose,
        note
      );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Error("DUPLICATE_BANK_ACCOUNT");
    }

    throw error;
  }

  const row = getById(Number(result.lastInsertRowid));

  if (!row) {
    throw new Error("BANK_ACCOUNT_CREATE_FAILED");
  }

  return row;
}

export interface ListBankAccountsFilters {
  classification?: string;
  isActive?: boolean;
  search?: string;
  limit?: number;
}

// STEP B.2 — list ทั้งหมดตาม filter ที่ระบุ ไม่ default กรอง isActive (ผู้เรียกเลือกเอง เหมือน
// listCustomers() ที่ไม่ default กรองอะไรถ้าไม่ได้ขอ) — เพราะยังไม่มี API/UI ที่ตัดสินใจ default
// view แทน ณ STEP นี้ search จับคู่ bankName/accountName เท่านั้น ไม่ค้นด้วย accountNumber
// โดยเจตนา (เลี่ยงการต้องส่งเลขบัญชีเต็มผ่าน query string โดยไม่จำเป็น)
export function listBankAccounts(filters: ListBankAccountsFilters = {}): BankAccountRow[] {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters.classification) {
    conditions.push("classification = ?");
    params.push(filters.classification);
  }

  if (filters.isActive !== undefined) {
    conditions.push("is_active = ?");
    params.push(filters.isActive ? 1 : 0);
  }

  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push("(bank_name LIKE ? OR account_name LIKE ?)");
    params.push(term, term);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 100;

  const rows = db
    .prepare(
      `
      SELECT * FROM bank_accounts
      ${whereClause}
      ORDER BY bank_name ASC, account_name ASC
      LIMIT ?
      `
    )
    .all(...params, limit) as DbRow[];

  return rows.map(toRow);
}

export interface UpdateBankAccountInput {
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  accountType?: string | null;
  currency?: string;
  classification?: string;
  purpose?: string | null;
  note?: string | null;
  isActive?: boolean;
}

// STEP B.2 — แก้ไข/activate-deactivate ผ่านฟังก์ชันเดียว (isActive เป็นแค่ field หนึ่งที่แก้ได้)
// ตรงตาม CRUD design ที่ audit STEP B วางไว้ (ไม่มี endpoint/ฟังก์ชันแยกสำหรับ deactivate)
export function updateBankAccount(id: number, input: UpdateBankAccountInput): BankAccountRow {
  const existing = getById(id);

  if (!existing) {
    throw new Error("BANK_ACCOUNT_NOT_FOUND");
  }

  const nextBankName =
    input.bankName === undefined
      ? existing.bankName
      : normalizeRequiredText(input.bankName, "INVALID_BANK_NAME");

  const nextAccountName =
    input.accountName === undefined
      ? existing.accountName
      : normalizeRequiredText(input.accountName, "INVALID_ACCOUNT_NAME");

  const nextAccountNumber =
    input.accountNumber === undefined
      ? existing.accountNumber
      : normalizeRequiredText(input.accountNumber, "INVALID_ACCOUNT_NUMBER");
  assertAccountNumberLength(nextAccountNumber);

  const nextClassification =
    input.classification === undefined ? existing.classification : input.classification;

  if (!isValidBankAccountClassification(nextClassification)) {
    throw new Error("INVALID_CLASSIFICATION");
  }

  const nextAccountType =
    input.accountType === undefined ? existing.accountType : normalizeOptionalText(input.accountType);

  if (nextAccountType !== null && !isValidBankAccountType(nextAccountType)) {
    throw new Error("INVALID_ACCOUNT_TYPE");
  }

  const nextCurrency =
    input.currency === undefined ? existing.currency : normalizeOptionalText(input.currency) || "THB";

  const nextPurpose = input.purpose === undefined ? existing.purpose : normalizeOptionalText(input.purpose);
  const nextNote = input.note === undefined ? existing.note : normalizeOptionalText(input.note);
  const nextIsActive = input.isActive === undefined ? existing.isActive : input.isActive;

  try {
    db.prepare(
      `
      UPDATE bank_accounts
      SET
        bank_name = ?,
        account_name = ?,
        account_number = ?,
        account_type = ?,
        currency = ?,
        classification = ?,
        purpose = ?,
        note = ?,
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `
    ).run(
      nextBankName,
      nextAccountName,
      nextAccountNumber,
      nextAccountType,
      nextCurrency,
      nextClassification,
      nextPurpose,
      nextNote,
      nextIsActive ? 1 : 0,
      id
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Error("DUPLICATE_BANK_ACCOUNT");
    }

    throw error;
  }

  const row = getById(id);

  if (!row) {
    throw new Error("BANK_ACCOUNT_UPDATE_FAILED");
  }

  return row;
}

// STEP C.2 — the relation the STEP B.2 comment above anticipated now exists: bank_statements.
// bank_account_id (src/lib/db.ts). App-layer pre-check first, for a clean, specific error — same
// cross-table-existence-check convention as assertProductExists()/assertOrderExists() in
// src/lib/transactions.ts (a direct SELECT, not an import of bankStatements.ts). The DB-level FK
// (also added in STEP C.2, no ON DELETE clause, same convention as every other FK in this schema) is
// the backstop that can never be bypassed by a future code path that forgets to call this function —
// caught below and translated to the same error code so either layer produces an identical result.
function hasLinkedBankStatements(bankAccountId: number): boolean {
  const row = db
    .prepare("SELECT id FROM bank_statements WHERE bank_account_id = ? LIMIT 1")
    .get(bankAccountId);

  return !!row;
}

function isForeignKeyConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as { code?: string }).code === "SQLITE_CONSTRAINT_FOREIGNKEY"
  );
}

// STEP B.2 — hard delete. STEP C.2 adds the guard the STEP B.2 comment below anticipated: once a
// bank_statements row references this account, delete is blocked (BANK_ACCOUNT_HAS_STATEMENTS)
// rather than proceeding. Accounts with no statements are completely unaffected — deleted exactly as
// before.
//
// [original STEP B.2 note, still accurate for the "no statements yet" path:] hard delete แบบไม่มี
// เงื่อนไข ณ ตอนนั้น เพราะยังไม่มีตารางใดอ้างอิง bank_accounts.id เลย
export function deleteBankAccount(id: number): void {
  const existing = getById(id);

  if (!existing) {
    throw new Error("BANK_ACCOUNT_NOT_FOUND");
  }

  if (hasLinkedBankStatements(id)) {
    throw new Error("BANK_ACCOUNT_HAS_STATEMENTS");
  }

  try {
    db.prepare("DELETE FROM bank_accounts WHERE id = ?").run(id);
  } catch (error) {
    if (isForeignKeyConstraintError(error)) {
      throw new Error("BANK_ACCOUNT_HAS_STATEMENTS");
    }

    throw error;
  }
}
