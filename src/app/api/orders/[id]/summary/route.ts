import { NextRequest, NextResponse } from "next/server";
import { updateOrderShippingAndDiscount } from "@/lib/orders";

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

  if (message === "ORDER_NOT_FOUND") {
    return NextResponse.json(
      { success: false, error: "Order not found" },
      { status: 404 }
    );
  }

  const badRequestMessages: Record<string, string> = {
    INVALID_ORDER_ID: "Invalid order ID",
    INVALID_SHIPPING_FEE: "shippingFee must be a non-negative finite number",
    INVALID_DISCOUNT: "discount must be a non-negative finite number",
    INVALID_ORDER_TOTAL: "Resulting order total would be invalid",
  };

  if (message in badRequestMessages) {
    return NextResponse.json(
      { success: false, error: badRequestMessages[message] },
      { status: 400 }
    );
  }

  const conflictMessages: Record<string, string> = {
    ORDER_TERMINAL_STATUS: "ออเดอร์นี้อยู่ในสถานะสิ้นสุดแล้ว ไม่สามารถแก้ไขค่าจัดส่ง/ส่วนลดได้",
    LINKED_INCOME_REQUIRES_POSITIVE_TOTAL:
      "ไม่สามารถปรับให้ยอดรวมเป็น 0 หรือติดลบได้ เนื่องจากออเดอร์นี้มีรายรับที่ผูกไว้อยู่",
  };

  if (message in conflictMessages) {
    return NextResponse.json(
      { success: false, error: conflictMessages[message] },
      { status: 409 }
    );
  }

  console.error("Order summary update API error:", error);

  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}

// STEP 54 — shipping fee / discount correction only (Option C). Its own narrow sub-route, matching
// the existing /status, /delivery, /items convention. Protected automatically by the existing
// src/proxy.ts session gate — no proxy change needed, it already matches
// `pathname.startsWith("/api/orders/")`.
//
// Accepts ONLY { shippingFee?, discount? }. `subtotal`, `total`, `items`, `quantity`, `unitPrice`,
// and `productId`/`product_id` are explicitly rejected if present — this endpoint has no code path
// (here or in updateOrderShippingAndDiscount()) capable of writing any order-item field or accepting
// a client-supplied subtotal/total.
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

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const rejectedFields = [
      "subtotal",
      "total",
      "items",
      "quantity",
      "unitPrice",
      "unit_price",
      "productId",
      "product_id",
    ];

    for (const field of rejectedFields) {
      if (field in body) {
        return NextResponse.json(
          {
            success: false,
            error: `This endpoint only accepts { shippingFee, discount } — ${field} cannot be changed here`,
          },
          { status: 400 }
        );
      }
    }

    const patch: { shippingFee?: number; discount?: number } = {};

    if (body.shippingFee !== undefined) {
      patch.shippingFee = Number(body.shippingFee);
    }

    if (body.discount !== undefined) {
      patch.discount = Number(body.discount);
    }

    const result = updateOrderShippingAndDiscount(orderId, patch);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorToResponse(error);
  }
}
