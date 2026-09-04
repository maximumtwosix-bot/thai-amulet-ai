import { NextRequest, NextResponse } from "next/server";
import {
  deleteBankAccount,
  getBankAccountById,
  updateBankAccount,
  type BankAccountRow,
} from "@/lib/bankAccounts";

// STEP B.6 — same masking shape/logic as src/app/api/bank-accounts/route.ts's toListItem()/
// maskAccountNumber(), duplicated here rather than extracted to a shared module: this STEP's
// approved scope is these two route files plus the library and backup script, not a new shared-file
// refactor. See that file's identical function for the "1234567890 → ••••7890" / edge-case reasoning
// (short values reveal in full via slice(-4), which is safe since there's nothing left to hide).
function maskAccountNumber(accountNumber: string): string {
  if (!accountNumber) return "••••";

  return `••••${accountNumber.slice(-4)}`;
}

type BankAccountListItem = Omit<BankAccountRow, "accountNumber"> & {
  accountNumberMasked: string;
};

function toListItem(row: BankAccountRow): BankAccountListItem {
  return {
    id: row.id,
    bankName: row.bankName,
    accountName: row.accountName,
    accountNumberMasked: maskAccountNumber(row.accountNumber),
    accountType: row.accountType,
    currency: row.currency,
    classification: row.classification,
    purpose: row.purpose,
    isActive: row.isActive,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(idParam: string): number | null {
  const id = Number(idParam);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

function errorToResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";

  if (message === "BANK_ACCOUNT_NOT_FOUND") {
    return NextResponse.json(
      { success: false, error: "Bank account not found" },
      { status: 404 }
    );
  }

  const badRequestMessages: Record<string, string> = {
    INVALID_BANK_NAME: "กรุณาระบุชื่อธนาคาร",
    INVALID_ACCOUNT_NAME: "กรุณาระบุชื่อบัญชี",
    INVALID_ACCOUNT_NUMBER: "กรุณาระบุเลขที่บัญชี",
    INVALID_CLASSIFICATION: "classification ต้องเป็น BUSINESS, PERSONAL หรือ MIXED",
    INVALID_ACCOUNT_TYPE: "accountType ต้องเป็น SAVINGS, CURRENT หรือ OTHER",
    // STEP B.6 — src/lib/bankAccounts.ts's assertAccountNumberLength() (resource-abuse guard, not a
    // format rule — see that function's comment).
    ACCOUNT_NUMBER_TOO_LONG: "เลขที่บัญชียาวเกินไป (ไม่เกิน 64 ตัวอักษร)",
  };

  if (message in badRequestMessages) {
    return NextResponse.json(
      { success: false, error: badRequestMessages[message] },
      { status: 400 }
    );
  }

  // STEP B.3 — same DB-unique-constraint-is-final-authority reasoning as POST /api/bank-accounts;
  // updateBankAccount() (STEP B.2) catches SQLITE_CONSTRAINT_UNIQUE on the UPDATE statement too, so
  // changing accountNumber (or bankName) into a combination that collides with another existing row
  // is rejected here exactly like a duplicate create.
  if (message === "DUPLICATE_BANK_ACCOUNT") {
    return NextResponse.json(
      { success: false, error: "มีบัญชีธนาคารนี้อยู่ในระบบแล้ว (ธนาคาร + เลขที่บัญชีซ้ำ)" },
      { status: 409 }
    );
  }

  // STEP C.2 — deleteBankAccount() (src/lib/bankAccounts.ts) now blocks deletion once a
  // bank_statements row references this account (app-layer pre-check, backed by a DB-level FK
  // constraint as a defense-in-depth backstop — both paths throw this same code).
  if (message === "BANK_ACCOUNT_HAS_STATEMENTS") {
    return NextResponse.json(
      {
        success: false,
        error: "ไม่สามารถลบบัญชีนี้ได้ เนื่องจากมีการนำเข้า Bank Statement ของบัญชีนี้แล้ว",
      },
      { status: 409 }
    );
  }

  console.error("Bank account detail API error:", error);

  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}

// STEP B.3 — single bank account detail. Full accountNumber IS included here by design (unlike the
// list endpoint) — this is an authenticated, internal, single-admin endpoint (gated by proxy.ts's
// session cookie, same as every other Finance API), and STEP B's audit explicitly allows the detail
// endpoint to return the real number since a future edit form (STEP B.5) needs to show/correct it.
// The id in the URL is an internal auto-increment integer, never the account number itself.
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json(
        { success: false, error: "Invalid bank account ID" },
        { status: 400 }
      );
    }

    const bankAccount = getBankAccountById(id);

    if (!bankAccount) {
      return NextResponse.json(
        { success: false, error: "Bank account not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: bankAccount });
  } catch (error) {
    return errorToResponse(error);
  }
}

// STEP B.3 — edit one field or several (manual correction), including isActive — this IS the
// activate/deactivate mechanism (no separate endpoint), matching the CRUD design the STEP B audit
// laid out. Only fields explicitly present in the request body are forwarded; everything else on the
// existing row is left untouched by updateBankAccount()'s own "input.field === undefined ? existing
// : ..." handling (STEP B.2).
//
// STEP B.6 — response is masked (toListItem()) for the same reason as POST above: a pure isActive
// toggle (bank/page.tsx's toggleActive()) was getting the full accountNumber back despite never
// touching or reading it — unnecessary exposure with no UX benefit. GET single (below) is
// intentionally left returning the full number — that is the one endpoint the edit form's
// startEdit() genuinely needs it from, per the existing, audited contract.
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json(
        { success: false, error: "Invalid bank account ID" },
        { status: 400 }
      );
    }

    let body: any;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body (must be JSON)" },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const patch: Record<string, unknown> = {};

    if (body.bankName !== undefined) patch.bankName = String(body.bankName);
    if (body.accountName !== undefined) patch.accountName = String(body.accountName);
    if (body.accountNumber !== undefined) patch.accountNumber = String(body.accountNumber);
    if (body.accountType !== undefined) {
      patch.accountType = body.accountType === null ? null : String(body.accountType);
    }
    if (body.currency !== undefined) patch.currency = String(body.currency);
    if (body.classification !== undefined) {
      patch.classification =
        typeof body.classification === "string" ? body.classification : "";
    }
    if (body.purpose !== undefined) patch.purpose = body.purpose;
    if (body.note !== undefined) patch.note = body.note;
    if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);

    const bankAccount = updateBankAccount(id, patch);

    return NextResponse.json({ success: true, data: toListItem(bankAccount) });
  } catch (error) {
    return errorToResponse(error);
  }
}

// STEP B.3 — hard delete, no linked-data guard (none exists yet — see src/lib/bankAccounts.ts
// deleteBankAccount()'s STEP B.2 comment: no table currently references bank_accounts.id at all).
// Does not touch/cascade to transactions/orders/customers — nothing in this codebase references a
// bank_accounts row, so there is nothing to cascade.
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json(
        { success: false, error: "Invalid bank account ID" },
        { status: 400 }
      );
    }

    deleteBankAccount(id);

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    return errorToResponse(error);
  }
}
