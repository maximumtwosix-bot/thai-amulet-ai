// Social Analytics Service — STEP 16
//
// ต่อยอดจาก social_posts (STEP 10/12) และ social_post_analytics (STEP 16, ตารางใหม่) — ไม่มีการ
// ดึงข้อมูลจาก Facebook/Instagram/TikTok จริงเลยในไฟล์นี้ (ไม่มี credential ให้ใช้งานตอนนี้) —
// recordAnalytics() มีไว้ให้ STEP ในอนาคตเรียกหลังได้ข้อมูลจริงจาก provider.getPostAnalytics()
// เท่านั้น ไม่มีจุดไหนในระบบเรียกฟังก์ชันนี้อัตโนมัติตอนนี้ ดังนั้น social_post_analytics จะว่าง
// เปล่าเสมอในสภาพแวดล้อมนี้ — ทุก query จึงคืนค่า "ไม่มีข้อมูล" อย่างซื่อสัตย์ ไม่ใช่เลขปลอม

import db from "@/lib/db";
import type { SocialPlatform } from "@/lib/socialContent";
import { getSocialPostById, type SocialPostStatus } from "@/lib/socialPosts";

export type AnalyticsMetrics = {
  impressions: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  clicks: number | null;
};

export type AnalyticsRow = AnalyticsMetrics & {
  id: number;
  socialPostId: number;
  platform: SocialPlatform;
  engagementRate: number | null;
  fetchedAt: string;
};

type DbRow = {
  id: number;
  social_post_id: number;
  platform: string;
  impressions: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  clicks: number | null;
  engagement_rate: number | null;
  fetched_at: string;
};

function toRow(row: DbRow): AnalyticsRow {
  return {
    id: row.id,
    socialPostId: row.social_post_id,
    platform: row.platform as SocialPlatform,
    impressions: row.impressions,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    saves: row.saves,
    clicks: row.clicks,
    engagementRate: row.engagement_rate,
    fetchedAt: row.fetched_at,
  };
}

/**
 * engagement rate มีความหมายเฉพาะเมื่อมี impressions (หรือ views) เป็นตัวเลขจริงมากกว่า 0 เท่านั้น
 * — ถ้าไม่มีตัวส่วนที่เชื่อถือได้ คืน null แทนที่จะเดา/หารด้วยค่าไม่จริง
 */
function computeEngagementRate(metrics: AnalyticsMetrics): number | null {
  const denominator = metrics.impressions ?? metrics.views;

  if (!denominator || denominator <= 0) {
    return null;
  }

  const engagementSum =
    (metrics.likes ?? 0) +
    (metrics.comments ?? 0) +
    (metrics.shares ?? 0) +
    (metrics.saves ?? 0);

  return engagementSum / denominator;
}

/** บันทึก snapshot ใหม่จากข้อมูลจริงที่ provider ยืนยันแล้วเท่านั้น (ไม่มีใครเรียกฟังก์ชันนี้เองในระบบนี้) */
export function recordAnalytics(params: {
  socialPostId: number;
  platform: SocialPlatform;
  metrics: Partial<AnalyticsMetrics>;
}): AnalyticsRow {
  const metrics: AnalyticsMetrics = {
    impressions: params.metrics.impressions ?? null,
    views: params.metrics.views ?? null,
    likes: params.metrics.likes ?? null,
    comments: params.metrics.comments ?? null,
    shares: params.metrics.shares ?? null,
    saves: params.metrics.saves ?? null,
    clicks: params.metrics.clicks ?? null,
  };

  const engagementRate = computeEngagementRate(metrics);

  const result = db
    .prepare(
      `INSERT INTO social_post_analytics
         (social_post_id, platform, impressions, views, likes, comments, shares, saves, clicks, engagement_rate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.socialPostId,
      params.platform,
      metrics.impressions,
      metrics.views,
      metrics.likes,
      metrics.comments,
      metrics.shares,
      metrics.saves,
      metrics.clicks,
      engagementRate
    );

  const row = db
    .prepare("SELECT * FROM social_post_analytics WHERE id = ?")
    .get(result.lastInsertRowid) as DbRow;

  return toRow(row);
}

/** snapshot ล่าสุดของโพสต์นี้ — null ถ้าไม่เคย fetch จริงเลย (ไม่ใช่ error) */
export function getLatestAnalyticsForPost(socialPostId: number): AnalyticsRow | null {
  const row = db
    .prepare(
      `SELECT * FROM social_post_analytics
       WHERE social_post_id = ?
       ORDER BY fetched_at DESC, id DESC
       LIMIT 1`
    )
    .get(socialPostId) as DbRow | undefined;

  return row ? toRow(row) : null;
}

export function getAnalyticsHistoryForPost(socialPostId: number): AnalyticsRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM social_post_analytics
       WHERE social_post_id = ?
       ORDER BY fetched_at ASC, id ASC`
    )
    .all(socialPostId) as DbRow[];

  return rows.map(toRow);
}

export type AnalyticsFilters = {
  productId?: number;
  platform?: SocialPlatform;
  status?: SocialPostStatus;
  startDate?: string; // ISO date, filter บน social_posts.created_at
  endDate?: string;
};

function buildPostFilterClause(filters: AnalyticsFilters): {
  where: string;
  values: Array<string | number>;
} {
  const conditions: string[] = [];
  const values: Array<string | number> = [];

  if (typeof filters.productId === "number") {
    conditions.push("sp.product_id = ?");
    values.push(filters.productId);
  }

  if (filters.platform) {
    conditions.push("sp.platform = ?");
    values.push(filters.platform);
  }

  if (filters.status) {
    conditions.push("sp.status = ?");
    values.push(filters.status);
  }

  if (filters.startDate) {
    conditions.push("sp.created_at >= ?");
    values.push(filters.startDate);
  }

  if (filters.endDate) {
    conditions.push("sp.created_at <= ?");
    values.push(filters.endDate);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    values,
  };
}

export type StatusCounts = Record<SocialPostStatus, number>;

export type PlatformBreakdown = {
  platform: SocialPlatform;
  totalPosts: number;
  publishedPosts: number;
  postsWithAnalytics: number;
  totals: AnalyticsMetrics;
};

export type TopPerformingPost = {
  socialPostId: number;
  productId: number;
  platform: SocialPlatform;
  caption: string;
  engagementRate: number | null;
  metrics: AnalyticsMetrics;
  fetchedAt: string;
};

export type DashboardSummary = {
  totalPosts: number;
  statusCounts: StatusCounts;
  postsWithAnalytics: number;
  totals: AnalyticsMetrics;
  analyticsAvailable: boolean;
  platformBreakdown: PlatformBreakdown[];
  topPerformingPosts: TopPerformingPost[];
};

const ALL_STATUSES: SocialPostStatus[] = [
  "draft",
  "scheduled",
  "processing",
  "published",
  "failed",
  "cancelled",
];

const ALL_PLATFORMS: SocialPlatform[] = ["facebook", "reels", "instagram", "tiktok"];

function emptyMetrics(): AnalyticsMetrics {
  return {
    impressions: null,
    views: null,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    clicks: null,
  };
}

function sumMetrics(rows: DbRow[]): AnalyticsMetrics {
  if (rows.length === 0) {
    return emptyMetrics();
  }

  const sum = (key: keyof AnalyticsMetrics): number | null => {
    const values = rows
      .map((row) => (row as unknown as Record<string, number | null>)[key])
      .filter((value): value is number => typeof value === "number");

    return values.length > 0 ? values.reduce((a, b) => a + b, 0) : null;
  };

  return {
    impressions: sum("impressions"),
    views: sum("views"),
    likes: sum("likes"),
    comments: sum("comments"),
    shares: sum("shares"),
    saves: sum("saves"),
    clicks: sum("clicks"),
  };
}

/** ดึง snapshot ล่าสุด "ต่อโพสต์" ที่ตรงเงื่อนไข filter (join กับ social_posts) */
function getLatestAnalyticsRowsForFilter(filters: AnalyticsFilters): DbRow[] {
  const { where, values } = buildPostFilterClause(filters);

  return db
    .prepare(
      `SELECT a.* FROM social_post_analytics a
       INNER JOIN (
         SELECT social_post_id, MAX(fetched_at) as max_fetched
         FROM social_post_analytics
         GROUP BY social_post_id
       ) latest ON a.social_post_id = latest.social_post_id AND a.fetched_at = latest.max_fetched
       INNER JOIN social_posts sp ON sp.id = a.social_post_id
       ${where}`
    )
    .all(...values) as DbRow[];
}

/**
 * สรุปภาพรวมสำหรับ Dashboard — จำนวนโพสต์แยกตาม status เป็นข้อมูลจริงเสมอ (มาจาก social_posts
 * ตรงๆ) ส่วน totals/platformBreakdown/topPerformingPosts จะว่างเปล่าอัตโนมัติถ้ายังไม่เคยมีการ
 * fetch analytics จริงเลย (social_post_analytics ว่าง) — ไม่ใส่ 0 ปลอมแทนค่าที่ไม่รู้
 */
export function getDashboardSummary(filters: AnalyticsFilters = {}): DashboardSummary {
  const { where, values } = buildPostFilterClause(filters);

  const statusRows = db
    .prepare(`SELECT sp.status, COUNT(*) as c FROM social_posts sp ${where} GROUP BY sp.status`)
    .all(...values) as Array<{ status: string; c: number }>;

  const statusCounts = ALL_STATUSES.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as StatusCounts);

  let totalPosts = 0;

  for (const row of statusRows) {
    if ((ALL_STATUSES as string[]).includes(row.status)) {
      statusCounts[row.status as SocialPostStatus] = row.c;
    }
    totalPosts += row.c;
  }

  const latestRows = getLatestAnalyticsRowsForFilter(filters);

  const platformBreakdown: PlatformBreakdown[] = ALL_PLATFORMS.map((platform) => {
    const platformStatusRows = db
      .prepare(
        `SELECT sp.status, COUNT(*) as c FROM social_posts sp ${where ? `${where} AND` : "WHERE"} sp.platform = ?
         GROUP BY sp.status`
      )
      .all(...values, platform) as Array<{ status: string; c: number }>;

    const platformTotalPosts = platformStatusRows.reduce((sum, row) => sum + row.c, 0);
    const publishedPosts =
      platformStatusRows.find((row) => row.status === "published")?.c ?? 0;

    const platformAnalyticsRows = latestRows.filter((row) => row.platform === platform);

    return {
      platform,
      totalPosts: platformTotalPosts,
      publishedPosts,
      postsWithAnalytics: platformAnalyticsRows.length,
      totals: sumMetrics(platformAnalyticsRows),
    };
  }).filter((entry) => entry.totalPosts > 0 || entry.postsWithAnalytics > 0);

  const topPerformingPosts: TopPerformingPost[] = latestRows
    .filter((row) => row.engagement_rate !== null)
    .sort((a, b) => (b.engagement_rate ?? 0) - (a.engagement_rate ?? 0))
    .slice(0, 10)
    .map((row) => {
      const post = getSocialPostById(row.social_post_id);

      return {
        socialPostId: row.social_post_id,
        productId: post?.productId ?? 0,
        platform: row.platform as SocialPlatform,
        caption: post?.caption ?? "",
        engagementRate: row.engagement_rate,
        metrics: {
          impressions: row.impressions,
          views: row.views,
          likes: row.likes,
          comments: row.comments,
          shares: row.shares,
          saves: row.saves,
          clicks: row.clicks,
        },
        fetchedAt: row.fetched_at,
      };
    });

  return {
    totalPosts,
    statusCounts,
    postsWithAnalytics: latestRows.length,
    totals: sumMetrics(latestRows),
    analyticsAvailable: latestRows.length > 0,
    platformBreakdown,
    topPerformingPosts,
  };
}

export type DailyAggregate = {
  date: string;
  postsWithAnalytics: number;
  totals: AnalyticsMetrics;
};

function aggregateByDatePart(
  filters: AnalyticsFilters,
  datePartExpr: string
): DailyAggregate[] {
  const { where, values } = buildPostFilterClause(filters);

  const rows = db
    .prepare(
      `SELECT a.*, ${datePartExpr} as date_part FROM social_post_analytics a
       INNER JOIN social_posts sp ON sp.id = a.social_post_id
       ${where}
       ORDER BY date_part ASC`
    )
    .all(...values) as Array<DbRow & { date_part: string }>;

  const grouped = new Map<string, DbRow[]>();

  for (const row of rows) {
    const key = row.date_part;
    const existing = grouped.get(key) || [];
    existing.push(row);
    grouped.set(key, existing);
  }

  return Array.from(grouped.entries()).map(([date, groupRows]) => ({
    date,
    postsWithAnalytics: groupRows.length,
    totals: sumMetrics(groupRows),
  }));
}

/** รวมยอดรายวัน — ว่างเปล่าถ้ายังไม่เคยมี analytics snapshot เลย (ไม่ใส่วันที่ปลอม) */
export function aggregateDaily(filters: AnalyticsFilters = {}): DailyAggregate[] {
  return aggregateByDatePart(filters, "date(a.fetched_at)");
}

/** รวมยอดรายเดือน — เหมือน aggregateDaily แต่ group เป็นเดือน (YYYY-MM) */
export function aggregateMonthly(filters: AnalyticsFilters = {}): DailyAggregate[] {
  return aggregateByDatePart(filters, "strftime('%Y-%m', a.fetched_at)");
}
