import db from "@/lib/db";

export type ContentPlanType = "facebook" | "reels" | "tiktok" | "script";

export type ContentPlanAngle =
  | "product_highlight"
  | "story"
  | "educational"
  | "collector"
  | "belief_spiritual"
  | "promotion"
  | "problem_solution"
  | "faq"
  | "short_reel_hook";

export type ContentPlanStatus = "draft" | "ready" | "archived";

export const CONTENT_PLAN_TYPES: ContentPlanType[] = ["facebook", "reels", "tiktok", "script"];

export const CONTENT_PLAN_ANGLES: ContentPlanAngle[] = [
  "product_highlight",
  "story",
  "educational",
  "collector",
  "belief_spiritual",
  "promotion",
  "problem_solution",
  "faq",
  "short_reel_hook",
];

export function isValidContentPlanType(value: string): value is ContentPlanType {
  return (CONTENT_PLAN_TYPES as string[]).includes(value);
}

export function isValidContentPlanAngle(value: string): value is ContentPlanAngle {
  return (CONTENT_PLAN_ANGLES as string[]).includes(value);
}

export type ContentPlanRow = {
  id: number;
  productId: number;
  contentType: ContentPlanType;
  contentAngle: ContentPlanAngle;
  objective: string | null;
  targetAudience: string | null;
  hook: string | null;
  caption: string;
  cta: string | null;
  hashtags: string[];
  imagePrompt: string | null;
  videoPrompt: string | null;
  status: ContentPlanStatus;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: number;
  product_id: number;
  content_type: string;
  content_angle: string;
  objective: string | null;
  target_audience: string | null;
  hook: string | null;
  caption: string;
  cta: string | null;
  hashtags: string;
  image_prompt: string | null;
  video_prompt: string | null;
  status: string;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
};

function parseHashtags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((tag) => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

function toRow(row: DbRow): ContentPlanRow {
  return {
    id: row.id,
    productId: row.product_id,
    contentType: row.content_type as ContentPlanType,
    contentAngle: row.content_angle as ContentPlanAngle,
    objective: row.objective,
    targetAudience: row.target_audience,
    hook: row.hook,
    caption: row.caption,
    cta: row.cta,
    hashtags: parseHashtags(row.hashtags),
    imagePrompt: row.image_prompt,
    videoPrompt: row.video_prompt,
    status: row.status as ContentPlanStatus,
    scheduledAt: row.scheduled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function insertContentPlan(params: {
  productId: number;
  contentType: ContentPlanType;
  contentAngle: ContentPlanAngle;
  objective?: string | null;
  targetAudience?: string | null;
  hook?: string | null;
  caption: string;
  cta?: string | null;
  hashtags?: string[];
  imagePrompt?: string | null;
  videoPrompt?: string | null;
}): ContentPlanRow {
  const result = db
    .prepare(
      `INSERT INTO content_plans
         (product_id, content_type, content_angle, objective, target_audience, hook,
          caption, cta, hashtags, image_prompt, video_prompt, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`
    )
    .run(
      params.productId,
      params.contentType,
      params.contentAngle,
      params.objective ?? null,
      params.targetAudience ?? null,
      params.hook ?? null,
      params.caption,
      params.cta ?? null,
      JSON.stringify(params.hashtags || []),
      params.imagePrompt ?? null,
      params.videoPrompt ?? null
    );

  const row = db
    .prepare("SELECT * FROM content_plans WHERE id = ?")
    .get(result.lastInsertRowid) as DbRow;

  return toRow(row);
}

export function getContentPlanById(id: number): ContentPlanRow | undefined {
  const row = db.prepare("SELECT * FROM content_plans WHERE id = ?").get(id) as
    | DbRow
    | undefined;

  return row ? toRow(row) : undefined;
}

export type ContentPlanFilters = {
  productId?: number;
  contentType?: ContentPlanType;
  contentAngle?: ContentPlanAngle;
  status?: ContentPlanStatus;
};

export function listContentPlans(
  filters: ContentPlanFilters,
  pagination: { page: number; pageSize: number }
): { items: ContentPlanRow[]; total: number } {
  const conditions: string[] = [];
  const values: Array<string | number> = [];

  if (typeof filters.productId === "number") {
    conditions.push("product_id = ?");
    values.push(filters.productId);
  }

  if (filters.contentType) {
    conditions.push("content_type = ?");
    values.push(filters.contentType);
  }

  if (filters.contentAngle) {
    conditions.push("content_angle = ?");
    values.push(filters.contentAngle);
  }

  if (filters.status) {
    conditions.push("status = ?");
    values.push(filters.status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const total = (
    db
      .prepare(`SELECT COUNT(*) as c FROM content_plans ${whereClause}`)
      .get(...values) as { c: number }
  ).c;

  const offset = (pagination.page - 1) * pagination.pageSize;

  const rows = db
    .prepare(
      `SELECT * FROM content_plans ${whereClause}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...values, pagination.pageSize, offset) as DbRow[];

  return { items: rows.map(toRow), total };
}

export function updateContentPlan(
  id: number,
  fields: Partial<{
    objective: string | null;
    targetAudience: string | null;
    hook: string | null;
    caption: string;
    cta: string | null;
    hashtags: string[];
    imagePrompt: string | null;
    videoPrompt: string | null;
    status: ContentPlanStatus;
    scheduledAt: string | null;
  }>
): ContentPlanRow | undefined {
  const setClauses: string[] = ["updated_at = CURRENT_TIMESTAMP"];
  const values: Array<string | number | null> = [];

  if (fields.objective !== undefined) {
    setClauses.push("objective = ?");
    values.push(fields.objective);
  }

  if (fields.targetAudience !== undefined) {
    setClauses.push("target_audience = ?");
    values.push(fields.targetAudience);
  }

  if (fields.hook !== undefined) {
    setClauses.push("hook = ?");
    values.push(fields.hook);
  }

  if (fields.caption !== undefined) {
    setClauses.push("caption = ?");
    values.push(fields.caption);
  }

  if (fields.cta !== undefined) {
    setClauses.push("cta = ?");
    values.push(fields.cta);
  }

  if (fields.hashtags !== undefined) {
    setClauses.push("hashtags = ?");
    values.push(JSON.stringify(fields.hashtags));
  }

  if (fields.imagePrompt !== undefined) {
    setClauses.push("image_prompt = ?");
    values.push(fields.imagePrompt);
  }

  if (fields.videoPrompt !== undefined) {
    setClauses.push("video_prompt = ?");
    values.push(fields.videoPrompt);
  }

  if (fields.status !== undefined) {
    setClauses.push("status = ?");
    values.push(fields.status);
  }

  if (fields.scheduledAt !== undefined) {
    setClauses.push("scheduled_at = ?");
    values.push(fields.scheduledAt);
  }

  values.push(id);

  db.prepare(`UPDATE content_plans SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);

  return getContentPlanById(id);
}

export function deleteContentPlan(id: number): boolean {
  const result = db.prepare("DELETE FROM content_plans WHERE id = ?").run(id);

  return result.changes > 0;
}
