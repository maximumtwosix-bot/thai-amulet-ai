import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createReview, listReviews } from "@/lib/reviews";

export const runtime = "nodejs";

// STEP 103/104 — reviews API. Deliberately unauthenticated (not listed in src/proxy.ts's protected
// paths), same as GET /api/shop/products and POST /api/shop/checkout: a storefront customer
// writing a review has no admin session. The admin "+ เพิ่มรีวิว" form on the (session-gated)
// /reviews page posts to this exact same endpoint — there is no separate "admin review" write path,
// matching the schema's single-row-shape design (see src/lib/db.ts's reviews table comment).
//
// Image handling below is copied from src/app/api/notes/upload/route.ts (itself copied from
// src/app/api/products/[id]/media/route.ts) — same 10MB limit, same allowlisted extensions, same
// magic-byte signature check that never trusts client-supplied extension/Content-Type alone. Kept
// as its own inline copy rather than a shared helper, matching this codebase's existing convention
// of not sharing this logic across upload routes (every one of notes/upload, products/[id]/media,
// transactions/[id]/attachments, orders/[id]/delivery-proofs already duplicates it independently).
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

// Returns the saved file's public URL, or null when no file was attached (image is optional).
// Throws a plain Error with a Thai message on any validation failure — the caller maps that
// straight to a 400 response, same shape as every other error in this route.
async function saveOptionalReviewImage(file: File | null): Promise<string | null> {
  if (!file) return null;

  if (!file.type.startsWith("image/")) {
    throw new Error("รองรับเฉพาะไฟล์รูปภาพเท่านั้น");
  }
  if (file.size <= 0) {
    throw new Error("ไฟล์รูปภาพว่างเปล่า");
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error("ไฟล์รูปภาพมีขนาดใหญ่เกินไป (จำกัดไม่เกิน 10MB)");
  }

  const rawExtension = path.extname(file.name).toLowerCase();

  if (rawExtension && !ALLOWED_IMAGE_EXTENSIONS.has(rawExtension)) {
    throw new Error("รองรับเฉพาะไฟล์นามสกุล .jpg, .jpeg, .png, .gif, .webp เท่านั้น");
  }

  const mimeSignatureType = MIME_TO_SIGNATURE_TYPE[file.type.split(";")[0].trim().toLowerCase()];

  if (!mimeSignatureType) {
    throw new Error("รองรับเฉพาะไฟล์รูปภาพ JPEG, PNG, GIF, WEBP เท่านั้น");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detectedSignatureType = detectImageSignatureType(buffer);

  if (!detectedSignatureType) {
    throw new Error("ไม่สามารถตรวจสอบชนิดไฟล์จากเนื้อไฟล์จริงได้ — ไฟล์อาจเสียหายหรือไม่ใช่ไฟล์รูปภาพ");
  }
  if (detectedSignatureType !== mimeSignatureType) {
    throw new Error("ชนิดไฟล์จริงไม่ตรงกับ Content-Type ที่แจ้งมา");
  }
  if (rawExtension && EXTENSION_TO_SIGNATURE_TYPE[rawExtension] !== detectedSignatureType) {
    throw new Error("ชนิดไฟล์จริงไม่ตรงกับนามสกุลไฟล์ที่ระบุ");
  }

  const safeExtension = rawExtension || signatureTypeToExtension(detectedSignatureType);

  const imageDirectory = path.join(process.cwd(), "public", "generated", "review-images");
  await mkdir(imageDirectory, { recursive: true });

  const fileName = `review-${randomUUID()}${safeExtension}`;
  await writeFile(path.join(imageDirectory, fileName), buffer);

  return `/generated/review-images/${fileName}`;
}

export async function GET() {
  try {
    return NextResponse.json(listReviews());
  } catch (error) {
    console.error("GET /api/reviews error:", error);

    return NextResponse.json({ error: "ไม่สามารถโหลดรีวิวได้" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const customerName = String(formData.get("customerName") ?? "").trim();
    const ratingRaw = formData.get("rating");
    const comment = String(formData.get("comment") ?? "").trim();
    const file = formData.get("image");

    if (!customerName) {
      return NextResponse.json({ error: "กรุณาระบุชื่อผู้รีวิว" }, { status: 400 });
    }

    const rating = Number(ratingRaw);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "กรุณาให้คะแนน 1-5 ดาว" }, { status: 400 });
    }

    let imageUrl: string | null;

    try {
      imageUrl = await saveOptionalReviewImage(file instanceof File ? file : null);
    } catch (uploadError) {
      return NextResponse.json(
        { error: uploadError instanceof Error ? uploadError.message : "ไม่สามารถอัปโหลดรูปภาพได้" },
        { status: 400 }
      );
    }

    const review = createReview({
      customerName,
      rating,
      comment: comment || null,
      imageUrl,
    });

    return NextResponse.json(review, { status: 201 });
  } catch (error) {
    console.error("POST /api/reviews error:", error);

    return NextResponse.json({ error: "ไม่สามารถบันทึกรีวิวได้" }, { status: 500 });
  }
}
