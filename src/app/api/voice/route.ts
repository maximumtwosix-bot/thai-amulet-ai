import { NextResponse } from "next/server";
import { generateVoice } from "@/lib/voice";
import { calculateEstimatedCost } from "@/lib/costConfig";
import { finalizeAiGenerationCost, recordAiGeneration } from "@/lib/costLedger";

export const runtime = "nodejs";

const VOICE_MODEL = "tts-1-hd";

export async function POST(request: Request) {
  let ledgerId: number | null = null;
  let ledgerFinalized = false;

  try {
    let body: any;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "รูปแบบคำขอไม่ถูกต้อง (ต้องเป็น JSON)" },
        { status: 400 }
      );
    }

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

    // STEP 21: productId/contentPlanId เป็น optional เสมอ — Voice Studio (Manual Workflow) เดิม
    // ไม่ได้ส่งค่านี้มาและยังทำงานได้ปกติทุกประการ (ledger แถวนั้นจะมี product_id/content_plan_id
    // เป็น NULL ตามจริง ไม่ใช่ bug) ผู้เรียกรายอื่นที่มี context ครบสามารถส่งมาเพื่อ trace ได้ละเอียดขึ้น
    const productId =
      typeof body.productId === "number" && Number.isInteger(body.productId) && body.productId > 0
        ? body.productId
        : null;

    const contentPlanId =
      typeof body.contentPlanId === "number" &&
      Number.isInteger(body.contentPlanId) &&
      body.contentPlanId > 0
        ? body.contentPlanId
        : null;

    const characterCount = script.length;

    const estimate = calculateEstimatedCost({
      provider: "openai",
      operation: "voice",
      characterCount,
    });

    const ledger = recordAiGeneration({
      productId,
      contentPlanId,
      provider: "openai",
      model: VOICE_MODEL,
      operation: "voice_generate",
      inputUnits: characterCount,
      estimatedCost: estimate.cost,
      metadata: { pricingReason: estimate.reason },
    });

    ledgerId = ledger.id;

    const voice = await generateVoice(script);

    finalizeAiGenerationCost(ledger.id, { status: "succeeded" });
    ledgerFinalized = true;

    console.log("Voice file saved:", voice.filePath);

    return new NextResponse(new Uint8Array(voice.buffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'attachment; filename="voice.mp3"',
        "Content-Length": String(voice.size),
        "Cache-Control": "no-store",
        "X-Audio-Url": voice.audioUrl,
      },
    });
  } catch (error) {
    console.error("POST /api/voice error:", error);

    if (ledgerId !== null && !ledgerFinalized) {
      finalizeAiGenerationCost(ledgerId, {
        status: "failed",
        metadataPatch: { error: error instanceof Error ? error.message : String(error) },
      });
    }

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
