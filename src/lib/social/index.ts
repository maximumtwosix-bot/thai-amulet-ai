import type { SocialPlatform } from "@/lib/socialContent";
import type { SocialProvider } from "@/lib/social/provider";
import { FacebookProvider } from "@/lib/social/facebook";
import { InstagramProvider } from "@/lib/social/instagram";
import { TikTokProvider } from "@/lib/social/tiktok";

// เป้าหมาย STEP 10 มี 3 แพลตฟอร์ม: Facebook, Instagram/Reels, TikTok — "reels" ใช้ provider
// เดียวกับ "instagram" (Instagram Reels เป็น content type บน Instagram Graph API ตัวเดียวกัน
// ไม่มี API แยกต่างหากสำหรับ Reels) สอดคล้องกับที่ socialContent.ts (STEP 9) ปฏิบัติกับ 2 platform
// นี้เหมือนกันอยู่แล้ว

const facebookProvider = new FacebookProvider();
const instagramProvider = new InstagramProvider();
const tiktokProvider = new TikTokProvider();

const providers: Record<SocialPlatform, SocialProvider> = {
  facebook: facebookProvider,
  instagram: instagramProvider,
  reels: instagramProvider,
  tiktok: tiktokProvider,
};

export function getProvider(platform: SocialPlatform): SocialProvider {
  return providers[platform];
}

// รายชื่อ provider ที่แยกกันจริง (ไม่นับ "reels" ซ้ำกับ "instagram") — ใช้ตอนแสดง connection status
export const distinctProviders: SocialProvider[] = [
  facebookProvider,
  instagramProvider,
  tiktokProvider,
];

export type { SocialProvider } from "@/lib/social/provider";
