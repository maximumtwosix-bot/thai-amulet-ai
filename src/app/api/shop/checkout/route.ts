import { NextResponse } from "next/server";
import db from "@/lib/db";
import { createOrder } from "@/lib/orders";
import { createCustomer } from "@/lib/customers";
import { isValidPaymentMethod } from "@/lib/transactions";

// STEP 102 — public checkout for the customer-facing storefront ("/shop"). Deliberately reuses the
// EXISTING orders/customers system (src/lib/orders.ts's createOrder(), same function the admin
// "เพิ่มออเดอร์" form at /orders/new calls) rather than introducing a new "Order" table — that
// existing system already handles order_number/total computation, stock deduction
// (decreaseStockForSale), customer validation, and auto-recording the sale as a Finance income
// transaction atomically. A parallel table would fragment that data and duplicate all of that
// already-battle-tested logic. Storefront orders are distinguished from admin-created ones purely
// by orders.channel = "storefront" (free TEXT column, never validated against the fixed
// SalesChannel enum — see mapOrderChannelToSalesChannel()'s own comment in orders.ts) — they show
// up in the exact same /orders admin list/detail pages as any other order, no new UI needed there.
//
// Unauthenticated by design (not listed in src/proxy.ts's protected paths) — a customer checking
// out has no admin session. To keep that safe: only products currently listed on /shop (status =
// 'active') can be ordered here — a request naming any other product id is rejected before
// createOrder() ever runs, so this endpoint can't be used to buy a delisted/hidden product by
// guessing its id.
export async function POST(request: Request) {
  try {
    let body: any;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "รูปแบบคำขอไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const customerName = String(body.customerName ?? "").trim();
    const customerPhone = String(body.customerPhone ?? "").trim();
    const customerAddress = String(body.customerAddress ?? "").trim();
    const paymentMethod = String(body.paymentMethod ?? "").trim();

    if (!customerName) {
      return NextResponse.json({ error: "กรุณาระบุชื่อ-นามสกุล" }, { status: 400 });
    }
    if (!customerPhone) {
      return NextResponse.json({ error: "กรุณาระบุเบอร์โทรศัพท์" }, { status: 400 });
    }
    if (!customerAddress) {
      return NextResponse.json({ error: "กรุณาระบุที่อยู่จัดส่ง" }, { status: 400 });
    }
    if (!isValidPaymentMethod(paymentMethod)) {
      return NextResponse.json({ error: "กรุณาเลือกวิธีชำระเงิน" }, { status: 400 });
    }

    const productId = Number(body.productId);
    const quantity = Number.isInteger(Number(body.quantity)) ? Number(body.quantity) : 1;

    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json({ error: "ไม่พบสินค้าที่ต้องการสั่งซื้อ" }, { status: 400 });
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "จำนวนสินค้าไม่ถูกต้อง" }, { status: 400 });
    }

    const listedProduct = db
      .prepare("SELECT id FROM products WHERE id = ? AND status = 'active'")
      .get(productId);

    if (!listedProduct) {
      return NextResponse.json(
        { error: "สินค้านี้ไม่พร้อมจำหน่ายแล้ว กรุณารีเฟรชหน้าเว็บ" },
        { status: 404 }
      );
    }

    const customer = createCustomer({
      name: customerName,
      phone: customerPhone,
      address: customerAddress,
    });

    const order = createOrder({
      orderNumber: `SHOP-${Date.now()}`,
      customerId: customer.id,
      channel: "storefront",
      paymentMethod,
      items: [{ productId, quantity }],
    });

    return NextResponse.json(
      { success: true, orderNumber: order.orderNumber },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/shop/checkout error:", error);

    const message = error instanceof Error ? error.message : "Unknown error";

    if (message === "PRODUCT_NOT_FOUND") {
      return NextResponse.json({ error: "ไม่พบสินค้าที่ต้องการสั่งซื้อ" }, { status: 404 });
    }
    if (message === "INSUFFICIENT_STOCK" || message.includes("INSUFFICIENT_STOCK")) {
      return NextResponse.json({ error: "สินค้าไม่เพียงพอในสต็อก" }, { status: 409 });
    }

    return NextResponse.json(
      { error: "ไม่สามารถสั่งซื้อสินค้าได้ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}
