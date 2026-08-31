import { NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { deleteProductMedia, setPrimaryProductMedia } from "@/lib/productMedia";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; mediaId: string }>;
};

function parseId(raw: string): number | null {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

// ต้องขึ้นต้นด้วย /generated/ และไม่มี ".." — ตรรกะเดียวกับที่ใช้ตรวจ videoUrl/audioUrl ทั่วทั้งระบบ
// (ป้องกัน path traversal ก่อน unlink ไฟล์จริงบนดิสก์เสมอ)
function isSafeGeneratedPath(url: string): boolean {
  if (!url || !url.startsWith("/")) {
    return false;
  }

  const cleanUrl = decodeURIComponent(url.split("?")[0]);

  return !cleanUrl.includes("..") && cleanUrl.startsWith("/generated/");
}

// DELETE /api/products/[id]/media/[mediaId] — ลบสื่อสินค้า 1 รายการ (รูปจริง/รูป AI/วิดีโอ AI)
//
// ตรวจว่า mediaId เป็นของ productId นี้จริงเท่านั้น (deleteProductMedia join ทั้งสองเงื่อนไข
// ในคำสั่งเดียว) — ถ้า mediaId มีอยู่จริงแต่เป็นของสินค้าอื่น จะได้ 404 เหมือนไม่พบเลย ไม่เปิดเผยว่า
// id นี้มีอยู่จริงในระบบ (กัน enumeration ข้ามสินค้า)
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id, mediaId: rawMediaId } = await context.params;
    const productId = parseId(id);
    const mediaId = parseId(rawMediaId);

    if (productId === null || mediaId === null) {
      return NextResponse.json(
        { error: "รหัสสินค้าหรือรหัสสื่อไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const deleted = deleteProductMedia(productId, mediaId);

    if (!deleted) {
      return NextResponse.json(
        { error: `ไม่พบสื่อรหัส ${mediaId} สำหรับสินค้านี้` },
        { status: 404 }
      );
    }

    // ลบไฟล์จริงบนดิสก์แบบ best-effort — ถ้าไฟล์หายไปก่อนแล้วก็ไม่ถือเป็น error (record ก็ถูกลบแล้ว)
    // แต่ถ้า URL ที่บันทึกไว้ผิดปกติ (ไม่ผ่าน isSafeGeneratedPath) จะไม่พยายาม unlink เด็ดขาด
    if (isSafeGeneratedPath(deleted.url)) {
      const filePath = path.join(
        process.cwd(),
        "public",
        deleted.url.replace(/^\/+/, "")
      );

      await unlink(filePath).catch(() => {});
    }

    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    console.error("DELETE /api/products/[id]/media/[mediaId] error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "ไม่สามารถลบสื่อสินค้าได้",
      },
      { status: 500 }
    );
  }
}

// PATCH /api/products/[id]/media/[mediaId] — STEP 31: ตั้งสื่อรายการนี้เป็นรูปหลักของสินค้า
// (ไม่มี field อื่นให้แก้ผ่าน endpoint นี้ — ไม่อ่าน request body เลย ความหมายของ PATCH ที่นี่คือ
// "ตั้งเป็นรูปหลัก" เท่านั้น สอดคล้องกับข้อเท็จจริงที่ product_media มีค่าที่แก้ได้จริงแค่ is_primary)
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id, mediaId: rawMediaId } = await context.params;
    const productId = parseId(id);
    const mediaId = parseId(rawMediaId);

    if (productId === null || mediaId === null) {
      return NextResponse.json(
        { error: "รหัสสินค้าหรือรหัสสื่อไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    let updated;

    try {
      updated = setPrimaryProductMedia(productId, mediaId);
    } catch (error) {
      // source !== "product" (พยายามตั้งรูป AI เป็นรูปหลัก) — ไม่ใช่ error ที่ไม่คาดคิด
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "ไม่สามารถตั้งรูปหลักได้",
        },
        { status: 400 }
      );
    }

    if (!updated) {
      return NextResponse.json(
        { error: `ไม่พบสื่อรหัส ${mediaId} สำหรับสินค้านี้` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, media: updated });
  } catch (error) {
    console.error("PATCH /api/products/[id]/media/[mediaId] error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "ไม่สามารถตั้งรูปหลักได้",
      },
      { status: 500 }
    );
  }
}
