import { NextResponse } from "next/server";
import db from "@/lib/db";
import {
  findPotentialDuplicates,
  insertCalendarItem,
  isValidCalendarPlatform,
  isValidCalendarStatus,
  isValidContentPlanAngle,
  isValidContentPlanType,
  listCalendarItems,
  type CalendarStatus,
} from "@/lib/contentCalendar";
import type { ContentPlanAngle, ContentPlanType } from "@/lib/contentPlans";
import type { SocialPlatform } from "@/lib/socialContent";

export const runtime = "nodejs";

const MAX_NOTES_LENGTH = 1000;

type CreateRequest = {
  contentPlanId?: number;
  productId?: number;
  platform?: string;
  contentType?: string;
  contentAngle?: string;
  scheduledAt?: string;
  notes?: string;
};

function isValidIsoDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

// POST /api/content/calendar — สร้างรายการปฏิทิน 1 รายการ (draft ถ้ายังไม่มี content_plan_id
// หรือ planned ถ้ามี) — ไม่ schedule เข้าคิวจริงที่นี่ (ดู POST .../[id]/schedule แยกต่างหาก)
export async function POST(request: Request) {
  try {
    let body: CreateRequest;

    try {
      body = (await request.json()) as CreateRequest;
    } catch {
      return NextResponse.json(
        { error: "รูปแบบคำขอไม่ถูกต้อง (ต้องเป็น JSON)" },
        { status: 400 }
      );
    }

    const productId = Number(body.productId || 0);

    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json({ error: "กรุณาระบุรหัสสินค้าให้ถูกต้อง" }, { status: 400 });
    }

    const product = db.prepare("SELECT id FROM products WHERE id = ?").get(productId);

    if (!product) {
      return NextResponse.json({ error: `ไม่พบสินค้ารหัส ${productId}` }, { status: 404 });
    }

    const contentTypeRaw = String(body.contentType || "").trim().toLowerCase();

    if (!isValidContentPlanType(contentTypeRaw)) {
      return NextResponse.json(
        { error: 'contentType ไม่ถูกต้อง — ต้องเป็น "facebook", "reels", "tiktok" หรือ "script"' },
        { status: 400 }
      );
    }

    let platform: SocialPlatform | null = null;

    if (body.platform !== undefined && body.platform !== null && String(body.platform).trim()) {
      const platformRaw = String(body.platform).trim().toLowerCase();

      if (!isValidCalendarPlatform(platformRaw)) {
        return NextResponse.json({ error: "platform ไม่ถูกต้อง" }, { status: 400 });
      }

      platform = platformRaw as SocialPlatform;
    } else if (contentTypeRaw !== "script") {
      return NextResponse.json(
        { error: "กรุณาระบุ platform (จำเป็นสำหรับ content type นี้)" },
        { status: 400 }
      );
    }

    let contentAngle: ContentPlanAngle | null = null;

    if (body.contentAngle) {
      const angleRaw = String(body.contentAngle).trim().toLowerCase();

      if (!isValidContentPlanAngle(angleRaw)) {
        return NextResponse.json({ error: "contentAngle ไม่ถูกต้อง" }, { status: 400 });
      }

      contentAngle = angleRaw;
    }

    const scheduledAtRaw = String(body.scheduledAt || "").trim();

    if (!scheduledAtRaw || !isValidIsoDate(scheduledAtRaw)) {
      return NextResponse.json(
        { error: "รูปแบบ scheduledAt ไม่ถูกต้อง (ต้องเป็น ISO date string)" },
        { status: 400 }
      );
    }

    const scheduledDate = new Date(scheduledAtRaw);

    if (scheduledDate.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "scheduledAt ต้องเป็นเวลาในอนาคตเท่านั้น" },
        { status: 400 }
      );
    }

    let contentPlanId: number | null = null;

    if (body.contentPlanId !== undefined && body.contentPlanId !== null) {
      contentPlanId = Number(body.contentPlanId);

      if (!Number.isInteger(contentPlanId) || contentPlanId <= 0) {
        return NextResponse.json({ error: "contentPlanId ไม่ถูกต้อง" }, { status: 400 });
      }

      const plan = db.prepare("SELECT id FROM content_plans WHERE id = ?").get(contentPlanId);

      if (!plan) {
        return NextResponse.json(
          { error: `ไม่พบ Content Plan รหัส ${contentPlanId}` },
          { status: 404 }
        );
      }
    }

    let notes: string | null = null;

    if (body.notes !== undefined) {
      const trimmedNotes = String(body.notes).trim();

      if (trimmedNotes.length > MAX_NOTES_LENGTH) {
        return NextResponse.json(
          { error: `notes ยาวเกินไป (สูงสุด ${MAX_NOTES_LENGTH} ตัวอักษร)` },
          { status: 400 }
        );
      }

      notes = trimmedNotes || null;
    }

    // STEP 20.16: ตรวจ duplicate แบบ warning เท่านั้น ไม่ block การสร้าง
    const duplicates = findPotentialDuplicates({
      productId,
      platform,
      contentAngle,
      scheduledAt: scheduledDate.toISOString(),
    });

    const item = insertCalendarItem({
      contentPlanId,
      productId,
      platform,
      contentType: contentTypeRaw,
      contentAngle,
      scheduledAt: scheduledDate.toISOString(),
      notes,
    });

    return NextResponse.json(
      {
        success: true,
        item,
        warning:
          duplicates.length > 0 ? "อาจมี Content ซ้ำในช่วงเวลาเดียวกัน" : undefined,
        duplicates: duplicates.length > 0 ? duplicates : undefined,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/content/calendar error:", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ไม่สามารถสร้าง Calendar Item ได้" },
      { status: 500 }
    );
  }
}

// GET /api/content/calendar — filter: productId, platform, status, startDate, endDate
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const productIdParam = url.searchParams.get("productId");
    const platformParam = url.searchParams.get("platform");
    const statusParam = url.searchParams.get("status");
    const startDateParam = url.searchParams.get("startDate");
    const endDateParam = url.searchParams.get("endDate");

    let productId: number | undefined;

    if (productIdParam) {
      productId = Number(productIdParam);

      if (!Number.isInteger(productId) || productId <= 0) {
        return NextResponse.json({ error: "productId ไม่ถูกต้อง" }, { status: 400 });
      }
    }

    if (platformParam && !isValidCalendarPlatform(platformParam)) {
      return NextResponse.json({ error: "platform ไม่ถูกต้อง" }, { status: 400 });
    }

    if (statusParam && !isValidCalendarStatus(statusParam)) {
      return NextResponse.json({ error: "status ไม่ถูกต้อง" }, { status: 400 });
    }

    if (startDateParam && !isValidIsoDate(startDateParam)) {
      return NextResponse.json({ error: "startDate ไม่ถูกต้อง" }, { status: 400 });
    }

    if (endDateParam && !isValidIsoDate(endDateParam)) {
      return NextResponse.json({ error: "endDate ไม่ถูกต้อง" }, { status: 400 });
    }

    const items = listCalendarItems({
      productId,
      platform: (platformParam as SocialPlatform) || undefined,
      status: (statusParam as CalendarStatus) || undefined,
      startDate: startDateParam || undefined,
      endDate: endDateParam || undefined,
    });

    return NextResponse.json({ success: true, items, total: items.length });
  } catch (error) {
    console.error("GET /api/content/calendar error:", error);

    return NextResponse.json({ error: "ไม่สามารถโหลด Content Calendar ได้" }, { status: 500 });
  }
}
