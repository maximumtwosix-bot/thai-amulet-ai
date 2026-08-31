import { NextRequest, NextResponse } from "next/server";
import { adjustProductStock } from "@/lib/inventory";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const productId = Number(id);

    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json(
        { error: "Invalid product ID" },
        { status: 400 }
      );
    }

    const body = await request.json();

    const quantityChange = Number(body?.quantityChange);

    if (!Number.isInteger(quantityChange) || quantityChange === 0) {
      return NextResponse.json(
        { error: "quantityChange must be a non-zero integer" },
        { status: 400 }
      );
    }

    const note =
      body?.note === undefined || body?.note === null
        ? null
        : String(body.note).trim() || null;

    const referenceType =
      body?.referenceType === undefined ||
      body?.referenceType === null
        ? "manual"
        : String(body.referenceType).trim() || "manual";

    const referenceId =
      body?.referenceId === undefined ||
      body?.referenceId === null ||
      body?.referenceId === ""
        ? null
        : Number(body.referenceId);

    if (
      referenceId !== null &&
      (!Number.isInteger(referenceId) || referenceId <= 0)
    ) {
      return NextResponse.json(
        { error: "Invalid reference ID" },
        { status: 400 }
      );
    }

    const result = adjustProductStock({
      productId,
      quantityChange,
      note,
      referenceType,
      referenceId,
    });

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    if (message === "PRODUCT_NOT_FOUND") {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    if (message === "INSUFFICIENT_STOCK") {
      return NextResponse.json(
        { error: "Insufficient stock" },
        { status: 409 }
      );
    }

    if (message === "STOCK_UPDATE_FAILED") {
      return NextResponse.json(
        { error: "Stock update failed" },
        { status: 409 }
      );
    }

    if (
      message === "Invalid product ID" ||
      message === "quantityChange must be a non-zero integer" ||
      message === "Invalid reference ID"
    ) {
      return NextResponse.json(
        { error: message },
        { status: 400 }
      );
    }

    console.error("Stock adjustment error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
