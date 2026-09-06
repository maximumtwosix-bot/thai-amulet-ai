import { NextRequest, NextResponse } from "next/server";
import { listAuditEvents } from "@/lib/taxAuditLog";

// STEP 96 — read-only view of the tax audit trail. GET only — no POST/PATCH/DELETE is ever defined
// here or anywhere else for tax_audit_log, matching src/lib/taxAuditLog.ts's own "no update/delete
// function will ever be provided" convention (same as bank_reconciliation_audit).

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const entityType = searchParams.get("entityType") || undefined;
    const entityIdParam = searchParams.get("entityId");

    let entityId: number | undefined;

    if (entityIdParam !== null && entityIdParam !== "") {
      const parsed = Number(entityIdParam);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        return NextResponse.json({ success: false, error: "Invalid entityId" }, { status: 400 });
      }

      entityId = parsed;
    }

    const limitParam = searchParams.get("limit");
    let limit: number | undefined;

    if (limitParam !== null && limitParam !== "") {
      const parsed = Number(limitParam);

      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 1000) {
        return NextResponse.json(
          { success: false, error: "Invalid limit. Must be an integer between 1 and 1000" },
          { status: 400 }
        );
      }

      limit = parsed;
    }

    const events = listAuditEvents({ entityType, entityId, limit });

    return NextResponse.json({ success: true, data: events, count: events.length });
  } catch (error) {
    console.error("Tax audit log API error:", error);

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
