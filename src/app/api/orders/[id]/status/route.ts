import { NextRequest, NextResponse } from "next/server";
import { updateOrderStatus } from "@/lib/orders";

// STEP 32 — order status workflow. The only mutation endpoint for orders.status; everything else
// about an order (items, totals, stock, the STEP 31 income transaction) is immutable after
// creation. Already covered by the existing src/proxy.ts rule
// (pathname === "/api/orders" || pathname.startsWith("/api/orders/")) — no proxy.ts change needed,
// same as STEP 31's new /api/orders/[id] field and STEP 29's /api/transactions/ai-extract.

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

    const status = typeof body?.status === "string" ? body.status : "";

    if (!status) {
      return NextResponse.json(
        { success: false, error: "status is required" },
        { status: 400 }
      );
    }

    const result = updateOrderStatus(orderId, status);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message === "ORDER_NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Order not found" },
        { status: 404 }
      );
    }

    if (message === "INVALID_STATUS") {
      return NextResponse.json(
        { success: false, error: "Invalid status value" },
        { status: 400 }
      );
    }

    if (message === "INVALID_STATUS_TRANSITION") {
      return NextResponse.json(
        { success: false, error: "This status transition is not allowed" },
        { status: 409 }
      );
    }

    if (message === "INVALID_ORDER_ID") {
      return NextResponse.json(
        { success: false, error: "Invalid order ID" },
        { status: 400 }
      );
    }

    console.error(
      "PATCH /api/orders/[id]/status error:",
      error instanceof Error ? error.message : "unknown error"
    );

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
