import { NextRequest, NextResponse } from "next/server";
import { getCustomerById, updateCustomer } from "@/lib/customers";

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

  if (message === "CUSTOMER_NOT_FOUND") {
    return NextResponse.json(
      { success: false, error: "Customer not found" },
      { status: 404 }
    );
  }

  if (message === "INVALID_CUSTOMER_NAME") {
    return NextResponse.json(
      { success: false, error: "กรุณาระบุชื่อลูกค้า" },
      { status: 400 }
    );
  }

  console.error("Customer detail API error:", error);

  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}

// STEP 36 — single customer detail (used by /orders/[id] if it ever needs a fresh fetch, and
// available for future use — not currently called by any page, since order detail already gets
// customer fields via its own existing JOIN).
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json(
        { success: false, error: "Invalid customer ID" },
        { status: 400 }
      );
    }

    const customer = getCustomerById(id);

    if (!customer) {
      return NextResponse.json(
        { success: false, error: "Customer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: customer });
  } catch (error) {
    return errorToResponse(error);
  }
}

// STEP 36 — edit an existing customer (manual correction only, same convention as
// PATCH /api/transactions/[id]).
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json(
        { success: false, error: "Invalid customer ID" },
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

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const patch: Record<string, unknown> = {};

    if (body.name !== undefined) patch.name = String(body.name);
    if (body.phone !== undefined) patch.phone = body.phone;
    if (body.address !== undefined) patch.address = body.address;
    if (body.district !== undefined) patch.district = body.district;
    if (body.province !== undefined) patch.province = body.province;
    if (body.postalCode !== undefined) patch.postalCode = body.postalCode;

    const customer = updateCustomer(id, patch);

    return NextResponse.json({ success: true, data: customer });
  } catch (error) {
    return errorToResponse(error);
  }
}
