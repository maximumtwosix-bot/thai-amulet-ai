import { NextRequest, NextResponse } from "next/server";
import { updateOrderChannel } from "@/lib/orders";

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
    INVALID_CHANNEL: "channel must be one of the recognized sales channels",
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
        error: "ออเดอร์นี้อยู่ในสถานะสิ้นสุดแล้ว ไม่สามารถแก้ไขช่องทางการขายได้",
      },
      { status: 409 }
    );
  }

  console.error("Order channel update API error:", error);

  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}

// STEP 55 — order channel (sales channel) correction only. Its own narrow sub-route, matching the
// existing /status, /delivery, /items, /summary convention. Protected automatically by the existing
// src/proxy.ts session gate — no proxy change needed, it already matches
// `pathname.startsWith("/api/orders/")`.
//
// Accepts ONLY { channel }, restricted to the 7 valid SALES_CHANNELS values (never arbitrary free
// text). payment_method is explicitly out of scope for this route.
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

    if (!body || typeof body.channel !== "string") {
      return NextResponse.json(
        { success: false, error: "channel is required and must be a string" },
        { status: 400 }
      );
    }

    const result = updateOrderChannel(orderId, body.channel);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorToResponse(error);
  }
}
