import { NextRequest, NextResponse } from "next/server";
import { updateOrderItemPrices } from "@/lib/orders";

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

  const notFoundMessages: Record<string, string> = {
    ORDER_NOT_FOUND: "Order not found",
    ORDER_ITEM_NOT_FOUND: "One or more order items were not found on this order",
  };

  if (message in notFoundMessages) {
    return NextResponse.json(
      { success: false, error: notFoundMessages[message] },
      { status: 404 }
    );
  }

  const badRequestMessages: Record<string, string> = {
    INVALID_ORDER_ID: "Invalid order ID",
    ORDER_ITEMS_REQUIRED: "At least one item price is required",
    INVALID_ORDER_ITEM_ID: "orderItemId must be a positive integer",
    INVALID_PRICE: "price must be a non-negative finite number",
    INVALID_ORDER_TOTAL: "Resulting order total would be invalid",
  };

  if (message in badRequestMessages) {
    return NextResponse.json(
      { success: false, error: badRequestMessages[message] },
      { status: 400 }
    );
  }

  const conflictMessages: Record<string, string> = {
    ORDER_TERMINAL_STATUS: "ออเดอร์นี้อยู่ในสถานะสิ้นสุดแล้ว ไม่สามารถแก้ไขราคาสินค้าได้",
    LINKED_INCOME_REQUIRES_POSITIVE_TOTAL:
      "ไม่สามารถปรับราคาให้ยอดรวมเป็น 0 หรือติดลบได้ เนื่องจากออเดอร์นี้มีรายรับที่ผูกไว้อยู่",
  };

  if (message in conflictMessages) {
    return NextResponse.json(
      { success: false, error: conflictMessages[message] },
      { status: 409 }
    );
  }

  console.error("Order item price update API error:", error);

  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}

// STEP 53 — price-only correction for existing order_items. Deliberately its own narrow route
// (matches the existing /status and /delivery sub-route convention) rather than a PATCH added to
// /api/orders/[id]/route.ts, so it stays obviously scoped to exactly one concern. Protected by the
// existing src/proxy.ts session gate — no proxy change needed, since it already matches
// `pathname.startsWith("/api/orders/")`.
//
// Accepts ONLY { items: [{ orderItemId, price }, ...] }. `quantity`/`productId`/`product_id` are
// explicitly rejected if present on any item — this endpoint has no code path (here or in
// updateOrderItemPrices()) capable of changing either. No add/remove-item support exists or is
// planned for this endpoint.
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const orderId = parseId(idParam);

    if (orderId === null) {
      return NextResponse.json(
        { success: false, error: "Invalid order ID" },
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

    if (!body || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { success: false, error: "items must be a non-empty array of { orderItemId, price }" },
        { status: 400 }
      );
    }

    for (const raw of body.items) {
      if (
        raw &&
        typeof raw === "object" &&
        ("quantity" in raw || "productId" in raw || "product_id" in raw)
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "This endpoint only accepts { orderItemId, price } — quantity and productId cannot be changed here",
          },
          { status: 400 }
        );
      }
    }

    const items = body.items.map((item: any) => ({
      orderItemId: Number(item?.orderItemId),
      price: Number(item?.price),
    }));

    const result = updateOrderItemPrices(orderId, items);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorToResponse(error);
  }
}
