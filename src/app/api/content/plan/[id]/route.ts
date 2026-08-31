import { NextResponse } from "next/server";
import { MAX_CAPTION_LENGTH } from "@/lib/socialContent";
import {
  deleteContentPlan,
  getContentPlanById,
  updateContentPlan,
  type ContentPlanStatus,
} from "@/lib/contentPlans";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PatchRequest = {
  objective?: string;
  targetAudience?: string;
  hook?: string;
  caption?: string;
  cta?: string;
  hashtags?: string[];
  imagePrompt?: string;
  videoPrompt?: string;
  status?: string;
};

const MAX_FIELD_LENGTH = 2000;
const VALID_STATUSES = ["draft", "ready", "archived"];

function parseId(raw: string): number | null {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id: rawId } = await context.params;
    const id = parseId(rawId);

    if (id === null) {
      return NextResponse.json({ error: "รหัส Content Plan ไม่ถูกต้อง" }, { status: 400 });
    }

    const plan = getContentPlanById(id);

    if (!plan) {
      return NextResponse.json({ error: `ไม่พบ Content Plan รหัส ${id}` }, { status: 404 });
    }

    return NextResponse.json({ success: true, plan });
  } catch (error) {
    console.error("GET /api/content/plan/[id] error:", error);

    return NextResponse.json({ error: "ไม่สามารถโหลด Content Plan ได้" }, { status: 500 });
  }
}

// PATCH /api/content/plan/[id] — แก้ไข Content Plan ที่สร้างไว้แล้ว (รองรับ flow "แก้ไขได้ → Save")
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id: rawId } = await context.params;
    const id = parseId(rawId);

    if (id === null) {
      return NextResponse.json({ error: "รหัส Content Plan ไม่ถูกต้อง" }, { status: 400 });
    }

    const existing = getContentPlanById(id);

    if (!existing) {
      return NextResponse.json({ error: `ไม่พบ Content Plan รหัส ${id}` }, { status: 404 });
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

    const fields: Parameters<typeof updateContentPlan>[1] = {};

    if (body.objective !== undefined) {
      if (String(body.objective).length > MAX_FIELD_LENGTH) {
        return NextResponse.json({ error: "objective ยาวเกินไป" }, { status: 400 });
      }
      fields.objective = String(body.objective).trim() || null;
    }

    if (body.targetAudience !== undefined) {
      if (String(body.targetAudience).length > MAX_FIELD_LENGTH) {
        return NextResponse.json({ error: "targetAudience ยาวเกินไป" }, { status: 400 });
      }
      fields.targetAudience = String(body.targetAudience).trim() || null;
    }

    if (body.hook !== undefined) {
      if (String(body.hook).length > MAX_FIELD_LENGTH) {
        return NextResponse.json({ error: "hook ยาวเกินไป" }, { status: 400 });
      }
      fields.hook = String(body.hook).trim() || null;
    }

    if (body.caption !== undefined) {
      const caption = String(body.caption).trim();

      if (!caption) {
        return NextResponse.json({ error: "caption ต้องไม่ว่างเปล่า" }, { status: 400 });
      }

      if (caption.length > MAX_CAPTION_LENGTH) {
        return NextResponse.json(
          { error: `caption ยาวเกินไป (สูงสุด ${MAX_CAPTION_LENGTH} ตัวอักษร)` },
          { status: 400 }
        );
      }

      fields.caption = caption;
    }

    if (body.cta !== undefined) {
      if (String(body.cta).length > MAX_FIELD_LENGTH) {
        return NextResponse.json({ error: "cta ยาวเกินไป" }, { status: 400 });
      }
      fields.cta = String(body.cta).trim() || null;
    }

    if (body.hashtags !== undefined) {
      if (!Array.isArray(body.hashtags) || body.hashtags.some((tag) => typeof tag !== "string")) {
        return NextResponse.json({ error: "hashtags ต้องเป็น array ของ string" }, { status: 400 });
      }
      fields.hashtags = body.hashtags;
    }

    if (body.imagePrompt !== undefined) {
      if (String(body.imagePrompt).length > MAX_FIELD_LENGTH) {
        return NextResponse.json({ error: "imagePrompt ยาวเกินไป" }, { status: 400 });
      }
      fields.imagePrompt = String(body.imagePrompt).trim() || null;
    }

    if (body.videoPrompt !== undefined) {
      if (String(body.videoPrompt).length > MAX_FIELD_LENGTH) {
        return NextResponse.json({ error: "videoPrompt ยาวเกินไป" }, { status: 400 });
      }
      fields.videoPrompt = String(body.videoPrompt).trim() || null;
    }

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: "status ไม่ถูกต้อง" }, { status: 400 });
      }
      fields.status = body.status as ContentPlanStatus;
    }

    const updated = updateContentPlan(id, fields);

    return NextResponse.json({ success: true, plan: updated });
  } catch (error) {
    console.error("PATCH /api/content/plan/[id] error:", error);

    return NextResponse.json({ error: "ไม่สามารถแก้ไข Content Plan ได้" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id: rawId } = await context.params;
    const id = parseId(rawId);

    if (id === null) {
      return NextResponse.json({ error: "รหัส Content Plan ไม่ถูกต้อง" }, { status: 400 });
    }

    const deleted = deleteContentPlan(id);

    if (!deleted) {
      return NextResponse.json({ error: `ไม่พบ Content Plan รหัส ${id}` }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/content/plan/[id] error:", error);

    return NextResponse.json({ error: "ไม่สามารถลบ Content Plan ได้" }, { status: 500 });
  }
}
