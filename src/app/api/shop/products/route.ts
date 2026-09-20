import { NextResponse } from "next/server";
import db from "@/lib/db";
import { listProductMedia } from "@/lib/productMedia";

// STEP 101 — public, read-only catalogue feed for the customer-facing storefront ("/shop").
// Deliberately a SEPARATE route from /api/products (the back-office CRUD API, session-gated in
// src/proxy.ts) rather than reusing it: this endpoint is intentionally unauthenticated (customers
// browsing /shop have no session), so it must never expose the admin fields /api/products returns
// (cost, stock, low_stock_threshold, category, created_at/updated_at) — only what a customer is
// meant to see. Only products with status = 'active' (stock > 0, computed the same way
// /api/products POST/PATCH already compute it) are listed — an out-of-stock item is simply not
// shown, rather than shown with a "sold out" state, matching this STEP's scope.
type ProductRow = {
  id: number;
  name: string;
  master: string | null;
  year: string | null;
  description: string | null;
  price: number;
  badge: string | null;
  monk_image: string | null;
  monk_history: string | null;
};

export async function GET() {
  try {
    const products = db
      .prepare(
        `
        SELECT id, name, master, year, description, price, badge, monk_image, monk_history
        FROM products
        WHERE status = 'active'
        ORDER BY id DESC
        `
      )
      .all() as ProductRow[];

    const items = products.map((product) => {
      // Gallery is images only (a carousel has no use for a video entry) — already ordered
      // primary-first by listProductMedia() itself, so gallery[0] doubles as the card thumbnail.
      const gallery = listProductMedia(product.id)
        .filter((media) => media.type === "image")
        .map((media) => media.url);

      return {
        id: product.id,
        name: product.name,
        temple: product.master,
        era: product.year,
        description: product.description,
        price: product.price,
        badge: product.badge,
        imageUrl: gallery[0] ?? null,
        gallery,
        monkImage: product.monk_image || null,
        monkHistory: product.monk_history || null,
      };
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /api/shop/products error:", error);

    return NextResponse.json(
      { error: "ไม่สามารถโหลดข้อมูลสินค้าได้" },
      { status: 500 }
    );
  }
}
