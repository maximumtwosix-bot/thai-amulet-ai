import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { createTaxDocument, getTaxDocumentByHash, listTaxDocuments } from "@/lib/taxDocuments";

export const runtime = "nodejs";

// STEP 100 — Tax Document upload/list. Security validation below (extension allowlist, MIME
// cross-check, magic-byte content verification, fail-closed) extends the exact hardened pattern
// already proven in src/app/api/transactions/[id]/attachments/route.ts and
// src/app/api/products/[id]/media/route.ts to the additional formats these evidence documents
// actually arrive in (PDF/CSV/XLSX, per the STEP 97.2/99 audits' own findings) — duplicated here
// rather than shared, matching this codebase's established per-route convention for this exact
// validation block.
//
// Explicitly OUT of scope for this STEP (approved): ZIP is NOT an accepted extension here — the
// STEP 99 audit's own zip-slip/decompression-bomb security design has not been built yet, and
// accepting ZIP uploads without it would be exactly the risk that audit flagged. No AI/OCR
// extraction call is made anywhere in this file — a document is stored and hashed only; its
// review_status always starts 'UPLOADED'.

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

type SignatureType = "jpeg" | "png" | "gif" | "webp" | "pdf" | "xlsx" | "csv";

const ALLOWED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".pdf",
  ".csv",
  ".xlsx",
]);

const EXTENSION_TO_SIGNATURE_TYPE: Record<string, SignatureType> = {
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".png": "png",
  ".gif": "gif",
  ".webp": "webp",
  ".pdf": "pdf",
  ".xlsx": "xlsx",
  ".csv": "csv",
};

const MIME_TO_SIGNATURE_TYPE: Record<string, SignatureType> = {
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/pjpeg": "jpeg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "application/vnd.ms-excel": "csv",
  "text/plain": "csv",
};

// Magic-byte content sniffing, extended from the existing image-only detector
// (src/app/api/transactions/[id]/attachments/route.ts) to also recognize PDF and XLSX (both have
// real, checkable binary signatures). CSV has no binary signature at all (it's plain text) — it is
// instead validated by a printable-text heuristic, applied only when the claimed type is csv.
function detectBinarySignatureType(buffer: Buffer): SignatureType | null {
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

  if (buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "%PDF") {
    return "pdf";
  }

  // XLSX is a ZIP-based container (Open Packaging Convention) — same leading signature as a plain
  // ZIP. This file NEVER opens/extracts the archive (that remains explicitly out of scope, per the
  // STEP 99 audit) — it is stored and hashed as an opaque blob, exactly like every other format
  // here, so recognizing the signature for content-sniffing purposes carries none of the
  // extraction risk a real ZIP-open would.
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return "xlsx";
  }

  return null;
}

// CSV has no binary signature — validated instead as printable text: must decode without the
// UTF-8 replacement character and must not contain NUL bytes (a strong signal of a mislabeled
// binary file). This is intentionally a light heuristic, not a CSV structure parser — actual
// parsing/extraction is explicitly out of this STEP's scope.
function looksLikeText(buffer: Buffer): boolean {
  if (buffer.includes(0x00)) return false;

  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));

  return !sample.toString("utf8").includes("�");
}

function parseId(idParam: string): number | null {
  const id = Number(idParam);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

function errorToResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";

  const notFoundMessages: Record<string, string> = {
    TAXPAYER_PROFILE_NOT_FOUND: "Taxpayer profile not found",
    TAX_PERIOD_NOT_FOUND: "Tax period not found",
    TRANSACTION_NOT_FOUND: "Transaction not found",
  };

  if (message in notFoundMessages) {
    return NextResponse.json({ success: false, error: notFoundMessages[message] }, { status: 404 });
  }

  const badRequestMessages: Record<string, string> = {
    INVALID_TAXPAYER_PROFILE_ID: "กรุณาระบุ taxpayerProfileId ที่ถูกต้อง",
    INVALID_ID: "ID ที่อ้างอิงไม่ถูกต้อง",
    INVALID_DOCUMENT_TYPE: "documentType ไม่ถูกต้อง",
    INVALID_DOCUMENT_SOURCE: "source ไม่ถูกต้อง",
    INVALID_ORIGINAL_FILENAME: "ไม่พบชื่อไฟล์ต้นฉบับ",
    INVALID_FILE_NAME: "เกิดข้อผิดพลาดในการตั้งชื่อไฟล์",
    INVALID_FILE_URL: "เกิดข้อผิดพลาดในการบันทึกที่อยู่ไฟล์",
    INVALID_FILE_HASH: "เกิดข้อผิดพลาดในการคำนวณ hash ไฟล์",
    INVALID_MIME_TYPE: "ไม่พบชนิดไฟล์",
    INVALID_FILE_EXTENSION: "ไม่พบนามสกุลไฟล์",
    INVALID_FILE_SIZE: "ขนาดไฟล์ไม่ถูกต้อง",
    INVALID_DOCUMENT_DATE: "document_date ไม่ใช่วันที่ที่ถูกต้อง",
    INVALID_STATEMENT_PERIOD_FROM: "statement_period_from ไม่ใช่วันที่ที่ถูกต้อง",
    INVALID_STATEMENT_PERIOD_TO: "statement_period_to ไม่ใช่วันที่ที่ถูกต้อง",
    INVALID_STATEMENT_PERIOD_RANGE: "statement_period_from ต้องไม่มากกว่า statement_period_to",
  };

  if (message in badRequestMessages) {
    return NextResponse.json({ success: false, error: badRequestMessages[message] }, { status: 400 });
  }

  if (message === "DUPLICATE_DOCUMENT_HASH") {
    return NextResponse.json(
      { success: false, error: "ไฟล์นี้มีอยู่ในระบบแล้ว (ไฟล์เดียวกันทุกประการ)" },
      { status: 409 }
    );
  }

  console.error("Tax documents API error:", error);

  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    function optionalId(name: string): number | undefined {
      const raw = searchParams.get(name);
      if (raw === null || raw === "") return undefined;

      const parsed = parseId(raw);
      if (parsed === null) throw new Error(`INVALID_${name.toUpperCase()}_PARAM`);

      return parsed;
    }

    let taxpayerProfileId: number | undefined;
    let taxPeriodId: number | undefined;
    let transactionId: number | undefined;

    try {
      taxpayerProfileId = optionalId("taxpayerProfileId");
      taxPeriodId = optionalId("taxPeriodId");
      transactionId = optionalId("transactionId");
    } catch {
      return NextResponse.json({ success: false, error: "Invalid filter parameter" }, { status: 400 });
    }

    const documents = listTaxDocuments({
      taxpayerProfileId,
      taxPeriodId,
      transactionId,
      documentType: searchParams.get("documentType") || undefined,
      reviewStatus: searchParams.get("reviewStatus") || undefined,
      unlinkedOnly: searchParams.get("unlinkedOnly") === "true",
    });

    return NextResponse.json({ success: true, data: documents, count: documents.length });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
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
      return NextResponse.json({ success: false, error: "กรุณาเลือกไฟล์" }, { status: 400 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ success: false, error: "ไฟล์ว่างเปล่า" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "ไฟล์มีขนาดใหญ่เกินไป (จำกัดไม่เกิน 10MB)" },
        { status: 400 }
      );
    }

    const rawExtension = path.extname(file.name).toLowerCase();

    if (!rawExtension || !ALLOWED_EXTENSIONS.has(rawExtension)) {
      return NextResponse.json(
        {
          success: false,
          error: "รองรับเฉพาะไฟล์นามสกุล .jpg, .jpeg, .png, .gif, .webp, .pdf, .csv, .xlsx เท่านั้น",
        },
        { status: 400 }
      );
    }

    const claimedMimeSignature = MIME_TO_SIGNATURE_TYPE[file.type.split(";")[0].trim().toLowerCase()];

    if (!claimedMimeSignature) {
      return NextResponse.json(
        { success: false, error: "ไม่รองรับชนิดไฟล์ (Content-Type) นี้" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const expectedType = EXTENSION_TO_SIGNATURE_TYPE[rawExtension];

    let detectedType: SignatureType | null;

    if (expectedType === "csv") {
      detectedType = looksLikeText(buffer) ? "csv" : null;
    } else {
      detectedType = detectBinarySignatureType(buffer);
    }

    if (!detectedType) {
      return NextResponse.json(
        {
          success: false,
          error: "ไม่สามารถตรวจสอบชนิดไฟล์จากเนื้อไฟล์จริงได้ — ไฟล์อาจเสียหายหรือไม่ตรงกับนามสกุล",
        },
        { status: 400 }
      );
    }

    if (detectedType !== expectedType || detectedType !== claimedMimeSignature) {
      return NextResponse.json(
        { success: false, error: "ชนิดไฟล์จริงไม่ตรงกับนามสกุลไฟล์หรือ Content-Type ที่ระบุ" },
        { status: 400 }
      );
    }

    const b = formData;

    function optionalField(name: string): string | null {
      const value = b.get(name);
      return typeof value === "string" && value.trim() ? value.trim() : null;
    }

    const taxpayerProfileIdRaw = b.get("taxpayerProfileId");

    if (typeof taxpayerProfileIdRaw !== "string" || !taxpayerProfileIdRaw.trim()) {
      return NextResponse.json(
        { success: false, error: "กรุณาระบุ taxpayerProfileId" },
        { status: 400 }
      );
    }

    const fileHash = createHash("sha256").update(buffer).digest("hex");

    // STEP 100 — checked here, BEFORE any file I/O, not just inside createTaxDocument(). Found
    // during this STEP's own live testing: without this early check, a rejected duplicate upload
    // still wrote its file to disk (the DAL-level unique-constraint guard only stops the DB row,
    // since this route would otherwise write the file first) — an orphaned file with no database
    // record. Same fix already applied to the transaction-attachments route in STEP 96. The
    // DAL-level check remains the authoritative, race-free enforcement; this only avoids the
    // wasted/orphaned disk write on the common path.
    const taxpayerProfileIdForDedupCheck = Number(taxpayerProfileIdRaw);

    if (
      Number.isInteger(taxpayerProfileIdForDedupCheck) &&
      taxpayerProfileIdForDedupCheck > 0 &&
      getTaxDocumentByHash(taxpayerProfileIdForDedupCheck, fileHash)
    ) {
      return NextResponse.json(
        { success: false, error: "ไฟล์นี้มีอยู่ในระบบแล้ว (ไฟล์เดียวกันทุกประการ)" },
        { status: 409 }
      );
    }

    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");

    const uploadDirectory = path.join(
      process.cwd(),
      "public",
      "generated",
      "tax-documents",
      year,
      month
    );

    await mkdir(uploadDirectory, { recursive: true });

    const fileName = `tax-doc-${Date.now()}-${randomUUID()}${rawExtension}`;
    const filePath = path.join(uploadDirectory, fileName);

    await writeFile(filePath, buffer);

    const fileUrl = `/generated/tax-documents/${year}/${month}/${fileName}`;

    const document = createTaxDocument({
      taxpayerProfileId: Number(taxpayerProfileIdRaw),
      taxPeriodId: optionalField("taxPeriodId") ? Number(optionalField("taxPeriodId")) : null,
      transactionId: optionalField("transactionId") ? Number(optionalField("transactionId")) : null,
      documentType: optionalField("documentType"),
      source: optionalField("source"),
      originalFilename: file.name,
      fileName,
      fileUrl,
      fileHash,
      mimeType: file.type.split(";")[0].trim().toLowerCase(),
      fileExtension: rawExtension,
      fileSizeBytes: file.size,
      documentDate: optionalField("documentDate"),
      statementPeriodFrom: optionalField("statementPeriodFrom"),
      statementPeriodTo: optionalField("statementPeriodTo"),
      note: optionalField("note"),
    });

    return NextResponse.json({ success: true, data: document }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
