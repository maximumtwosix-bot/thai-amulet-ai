import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// STEP 18 — read-only order detail. ไม่มีการแก้ไข/ลบข้อมูลใดๆ ในไฟล์นี้
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const orderId = Number(id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid order ID" },
        { status: 400 }
      );
    }

    const order = db
      .prepare(
        `
        SELECT
          o.id,
          o.order_number,
          o.customer_id,
          c.name AS customer_name,
          c.phone AS customer_phone,
          c.address AS customer_address,
          c.district AS customer_district,
          c.province AS customer_province,
          c.postal_code AS customer_postal_code,
          o.channel,
          o.payment_method,
          o.subtotal,
          o.shipping_fee,
          o.discount,
          o.total,
          o.status,
          o.created_at
        FROM orders o
        LEFT JOIN customers c ON c.id = o.customer_id
        WHERE o.id = ?
        `
      )
      .get(orderId);

    if (!order) {
      return NextResponse.json(
        { success: false, error: "Order not found" },
        { status: 404 }
      );
    }

    const items = db
      .prepare(
        `
        SELECT
          oi.id,
          oi.product_id,
          p.name AS product_name,
          oi.quantity,
          oi.price,
          oi.cost
        FROM order_items oi
        LEFT JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = ?
        ORDER BY oi.id ASC
        `
      )
      .all(orderId);

    return NextResponse.json({
      success: true,
      data: {
        ...order,
        items,
      },
    });
  } catch (error) {
    console.error("Get order detail error:", error);

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
