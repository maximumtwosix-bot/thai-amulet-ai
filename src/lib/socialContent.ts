// Content Package สำหรับเตรียมโพสต์ Facebook/TikTok/Instagram — STEP 9
//
// สำคัญ (ตรวจ architecture จริงก่อนเขียนไฟล์นี้แล้ว): ตาราง `content` ที่มีอยู่เดิม (src/lib/db.ts)
// ไม่มีคอลัมน์ผูกกับ product เลย (id, title, content_type, platform, caption, status, created_at เท่านั้น)
// เป็นแค่ "คลังคอนเทนต์" อิสระที่บันทึกจาก Content Studio ไม่ใช่ระบบผูกคอนเทนต์เข้ากับสินค้าหรือวิดีโอ
// จึงไม่มีทาง "ดึงคอนเทนต์เดิมของสินค้านี้" จากตารางนั้นได้จริง — Content Package นี้จึงประกอบขึ้นจาก
// ข้อมูลสินค้าจริง + คอนเทนต์ที่สร้างสดใหม่ (เรียก /api/content/generate ตัวเดิมที่ /api/video/auto ใช้อยู่แล้ว)
// ไม่ได้ query ตาราง content เดิม เพื่อไม่ให้ดูเหมือนมีความเชื่อมโยงที่ไม่มีอยู่จริง
//
// ยังไม่มีการโพสต์ไป Facebook/TikTok/Instagram จริงในไฟล์นี้ — เป็นแค่การประกอบ "แพ็กเกจ" ที่พร้อมสำหรับ
// ขั้นตอนโพสต์จริงในอนาคต (ดูหมายเหตุ "future architecture" ท้ายไฟล์)

export type SocialPlatform = "facebook" | "reels" | "instagram" | "tiktok";

export function isValidPlatform(value: string): value is SocialPlatform {
  return (
    value === "facebook" ||
    value === "reels" ||
    value === "instagram" ||
    value === "tiktok"
  );
}

// เดิม isValidVideoUrl() ถูกเขียนซ้ำแยกกันใน prepare/route.ts และ post/route.ts (STEP 9/10) —
// STEP 12 เพิ่ม route ที่ 3 (/api/social/queue) ที่ต้องใช้ตรรกะเดียวกันอีก จึงรวมมาไว้ที่นี่ที่เดียว
// (ตรรกะเดิมทุกประการ ไม่เปลี่ยนพฤติกรรม): ต้องขึ้นต้นด้วย /generated/video/ และไม่มี ".."
export function isValidGeneratedVideoUrl(videoUrl: string): boolean {
  if (!videoUrl || !videoUrl.startsWith("/")) {
    return false;
  }

  const cleanUrl = decodeURIComponent(videoUrl.split("?")[0]);

  return !cleanUrl.includes("..") && cleanUrl.startsWith("/generated/video/");
}

// limit จริงที่เข้มที่สุดในสามแพลตฟอร์ม (Instagram/TikTok) — ใช้ร่วมกันทั้ง post/route.ts และ
// queue/route.ts กันค่าไม่ตรงกันระหว่าง 2 จุดที่ validate caption เดียวกัน
export const MAX_CAPTION_LENGTH = 2200;

export type ProductSummary = {
  id: number;
  name: string;
  model: string | null;
  master: string | null;
  year: string | null;
  price: number;
  stock: number;
};

export type GeneratedContent = {
  facebook: string;
  reels: string;
  tiktok: string;
  script: string;
};

export type PostStatus = "ready_to_post" | "draft";

export type ContentPackage = {
  productId: number;
  platform: SocialPlatform;
  videoUrl: string;
  audioUrl?: string;
  product: ProductSummary;
  content: GeneratedContent;
  caption: string;
  hashtags: string[];
  status: PostStatus;
};

// แฮชแท็กของแบรนด์ — ใช้ชุดเดียวกับที่ content-studio ใช้อยู่แล้วทุกประการ (ไม่สร้างชุดใหม่ซ้ำซ้อน)
const BRAND_HASHTAGS: Record<SocialPlatform, string[]> = {
  facebook: ["#THAIAMULETTH", "#วัตถุมงคล", "#พระเครื่อง", "#สายมู"],
  reels: ["#THAIAMULETTH", "#วัตถุมงคล", "#Reels"],
  // Instagram ยังไม่มีประเภทคอนเทนต์ของตัวเองในระบบ (content-studio ก็ไม่มี) — ใช้ caption/hashtag
  // สไตล์เดียวกับ Reels ไปก่อน เพราะ Instagram Reels เป็นรูปแบบที่ใกล้เคียงที่สุดที่มีข้อมูลจริงรองรับ
  instagram: ["#THAIAMULETTH", "#วัตถุมงคล", "#Reels"],
  tiktok: ["#THAIAMULETTH", "#พระเครื่อง", "#วัตถุมงคล", "#TikTok"],
};

function captionForPlatform(
  content: GeneratedContent,
  platform: SocialPlatform
): string {
  if (platform === "facebook") return content.facebook;
  if (platform === "tiktok") return content.tiktok;
  return content.reels; // reels และ instagram ใช้ caption สไตล์เดียวกัน
}

export function buildContentPackage(params: {
  productId: number;
  platform: SocialPlatform;
  videoUrl: string;
  audioUrl?: string;
  product: ProductSummary;
  content: GeneratedContent;
}): ContentPackage {
  const caption = captionForPlatform(params.content, params.platform).trim();

  return {
    productId: params.productId,
    platform: params.platform,
    videoUrl: params.videoUrl,
    audioUrl: params.audioUrl,
    product: params.product,
    content: params.content,
    caption,
    hashtags: BRAND_HASHTAGS[params.platform],
    status: caption ? "ready_to_post" : "draft",
  };
}

// ===== หมายเหตุสถาปัตยกรรมสำหรับอนาคต (STEP 9.5) — ยังไม่ implement การโพสต์จริง =====
//
// เมื่อถึงเวลาต่อ API โพสต์จริง จุดที่ควรขยายมีดังนี้ (ไม่ใช่การ implement ตอนนี้):
//
// 1. Facebook Graph API / Instagram Graph API — ต้องมี Page Access Token (เก็บผ่าน environment
//    variable เท่านั้น เช่น FACEBOOK_PAGE_ACCESS_TOKEN, ห้าม hardcode ใน source code) แล้วเรียก
//    POST /{page-id}/videos หรือ /{ig-user-id}/media ตาม Graph API ปัจจุบัน
// 2. TikTok Content Posting API — ต้องมี OAuth access token ต่อบัญชี TikTok Business
// 3. Post Queue — ตาราง DB ใหม่ (เช่น social_posts: id, product_id, platform, video_url, caption,
//    hashtags, status, scheduled_at, posted_at, external_post_id, error_message, created_at) เพื่อ
//    เก็บสถานะจริงของแต่ละโพสต์ แยกจากตาราง content เดิมโดยสิ้นเชิง (ไม่ผสมกัน)
// 4. Scheduled Posting — ต้องมี worker/cron แยกต่างหากที่ query สถานะ "scheduled" แล้วยิงโพสต์ตามเวลา
// 5. Posting Status + Retry — status enum เช่น draft/queued/posting/posted/failed, เก็บ error
//    message ไว้ retry ได้ (ไม่ retry อัตโนมัติแบบไม่จำกัดครั้ง)
// 6. Analytics — ดึงสถิติย้อนกลับจาก Graph API/TikTok API หลังโพสต์สำเร็จ เก็บแยกตาราง
//
// ContentPackage ที่ประกอบไว้ในไฟล์นี้ออกแบบให้มีข้อมูลครบพอที่จะส่งต่อเข้าขั้นตอนโพสต์จริงข้างต้นได้ทันที
// โดยไม่ต้องปรับโครงสร้างใหม่
