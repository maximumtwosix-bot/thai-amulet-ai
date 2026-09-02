import { NextRequest, NextResponse } from "next/server";
import { updateOrderPaymentMethod } from "@/lib/orders";

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
    INVALID_PAYMENT_METHOD: "paymentMethod must be one of the recognized payment methods",
  };

  if (message in badRequestMessages) {
    return NextResponse.json(
      { success: false, error: badRequestMessages[message] },
      { status: 400 }
    );
  }

  if (message === "ORDER_TERMINAL_STATUS") {
    return NextResponse.json(
      {
        success: false,
        error: "ออเดอร์นี้อยู่ในสถานะสิ้นสุดแล้ว ไม่สามารถแก้ไขวิธีชำระเงินได้",
      },
      { status: 409 }
    );
  }

  console.error("Order payment method update API error:", error);

  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}

// STEP 56 — order payment method correction only. Its own narrow sub-route, matching the existing
// /status, /delivery, /items, /summary, /channel convention. Protected automatically by the
// existing src/proxy.ts session gate — no proxy change needed, it already matches
// `pathname.startsWith("/api/orders/")`.
//
// Accepts ONLY { paymentMethod }, restricted to the 2 valid PAYMENT_METHODS values (never arbitrary
// free text).
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

    if (!body || typeof body.paymentMethod !== "string") {
      return NextResponse.json(
        { success: false, error: "paymentMethod is required and must be a string" },
        { status: 400 }
      );
    }

    const result = updateOrderPaymentMethod(orderId, body.paymentMethod);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorToResponse(error);
  }
}
