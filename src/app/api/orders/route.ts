import { NextRequest, NextResponse } from "next/server";
import { createOrder } from "@/lib/orders";
import db from "@/lib/db";

// STEP 18 — read-only list, ไม่แตะ POST เดิมด้านล่างเลย (order creation / stock deduction logic
// เหมือนเดิมทุกประการ) รวม customer name + item count ต่อออเดอร์ให้พอสำหรับตาราง /orders โดยไม่ต้อง
// query แยกทีละแถวใน UI
//
// STEP 50 — added o.carrier/o.tracking_number/o.delivery_status to the SELECT list only, so
// src/app/orders/page.tsx can show a delivery-status column. Read-only addition, same pattern as
// STEP 49's identical addition to GET /api/orders/[id] — no other line in this file changed.
//
// STEP 59 — added an optional `date` query param (YYYY-MM-DD) so /orders can show "today's orders"
// as a daily-operations view. orders.created_at is stored as SQLite CURRENT_TIMESTAMP, which is
// UTC — filtering with a naive `date(created_at) = ?` would misclassify any order created between
// 00:00-06:59 Bangkok time into the previous UTC calendar day (Bangkok is UTC+7 with no DST, so
// this is a fixed, always-correct offset, not a full timezone-database lookup). `date(o.created_at,
// '+7 hours')` shifts to Bangkok local time before extracting the calendar day, avoiding that
// off-by-one-day bug. Omitting `date` preserves the exact prior behavior (no WHERE clause at all).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const limitParam = searchParams.get("limit");
    let limit = 100;

    if (limitParam !== null && limitParam !== "") {
      const parsedLimit = Number(limitParam);

      if (
        !Number.isInteger(parsedLimit) ||
        parsedLimit <= 0 ||
        parsedLimit > 500
      ) {
        return NextResponse.json(
          { success: false, error: "Invalid limit. Must be an integer between 1 and 500" },
          { status: 400 }
        );
      }

      limit = parsedLimit;
    }

    const dateParam = searchParams.get("date");
    let dateFilter: string | null = null;

    if (dateParam !== null && dateParam !== "") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        return NextResponse.json(
          { success: false, error: "Invalid date. Must be in YYYY-MM-DD format" },
          { status: 400 }
        );
      }

      dateFilter = dateParam;
    }

    const rows = db
      .prepare(
        `
        SELECT
          o.id,
          o.order_number,
          o.customer_id,
          c.name AS customer_name,
          o.channel,
          o.payment_method,
          o.subtotal,
          o.shipping_fee,
          o.discount,
          o.total,
          o.status,
          o.carrier,
          o.tracking_number,
          o.delivery_status,
          o.created_at,
          COUNT(oi.id) AS item_count,
          COALESCE(SUM(oi.quantity), 0) AS total_quantity
        FROM orders o
        LEFT JOIN customers c ON c.id = o.customer_id
        LEFT JOIN order_items oi ON oi.order_id = o.id
        ${dateFilter ? "WHERE date(o.created_at, '+7 hours') = ?" : ""}
        GROUP BY o.id
        ORDER BY o.id DESC
        LIMIT ?
        `
      )
      .all(...(dateFilter ? [dateFilter, limit] : [limit]));

    return NextResponse.json({
      success: true,
      data: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error("List orders error:", error);

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const orderNumber =
      typeof body.orderNumber === "string" &&
      body.orderNumber.trim()
        ? body.orderNumber.trim()
        : `ORD-${Date.now()}`;

    const channel =
      typeof body.channel === "string" && body.channel.trim()
        ? body.channel.trim()
        : "manual";

    const paymentMethod =
      typeof body.paymentMethod === "string" &&
      body.paymentMethod.trim()
        ? body.paymentMethod.trim()
        : "unknown";

    const shippingFee =
      Number.isFinite(Number(body.shippingFee))
        ? Number(body.shippingFee)
        : 0;

    const discount =
      Number.isFinite(Number(body.discount))
        ? Number(body.discount)
        : 0;

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Order must contain at least one item",
        },
        { status: 400 }
      );
    }

    const items = body.items.map((item: any) => ({
      productId: Number(item.productId),
      quantity: Number(item.quantity),
      price:
        item.price === undefined || item.price === null
          ? undefined
          : Number(item.price),
    }));

    for (const item of items) {
      if (
        !Number.isInteger(item.productId) ||
        item.productId <= 0
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid product ID",
          },
          { status: 400 }
        );
      }

      if (
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Quantity must be a positive integer",
          },
          { status: 400 }
        );
      }

      if (
        item.price !== undefined &&
        (!Number.isFinite(item.price) || item.price < 0)
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid item price",
          },
          { status: 400 }
        );
      }
    }

    if (!Number.isFinite(shippingFee) || shippingFee < 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid shipping fee",
        },
        { status: 400 }
      );
    }

    if (!Number.isFinite(discount) || discount < 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid discount",
        },
        { status: 400 }
      );
    }

    // STEP 36 — optional; createOrder() validates existence itself (INVALID_CUSTOMER_ID/
    // CUSTOMER_NOT_FOUND below) so a typo'd or deleted-in-between id fails the whole order
    // atomically rather than silently writing a dangling customer_id.
    const customerId =
      body.customerId === undefined || body.customerId === null || body.customerId === ""
        ? null
        : Number(body.customerId);

    const result = createOrder({
      orderNumber,
      customerId,
      channel,
      paymentMethod,
      shippingFee,
      discount,
      items,
    });

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create order error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error";

    if (message === "PRODUCT_NOT_FOUND") {
      return NextResponse.json(
        {
          success: false,
          error: "Product not found",
        },
        { status: 404 }
      );
    }

    // STEP 36
    if (message === "CUSTOMER_NOT_FOUND") {
      return NextResponse.json(
        {
          success: false,
          error: "Customer not found",
        },
        { status: 404 }
      );
    }

    if (message === "INVALID_CUSTOMER_ID") {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid customer ID",
        },
        { status: 400 }
      );
    }

    if (
      message === "INSUFFICIENT_STOCK" ||
      message.includes("INSUFFICIENT_STOCK")
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient stock",
        },
        { status: 409 }
      );
    }

    if (
      message.includes("UNIQUE") ||
      message.includes("order_number")
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Order number already exists",
        },
        { status: 409 }
      );
    }

    // STEP 42 — every other route in this codebase (orders/[id]/status, transactions,
    // customers, tax/summary, profit/summary, stock-adjustment, and this file's own GET above)
    // ends its unmapped-error fallback with this exact generic message, never the raw thrown
    // `message` — that raw string (e.g. an internal constant like INVALID_ORDER_TOTAL, reachable
    // when a discount exceeds the order total) was leaking to the client here. console.error above
    // already logs the real error server-side, so nothing about diagnosability is lost.
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
