import { NextRequest, NextResponse } from "next/server";
import { createTransaction, listTransactions } from "@/lib/transactions";
import { resolveTransactionOwner } from "@/lib/taxOwnership";
import { SESSION_COOKIE_NAME, resolveSessionTaxpayerId } from "@/lib/auth";

function errorToResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";

  const notFoundMessages: Record<string, string> = {
    PRODUCT_NOT_FOUND: "Product not found",
    ORDER_NOT_FOUND: "Order not found",
  };

  if (message in notFoundMessages) {
    return NextResponse.json(
      { success: false, error: notFoundMessages[message] },
      { status: 404 }
    );
  }

  const badRequestMessages: Record<string, string> = {
    INVALID_TRANSACTION_TYPE: "transactionType must be 'income' or 'expense'",
    INVALID_AMOUNT: "amount must be a positive number",
    INVALID_TRANSACTION_DATE: "transactionDate must be a valid date",
    INVALID_CATEGORY: "category is not valid for the given transactionType",
    INVALID_SALES_CHANNEL: "salesChannel is not a recognized value",
    INVALID_PRODUCT_ID: "productId must be a positive integer",
    INVALID_ORDER_ID: "orderId must be a positive integer",
  };

  if (message in badRequestMessages) {
    return NextResponse.json(
      { success: false, error: badRequestMessages[message] },
      { status: 400 }
    );
  }

  // STEP 34 — duplicate-income-per-order guard (src/lib/transactions.ts createTransaction())
  if (message === "DUPLICATE_ORDER_INCOME") {
    return NextResponse.json(
      {
        success: false,
        error: "ออเดอร์นี้มีรายการรายรับที่บันทึกไว้แล้ว ไม่สามารถสร้างรายรับซ้ำสำหรับออเดอร์เดียวกันได้",
      },
      { status: 409 }
    );
  }

  // STEP 139 — order-linked returned-parcel-expense narrow exception (src/lib/transactions.ts
  // createTransaction()). Both only ever thrown when transactionType === "expense" && category ===
  // "RETURNED_PARCEL" && orderId is set — see that function's guards. Distinct codes/messages from
  // STEP 135's SHIPPING mappings above, which are untouched.
  if (message === "DUPLICATE_ORDER_RETURNED_PARCEL_EXPENSE") {
    return NextResponse.json(
      {
        success: false,
        error: "ออเดอร์นี้มีรายการค่าพัสดุตีกลับที่บันทึกไว้แล้ว ไม่สามารถบันทึกซ้ำสำหรับออเดอร์เดียวกันได้",
      },
      { status: 409 }
    );
  }

  if (message === "ORDER_TERMINAL_STATUS_RETURNED_PARCEL") {
    return NextResponse.json(
      {
        success: false,
        error: "ออเดอร์นี้อยู่ในสถานะสิ้นสุดแล้ว ไม่สามารถบันทึกค่าพัสดุตีกลับได้",
      },
      { status: 409 }
    );
  }

  console.error("Transactions API error:", error);

  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}

// STEP 20 — read list, filterable. ไม่มีการแก้ไข/ลบข้อมูลใดๆ ในเมธอดนี้
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

    const productIdParam = searchParams.get("productId");
    let productId: number | undefined;

    if (productIdParam !== null && productIdParam !== "") {
      const parsed = Number(productIdParam);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        return NextResponse.json(
          { success: false, error: "Invalid productId" },
          { status: 400 }
        );
      }

      productId = parsed;
    }

    const orderIdParam = searchParams.get("orderId");
    let orderId: number | undefined;

    if (orderIdParam !== null && orderIdParam !== "") {
      const parsed = Number(orderIdParam);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        return NextResponse.json(
          { success: false, error: "Invalid orderId" },
          { status: 400 }
        );
      }

      orderId = parsed;
    }

    const rows = listTransactions({
      transactionType: searchParams.get("transactionType") || undefined,
      category: searchParams.get("category") || undefined,
      salesChannel: searchParams.get("salesChannel") || undefined,
      productId,
      orderId,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      limit,
    });

    // STEP 117 — reporting-only ownership check (STEP 112/114 design). Applied here, on the
    // existing GET (list) handler, rather than GET /api/transactions/[id] — no such single-item GET
    // handler exists anywhere in this codebase (src/app/api/transactions/[id]/route.ts only defines
    // PATCH/DELETE), confirmed by direct inspection; inventing a brand-new GET capability where none
    // existed would expand this endpoint's surface beyond "reporting-only". READ-ONLY:
    // resolveTransactionOwner() (src/lib/taxOwnership.ts) and resolveSessionTaxpayerId()
    // (src/lib/auth.ts, decodes the already-verified session cookie) are both pure reads — neither
    // mutates anything. Purely additive: `success`/`data`/`count` are completely unchanged; only a
    // new top-level `ownershipReport` array is added, parallel to `data` — individual transaction
    // objects in `data` are never touched. Never denies access, never changes any status code.
    const sessionTaxpayerId = resolveSessionTaxpayerId(request.cookies.get(SESSION_COOKIE_NAME)?.value);

    const ownershipReport = rows.map((row) => {
      const ownership = resolveTransactionOwner(row.id);

      let sessionTaxpayerMatch: "MATCH" | "MISMATCH" | "SESSION_TAXPAYER_UNAVAILABLE" | "OWNER_UNRESOLVED";

      if (sessionTaxpayerId === null) {
        // Never guessed, never defaulted to "the one active taxpayer" — an unbound session (STEP
        // 113: old-format token, or bootstrap was UNAVAILABLE/AMBIGUOUS at login) reports this
        // explicitly, regardless of the transaction's own resolution state.
        sessionTaxpayerMatch = "SESSION_TAXPAYER_UNAVAILABLE";
      } else if (ownership.status !== "RESOLVED") {
        // Zero tax_year_transaction_links rows for this transaction (or a CONFLICT) — no
        // meaningful MATCH/MISMATCH comparison is possible. Never inferred from customer, order,
        // order item, product, bank account, amount, date, payment method, channel, or "the
        // active taxpayer".
        sessionTaxpayerMatch = "OWNER_UNRESOLVED";
      } else {
        sessionTaxpayerMatch = ownership.taxpayerProfileId === sessionTaxpayerId ? "MATCH" : "MISMATCH";
      }

      return {
        transactionId: row.id,
        ownerStatus: ownership.status,
        sessionTaxpayerMatch,
      };
    });

    return NextResponse.json({
      success: true,
      data: rows,
      count: rows.length,
      ownershipReport,
    });
  } catch (error) {
    return errorToResponse(error);
  }
}

// STEP 20 — create one transaction (income or expense). Manual entry only — no OCR/AI extraction.
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

    const transaction = createTransaction({
      transactionType: String(body.transactionType || ""),
      amount: Number(body.amount),
      transactionDate: String(body.transactionDate || ""),
      category: String(body.category || ""),
      description: body.description ?? null,
      salesChannel: body.salesChannel ?? null,
      productId:
        body.productId === undefined || body.productId === null || body.productId === ""
          ? null
          : Number(body.productId),
      orderId:
        body.orderId === undefined || body.orderId === null || body.orderId === ""
          ? null
          : Number(body.orderId),
      paymentMethod: body.paymentMethod ?? null,
      notes: body.notes ?? null,
    });

    return NextResponse.json(
      { success: true, data: transaction },
      { status: 201 }
    );
  } catch (error) {
    return errorToResponse(error);
  }
}
