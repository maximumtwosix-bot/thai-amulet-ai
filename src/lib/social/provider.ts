// SocialProvider — architecture กลางสำหรับ STEP 10 (SOCIAL POSTING INTEGRATION)
//
// ทุก provider (facebook.ts / instagram.ts / tiktok.ts) implement interface นี้ สอดคล้องกับ
// SocialPlatform ที่มีอยู่แล้วใน src/lib/socialContent.ts (STEP 9) — ไม่ประกาศ platform type ใหม่ซ้ำ
//
// กติกาที่ทุก provider ต้องทำตาม (ตรวจสอบได้จริง ไม่ fake):
//   - validateConnection() ต้องเช็ค environment variable ที่จำเป็นก่อนเสมอ ถ้าไม่ครบให้คืน
//     status "not_configured" ทันที "โดยไม่ยิง network request ออกไปเลย"
//   - ถ้า env ครบ ให้เรียก API จริงของแพลตฟอร์มนั้นเพื่อยืนยันว่า token/account ใช้งานได้จริง
//   - createPost()/publishPost() ต้อง "ไม่มีทางคืนค่า postId ปลอม" — ถ้า API จริงไม่ยืนยันสำเร็จ
//     (ไม่ตอบ 2xx หรือไม่มี id กลับมา) ต้อง throw error เท่านั้น ห้าม return success แบบเดา
//   - ห้าม log token/secret ใดๆ (ดู maskSecret() ด้านล่าง ใช้ตอน log เท่านั้น)

import type { SocialPlatform } from "@/lib/socialContent";

export type ConnectionStatus = "connected" | "not_configured" | "error";

export type ProviderStatus = {
  platform: SocialPlatform;
  status: ConnectionStatus;
  accountName?: string;
  message?: string;
};

export type CreatePostInput = {
  videoUrl: string; // absolute https URL (ต้อง publicly reachable ให้แพลตฟอร์มปลายทางดึงได้จริง)
  caption: string;
  hashtags: string[];
};

export type CreatePostResult = {
  externalPostId: string;
  status: "processing" | "published";
  raw?: unknown;
};

export type PostStatusResult = {
  externalPostId: string;
  status: "processing" | "published" | "failed";
  message?: string;
};

// STEP 16 — ตัวเลข engagement จริงจากแพลตฟอร์ม (ไม่ใช่สถานะ processing/published/failed แบบ
// PostStatusResult) ทุกฟิลด์เป็น optional เพราะแต่ละแพลตฟอร์มคืนค่าตัวชี้วัดไม่เหมือนกัน
export type PostAnalyticsResult = {
  externalPostId: string;
  impressions?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  clicks?: number;
};

export interface SocialProvider {
  readonly platform: SocialPlatform;

  /** เช็คว่า credentials ครบและใช้งานได้จริงหรือไม่ — ไม่มี side effect */
  validateConnection(): Promise<ProviderStatus>;

  /** สร้างโพสต์/อัปโหลดวิดีโอไปยังแพลตฟอร์ม — คืน id จริงจาก API เท่านั้น */
  createPost(input: CreatePostInput): Promise<CreatePostResult>;

  /** ยืนยันการเผยแพร่ (บางแพลตฟอร์มต้องมีขั้นตอนแยกจาก createPost เช่น Instagram media_publish) */
  publishPost(externalPostId: string): Promise<CreatePostResult>;

  /** ตรวจสถานะโพสต์ที่สร้างไปแล้ว */
  getStatus(externalPostId: string): Promise<PostStatusResult>;

  /**
   * STEP 16 — ดึงสถิติ engagement จริงของโพสต์ที่เผยแพร่แล้ว optional โดยตั้งใจ: facebook.ts /
   * instagram.ts / tiktok.ts (STEP 10) ยังไม่ implement เมธอดนี้เลย (ไม่มี credential ให้ทดสอบจริง
   * ตอนนี้ และไม่แก้ posting logic ที่ทำงานอยู่แล้วโดยไม่จำเป็น) — service ฝั่ง analytics
   * (src/lib/socialAnalytics.ts) ต้องเช็ค `typeof provider.getPostAnalytics === "function"` ก่อน
   * เรียกเสมอ ถ้าไม่มีให้ถือว่า "not_available" ไม่ใช่ error
   */
  getPostAnalytics?(externalPostId: string): Promise<PostAnalyticsResult>;
}

// ทุก fetch ไปยัง API ภายนอกของแพลตฟอร์มโซเชียลต้องมี timeout — ป้องกัน request ค้างไม่รู้จบ
// ถ้า API ปลายทางไม่ตอบสนอง (ดู STEP 10.7 timeout handling)
export const PROVIDER_FETCH_TIMEOUT_MS = 15000;

export function providerFetchSignal(): AbortSignal {
  return AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS);
}

/** ปิดบัง secret ก่อน log เสมอ — ห้าม log token/secret เต็มค่าไม่ว่าที่ไหนในระบบ */
export function maskSecret(value: string | undefined): string {
  if (!value) return "(unset)";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export class ProviderNotConfiguredError extends Error {
  constructor(platform: SocialPlatform) {
    super(`ยังไม่ได้ตั้งค่าการเชื่อมต่อ ${platform}`);
    this.name = "ProviderNotConfiguredError";
  }
}
