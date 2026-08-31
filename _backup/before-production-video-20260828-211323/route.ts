import OpenAI from "openai";
import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const script = String(body.script || "").trim();

    if (!script) {
      return NextResponse.json(
        { error: "กรุณาระบุสคริปต์สำหรับสร้างเสียงพากย์" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "ไม่พบ OPENAI_API_KEY ใน environment variables" },
        { status: 500 }
      );
    }

    const speech = await openai.audio.speech.create({
      model: "tts-1-hd",
      voice: "alloy",
      input: script,
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

    console.log("Voice file saved:", filePath);

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'attachment; filename="voice.mp3"',
        "Content-Length": String(audioBuffer.length),
        "Cache-Control": "no-store",
        "X-Audio-Url": audioUrl,
      },
    });
  } catch (error) {
    console.error("POST /api/voice error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "ไม่สามารถสร้างเสียงพากย์ได้",
      },
      { status: 500 }
    );
  }
}
