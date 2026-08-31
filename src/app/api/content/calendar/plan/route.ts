import { NextResponse } from "next/server";
import db from "@/lib/db";
import {
  CONTENT_INTELLIGENCE_MODEL,
  generateWeeklyContentPlan,
  isContentIntelligenceConfigured,
  type WeeklyPlanProductInput,
} from "@/lib/contentIntelligence";
import type { SocialPlatform } from "@/lib/socialContent";
import { calculateEstimatedCost } from "@/lib/costConfig";
import { finalizeAiGenerationCost, recordAiGeneration } from "@/lib/costLedger";

export const runtime = "nodejs";

const MAX_DAYS = 14;
const MAX_POSTS_PER_DAY = 5;
const VALID_PLATFORMS: SocialPlatform[] = ["facebook", "reels", "instagram", "tiktok"];
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

type PlanRequest = {
  productIds?: number[] | "all";
  days?: number;
  postsPerDay?: number;
  platforms?: string[];
  startDate?: string;
  preferredTimes?: string[];
};

type Product = {
  id: number;
  name: string;
  category: string | null;
};

// POST /api/content/calendar/plan — AI เสนอ "โครง" ปฏิทินหลายวัน — ไม่บันทึกลง DB ที่นี่เลย
// (ต้อง preview ก่อนเสมอ) ผู้ใช้ยืนยันแล้วค่อยยิง POST /api/content/calendar ทีละรายการ
export async function POST(request: Request) {
  try {
    let body: PlanRequest;

    try {
      body = (await request.json()) as PlanRequest;
    } catch {
      return NextResponse.json(
        { error: "รูปแบบคำขอไม่ถูกต้อง (ต้องเป็น JSON)" },
        { status: 400 }
      );
    }

    const days = Number(body.days ?? 7);

    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
      return NextResponse.json(
        { error: `days ต้องอยู่ระหว่าง 1-${MAX_DAYS}` },
        { status: 400 }
      );
    }

    const postsPerDay = Number(body.postsPerDay ?? 1);

    if (!Number.isInteger(postsPerDay) || postsPerDay < 1 || postsPerDay > MAX_POSTS_PER_DAY) {
      return NextResponse.json(
        { error: `postsPerDay ต้องอยู่ระหว่าง 1-${MAX_POSTS_PER_DAY}` },
        { status: 400 }
      );
    }

    if (days * postsPerDay > 30) {
      return NextResponse.json(
        { error: "จำนวนรายการรวมต้องไม่เกิน 30 รายการต่อการวางแผนหนึ่งครั้ง" },
        { status: 400 }
      );
    }

    const platformsRaw = Array.isArray(body.platforms) ? body.platforms : [];

    if (platformsRaw.length === 0) {
      return NextResponse.json({ error: "กรุณาระบุ platforms อย่างน้อย 1 รายการ" }, { status: 400 });
    }

    const invalidPlatform = platformsRaw.find(
      (p) => typeof p !== "string" || !(VALID_PLATFORMS as string[]).includes(p)
    );

    if (invalidPlatform !== undefined) {
      return NextResponse.json({ error: `platform ไม่ถูกต้อง: ${String(invalidPlatform)}` }, { status: 400 });
    }

    const platforms = platformsRaw as SocialPlatform[];

    const startDateRaw = String(body.startDate || "").trim();
    const startDate = startDateRaw ? new Date(startDateRaw) : new Date();

    if (Number.isNaN(startDate.getTime())) {
      return NextResponse.json({ error: "startDate ไม่ถูกต้อง" }, { status: 400 });
    }

    const preferredTimesRaw = Array.isArray(body.preferredTimes) ? body.preferredTimes : ["10:00"];

    const invalidTime = preferredTimesRaw.find(
      (t) => typeof t !== "string" || !TIME_PATTERN.test(t)
    );

    if (invalidTime !== undefined) {
      return NextResponse.json(
        { error: `รูปแบบเวลาไม่ถูกต้อง (ต้องเป็น HH:mm): ${String(invalidTime)}` },
        { status: 400 }
      );
    }

    const preferredTimes = preferredTimesRaw as string[];

    if (!isContentIntelligenceConfigured()) {
      return NextResponse.json(
        {
          success: false,
          status: "not_configured",
          error: "ยังไม่ได้ตั้งค่า OPENAI_API_KEY สำหรับ Content Intelligence",
        },
        { status: 503 }
      );
    }

    let products: Product[];

    if (body.productIds === "all" || !body.productIds) {
      products = db
        .prepare("SELECT id, name, category FROM products WHERE status = 'active'")
        .all() as Product[];
    } else {
      if (!Array.isArray(body.productIds) || body.productIds.length === 0) {
        return NextResponse.json({ error: "productIds ไม่ถูกต้อง" }, { status: 400 });
      }

      const ids = body.productIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0);

      if (ids.length === 0) {
        return NextResponse.json({ error: "productIds ไม่ถูกต้อง" }, { status: 400 });
      }

      const placeholders = ids.map(() => "?").join(",");

      products = db
        .prepare(`SELECT id, name, category FROM products WHERE id IN (${placeholders})`)
        .all(...ids) as Product[];
    }

    if (products.length === 0) {
      return NextResponse.json({ error: "ไม่พบสินค้าที่ระบุ" }, { status: 404 });
    }

    const weeklyProducts: WeeklyPlanProductInput[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
    }));

    // STEP 21: weekly planner ครอบคลุมหลายสินค้าในคำขอเดียว จึงไม่มี product_id เดียวให้ผูก —
    // ปล่อย NULL ตามจริง (ไม่เดา/ไม่เลือกสินค้าใดสินค้าหนึ่งมาแทน) ยังนับรวมใน cost summary รวมได้ปกติ
    const ledger = recordAiGeneration({
      provider: "openai",
      model: CONTENT_INTELLIGENCE_MODEL,
      operation: "weekly_plan_generate",
      metadata: { productCount: weeklyProducts.length, days, postsPerDay, platforms },
    });

    try {
      const { slots, usage, model } = await generateWeeklyContentPlan({
        products: weeklyProducts,
        days,
        postsPerDay,
        platforms,
        startDateIso: startDate.toISOString(),
        preferredTimes,
      });

      const estimate = calculateEstimatedCost({
        provider: "openai",
        operation: "text",
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });

      finalizeAiGenerationCost(ledger.id, {
        status: "succeeded",
        outputUnits: usage.outputTokens,
        estimatedCost: estimate.cost,
        metadataPatch: { model, pricingReason: estimate.reason, slotCount: slots.length },
      });

      return NextResponse.json({
        success: true,
        slots,
        message: `AI เสนอแผน ${slots.length} รายการ — ยังไม่ได้บันทึก กรุณาตรวจสอบก่อนยืนยัน`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "ไม่สามารถวางแผน Content Calendar ได้";

      finalizeAiGenerationCost(ledger.id, {
        status: "failed",
        metadataPatch: { error: message },
      });

      console.error("POST /api/content/calendar/plan error:", error);

      return NextResponse.json(
        {
          success: false,
          status: "error",
          error: message,
        },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error("POST /api/content/calendar/plan error:", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ไม่สามารถวางแผน Content Calendar ได้" },
      { status: 500 }
    );
  }
}
