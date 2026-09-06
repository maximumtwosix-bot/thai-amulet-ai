import { NextRequest, NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { deleteTransaction, updateTransaction } from "@/lib/transactions";

// ตรรกะเดียวกับ isSafeGeneratedPath ใน products/[id]/media/[mediaId]/route.ts — ต้องขึ้นต้นด้วย
// /generated/ และไม่มี ".." ก่อน unlink ไฟล์จริงบนดิสก์เสมอ
function isSafeGeneratedPath(url: string): boolean {
  if (!url || !url.startsWith("/")) {
    return false;
  }

  const cleanUrl = decodeURIComponent(url.split("?")[0]);

  return !cleanUrl.includes("..") && cleanUrl.startsWith("/generated/");
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

function errorToResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";

  if (message === "TRANSACTION_NOT_FOUND") {
    return NextResponse.json(
      { success: false, error: "Transaction not found" },
      { status: 404 }
    );
  }

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

  // STEP 34 — deleteTransaction() (src/lib/transactions.ts) requires ?confirm=order-linked for any
  // transaction with orderId set; this is the server-side half of that guard, not just the UI's
  // confirm() dialog.
  if (message === "ORDER_LINKED_CONFIRMATION_REQUIRED") {
    return NextResponse.json(
      {
        success: false,
        error: "รายการนี้ผูกกับออเดอร์ กรุณายืนยันการลบอีกครั้ง",
        requiresConfirmation: true,
      },
      { status: 409 }
    );
  }

  // STEP 40 — updateTransaction() (src/lib/transactions.ts) now applies the same STEP 34
  // duplicate-income-per-order guard createTransaction() already had: editing a transaction into
  // `income` linked to an order that already has a different income transaction is rejected here,
  // same message/status as the create-path equivalent in src/app/api/transactions/route.ts.
  if (message === "DUPLICATE_ORDER_INCOME") {
    return NextResponse.json(
      {
        success: false,
        error: "ออเดอร์นี้มีรายการรายรับที่บันทึกไว้แล้ว ไม่สามารถสร้างรายรับซ้ำสำหรับออเดอร์เดียวกันได้",
      },
      { status: 409 }
    );
  }

  // STEP 96 — assertTransactionMutable() (src/lib/taxYearTransactionLinks.ts), called from both
  // updateTransaction() and deleteTransaction(): this transaction is linked to a tax year that is
  // no longer OPEN.
  if (message === "TAX_YEAR_NOT_OPEN") {
    return NextResponse.json(
      {
        success: false,
        error: "ไม่สามารถแก้ไข/ลบรายการนี้ได้ — ปีภาษีที่เกี่ยวข้องไม่ได้อยู่ในสถานะ OPEN แล้ว",
      },
      { status: 409 }
    );
  }

  console.error("Transaction detail API error:", error);

  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}

function parseId(idParam: string): number | null {
  const id = Number(idParam);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

// STEP 20 — update one field or several on an existing transaction (manual correction only)
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json(
        { success: false, error: "Invalid transaction ID" },
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

    if (body.transactionType !== undefined) patch.transactionType = String(body.transactionType);
    if (body.amount !== undefined) patch.amount = Number(body.amount);
    if (body.transactionDate !== undefined) patch.transactionDate = String(body.transactionDate);
    if (body.category !== undefined) patch.category = String(body.category);
    if (body.description !== undefined) patch.description = body.description;
    if (body.salesChannel !== undefined) patch.salesChannel = body.salesChannel;
    if (body.productId !== undefined) {
      patch.productId = body.productId === null || body.productId === "" ? null : Number(body.productId);
    }
    if (body.orderId !== undefined) {
      patch.orderId = body.orderId === null || body.orderId === "" ? null : Number(body.orderId);
    }
    if (body.paymentMethod !== undefined) patch.paymentMethod = body.paymentMethod;
    if (body.notes !== undefined) patch.notes = body.notes;

    const transaction = updateTransaction(id, patch);

    return NextResponse.json({ success: true, data: transaction });
  } catch (error) {
    return errorToResponse(error);
  }
}

// STEP 20 — permanently delete one transaction. No cascading effect on products/orders — this table
// has no downstream data (nothing else references a transaction row).
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json(
        { success: false, error: "Invalid transaction ID" },
        { status: 400 }
      );
    }

    // STEP 34 — required only when the transaction being deleted is order-linked; see
    // deleteTransaction() in src/lib/transactions.ts. Ignored (harmlessly) for unlinked
    // transactions, which continue to delete exactly as before with no confirmation needed.
    const { searchParams } = new URL(request.url);
    const confirmOrderLinked = searchParams.get("confirm") === "order-linked";

    const deletedAttachments = deleteTransaction(id, { confirmOrderLinked });

    // STEP 21 — ลบไฟล์แนบจริงบนดิสก์แบบ best-effort (record ถูกลบแล้วไม่ว่ากรณีนี้จะสำเร็จหรือไม่)
    for (const attachment of deletedAttachments) {
      if (isSafeGeneratedPath(attachment.fileUrl)) {
        const filePath = path.join(
          process.cwd(),
          "public",
          attachment.fileUrl.replace(/^\/+/, "")
        );

        await unlink(filePath).catch(() => {});
      }
    }

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    return errorToResponse(error);
  }
}
