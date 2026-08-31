import { NextResponse } from "next/server";
import db from "@/lib/db";
import {
  CalendarError,
  cancelCalendarItem,
  deleteDraftCalendarItem,
  findPotentialDuplicates,
  getCalendarItemById,
  isValidCalendarPlatform,
  isValidCalendarStatus,
  isValidContentPlanAngle,
  updateCalendarItem,
  type CalendarStatus,
} from "@/lib/contentCalendar";
import type { ContentPlanAngle } from "@/lib/contentPlans";
import type { SocialPlatform } from "@/lib/socialContent";

export const runtime = "nodejs";

const MAX_NOTES_LENGTH = 1000;

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PatchRequest = {
  contentPlanId?: number | null;
  platform?: string | null;
  contentAngle?: string | null;
  scheduledAt?: string;
  notes?: string | null;
  status?: string;
};

function parseId(raw: string): number | null {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

function isValidIsoDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id: rawId } = await context.params;
    const id = parseId(rawId);

    if (id === null) {
      return NextResponse.json({ error: "รหัส Calendar Item ไม่ถูกต้อง" }, { status: 400 });
    }

    const item = getCalendarItemById(id);

    if (!item) {
      return NextResponse.json({ error: `ไม่พบ Calendar Item รหัส ${id}` }, { status: 404 });
    }

    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error("GET /api/content/calendar/[id] error:", error);

    return NextResponse.json({ error: "ไม่สามารถโหลด Calendar Item ได้" }, { status: 500 });
  }
}

// PATCH — แก้ไขรายการ (รวมถึงยกเลิกผ่าน status:"cancelled" ซึ่งจะ route ไปที่ cancelCalendarItem()
// เพื่อยกเลิก social_posts ที่เกี่ยวข้องด้วยถ้ามี) ห้ามตั้ง status เป็น published/failed ตรงๆ
// (ค่าเหล่านี้ sync มาจาก social_posts จริงเท่านั้น — ดู src/lib/contentCalendar.ts)
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id: rawId } = await context.params;
    const id = parseId(rawId);

    if (id === null) {
      return NextResponse.json({ error: "รหัส Calendar Item ไม่ถูกต้อง" }, { status: 400 });
    }

    const existing = getCalendarItemById(id);

    if (!existing) {
      return NextResponse.json({ error: `ไม่พบ Calendar Item รหัส ${id}` }, { status: 404 });
    }

    let body: PatchRequest;

    try {
      body = (await request.json()) as PatchRequest;
    } catch {
      return NextResponse.json(
        { error: "รูปแบบคำขอไม่ถูกต้อง (ต้องเป็น JSON)" },
        { status: 400 }
      );
    }

    // ยกเลิกผ่าน status:"cancelled" — ใช้ policy พิเศษ (ยกเลิก social_posts ที่ผูกไว้ด้วย)
    if (body.status === "cancelled") {
      try {
        const cancelled = cancelCalendarItem(id);
        return NextResponse.json({ success: true, item: cancelled });
      } catch (error) {
        if (error instanceof CalendarError) {
          return NextResponse.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }
    }

    const fields: Parameters<typeof updateCalendarItem>[1] = {};

    if (body.contentPlanId !== undefined) {
      if (body.contentPlanId === null) {
        fields.contentPlanId = null;
      } else {
        const contentPlanId = Number(body.contentPlanId);

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

        fields.contentPlanId = contentPlanId;
      }
    }

    if (body.platform !== undefined) {
      if (body.platform === null || body.platform === "") {
        fields.platform = null;
      } else {
        const platformRaw = String(body.platform).trim().toLowerCase();

        if (!isValidCalendarPlatform(platformRaw)) {
          return NextResponse.json({ error: "platform ไม่ถูกต้อง" }, { status: 400 });
        }

        fields.platform = platformRaw as SocialPlatform;
      }
    }

    if (body.contentAngle !== undefined) {
      if (body.contentAngle === null || body.contentAngle === "") {
        fields.contentAngle = null;
      } else {
        const angleRaw = String(body.contentAngle).trim().toLowerCase();

        if (!isValidContentPlanAngle(angleRaw)) {
          return NextResponse.json({ error: "contentAngle ไม่ถูกต้อง" }, { status: 400 });
        }

        fields.contentAngle = angleRaw as ContentPlanAngle;
      }
    }

    if (body.scheduledAt !== undefined) {
      if (!isValidIsoDate(body.scheduledAt)) {
        return NextResponse.json({ error: "รูปแบบ scheduledAt ไม่ถูกต้อง" }, { status: 400 });
      }

      const scheduledDate = new Date(body.scheduledAt);

      if (scheduledDate.getTime() <= Date.now()) {
        return NextResponse.json(
          { error: "scheduledAt ต้องเป็นเวลาในอนาคตเท่านั้น" },
          { status: 400 }
        );
      }

      if (existing.socialPostId !== null) {
        return NextResponse.json(
          { error: "ไม่สามารถแก้ไขเวลาได้ — รายการนี้ถูก schedule เข้าคิวจริงแล้ว" },
          { status: 409 }
        );
      }

      fields.scheduledAt = scheduledDate.toISOString();
    }

    if (body.notes !== undefined) {
      if (body.notes === null) {
        fields.notes = null;
      } else {
        const trimmedNotes = String(body.notes).trim();

        if (trimmedNotes.length > MAX_NOTES_LENGTH) {
          return NextResponse.json(
            { error: `notes ยาวเกินไป (สูงสุด ${MAX_NOTES_LENGTH} ตัวอักษร)` },
            { status: 400 }
          );
        }

        fields.notes = trimmedNotes || null;
      }
    }

    if (body.status !== undefined) {
      if (!isValidCalendarStatus(body.status)) {
        return NextResponse.json({ error: "status ไม่ถูกต้อง" }, { status: 400 });
      }

      fields.status = body.status as CalendarStatus;
    }

    let warning: string | undefined;
    let duplicates: ReturnType<typeof findPotentialDuplicates> | undefined;

    if (fields.scheduledAt || fields.platform !== undefined || fields.contentAngle !== undefined) {
      const found = findPotentialDuplicates({
        productId: existing.productId,
        platform: fields.platform !== undefined ? fields.platform : existing.platform,
        contentAngle:
          fields.contentAngle !== undefined ? fields.contentAngle : existing.contentAngle,
        scheduledAt: fields.scheduledAt || existing.scheduledAt,
        excludeId: id,
      });

      if (found.length > 0) {
        warning = "อาจมี Content ซ้ำในช่วงเวลาเดียวกัน";
        duplicates = found;
      }
    }

    let updated;

    try {
      updated = updateCalendarItem(id, fields);
    } catch (error) {
      if (error instanceof CalendarError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }

    return NextResponse.json({ success: true, item: updated, warning, duplicates });
  } catch (error) {
    console.error("PATCH /api/content/calendar/[id] error:", error);

    return NextResponse.json({ error: "ไม่สามารถแก้ไข Calendar Item ได้" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id: rawId } = await context.params;
    const id = parseId(rawId);

    if (id === null) {
      return NextResponse.json({ error: "รหัส Calendar Item ไม่ถูกต้อง" }, { status: 400 });
    }

    try {
      const deleted = deleteDraftCalendarItem(id);

      if (!deleted) {
        return NextResponse.json({ error: `ไม่พบ Calendar Item รหัส ${id}` }, { status: 404 });
      }
    } catch (error) {
      if (error instanceof CalendarError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/content/calendar/[id] error:", error);

    return NextResponse.json({ error: "ไม่สามารถลบ Calendar Item ได้" }, { status: 500 });
  }
}
