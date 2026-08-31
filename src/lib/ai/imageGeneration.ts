import OpenAI from "openai";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type GenerateProductImageUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type GenerateProductImageResult = {
  imageUrl: string;
  fileName: string;
  filePath: string;
  size: number;
  // ค่าที่ OpenAI ตอบกลับมาจริงหลัง resolve "auto" แล้ว (ดู costConfig.ts/STEP 21 audit) —
  // ห้ามเดา ถ้า API ไม่ส่ง field นี้กลับมา (เช่นเปลี่ยน provider ในอนาคต) ให้เป็น null เสมอ
  quality: "low" | "medium" | "high" | null;
  usage: GenerateProductImageUsage | null;
};

/** เช็คว่ามี credential พร้อมใช้งานจริงหรือไม่ — ไม่มี side effect ไม่ยิง network request */
export function isAiImageGenerationConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * สร้างภาพสินค้าด้วย OpenAI Image API (gpt-image-1) — ใช้ OPENAI_API_KEY เดียวกับที่
 * src/lib/voice.ts และ /api/content/generate ใช้อยู่แล้ว ไม่ต้องเพิ่ม dependency ใหม่
 *
 * ห้ามคืนค่าสำเร็จปลอม: ถ้าไม่มี OPENAI_API_KEY หรือ API ไม่ส่งข้อมูลภาพกลับมา จะ throw เท่านั้น
 */
export async function generateProductImage(
  prompt: string
): Promise<GenerateProductImageResult> {
  const trimmedPrompt = String(prompt || "").trim();

  if (!trimmedPrompt) {
    throw new Error("กรุณาระบุคำอธิบายภาพสำหรับสร้างด้วย AI");
  }

  if (!isAiImageGenerationConfigured()) {
    throw new Error("ไม่พบ OPENAI_API_KEY ใน environment variables");
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt: trimmedPrompt,
    size: "1024x1024",
    n: 1,
  });

  const image = response.data?.[0];

  if (!image?.b64_json) {
    throw new Error("AI ไม่สามารถสร้างภาพได้ (ไม่มีข้อมูลภาพส่งกลับมาจาก API)");
  }

  // response.quality/response.usage คือ tier และ token usage ที่ resolve จริงหลัง "auto"
  // แล้ว (มีเฉพาะ gpt-image-1) — ห้ามเดาว่า "auto" แปลว่า tier ไหน อ่านจาก response ตรงๆ
  // เท่านั้น ถ้าไม่มีมา (เช่น field ถูกถอดออกในอนาคต) ให้เป็น null แทนการสมมติ
  const quality = response.quality ?? null;
  const usage = response.usage
    ? {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.total_tokens,
      }
    : null;

  const buffer = Buffer.from(image.b64_json, "base64");

  const directory = path.join(process.cwd(), "public", "generated", "ai-images");

  await mkdir(directory, { recursive: true });

  const fileName = `ai-image-${Date.now()}-${randomUUID()}.png`;
  const filePath = path.join(directory, fileName);

  await writeFile(filePath, buffer);

  return {
    imageUrl: `/generated/ai-images/${fileName}`,
    fileName,
    filePath,
    size: buffer.length,
    quality,
    usage,
  };
}
