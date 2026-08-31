import { NextResponse } from "next/server";
import db from "@/lib/db";
import {
  CONTENT_INTELLIGENCE_MODEL,
  generateContentPlans,
  isContentIntelligenceConfigured,
  type ContentIntelligenceProduct,
} from "@/lib/contentIntelligence";
import {
  insertContentPlan,
  isValidContentPlanAngle,
  isValidContentPlanType,
  listContentPlans,
  type ContentPlanAngle,
  type ContentPlanRow,
  type ContentPlanStatus,
  type ContentPlanType,
} from "@/lib/contentPlans";
import { calculateEstimatedCost } from "@/lib/costConfig";
import {
  finalizeAiGenerationCost,
  linkLedgerToContentPlan,
  recordAiGeneration,
} from "@/lib/costLedger";

export const runtime = "nodejs";

const MAX_COUNT = 5;
const MIN_COUNT = 1;

type Product = {
  id: number;
  name: string;
  model: string | null;
  master: string | null;
  year: string | null;
  description: string | null;
  price: number;
  stock: number;
  category: string | null;
};

type PlanRequest = {
  productId?: number;
  count?: number;
  contentType?: string;
  angles?: string[] | string;
};

const VALID_STATUSES: ContentPlanStatus[] = ["draft", "ready", "archived"];

function isValidStatus(value: string): value is ContentPlanStatus {
  return (VALID_STATUSES as string[]).includes(value);
}

// POST /api/content/plan — ให้ AI วิเคราะห์สินค้าจริงแล้วสร้าง Content Plan หลายมุมพร้อมกัน
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

    const productId = Number(body.productId || 0);

    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json(
        { error: "กรุณาระบุรหัสสินค้าให้ถูกต้อง" },
        { status: 400 }
      );
    }

    const count = Number(body.count ?? 1);

    if (!Number.isInteger(count) || count < MIN_COUNT || count > MAX_COUNT) {
      return NextResponse.json(
        { error: `จำนวน Content ต้องอยู่ระหว่าง ${MIN_COUNT}-${MAX_COUNT}` },
        { status: 400 }
      );
    }

    const contentTypeRaw = String(body.contentType || "auto").trim().toLowerCase();

    if (contentTypeRaw !== "auto" && !isValidContentPlanType(contentTypeRaw)) {
      return NextResponse.json(
        { error: 'contentType ไม่ถูกต้อง — ต้องเป็น "auto", "facebook", "reels", "tiktok" หรือ "script"' },
        { status: 400 }
      );
    }

    const contentType: ContentPlanType | "auto" =
      contentTypeRaw === "auto" ? "auto" : contentTypeRaw;

    let angles: ContentPlanAngle[] | "auto" = "auto";

    if (body.angles && body.angles !== "auto") {
      const rawAngles = Array.isArray(body.angles) ? body.angles : [body.angles];

      const invalidAngle = rawAngles.find(
        (angle) => typeof angle !== "string" || !isValidContentPlanAngle(angle)
      );

      if (invalidAngle !== undefined) {
        return NextResponse.json(
          { error: `content angle ไม่ถูกต้อง: ${String(invalidAngle)}` },
          { status: 400 }
        );
      }

      angles = rawAngles as ContentPlanAngle[];

      if (angles.length > MAX_COUNT) {
        return NextResponse.json(
          { error: `ระบุ angle ได้ไม่เกิน ${MAX_COUNT} รายการ` },
          { status: 400 }
        );
      }
    }

    // ห้าม fake success — เช็ค credential ก่อนเสมอ ไม่ยิง network request ถ้ายังไม่พร้อม
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

    const product = db
      .prepare(
        `SELECT id, name, model, master, year, description, price, stock, category
         FROM products WHERE id = ?`
      )
      .get(productId) as Product | undefined;

    if (!product) {
      return NextResponse.json(
        { error: `ไม่พบสินค้ารหัส ${productId}` },
        { status: 404 }
      );
    }

    const mediaCount = (
      db
        .prepare("SELECT COUNT(*) as c FROM product_media WHERE product_id = ? AND source = 'product'")
        .get(productId) as { c: number }
    ).c;

    const intelligenceProduct: ContentIntelligenceProduct = {
      id: product.id,
      name: product.name,
      model: product.model,
      master: product.master,
      year: product.year,
      description: product.description,
      price: product.price,
      stock: product.stock,
      category: product.category,
      hasRealPhotos: mediaCount > 0,
    };

    // STEP 21: บันทึก ledger ก่อนยิง AI เสมอ (แม้ยังไม่รู้ผล) — operation นี้สร้าง Content Plan
    // ได้หลายรายการจาก OpenAI call เดียว จึง finalize เป็นค่าประมาณรวมก่อน แล้วค่อย "แตก" เป็นแถวย่อย
    // ต่อ content_plan_id จริงหลัง insert สำเร็จ (ดูด้านล่าง) เพื่อให้ getContentPlanAiCost()
    // ต่อแผนแต่ละอันหาเจอ — ถ้า generation ล้มเหลวจะ finalize เป็น failed ตรงนี้เลย ไม่มีการแตกแถว
    const ledger = recordAiGeneration({
      productId,
      provider: "openai",
      model: CONTENT_INTELLIGENCE_MODEL,
      operation: "content_plan_generate",
      metadata: { requestedCount: count, contentType, angles },
    });

    let result;

    try {
      result = await generateContentPlans({
        product: intelligenceProduct,
        count,
        contentType,
        angles,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "ไม่สามารถสร้าง Content Plan ด้วย AI ได้";

      finalizeAiGenerationCost(ledger.id, {
        status: "failed",
        metadataPatch: { error: message },
      });

      console.error(`POST /api/content/plan error (productId=${productId}):`, error);

      return NextResponse.json(
        {
          success: false,
          status: "error",
          error: message,
        },
        { status: 502 }
      );
    }

    const { drafts, usage, model } = result;

    const totalEstimate = calculateEstimatedCost({
      provider: "openai",
      operation: "text",
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });

    const plans: ContentPlanRow[] = drafts.map((draft) =>
      insertContentPlan({
        productId,
        contentType: isValidContentPlanType(draft.contentType) ? draft.contentType : "facebook",
        contentAngle: isValidContentPlanAngle(draft.contentAngle)
          ? draft.contentAngle
          : "product_highlight",
        objective: draft.objective || null,
        targetAudience: draft.targetAudience || null,
        hook: draft.hook || null,
        caption: draft.caption,
        cta: draft.cta || null,
        hashtags: draft.hashtags,
        imagePrompt: draft.imagePrompt || null,
        videoPrompt: draft.videoPrompt || null,
      })
    );

    // แตกต้นทุนรวมของการเรียกครั้งนี้เท่าๆ กันตามจำนวนแผนที่สร้างได้จริง (ไม่ใช่ค่าเดา — เป็นการหาร
    // ต้นทุนจริงของ 1 API call ที่ผลิตหลายแผนพร้อมกัน) แถวแรกถือ ledger เดิม ที่เหลือสร้างแถวใหม่
    // ต่อแผน ทุกแถวรวมกัน = ต้นทุนรวมของการเรียกครั้งนี้ทั้งหมด ไม่มีการนับซ้ำ
    const perPlanEstimate =
      totalEstimate.cost !== null && plans.length > 0 ? totalEstimate.cost / plans.length : null;
    const perPlanInputUnits =
      usage.inputTokens !== null ? usage.inputTokens / plans.length : null;
    const perPlanOutputUnits =
      usage.outputTokens !== null ? usage.outputTokens / plans.length : null;

    plans.forEach((plan, index) => {
      const metadataPatch = {
        model,
        batchSize: plans.length,
        totalInputTokens: usage.inputTokens,
        totalOutputTokens: usage.outputTokens,
        pricingReason: totalEstimate.reason,
      };

      if (index === 0) {
        finalizeAiGenerationCost(ledger.id, {
          status: "succeeded",
          outputUnits: perPlanOutputUnits,
          estimatedCost: perPlanEstimate,
          metadataPatch,
        });

        linkLedgerToContentPlan(ledger.id, plan.id, model, perPlanInputUnits);

        return;
      }

      const siblingLedger = recordAiGeneration({
        productId,
        contentPlanId: plan.id,
        provider: "openai",
        model,
        operation: "content_plan_generate",
        inputUnits: perPlanInputUnits,
        metadata: { splitFromLedgerId: ledger.id },
      });

      finalizeAiGenerationCost(siblingLedger.id, {
        status: "succeeded",
        outputUnits: perPlanOutputUnits,
        estimatedCost: perPlanEstimate,
        metadataPatch,
      });
    });

    return NextResponse.json({
      success: true,
      plans,
      message: `สร้าง Content Plan สำเร็จ ${plans.length} รายการ`,
    });
  } catch (error) {
    console.error("POST /api/content/plan error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "ไม่สามารถสร้าง Content Plan ได้",
      },
      { status: 500 }
    );
  }
}

// GET /api/content/plan — filter: productId, contentType, angle, status + pagination
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const productIdParam = url.searchParams.get("productId");
    const contentTypeParam = url.searchParams.get("contentType");
    const angleParam = url.searchParams.get("angle");
    const statusParam = url.searchParams.get("status");

    let productId: number | undefined;

    if (productIdParam) {
      productId = Number(productIdParam);

      if (!Number.isInteger(productId) || productId <= 0) {
        return NextResponse.json({ error: "productId ไม่ถูกต้อง" }, { status: 400 });
      }
    }

    if (contentTypeParam && !isValidContentPlanType(contentTypeParam)) {
      return NextResponse.json({ error: "contentType ไม่ถูกต้อง" }, { status: 400 });
    }

    if (angleParam && !isValidContentPlanAngle(angleParam)) {
      return NextResponse.json({ error: "angle ไม่ถูกต้อง" }, { status: 400 });
    }

    if (statusParam && !isValidStatus(statusParam)) {
      return NextResponse.json({ error: "status ไม่ถูกต้อง" }, { status: 400 });
    }

    const pageParam = Number(url.searchParams.get("page") || "1");
    const pageSizeParam = Number(url.searchParams.get("pageSize") || "20");

    const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
    const pageSize =
      Number.isInteger(pageSizeParam) && pageSizeParam > 0 && pageSizeParam <= 100
        ? pageSizeParam
        : 20;

    const result = listContentPlans(
      {
        productId,
        contentType: (contentTypeParam as ContentPlanType) || undefined,
        contentAngle: (angleParam as ContentPlanAngle) || undefined,
        status: (statusParam as ContentPlanStatus) || undefined,
      },
      { page, pageSize }
    );

    return NextResponse.json({ success: true, ...result, page, pageSize });
  } catch (error) {
    console.error("GET /api/content/plan error:", error);

    return NextResponse.json(
      { error: "ไม่สามารถโหลด Content Plan ได้" },
      { status: 500 }
    );
  }
}
