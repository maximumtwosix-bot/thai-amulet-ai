import { NextRequest, NextResponse } from "next/server";
import { updateOrderDelivery } from "@/lib/orderDelivery";

// STEP 49 — order fulfillment tracking (carrier / tracking number / delivery status), approved
// 2026-09-01. Sibling of PATCH /api/orders/[id]/status (STEP 32) — a separate route so that route
// and its file remain byte-for-byte unchanged. Already covered by the existing src/proxy.ts rule
// (pathname === "/api/orders" || pathname.startsWith("/api/orders/")) — no proxy.ts change needed.

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

    const result = updateOrderDelivery(orderId, {
      carrier: typeof body?.carrier === "string" ? body.carrier : undefined,
      trackingNumber:
        typeof body?.trackingNumber === "string" ? body.trackingNumber : undefined,
      deliveryStatus:
        typeof body?.deliveryStatus === "string" ? body.deliveryStatus : undefined,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message === "ORDER_NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Order not found" },
        { status: 404 }
      );
    }

    if (message === "INVALID_DELIVERY_STATUS") {
      return NextResponse.json(
        { success: false, error: "Invalid delivery status value" },
        { status: 400 }
      );
    }

    if (message === "INVALID_DELIVERY_TEXT_TOO_LONG") {
      return NextResponse.json(
        { success: false, error: "Carrier or tracking number is too long" },
        { status: 400 }
      );
    }

    if (message === "INVALID_ORDER_ID") {
      return NextResponse.json(
        { success: false, error: "Invalid order ID" },
        { status: 400 }
      );
    }

    console.error(
      "PATCH /api/orders/[id]/delivery error:",
      error instanceof Error ? error.message : "unknown error"
    );

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
