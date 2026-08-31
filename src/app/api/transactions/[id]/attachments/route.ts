import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getTransactionById } from "@/lib/transactions";
import {
  insertTransactionAttachment,
  listTransactionAttachments,
} from "@/lib/transactionAttachments";

export const runtime = "nodejs";

// STEP 21 — receipt / transfer slip upload only. No OCR, no AI extraction of any kind — the file is
// stored and displayed as-is. Security validation below (extension allowlist, MIME cross-check,
// magic-byte content verification, fail-closed) is copied exactly from the existing hardened
// pattern in src/app/api/products/[id]/media/route.ts (STEP 26.10 / STEP 27 security fixes) rather
// than re-derived, since this is the same "user-uploaded image, written to disk" attack surface.

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

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(raw: string): number | null {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const transactionId = parseId(idParam);

    if (transactionId === null) {
      return NextResponse.json(
        { success: false, error: "Invalid transaction ID" },
        { status: 400 }
      );
    }

    if (!getTransactionById(transactionId)) {
      return NextResponse.json(
        { success: false, error: "Transaction not found" },
        { status: 404 }
      );
    }

    const items = listTransactionAttachments(transactionId);

    return NextResponse.json({ success: true, data: items, count: items.length });
  } catch (error) {
    console.error("GET /api/transactions/[id]/attachments error:", error);

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const transactionId = parseId(idParam);

    if (transactionId === null) {
      return NextResponse.json(
        { success: false, error: "Invalid transaction ID" },
        { status: 400 }
      );
    }

    if (!getTransactionById(transactionId)) {
      return NextResponse.json(
        { success: false, error: "Transaction not found" },
        { status: 404 }
      );
    }

    let formData: FormData;

    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body (must be FormData)" },
        { status: 400 }
      );
    }

    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "กรุณาเลือกไฟล์" },
        { status: 400 }
      );
    }

    if (file.size <= 0) {
      return NextResponse.json(
        { success: false, error: "ไฟล์ว่างเปล่า" },
        { status: 400 }
      );
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "ไฟล์มีขนาดใหญ่เกินไป (จำกัดไม่เกิน 10MB)" },
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

    const attachmentsDirectory = path.join(
      process.cwd(),
      "public",
      "generated",
      "transaction-attachments"
    );

    await mkdir(attachmentsDirectory, { recursive: true });

    const fileName = `transaction-${transactionId}-${randomUUID()}${safeExtension}`;
    const filePath = path.join(attachmentsDirectory, fileName);

    await writeFile(filePath, buffer);

    const fileUrl = `/generated/transaction-attachments/${fileName}`;

    const attachment = insertTransactionAttachment({
      transactionId,
      fileName,
      fileUrl,
    });

    return NextResponse.json({ success: true, data: attachment }, { status: 201 });
  } catch (error) {
    console.error("POST /api/transactions/[id]/attachments error:", error);

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
