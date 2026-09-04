import { NextRequest, NextResponse } from "next/server";
import { createBankAccount, listBankAccounts, type BankAccountRow } from "@/lib/bankAccounts";

// STEP B.3 — API layer for Bank Account. Auth is NOT re-checked here (same convention as every
// other admin API in this codebase — see src/proxy.ts's STEP 70 comment: "the route itself does not
// re-check auth"); this route is only reachable once STEP B.3 adds "/api/bank-accounts" to
// proxy.ts's isProtectedApi()/matcher, which is done alongside this file (see proxy.ts diff).

function errorToResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";

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

  // STEP B.3 — idx_bank_accounts_bank_account_number (STEP B.1) is the final authority on
  // duplicates; src/lib/bankAccounts.ts createBankAccount() relies on the DB unique constraint
  // itself (catches SQLITE_CONSTRAINT_UNIQUE) rather than a SELECT-first check, so this is race-free.
  if (message === "DUPLICATE_BANK_ACCOUNT") {
    return NextResponse.json(
      { success: false, error: "มีบัญชีธนาคารนี้อยู่ในระบบแล้ว (ธนาคาร + เลขที่บัญชีซ้ำ)" },
      { status: 409 }
    );
  }

  // STEP B.3 — never include the raw error/body (which may contain accountNumber) beyond the error
  // object itself; error.message here is always one of this codebase's fixed internal code strings
  // (see the throw sites in src/lib/bankAccounts.ts), never an interpolated field value.
  console.error("Bank accounts API error:", error);

  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}

// STEP B.3 — never show more than the last 4 digits. Constant-length "••••" prefix regardless of
// the real number's length (matches the required "1234567890 → ••••7890" shape exactly — NOT one
// bullet per hidden digit, which would itself leak the real length). slice(-4) on a string shorter
// than 4 chars safely returns the whole string (no throw) — masking then reveals it in full, but
// that is not a regression: a <=4-char value has nothing left to hide behind a 4-char mask anyway.
function maskAccountNumber(accountNumber: string): string {
  if (!accountNumber) return "••••";

  return `••••${accountNumber.slice(-4)}`;
}

type BankAccountListItem = Omit<BankAccountRow, "accountNumber"> & {
  accountNumberMasked: string;
};

// STEP B.3 — response DTO built explicitly field-by-field (never spreads the raw DB row) so
// accountNumber can never leak into the list endpoint by accident, now or after a future field is
// added to BankAccountRow.
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

// STEP B.3 — list/search/filter. accountNumber is NEVER present in this response — see
// toListItem()/maskAccountNumber() above. Filter values are passed through unvalidated to
// listBankAccounts() exactly like GET /api/transactions does for transactionType/category — an
// unrecognized classification simply matches zero rows, it is not a 400 (same convention).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const limitParam = searchParams.get("limit");
    let limit: number | undefined;

    if (limitParam !== null && limitParam !== "") {
      const parsedLimit = Number(limitParam);

      if (!Number.isInteger(parsedLimit) || parsedLimit <= 0 || parsedLimit > 500) {
        return NextResponse.json(
          { success: false, error: "Invalid limit. Must be an integer between 1 and 500" },
          { status: 400 }
        );
      }

      limit = parsedLimit;
    }

    const isActiveParam = searchParams.get("isActive");
    let isActive: boolean | undefined;

    if (isActiveParam !== null && isActiveParam !== "") {
      if (isActiveParam !== "true" && isActiveParam !== "false") {
        return NextResponse.json(
          { success: false, error: "Invalid isActive. Must be 'true' or 'false'" },
          { status: 400 }
        );
      }

      isActive = isActiveParam === "true";
    }

    const rows = listBankAccounts({
      classification: searchParams.get("classification") || undefined,
      isActive,
      search: searchParams.get("search") || undefined,
      limit,
    });

    return NextResponse.json({
      success: true,
      data: rows.map(toListItem),
      count: rows.length,
    });
  } catch (error) {
    return errorToResponse(error);
  }
}

// STEP B.3 — create one bank account. Only known fields are ever read off the request body and
// forwarded to createBankAccount() — any other field the client sends (id, createdAt, updatedAt,
// isActive, ...) is silently ignored, never reaches the library, and can never influence the created
// row. createBankAccount() (STEP B.2) always starts a new account as isActive=true by design — there
// is intentionally no client-settable isActive on create; deactivating happens only via PATCH.
//
// STEP B.6 — response is masked via the same toListItem() the list endpoint uses: the STEP B.6 audit
// found the created row's full accountNumber was being echoed back for no reason the UI ever reads
// (bank/page.tsx's submitForm() only checks response.success, never response.data.accountNumber) —
// reusing this endpoint's own accountNumber right back at it added over-the-wire exposure with zero
// benefit. The client already has the value it just typed, so nothing is lost by masking the reply.
export async function POST(request: NextRequest) {
  try {
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

    const bankAccount = createBankAccount({
      bankName: String(body.bankName || ""),
      accountName: String(body.accountName || ""),
      accountNumber: String(body.accountNumber || ""),
      accountType:
        body.accountType === undefined || body.accountType === null
          ? null
          : String(body.accountType),
      currency:
        body.currency === undefined || body.currency === null ? null : String(body.currency),
      classification: typeof body.classification === "string" ? body.classification : "",
      purpose: body.purpose ?? null,
      note: body.note ?? null,
    });

    return NextResponse.json({ success: true, data: toListItem(bankAccount) }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
