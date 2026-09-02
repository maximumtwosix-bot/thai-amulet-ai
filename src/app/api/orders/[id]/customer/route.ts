import { NextRequest, NextResponse } from "next/server";
import { updateOrderCustomer } from "@/lib/orders";

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
    CUSTOMER_NOT_FOUND: "Customer not found",
  };

  if (message in notFoundMessages) {
    return NextResponse.json(
      { success: false, error: notFoundMessages[message] },
      { status: 404 }
    );
  }

  const badRequestMessages: Record<string, string> = {
    INVALID_ORDER_ID: "Invalid order ID",
    INVALID_CUSTOMER_ID: "customerId is required and must be a positive integer",
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
        error: "ออเดอร์นี้อยู่ในสถานะสิ้นสุดแล้ว ไม่สามารถเปลี่ยนลูกค้าได้",
      },
      { status: 409 }
    );
  }

  console.error("Order customer reassignment API error:", error);

  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}

// STEP 57 — reassign an order to a different existing customer. Its own narrow sub-route, matching
// the existing /status, /delivery, /items, /summary, /channel, /payment-method convention.
// Protected automatically by the existing src/proxy.ts session gate — no proxy change needed, it
// already matches `pathname.startsWith("/api/orders/")`.
//
// Accepts ONLY { customerId }, a required positive integer referencing an existing customer.
// null/missing is never accepted — a valid target customer is always required (approved decision).
// Does not modify the customers table itself; use the existing PATCH /api/customers/[id] (STEP 36,
// used by STEP 52) to edit a customer's own data.
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

    if (!body || body.customerId === undefined || body.customerId === null) {
      return NextResponse.json(
        { success: false, error: "customerId is required and must be a positive integer" },
        { status: 400 }
      );
    }

    const customerId = Number(body.customerId);

    const result = updateOrderCustomer(orderId, customerId);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorToResponse(error);
  }
}
