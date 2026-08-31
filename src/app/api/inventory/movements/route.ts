import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const productIdParam = searchParams.get("productId");
    const limitParam = searchParams.get("limit");

    let productId: number | null = null;

    if (productIdParam !== null && productIdParam !== "") {
      const parsedProductId = Number(productIdParam);

      if (!Number.isInteger(parsedProductId) || parsedProductId <= 0) {
        return NextResponse.json(
          { error: "Invalid product ID" },
          { status: 400 }
        );
      }

      productId = parsedProductId;
    }

    let limit = 100;

    if (limitParam !== null && limitParam !== "") {
      const parsedLimit = Number(limitParam);

      if (
        !Number.isInteger(parsedLimit) ||
        parsedLimit <= 0 ||
        parsedLimit > 500
      ) {
        return NextResponse.json(
          { error: "Invalid limit. Must be an integer between 1 and 500" },
          { status: 400 }
        );
      }

      limit = parsedLimit;
    }

    const rows = productId === null
      ? db
          .prepare(
            `
            SELECT
              im.id,
              im.product_id,
              p.name AS product_name,
              im.movement_type,
              im.quantity_change,
              im.quantity_before,
              im.quantity_after,
              im.reference_type,
              im.reference_id,
              im.note,
              im.created_at
            FROM inventory_movements im
            INNER JOIN products p
              ON p.id = im.product_id
            ORDER BY im.id DESC
            LIMIT ?
            `
          )
          .all(limit)
      : db
          .prepare(
            `
            SELECT
              im.id,
              im.product_id,
              p.name AS product_name,
              im.movement_type,
              im.quantity_change,
              im.quantity_before,
              im.quantity_after,
              im.reference_type,
              im.reference_id,
              im.note,
              im.created_at
            FROM inventory_movements im
            INNER JOIN products p
              ON p.id = im.product_id
            WHERE im.product_id = ?
            ORDER BY im.id DESC
            LIMIT ?
            `
          )
          .all(productId, limit);

    return NextResponse.json({
      success: true,
      data: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error("Inventory movement history error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
