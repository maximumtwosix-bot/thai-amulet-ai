import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { calculateEstimatedCost } from "@/lib/costConfig";
import { finalizeAiGenerationCost, recordAiGeneration } from "@/lib/costLedger";
import {
  isValidSalesChannel,
  isValidTransactionCategory,
  isValidTransactionType,
} from "@/lib/transactions";

export const runtime = "nodejs";

// STEP 29 — AI slip/receipt extraction. Authentication is already enforced by src/proxy.ts
// (isProtectedApi() matches "/api/transactions" and every "/api/transactions/*" prefix, which
// covers this route without any proxy.ts change).
//
// This endpoint ONLY reads an image and returns a suggestion — it never creates a transaction.
// A transaction is created later, only via the existing, unmodified POST /api/transactions, after
// the authenticated user explicitly reviews/edits the suggestion and clicks "ยืนยันและบันทึก" in the
// UI. The evidence image saved here is a *preview* copy (public/generated/ai-slip-previews/),
// deliberately kept separate from public/generated/transaction-attachments/ (STEP 21) — that
// directory's files are always 1:1 with a transaction_attachments row, and a slip the user never
// confirms must not pollute it. On confirm, the browser re-submits the same File object the user
// already picked to the existing, unmodified POST /api/transactions/[id]/attachments endpoint,
// which writes the real evidence copy exactly like every other transaction attachment — no new
// attachment-linking mechanism, no duplicate attachment system.
//
// Image validation below (extension allowlist, MIME cross-check, magic-byte content verification,
// fail-closed) is copied exactly from the existing hardened pattern in
// src/app/api/transactions/[id]/attachments/route.ts (itself copied from
// src/app/api/products/[id]/media/route.ts) — same "user-uploaded image, written to disk" attack
// surface, same convention of duplicating this block per-route rather than sharing a module.

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

const SIGNATURE_TYPE_TO_MIME: Record<ImageSignatureType, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
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

// gpt-5-mini — same text model already used by /api/content/generate (STEP 20/23), confirmed
// vision-capable (input modalities: text, image) via developers.openai.com/api/docs/models/gpt-5-mini
// (checked 2026-09-01). No new AI provider/model was installed for this feature.
const VISION_MODEL = "gpt-5-mini";

const DOCUMENT_TYPES = [
  "customer_payment_slip",
  "product_purchase_slip",
  "shipping_payment_receipt",
  "cod_shipping_expense_receipt",
  "advertising_expense_receipt",
  "packaging_material_receipt",
  "other_business_expense_receipt",
] as const;

type DocumentType = (typeof DOCUMENT_TYPES)[number];

function isValidDocumentType(value: unknown): value is DocumentType {
  return typeof value === "string" && (DOCUMENT_TYPES as readonly string[]).includes(value);
}

type ExtractionResult = {
  documentType: DocumentType | null;
  transactionType: "income" | "expense" | null;
  transactionDate: string | null;
  amount: number | null;
  payerName: string | null;
  recipientName: string | null;
  bankOrProvider: string | null;
  referenceNumber: string | null;
  description: string | null;
  suggestedCategory: string | null;
  suggestedSalesChannel: string | null;
  confidence: number | null;
  fieldsNeedingReview: string[];
  needsReview: boolean;
};

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// AI output is untrusted input — every field is independently re-validated here against the same
// enums/rules the rest of the app already enforces (src/lib/transactions.ts). Nothing the model
// says is trusted at face value; anything that fails validation becomes null and is added to
// fieldsNeedingReview instead of being silently passed through or guessed at.
function validateExtraction(raw: unknown): ExtractionResult {
  const review = new Set<string>();
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const documentType = isValidDocumentType(source.documentType) ? source.documentType : null;
  if (source.documentType && documentType === null) review.add("documentType");

  const transactionType = isValidTransactionType(String(source.transactionType ?? ""))
    ? (source.transactionType as "income" | "expense")
    : null;
  if (source.transactionType && transactionType === null) review.add("transactionType");
  if (transactionType === null) review.add("transactionType");

  const rawDate = cleanString(source.transactionDate);
  const transactionDate =
    rawDate && !Number.isNaN(Date.parse(rawDate)) ? rawDate : null;
  if (rawDate && transactionDate === null) review.add("transactionDate");
  if (transactionDate === null) review.add("transactionDate");

  const rawAmount = source.amount;
  const numericAmount =
    typeof rawAmount === "number"
      ? rawAmount
      : typeof rawAmount === "string" && rawAmount.trim() !== ""
        ? Number(rawAmount)
        : NaN;
  const amount = Number.isFinite(numericAmount) && numericAmount > 0 ? numericAmount : null;
  if (rawAmount !== null && rawAmount !== undefined && amount === null) review.add("amount");
  if (amount === null) review.add("amount");

  const payerName = cleanString(source.payerName);
  const recipientName = cleanString(source.recipientName);
  const bankOrProvider = cleanString(source.bankOrProvider);
  const referenceNumber = cleanString(source.referenceNumber);
  const description = cleanString(source.description);

  const rawCategory = cleanString(source.suggestedCategory);
  let suggestedCategory: string | null = null;
  if (rawCategory && transactionType) {
    if (isValidTransactionCategory(transactionType, rawCategory)) {
      suggestedCategory = rawCategory;
    } else {
      review.add("suggestedCategory");
    }
  } else if (rawCategory) {
    // ยังไม่รู้ transactionType ที่ยืนยันได้ — บอกไม่ได้ว่า category ที่ AI แนะนำถูกต้องหรือไม่
    review.add("suggestedCategory");
  }

  const rawChannel = cleanString(source.suggestedSalesChannel);
  const suggestedSalesChannel =
    rawChannel && isValidSalesChannel(rawChannel) ? rawChannel : null;
  if (rawChannel && suggestedSalesChannel === null) review.add("suggestedSalesChannel");

  const rawConfidence = source.confidence;
  const numericConfidence = typeof rawConfidence === "number" ? rawConfidence : NaN;
  const confidence =
    Number.isFinite(numericConfidence) && numericConfidence >= 0 && numericConfidence <= 1
      ? numericConfidence
      : null;

  if (Array.isArray(source.fieldsNeedingReview)) {
    for (const item of source.fieldsNeedingReview) {
      if (typeof item === "string" && item.trim()) review.add(item.trim());
    }
  }

  const needsReview =
    confidence === null || confidence < 0.6 || review.size > 0;

  return {
    documentType,
    transactionType,
    transactionDate,
    amount,
    payerName,
    recipientName,
    bankOrProvider,
    referenceNumber,
    description,
    suggestedCategory,
    suggestedSalesChannel,
    confidence,
    fieldsNeedingReview: Array.from(review),
    needsReview,
  };
}

function buildPrompt(): string {
  return [
    "คุณคือผู้ช่วยอ่านสลิปโอนเงิน/ใบเสร็จ/บิลสำหรับระบบบัญชีร้าน THAI AMULET TH",
    "หน้าที่ของคุณคืออ่านข้อมูลจากภาพเท่านั้น ห้ามแต่งข้อมูลที่มองไม่เห็นในภาพขึ้นมาเอง",
    "",
    "กฎสำคัญ:",
    "- ถ้าอ่านค่าใดไม่ได้ชัดเจน ให้ใส่ null สำหรับค่านั้น ห้ามเดา",
    "- ห้ามคำนวณภาษี, VAT, อัตราภาษี, ค่าลดหย่อน หรือข้อสรุปทางกฎหมาย/ภาษีใดๆ ทั้งสิ้น",
    "- ห้ามสรุปว่าเอกสารนี้ถูกต้องตามกฎหมายหรือไม่",
    "- amount ต้องเป็นตัวเลขล้วน (จำนวนเงินสุทธิที่เห็นในสลิป/บิล) ไม่ใส่หน่วยเงินหรือคอมมา",
    "- transactionDate ให้ตอบเป็นรูปแบบ YYYY-MM-DD ถ้าอ่านปีพ.ศ.ได้ให้แปลงเป็น ค.ศ. ก่อนตอบ",
    "- confidence คือค่าความมั่นใจโดยรวมของคุณ เป็นตัวเลข 0 ถึง 1",
    "- fieldsNeedingReview คือรายชื่อ field (ภาษาอังกฤษ ตรงกับชื่อ key ด้านล่าง) ที่คุณอ่านได้ไม่ชัด/ไม่มั่นใจ",
    "",
    "documentType ต้องเป็นค่าใดค่าหนึ่งในนี้เท่านั้น (หรือ null ถ้าไม่แน่ใจ):",
    DOCUMENT_TYPES.join(", "),
    "",
    "transactionType ต้องเป็น \"income\" (ลูกค้าโอนเงินเข้ามา) หรือ \"expense\" (ร้านจ่ายเงินออก) หรือ null",
    "",
    "ตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่นนอกเหนือจาก JSON ตามโครงสร้างนี้:",
    JSON.stringify(
      {
        documentType: null,
        transactionType: null,
        transactionDate: null,
        amount: null,
        payerName: null,
        recipientName: null,
        bankOrProvider: null,
        referenceNumber: null,
        description: null,
        suggestedCategory: null,
        suggestedSalesChannel: null,
        confidence: null,
        fieldsNeedingReview: [],
      },
      null,
      2
    ),
  ].join("\n");
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

    // เก็บสำเนาต้นฉบับไว้ก่อนเรียก AI เสมอ — ไม่ว่า AI จะอ่านสำเร็จหรือไม่ ไฟล์นี้จะไม่ถูกลบ/เขียนทับ
    const previewDirectory = path.join(process.cwd(), "public", "generated", "ai-slip-previews");

    await mkdir(previewDirectory, { recursive: true });

    const fileName = `ai-slip-${Date.now()}-${randomUUID()}${safeExtension}`;
    const filePath = path.join(previewDirectory, fileName);

    await writeFile(filePath, buffer);

    const fileUrl = `/generated/ai-slip-previews/${fileName}`;
    const attachment = { fileName, fileUrl };

    if (!process.env.OPENAI_API_KEY) {
      // ไม่ throw raw error ออกไป — แค่บอกว่าอ่านด้วย AI ไม่ได้ ให้กรอกเองแทน หลักฐานยังอยู่ครบ
      return NextResponse.json({
        success: true,
        data: { attachment, extraction: null, aiError: "ระบบ AI ยังไม่พร้อมใช้งาน กรุณากรอกข้อมูลด้วยตนเอง" },
      });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const ledger = recordAiGeneration({
      provider: "openai",
      model: VISION_MODEL,
      operation: "text_generate",
      metadata: { feature: "ai_slip_extract" },
    });

    let ledgerFinalized = false;

    try {
      const dataUrl = `data:${SIGNATURE_TYPE_TO_MIME[detectedSignatureType]};base64,${buffer.toString("base64")}`;

      const response = await openai.responses.create({
        model: VISION_MODEL,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: buildPrompt() },
              { type: "input_image", image_url: dataUrl, detail: "auto" },
            ],
          },
        ],
      });

      const usage = {
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
      };

      const estimate = calculateEstimatedCost({
        provider: "openai",
        operation: "text",
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });

      let parsed: unknown;

      try {
        parsed = JSON.parse(response.output_text);
      } catch {
        finalizeAiGenerationCost(ledger.id, {
          status: "failed",
          inputUnits: usage.inputTokens,
          outputUnits: usage.outputTokens,
          estimatedCost: estimate.cost,
          metadataPatch: { error: "AI ส่งข้อมูลกลับมาไม่ใช่ JSON", pricingReason: estimate.reason },
        });
        ledgerFinalized = true;

        return NextResponse.json({
          success: true,
          data: {
            attachment,
            extraction: null,
            aiError: "AI อ่านสลิปไม่สำเร็จ กรุณากรอกข้อมูลด้วยตนเอง",
          },
        });
      }

      const extraction = validateExtraction(parsed);

      finalizeAiGenerationCost(ledger.id, {
        status: "succeeded",
        inputUnits: usage.inputTokens,
        outputUnits: usage.outputTokens,
        estimatedCost: estimate.cost,
        metadataPatch: { pricingReason: estimate.reason },
      });
      ledgerFinalized = true;

      return NextResponse.json({ success: true, data: { attachment, extraction } });
    } catch (aiError) {
      // ไม่ log ตัว error object ดิบ (อาจมี request/response payload ปนอยู่) — log เฉพาะข้อความ
      console.error(
        "POST /api/transactions/ai-extract — AI call failed:",
        aiError instanceof Error ? aiError.message : "unknown error"
      );

      if (!ledgerFinalized) {
        finalizeAiGenerationCost(ledger.id, {
          status: "failed",
          metadataPatch: { error: "ai_call_failed" },
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          attachment,
          extraction: null,
          aiError: "AI อ่านสลิปไม่สำเร็จ กรุณากรอกข้อมูลด้วยตนเอง",
        },
      });
    }
  } catch (error) {
    console.error(
      "POST /api/transactions/ai-extract error:",
      error instanceof Error ? error.message : "unknown error"
    );

    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// ตรรกะเดียวกับ isSafeGeneratedPath ใน transaction-attachments/[attachmentId]/route.ts แต่เข้มงวด
// กว่า — ต้องขึ้นต้นด้วย "/generated/ai-slip-previews/" เท่านั้น (ไม่ใช่ "/generated/" เฉยๆ) เพื่อไม่
// ให้ endpoint นี้ถูกใช้ลบไฟล์หลักฐานจริงใน transaction-attachments/ หรือไฟล์อื่นใดใน public/generated/
// ได้เลยไม่ว่ากรณีใด — โครงสร้าง path เองเป็นตัวบังคับ ไม่ใช่แค่ intent
function isSafeAiSlipPreviewPath(url: string): boolean {
  if (!url || !url.startsWith("/")) {
    return false;
  }

  const cleanUrl = decodeURIComponent(url.split("?")[0]);

  return !cleanUrl.includes("..") && cleanUrl.startsWith("/generated/ai-slip-previews/");
}

// STEP 82 — best-effort cleanup for the preview copy written by POST above (public/generated/
// ai-slip-previews/), called by the client (src/app/finance/page.tsx's resetAiSession()) at the two
// points a preview is known to no longer be needed: the user abandons it (explicit cancel, or picks
// a different file before ever confirming) or a transaction was confirmed and the real evidence copy
// was successfully re-uploaded to transaction-attachments/ (making this preview a redundant
// duplicate). Deliberately narrow: accepts only a fileUrl scoped to ai-slip-previews/ (see
// isSafeAiSlipPreviewPath above) — cannot be used to delete anything in transaction-attachments/ or
// any other file under public/. Failure here is swallowed (unlink().catch()) — this must never be
// able to affect a transaction that was already successfully created and attached.
export async function DELETE(request: NextRequest) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body (must be JSON)" },
        { status: 400 }
      );
    }

    const b = body as Record<string, unknown> | null | undefined;
    const fileUrl = typeof b?.fileUrl === "string" ? b.fileUrl : "";

    if (!fileUrl || !isSafeAiSlipPreviewPath(fileUrl)) {
      return NextResponse.json(
        { success: false, error: "Invalid or unsafe fileUrl" },
        { status: 400 }
      );
    }

    const filePath = path.join(process.cwd(), "public", fileUrl.replace(/^\/+/, ""));

    await unlink(filePath).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      "DELETE /api/transactions/ai-extract error:",
      error instanceof Error ? error.message : "unknown error"
    );

    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
