import { NextRequest, NextResponse } from "next/server";
import { updateReviewStatus } from "@/lib/taxDocuments";

// STEP 100 — the ONLY path that changes a tax_document's review_status. Every call here
// represents an explicit human (or, for a future STEP, explicitly human-authorized) action — no
// AI/OCR/extraction code exists anywhere in this STEP, so nothing can reach this endpoint except a
// deliberate API call.

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

  if (message === "TAX_DOCUMENT_NOT_FOUND") {
    return NextResponse.json({ success: false, error: "Tax document not found" }, { status: 404 });
  }

  if (message === "INVALID_REVIEW_STATUS") {
    return NextResponse.json(
      {
        success: false,
        error:
          "status ต้องเป็น UPLOADED, PROCESSING, EXTRACTED, NEEDS_REVIEW, CONFIRMED, REJECTED, DUPLICATE หรือ FAILED",
      },
      { status: 400 }
    );
  }

  if (message === "TAX_DOCUMENT_CONFIRMED") {
    return NextResponse.json(
      { success: false, error: "เอกสารนี้ถูกยืนยันแล้ว ไม่สามารถเปลี่ยนสถานะได้อีก" },
      { status: 409 }
    );
  }

  if (message === "INVALID_STATUS_TRANSITION") {
    return NextResponse.json(
      { success: false, error: "สถานะนี้เหมือนกับสถานะปัจจุบันอยู่แล้ว" },
      { status: 409 }
    );
  }

  console.error("Tax document review-status API error:", error);

  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json({ success: false, error: "Invalid tax document ID" }, { status: 400 });
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body (must be JSON)" },
        { status: 400 }
      );
    }

    const b = body as Record<string, unknown> | null;
    const status = typeof b?.status === "string" ? b.status : "";

    const document = updateReviewStatus(id, status);

    return NextResponse.json({ success: true, data: document });
  } catch (error) {
    return errorToResponse(error);
  }
}
