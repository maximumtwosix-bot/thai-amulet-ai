import { NextResponse } from "next/server";
import { isValidPlatform, type SocialPlatform } from "@/lib/socialContent";
import { getDashboardSummary } from "@/lib/socialAnalytics";
import type { SocialPostStatus } from "@/lib/socialPosts";

export const runtime = "nodejs";

const VALID_STATUSES: SocialPostStatus[] = [
  "draft",
  "scheduled",
  "processing",
  "published",
  "failed",
  "cancelled",
];

function isValidStatus(value: string): value is SocialPostStatus {
  return (VALID_STATUSES as string[]).includes(value);
}

function isValidIsoDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

// GET /api/social/analytics — Dashboard summary (นับโพสต์จริงจาก social_posts เสมอ, ตัวเลข
// engagement จริงเฉพาะที่มี snapshot จาก social_post_analytics เท่านั้น — ว่างเปล่า = ไม่มีข้อมูล
// จริงๆ ไม่ใช่ 0 ปลอม) รองรับ filter: productId, platform, status, startDate, endDate
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

    if (platformParam && !isValidPlatform(platformParam)) {
      return NextResponse.json({ error: "platform ไม่ถูกต้อง" }, { status: 400 });
    }

    if (statusParam && !isValidStatus(statusParam)) {
      return NextResponse.json({ error: "status ไม่ถูกต้อง" }, { status: 400 });
    }

    if (startDateParam && !isValidIsoDate(startDateParam)) {
      return NextResponse.json({ error: "startDate ไม่ถูกต้อง" }, { status: 400 });
    }

    if (endDateParam && !isValidIsoDate(endDateParam)) {
      return NextResponse.json({ error: "endDate ไม่ถูกต้อง" }, { status: 400 });
    }

    const summary = getDashboardSummary({
      productId,
      platform: (platformParam as SocialPlatform) || undefined,
      status: (statusParam as SocialPostStatus) || undefined,
      startDate: startDateParam || undefined,
      endDate: endDateParam || undefined,
    });

    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error("GET /api/social/analytics error:", error);

    return NextResponse.json(
      { error: "ไม่สามารถโหลดข้อมูล Analytics ได้" },
      { status: 500 }
    );
  }
}
