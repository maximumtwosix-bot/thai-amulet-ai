import { NextResponse } from "next/server";
import { getSocialPostById } from "@/lib/socialPosts";
import { getAnalyticsHistoryForPost, getLatestAnalyticsForPost } from "@/lib/socialAnalytics";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(raw: string): number | null {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

// GET /api/social/analytics/[id] — รายละเอียด analytics ของ social post 1 รายการ
// latestAnalytics เป็น null และ history เป็น [] ถ้ายังไม่เคย fetch จริงเลย (ไม่ใช่ error)
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id: rawId } = await context.params;
    const id = parseId(rawId);

    if (id === null) {
      return NextResponse.json(
        { error: "รหัสโพสต์ไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const post = getSocialPostById(id);

    if (!post) {
      return NextResponse.json(
        { error: `ไม่พบโพสต์รหัส ${id}` },
        { status: 404 }
      );
    }

    const latestAnalytics = getLatestAnalyticsForPost(id);
    const history = getAnalyticsHistoryForPost(id);

    return NextResponse.json({
      success: true,
      post,
      latestAnalytics,
      history,
      analyticsAvailable: latestAnalytics !== null,
    });
  } catch (error) {
    console.error("GET /api/social/analytics/[id] error:", error);

    return NextResponse.json(
      { error: "ไม่สามารถโหลดข้อมูล Analytics ได้" },
      { status: 500 }
    );
  }
}
