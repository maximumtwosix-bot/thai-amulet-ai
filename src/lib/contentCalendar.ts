// Content Calendar — STEP 20
//
// ชั้นวางแผน "เมื่อไหร่/แพลตฟอร์มไหน" — ต่อยอด content_plans (STEP 19, "เนื้อหาอะไร") และ
// social_posts/socialQueue.ts (STEP 10/12, คิวโพสต์จริง) ไม่รื้อหรือ duplicate ระบบใดเลย:
// การ schedule จริงเรียก scheduleSocialPost()/cancelSocialPost() ของเดิมตรงๆ ไม่เขียน queue
// logic ใหม่ซ้ำ — ดูเหตุผลเต็มที่คอมเมนต์เหนือ CREATE TABLE ใน src/lib/db.ts

import db from "@/lib/db";
import type { SocialPlatform } from "@/lib/socialContent";
import {
  cancelSocialPost,
  scheduleSocialPost,
  SocialQueueError,
} from "@/lib/socialQueue";
import { getSocialPostById, type SocialPostStatus } from "@/lib/socialPosts";
import {
  isValidContentPlanAngle,
  isValidContentPlanType,
  type ContentPlanAngle,
  type ContentPlanType,
} from "@/lib/contentPlans";

export type CalendarStatus =
  | "draft"
  | "planned"
  | "ready"
  | "scheduled"
  | "published"
  | "failed"
  | "cancelled";

const VALID_CALENDAR_STATUSES: CalendarStatus[] = [
  "draft",
  "planned",
  "ready",
  "scheduled",
  "published",
  "failed",
  "cancelled",
];

// สถานะที่ calendar logic เขียนได้เองโดยตรง — 'published'/'failed' ไม่อยู่ในนี้โดยเจตนา (เขียนได้
// ทางเดียวผ่าน syncCalendarStatusFromSocialPost() เท่านั้น ดูด้านล่าง)
const DIRECTLY_SETTABLE_STATUSES: CalendarStatus[] = [
  "draft",
  "planned",
  "ready",
  "cancelled",
];

export function isValidCalendarStatus(value: string): value is CalendarStatus {
  return (VALID_CALENDAR_STATUSES as string[]).includes(value);
}

const VALID_PLATFORMS: SocialPlatform[] = ["facebook", "reels", "instagram", "tiktok"];

function isValidCalendarPlatform(value: string): value is SocialPlatform {
  return (VALID_PLATFORMS as string[]).includes(value);
}

export type CalendarItemRow = {
  id: number;
  contentPlanId: number | null;
  productId: number;
  platform: SocialPlatform | null;
  contentType: ContentPlanType;
  contentAngle: ContentPlanAngle | null;
  scheduledAt: string;
  status: CalendarStatus;
  socialPostId: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: number;
  content_plan_id: number | null;
  product_id: number;
  platform: string | null;
  content_type: string;
  content_angle: string | null;
  scheduled_at: string;
  status: string;
  social_post_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function toRow(row: DbRow): CalendarItemRow {
  return {
    id: row.id,
    contentPlanId: row.content_plan_id,
    productId: row.product_id,
    platform: (row.platform as SocialPlatform) || null,
    contentType: row.content_type as ContentPlanType,
    contentAngle: (row.content_angle as ContentPlanAngle) || null,
    scheduledAt: row.scheduled_at,
    status: row.status as CalendarStatus,
    socialPostId: row.social_post_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class CalendarError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CalendarError";
    this.status = status;
  }
}

// แปลง social_posts.status จริง → คำที่ calendar แสดงผล — ทางเดียวที่ 'published'/'failed' จะถูก
// เขียนลง content_calendar.status ได้ ไม่มี code path อื่นใดในไฟล์นี้เขียนสองค่านี้ตรงๆ เลย
function mapSocialPostStatusToCalendarStatus(status: SocialPostStatus): CalendarStatus {
  switch (status) {
    case "published":
      return "published";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "processing":
    case "scheduled":
    default:
      return "scheduled";
  }
}

/** อ่านสถานะจริงจาก social_posts (ถ้ามีการ schedule แล้ว) แล้วซิงก์กลับเข้า content_calendar */
function syncCalendarStatusFromSocialPost(item: CalendarItemRow): CalendarItemRow {
  if (!item.socialPostId) {
    return item;
  }

  const socialPost = getSocialPostById(item.socialPostId);

  if (!socialPost) {
    return item;
  }

  const mappedStatus = mapSocialPostStatusToCalendarStatus(socialPost.status);

  if (mappedStatus !== item.status) {
    db.prepare(
      "UPDATE content_calendar SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(mappedStatus, item.id);

    return { ...item, status: mappedStatus };
  }

  return item;
}

export function insertCalendarItem(params: {
  contentPlanId?: number | null;
  productId: number;
  platform?: SocialPlatform | null;
  contentType: ContentPlanType;
  contentAngle?: ContentPlanAngle | null;
  scheduledAt: string;
  notes?: string | null;
}): CalendarItemRow {
  const status: CalendarStatus = params.contentPlanId ? "planned" : "draft";

  const result = db
    .prepare(
      `INSERT INTO content_calendar
         (content_plan_id, product_id, platform, content_type, content_angle, scheduled_at, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.contentPlanId ?? null,
      params.productId,
      params.platform ?? null,
      params.contentType,
      params.contentAngle ?? null,
      params.scheduledAt,
      status,
      params.notes ?? null
    );

  const row = db
    .prepare("SELECT * FROM content_calendar WHERE id = ?")
    .get(result.lastInsertRowid) as DbRow;

  return toRow(row);
}

export function getCalendarItemById(id: number): CalendarItemRow | undefined {
  const row = db.prepare("SELECT * FROM content_calendar WHERE id = ?").get(id) as
    | DbRow
    | undefined;

  if (!row) return undefined;

  return syncCalendarStatusFromSocialPost(toRow(row));
}

export type CalendarFilters = {
  productId?: number;
  platform?: SocialPlatform;
  status?: CalendarStatus;
  startDate?: string;
  endDate?: string;
};

export function listCalendarItems(filters: CalendarFilters): CalendarItemRow[] {
  const conditions: string[] = [];
  const values: Array<string | number> = [];

  if (typeof filters.productId === "number") {
    conditions.push("product_id = ?");
    values.push(filters.productId);
  }

  if (filters.platform) {
    conditions.push("platform = ?");
    values.push(filters.platform);
  }

  if (filters.status) {
    conditions.push("status = ?");
    values.push(filters.status);
  }

  if (filters.startDate) {
    conditions.push("scheduled_at >= ?");
    values.push(filters.startDate);
  }

  if (filters.endDate) {
    conditions.push("scheduled_at <= ?");
    values.push(filters.endDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(`SELECT * FROM content_calendar ${whereClause} ORDER BY scheduled_at ASC`)
    .all(...values) as DbRow[];

  return rows.map((row) => syncCalendarStatusFromSocialPost(toRow(row)));
}

/**
 * หา calendar item ที่อาจซ้ำ (สินค้า+platform+angle เดียวกัน ในวันเดียวกัน) — ใช้แค่เตือน
 * ("อาจมี Content ซ้ำในช่วงเวลาเดียวกัน") ไม่เคย block การสร้างจริง ผู้ใช้ตัดสินใจเอง
 */
export function findPotentialDuplicates(params: {
  productId: number;
  platform: SocialPlatform | null;
  contentAngle: ContentPlanAngle | null;
  scheduledAt: string;
  excludeId?: number;
}): CalendarItemRow[] {
  const targetDate = params.scheduledAt.slice(0, 10); // YYYY-MM-DD

  const conditions = [
    "product_id = ?",
    "date(scheduled_at) = date(?)",
    "status != 'cancelled'",
  ];
  const values: Array<string | number> = [params.productId, params.scheduledAt];

  if (params.platform) {
    conditions.push("platform = ?");
    values.push(params.platform);
  }

  if (params.contentAngle) {
    conditions.push("content_angle = ?");
    values.push(params.contentAngle);
  }

  if (params.excludeId) {
    conditions.push("id != ?");
    values.push(params.excludeId);
  }

  const rows = db
    .prepare(`SELECT * FROM content_calendar WHERE ${conditions.join(" AND ")}`)
    .all(...values) as DbRow[];

  // date(scheduled_at) = date(?) ใน SQLite เทียบเฉพาะวันที่ ไม่สนโซนเวลา — ใช้แค่เตือนคร่าวๆ
  // (targetDate เก็บไว้เผื่ออนาคตอยากคำนวณ window แบบอื่น ไม่ได้ใช้ตรงๆ ตอนนี้)
  void targetDate;

  return rows.map(toRow);
}

export function updateCalendarItem(
  id: number,
  fields: Partial<{
    contentPlanId: number | null;
    platform: SocialPlatform | null;
    contentAngle: ContentPlanAngle | null;
    scheduledAt: string;
    notes: string | null;
    status: CalendarStatus;
  }>
): CalendarItemRow | undefined {
  if (fields.status !== undefined && !DIRECTLY_SETTABLE_STATUSES.includes(fields.status)) {
    throw new CalendarError(
      `ไม่สามารถตั้งสถานะเป็น "${fields.status}" ได้โดยตรง — สถานะนี้อัปเดตอัตโนมัติจากผลลัพธ์การโพสต์จริงเท่านั้น`,
      400
    );
  }

  const setClauses: string[] = ["updated_at = CURRENT_TIMESTAMP"];
  const values: Array<string | number | null> = [];

  if (fields.contentPlanId !== undefined) {
    setClauses.push("content_plan_id = ?");
    values.push(fields.contentPlanId);
  }

  if (fields.platform !== undefined) {
    setClauses.push("platform = ?");
    values.push(fields.platform);
  }

  if (fields.contentAngle !== undefined) {
    setClauses.push("content_angle = ?");
    values.push(fields.contentAngle);
  }

  if (fields.scheduledAt !== undefined) {
    setClauses.push("scheduled_at = ?");
    values.push(fields.scheduledAt);
  }

  if (fields.notes !== undefined) {
    setClauses.push("notes = ?");
    values.push(fields.notes);
  }

  if (fields.status !== undefined) {
    setClauses.push("status = ?");
    values.push(fields.status);
  }

  values.push(id);

  db.prepare(`UPDATE content_calendar SET ${setClauses.join(", ")} WHERE id = ?`).run(
    ...values
  );

  return getCalendarItemById(id);
}

/** ลบได้เฉพาะ draft/planned/cancelled — ห้ามลบรายการที่ schedule เข้าคิวจริงแล้ว (มี social_post_id) */
export function deleteDraftCalendarItem(id: number): boolean {
  const existing = getCalendarItemById(id);

  if (!existing) {
    return false;
  }

  if (existing.socialPostId !== null) {
    throw new CalendarError(
      "ไม่สามารถลบได้ — รายการนี้ถูก schedule เข้าคิวโพสต์จริงแล้ว ใช้การยกเลิกแทน",
      409
    );
  }

  const result = db.prepare("DELETE FROM content_calendar WHERE id = ?").run(id);

  return result.changes > 0;
}

/** ยกเลิก — ถ้า schedule เข้าคิวจริงไปแล้ว ยกเลิกที่ social_posts ด้วย (เรียกฟังก์ชันเดิม ไม่ duplicate) */
export function cancelCalendarItem(id: number): CalendarItemRow {
  const existing = getCalendarItemById(id);

  if (!existing) {
    throw new CalendarError(`ไม่พบ Calendar Item รหัส ${id}`, 404);
  }

  if (existing.status === "published" || existing.status === "cancelled") {
    throw new CalendarError(
      `ไม่สามารถยกเลิกได้ — สถานะปัจจุบันคือ "${existing.status}"`,
      409
    );
  }

  if (existing.socialPostId !== null) {
    try {
      cancelSocialPost(existing.socialPostId);
    } catch (error) {
      if (error instanceof SocialQueueError && error.status === 409) {
        // social_posts ฝั่งนั้นอาจ processing/published ไปแล้วพอดี — ให้ sync แล้วคืน error จริง
        throw new CalendarError(error.message, 409);
      }
      throw error;
    }
  }

  db.prepare(
    "UPDATE content_calendar SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(id);

  return getCalendarItemById(id) as CalendarItemRow;
}

/**
 * Schedule จริง — เรียก scheduleSocialPost() ของเดิม (STEP 12) ตรงๆ ไม่เขียน queue logic ซ้ำ
 * แล้วผูก social_post_id กลับเข้า calendar item — ต้องมี content_plan_id (มีเนื้อหาจริงพร้อมโพสต์)
 * และ videoUrl (มีวิดีโอที่ render จริงแล้ว) ก่อนเสมอ
 */
export function scheduleCalendarItem(
  id: number,
  params: { caption: string; hashtags: string[]; videoUrl: string }
): CalendarItemRow {
  const existing = getCalendarItemById(id);

  if (!existing) {
    throw new CalendarError(`ไม่พบ Calendar Item รหัส ${id}`, 404);
  }

  if (existing.socialPostId !== null) {
    throw new CalendarError("รายการนี้ถูก schedule เข้าคิวไปแล้ว", 409);
  }

  if (!existing.platform) {
    throw new CalendarError("รายการนี้ไม่มี platform ที่ระบุไว้ ไม่สามารถ schedule ได้", 400);
  }

  const socialPost = scheduleSocialPost({
    productId: existing.productId,
    platform: existing.platform,
    videoUrl: params.videoUrl,
    caption: params.caption,
    hashtags: params.hashtags,
    scheduledAt: existing.scheduledAt,
  });

  db.prepare(
    `UPDATE content_calendar
     SET social_post_id = ?, status = 'scheduled', updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(socialPost.id, id);

  return getCalendarItemById(id) as CalendarItemRow;
}

export { isValidCalendarPlatform, isValidContentPlanType, isValidContentPlanAngle };
