import { NextRequest, NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { deleteTransactionAttachment } from "@/lib/transactionAttachments";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; attachmentId: string }>;
};

function parseId(raw: string): number | null {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

// ตรรกะเดียวกับ isSafeGeneratedPath ใน products/[id]/media/[mediaId]/route.ts
function isSafeGeneratedPath(url: string): boolean {
  if (!url || !url.startsWith("/")) {
    return false;
  }

  const cleanUrl = decodeURIComponent(url.split("?")[0]);

  return !cleanUrl.includes("..") && cleanUrl.startsWith("/generated/");
}

// DELETE /api/transactions/[id]/attachments/[attachmentId] — ลบไฟล์แนบ 1 รายการ
//
// ตรวจว่า attachmentId เป็นของ transactionId นี้จริงเท่านั้น (deleteTransactionAttachment join
// ทั้งสองเงื่อนไขในคำสั่งเดียว, เหมือน deleteProductMedia) — ถ้า attachmentId มีอยู่จริงแต่เป็นของ
// transaction อื่น จะได้ 404 เหมือนไม่พบเลย ไม่เปิดเผยว่า id นี้มีอยู่จริงในระบบ
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id, attachmentId: rawAttachmentId } = await context.params;
    const transactionId = parseId(id);
    const attachmentId = parseId(rawAttachmentId);

    if (transactionId === null || attachmentId === null) {
      return NextResponse.json(
        { success: false, error: "Invalid transaction ID or attachment ID" },
        { status: 400 }
      );
    }

    const deleted = deleteTransactionAttachment(transactionId, attachmentId);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Attachment not found" },
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
    console.error("DELETE /api/transactions/[id]/attachments/[attachmentId] error:", error);

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
