import { NextRequest, NextResponse } from "next/server";
import { getTaxPeriodById } from "@/lib/taxPeriods";

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

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json({ success: false, error: "Invalid tax period ID" }, { status: 400 });
    }

    const period = getTaxPeriodById(id);

    if (!period) {
      return NextResponse.json({ success: false, error: "Tax period not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: period });
  } catch (error) {
    console.error("Tax period detail API error:", error);

    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
