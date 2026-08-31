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

    const deletedAttachments = deleteTransaction(id);

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
