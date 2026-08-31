import { NextResponse } from "next/server";
import { stat } from "node:fs/promises";
import path from "node:path";
import db from "@/lib/db";
import { isValidGeneratedVideoUrl, MAX_CAPTION_LENGTH } from "@/lib/socialContent";
import { CalendarError, getCalendarItemById, scheduleCalendarItem } from "@/lib/contentCalendar";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ScheduleRequest = {
  videoUrl?: string;
  caption?: string;
  hashtags?: string[];
};

type ContentPlanRow = {
  caption: string;
  hashtags: string;
};

function parseId(raw: string): number | null {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

// POST /api/content/calendar/[id]/schedule — orchestration เท่านั้น: อ่าน caption/hashtags จาก
// content_plan ที่ผูกไว้ (หรือรับ override จาก body) แล้วเรียก scheduleSocialPost() ของเดิม
// (STEP 12) ผ่าน scheduleCalendarItem() — ไม่มี queue logic ใหม่ที่นี่เลย
export async function POST(request: Request, context: RouteContext) {
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

    let body: ScheduleRequest;

    try {
      body = (await request.json()) as ScheduleRequest;
    } catch {
      return NextResponse.json(
        { error: "รูปแบบคำขอไม่ถูกต้อง (ต้องเป็น JSON)" },
        { status: 400 }
      );
    }

    const videoUrl = String(body.videoUrl || "").trim();

    if (!isValidGeneratedVideoUrl(videoUrl)) {
      return NextResponse.json({ error: "videoUrl ไม่ถูกต้อง" }, { status: 400 });
    }

    const videoFilePath = path.join(process.cwd(), "public", videoUrl.replace(/^\/+/, ""));

    try {
      const stats = await stat(videoFilePath);

      if (!stats.isFile() || stats.size <= 0) {
        throw new Error("empty or invalid file");
      }
    } catch {
      return NextResponse.json(
        { error: "ไม่พบไฟล์วิดีโอที่ระบุบนดิสก์จริง" },
        { status: 400 }
      );
    }

    let caption = String(body.caption || "").trim();
    let hashtags = Array.isArray(body.hashtags)
      ? body.hashtags.filter((tag) => typeof tag === "string")
      : [];

    if (!caption) {
      if (!item.contentPlanId) {
        return NextResponse.json(
          {
            error:
              "รายการนี้ยังไม่มี Content Plan และไม่ได้ระบุ caption มาด้วย — กรุณาสร้าง Content ก่อนหรือระบุ caption",
          },
          { status: 400 }
        );
      }

      const plan = db
        .prepare("SELECT caption, hashtags FROM content_plans WHERE id = ?")
        .get(item.contentPlanId) as ContentPlanRow | undefined;

      if (!plan) {
        return NextResponse.json(
          { error: `ไม่พบ Content Plan รหัส ${item.contentPlanId} ที่ผูกไว้` },
          { status: 404 }
        );
      }

      caption = plan.caption;

      try {
        const parsedHashtags = JSON.parse(plan.hashtags);
        hashtags = Array.isArray(parsedHashtags) ? parsedHashtags : [];
      } catch {
        hashtags = [];
      }
    }

    if (caption.length > MAX_CAPTION_LENGTH) {
      return NextResponse.json(
        { error: `caption ยาวเกินไป (สูงสุด ${MAX_CAPTION_LENGTH} ตัวอักษร)` },
        { status: 400 }
      );
    }

    try {
      const scheduled = scheduleCalendarItem(id, { caption, hashtags, videoUrl });

      return NextResponse.json({
        success: true,
        item: scheduled,
        message: "ตั้งเวลาโพสต์เข้าคิวเรียบร้อยแล้ว (ยังไม่โพสต์จริงจนกว่า worker จะประมวลผลและ provider ยืนยันสำเร็จ)",
      });
    } catch (error) {
      if (error instanceof CalendarError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
  } catch (error) {
    console.error("POST /api/content/calendar/[id]/schedule error:", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ไม่สามารถตั้งเวลาโพสต์ได้" },
      { status: 500 }
    );
  }
}
