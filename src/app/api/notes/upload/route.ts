import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

// เหมือนกับ src/app/api/products/[id]/media/route.ts ทุกประการ (จำกัดขนาด/นามสกุล/ตรวจ magic bytes
// จากเนื้อไฟล์จริง ไม่เชื่อ extension หรือ Content-Type ที่ client ส่งมาเพียงอย่างเดียว) — สำเนามาไว้ที่นี่
// เพราะเป็น route แยกกันคนละ feature (สมุดโน้ต ไม่ใช่สินค้า) ไม่ได้แชร์ตารางหรือ business logic ใดๆ กัน
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

type ImageSignatureType = "jpeg" | "png" | "gif" | "webp";

const EXTENSION_TO_SIGNATURE_TYPE: Record<string, ImageSignatureType> = {
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".png": "png",
  ".gif": "gif",
  ".webp": "webp",
};

const MIME_TO_SIGNATURE_TYPE: Record<string, ImageSignatureType> = {
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/pjpeg": "jpeg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

function signatureTypeToExtension(type: ImageSignatureType): string {
  switch (type) {
    case "jpeg":
      return ".jpg";
    case "png":
      return ".png";
    case "gif":
      return ".gif";
    case "webp":
      return ".webp";
    default:
      return ".jpg";
  }
}

function detectImageSignatureType(buffer: Buffer): ImageSignatureType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  if (
    buffer.length >= 6 &&
    (buffer.toString("ascii", 0, 6) === "GIF87a" || buffer.toString("ascii", 0, 6) === "GIF89a")
  ) {
    return "gif";
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }

  return null;
}

// ชื่อโฟลเดอร์มาจากผู้ใช้เอง (ช่อง "ชื่อโฟลเดอร์สำหรับโปรเจกต์" ใน Modal แทรกรูปภาพ) ใช้จัดกลุ่มไฟล์ให้
// เป็นระเบียบตามที่ตั้งชื่อไว้เท่านั้น ไม่ใช่ตัวระบุสิทธิ์การเข้าถึง — เส้นทาง /api/notes/upload เองก็ถูก
// proxy คุมด้วย session cookie อยู่แล้วเหมือนทุก endpoint ของสมุดโน้ต — ตัดอักขระที่ใช้เป็น path
// separator หรือ path traversal ออกทั้งหมด (เหลือได้แค่ 1 ระดับโฟลเดอร์เสมอ ป้องกัน ../ หรือสร้าง
// โฟลเดอร์ซ้อนนอกเจตนา) แต่ยังรองรับภาษาไทย/ตัวอักษร unicode อื่นๆ ในชื่อโฟลเดอร์ได้ตามปกติ
function sanitizeFolderName(raw: string | null): string {
  if (!raw) return "notes-unfiled";

  const cleaned = raw
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\.\./g, "")
    .slice(0, 100)
    .trim();

  return cleaned || "notes-unfiled";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const folder = sanitizeFolderName(
      typeof formData.get("folder") === "string" ? (formData.get("folder") as string) : null
    );

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "กรุณาเลือกไฟล์รูปภาพ" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ success: false, error: "รองรับเฉพาะไฟล์รูปภาพเท่านั้น" }, { status: 400 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ success: false, error: "ไฟล์รูปภาพว่างเปล่า" }, { status: 400 });
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "ไฟล์รูปภาพมีขนาดใหญ่เกินไป (จำกัดไม่เกิน 10MB)" },
        { status: 400 }
      );
    }

    const rawExtension = path.extname(file.name).toLowerCase();

    if (rawExtension && !ALLOWED_IMAGE_EXTENSIONS.has(rawExtension)) {
      return NextResponse.json(
        { success: false, error: "รองรับเฉพาะไฟล์นามสกุล .jpg, .jpeg, .png, .gif, .webp เท่านั้น" },
        { status: 400 }
      );
    }

    const mimeSignatureType =
      MIME_TO_SIGNATURE_TYPE[file.type.split(";")[0].trim().toLowerCase()];

    if (!mimeSignatureType) {
      return NextResponse.json(
        { success: false, error: "รองรับเฉพาะไฟล์รูปภาพ JPEG, PNG, GIF, WEBP เท่านั้น" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const detectedSignatureType = detectImageSignatureType(buffer);

    if (!detectedSignatureType) {
      return NextResponse.json(
        {
          success: false,
          error: "ไม่สามารถตรวจสอบชนิดไฟล์จากเนื้อไฟล์จริงได้ — ไฟล์อาจเสียหายหรือไม่ใช่ไฟล์รูปภาพ",
        },
        { status: 400 }
      );
    }

    if (detectedSignatureType !== mimeSignatureType) {
      return NextResponse.json(
        { success: false, error: "ชนิดไฟล์จริงไม่ตรงกับ Content-Type ที่แจ้งมา" },
        { status: 400 }
      );
    }

    if (rawExtension && EXTENSION_TO_SIGNATURE_TYPE[rawExtension] !== detectedSignatureType) {
      return NextResponse.json(
        { success: false, error: "ชนิดไฟล์จริงไม่ตรงกับนามสกุลไฟล์ที่ระบุ" },
        { status: 400 }
      );
    }

    const safeExtension = rawExtension || signatureTypeToExtension(detectedSignatureType);

    const uploadDirectory = path.join(process.cwd(), "public", "uploads", folder);
    await mkdir(uploadDirectory, { recursive: true });

    const fileName = `${randomUUID()}${safeExtension}`;
    await writeFile(path.join(uploadDirectory, fileName), buffer);

    return NextResponse.json({
      success: true,
      url: `/uploads/${encodeURIComponent(folder)}/${fileName}`,
    });
  } catch (error) {
    console.error("POST /api/notes/upload error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "ไม่สามารถอัปโหลดรูปภาพได้",
      },
      { status: 500 }
    );
  }
}
