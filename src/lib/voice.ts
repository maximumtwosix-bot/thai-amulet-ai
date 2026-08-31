import OpenAI from "openai";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type GenerateVoiceResult = {
  audioUrl: string;
  fileName: string;
  filePath: string;
  size: number;
  buffer: Buffer;
};

/**
 * สร้างเสียงพากย์ (MP3) จากสคริปต์ด้วย OpenAI TTS แล้วบันทึกไฟล์ไว้ที่
 * public/generated/voice/ — logic เดียวกับที่ /api/voice ใช้เดิมทุกประการ
 * (model, voice, response_format ไม่เปลี่ยน) ย้ายมาไว้ที่นี่เพื่อให้
 * /api/voice และ /api/video/auto เรียกใช้ implementation เดียวกันได้
 */
export async function generateVoice(
  script: string
): Promise<GenerateVoiceResult> {
  const trimmedScript = String(script || "").trim();

  if (!trimmedScript) {
    throw new Error("กรุณาระบุสคริปต์สำหรับสร้างเสียงพากย์");
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("ไม่พบ OPENAI_API_KEY ใน environment variables");
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const speech = await openai.audio.speech.create({
    model: "tts-1-hd",
    voice: "alloy",
    input: trimmedScript,
    response_format: "mp3",
  });

  const audioBuffer = Buffer.from(await speech.arrayBuffer());

  const voiceDirectory = path.join(
    process.cwd(),
    "public",
    "generated",
    "voice"
  );

  await mkdir(voiceDirectory, { recursive: true });

  const fileName = `voice-${Date.now()}-${randomUUID()}.mp3`;
  const filePath = path.join(voiceDirectory, fileName);

  await writeFile(filePath, audioBuffer);

  const audioUrl = `/generated/voice/${fileName}`;

  return {
    audioUrl,
    fileName,
    filePath,
    size: audioBuffer.length,
    buffer: audioBuffer,
  };
}
