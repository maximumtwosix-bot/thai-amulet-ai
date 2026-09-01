import { NextRequest, NextResponse } from "next/server";
import { createCustomer, listCustomers } from "@/lib/customers";

function errorToResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";

  if (message === "INVALID_CUSTOMER_NAME") {
    return NextResponse.json(
      { success: false, error: "กรุณาระบุชื่อลูกค้า" },
      { status: 400 }
    );
  }

  console.error("Customers API error:", error);

  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}

// STEP 36 — list/search customers. Read-only, no side effects.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search") || undefined;
    const limitParam = searchParams.get("limit");
    let limit: number | undefined;

    if (limitParam !== null && limitParam !== "") {
      const parsedLimit = Number(limitParam);

      if (!Number.isInteger(parsedLimit) || parsedLimit <= 0 || parsedLimit > 500) {
        return NextResponse.json(
          { success: false, error: "Invalid limit. Must be an integer between 1 and 500" },
          { status: 400 }
        );
      }

      limit = parsedLimit;
    }

    const rows = listCustomers({ search, limit });

    return NextResponse.json({ success: true, data: rows, count: rows.length });
  } catch (error) {
    return errorToResponse(error);
  }
}

// STEP 36 — create one customer. Used both by the dedicated /customers page and by the inline
// "+ เพิ่มลูกค้าใหม่" form in /orders/new.
export async function POST(request: NextRequest) {
  try {
    let body: any;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body (must be JSON)" },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const customer = createCustomer({
      name: String(body.name || ""),
      phone: body.phone ?? null,
      address: body.address ?? null,
      district: body.district ?? null,
      province: body.province ?? null,
      postalCode: body.postalCode ?? null,
    });

    return NextResponse.json({ success: true, data: customer }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
