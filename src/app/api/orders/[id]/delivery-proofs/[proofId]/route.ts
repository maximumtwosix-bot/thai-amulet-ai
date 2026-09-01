import { NextRequest, NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { deleteOrderDeliveryProof } from "@/lib/orderDeliveryProofs";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; proofId: string }>;
};

function parseId(raw: string): number | null {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

// เหมือน isSafeGeneratedPath ใน transactions/[id]/attachments/[attachmentId]/route.ts
function isSafeGeneratedPath(url: string): boolean {
  if (!url || !url.startsWith("/")) {
    return false;
  }

  const cleanUrl = decodeURIComponent(url.split("?")[0]);

  return !cleanUrl.includes("..") && cleanUrl.startsWith("/generated/");
}

// DELETE /api/orders/[id]/delivery-proofs/[proofId] — ลบรูปหลักฐานการจัดส่ง 1 รายการ
//
// ตรวจว่า proofId เป็นของ orderId นี้จริงเท่านั้น (deleteOrderDeliveryProof join ทั้งสองเงื่อนไข
// ในคำสั่งเดียว, เหมือน deleteTransactionAttachment) — ถ้า proofId มีอยู่จริงแต่เป็นของ order อื่น
// จะได้ 404 เหมือนไม่พบเลย ไม่เปิดเผยว่า id นี้มีอยู่จริงในระบบ
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id, proofId: rawProofId } = await context.params;
    const orderId = parseId(id);
    const proofId = parseId(rawProofId);

    if (orderId === null || proofId === null) {
      return NextResponse.json(
        { success: false, error: "Invalid order ID or proof ID" },
        { status: 400 }
      );
    }

    const deleted = deleteOrderDeliveryProof(orderId, proofId);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Delivery proof not found" },
        { status: 404 }
      );
    }

    if (isSafeGeneratedPath(deleted.fileUrl)) {
      const filePath = path.join(
        process.cwd(),
        "public",
        deleted.fileUrl.replace(/^\/+/, "")
      );

      await unlink(filePath).catch(() => {});
    }

    return NextResponse.json({ success: true, data: deleted });
  } catch (error) {
    console.error("DELETE /api/orders/[id]/delivery-proofs/[proofId] error:", error);

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
