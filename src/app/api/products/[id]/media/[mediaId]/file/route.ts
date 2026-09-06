import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getProductMediaById } from "@/lib/productMedia";

export const runtime = "nodejs";

// STEP 47G-21 — runtime file-serving route for Product Media.
//
// เหตุผล: production process ที่รันอยู่แล้วไม่เห็นไฟล์ที่เขียนลง public/generated/product-media/
// หลังจาก server start ไปแล้ว (proven by controlled test ใน STEP 47G-19/20/20B) เพราะ Next.js เสิร์ฟ
// public/ แบบ static ที่ผูกกับตอน build/start เท่านั้น route นี้จึงอ่านไฟล์จากดิสก์จริงทุกครั้งที่มี
// request เข้ามาแทน (runtime read, ไม่ใช่ static serving) — แก้เฉพาะปัญหานี้ ไม่แตะ primary/delete/
// source logic ใดๆ ของ Product Media เดิม

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

// เฉพาะนามสกุลรูปภาพที่ Product Media รองรับอยู่แล้ว (ตรงกับ ALLOWED_IMAGE_EXTENSIONS ใน
// api/products/[id]/media/route.ts) — ไม่เพิ่ม format ใหม่
const EXTENSION_TO_CONTENT_TYPE: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function GET(request: Request, context: RouteContext) {
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

    // getProductMediaById join product_id ในคำสั่งเดียว — ถ้า mediaId มีอยู่จริงแต่เป็นของสินค้าอื่น
    // จะได้ 404 เหมือนไม่พบเลย (เหมือน DELETE/PATCH ของ media/[mediaId]/route.ts)
    const media = getProductMediaById(productId, mediaId);

    if (!media) {
      return NextResponse.json(
        { error: `ไม่พบสื่อรหัส ${mediaId} สำหรับสินค้านี้` },
        { status: 404 }
      );
    }

    // route นี้เสิร์ฟเฉพาะรูปภาพ — วิดีโอต้องไม่ถูกเสิร์ฟผิดๆ เป็นรูปภาพจากตรงนี้
    if (media.type !== "image") {
      return NextResponse.json(
        { error: "ไม่รองรับการเสิร์ฟไฟล์วิดีโอผ่าน endpoint นี้" },
        { status: 400 }
      );
    }

    const extension = path.extname(media.fileName).toLowerCase();
    const contentType = EXTENSION_TO_CONTENT_TYPE[extension];

    if (!contentType) {
      return NextResponse.json(
        { error: "ไม่รองรับนามสกุลไฟล์นี้" },
        { status: 404 }
      );
    }

    // ไม่รับชื่อไฟล์ดิบจาก request URL เด็ดขาด — ใช้ fileName จาก DB record เท่านั้น (ผ่านการตรวจสอบ
    // แล้วว่าเป็นของ productId/mediaId นี้จริง) แล้วยืนยันอีกชั้นว่า path ที่ resolve ได้ยังอยู่ภายใน
    // product-media directory จริง กัน path traversal
    const mediaDirectory = path.resolve(
      process.cwd(),
      "public",
      "generated",
      "product-media"
    );

    const targetPath = path.resolve(mediaDirectory, media.fileName);

    if (
      targetPath !== mediaDirectory &&
      !targetPath.startsWith(mediaDirectory + path.sep)
    ) {
      return NextResponse.json({ error: "ไม่พบไฟล์สื่อ" }, { status: 400 });
    }

    let fileBuffer: Buffer;

    try {
      fileBuffer = await readFile(targetPath);
    } catch {
      return NextResponse.json({ error: "ไม่พบไฟล์สื่อ" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // ชื่อไฟล์สุ่มด้วย randomUUID() ต่อการอัปโหลด 1 ครั้งเสมอ (ดู api/products/[id]/media/route.ts)
        // เนื้อไฟล์จึงไม่มีทางเปลี่ยนแปลงได้ — cache แบบ immutable ได้อย่างปลอดภัย
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error(
      "GET /api/products/[id]/media/[mediaId]/file error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "ไม่สามารถโหลดไฟล์สื่อได้",
      },
      { status: 500 }
    );
  }
}
