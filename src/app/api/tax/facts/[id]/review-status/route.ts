import { NextRequest, NextResponse } from "next/server";
import { updateFactReviewStatus } from "@/lib/extractedFacts";

// STEP 104 — the ONLY path that changes an extracted_facts row's review_status. Every call here
// represents an explicit human (or, for a future STEP, explicitly human-authorized) action — no
// AI/OCR/extraction code exists anywhere in this STEP, so nothing can reach this endpoint except a
// deliberate API call. CONFIRMED here means only "accepted as an accurate transcription" — it never
// implies taxable income, deductible expense, WHT applicability, or VAT registration.

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

  if (message === "EXTRACTED_FACT_NOT_FOUND") {
    return NextResponse.json({ success: false, error: "Extracted fact not found" }, { status: 404 });
  }

  if (message === "TAX_PERIOD_CLOSED") {
    return NextResponse.json(
      { success: false, error: "งวดภาษีของเอกสารนี้ถูกปิดแล้ว ไม่สามารถเปลี่ยนสถานะ fact ได้" },
      { status: 409 }
    );
  }

  if (message === "FACT_REVIEW_TERMINAL") {
    return NextResponse.json(
      { success: false, error: "fact นี้ถูกยืนยัน/ปฏิเสธแล้ว ไม่สามารถเปลี่ยนสถานะได้อีก" },
      { status: 409 }
    );
  }

  if (message === "INVALID_STATUS_TRANSITION") {
    return NextResponse.json(
      { success: false, error: "สถานะนี้เหมือนกับสถานะปัจจุบันอยู่แล้ว" },
      { status: 409 }
    );
  }

  if (message === "INVALID_REVIEW_STATUS") {
    return NextResponse.json(
      {
        success: false,
        error: "status ต้องเป็น EXTRACTED, NEEDS_REVIEW, CONFIRMED หรือ REJECTED",
      },
      { status: 400 }
    );
  }

  console.error("Fact review-status API error:", error);

  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const id = parseId(idParam);

    if (id === null) {
      return NextResponse.json({ success: false, error: "Invalid fact ID" }, { status: 400 });
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

    const fact = updateFactReviewStatus(id, status);

    return NextResponse.json({ success: true, data: fact });
  } catch (error) {
    return errorToResponse(error);
  }
}
