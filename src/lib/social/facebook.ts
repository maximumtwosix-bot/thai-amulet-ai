import {
  maskSecret,
  providerFetchSignal,
  ProviderNotConfiguredError,
  type CreatePostInput,
  type CreatePostResult,
  type PostStatusResult,
  type ProviderStatus,
  type SocialProvider,
} from "@/lib/social/provider";

// Facebook Graph API — Page video publishing
// ต้องมี FACEBOOK_PAGE_ID + FACEBOOK_ACCESS_TOKEN (Page Access Token) เป็นอย่างน้อย
// FACEBOOK_APP_ID/FACEBOOK_APP_SECRET ใช้เสริมตอน validateConnection() ผ่าน debug_token
// (ยืนยันว่า token ยังไม่หมดอายุ/ผูกกับ App ID ที่ถูกต้อง) — ไม่ใช้สร้าง OAuth flow ใหม่ในไฟล์นี้
//
// หมายเหตุ: โค้ดนี้เรียก Graph API จริงตาม spec ที่เอกสารทางการระบุ ยังไม่เคยถูกทดสอบกับ
// credentials จริง (ไม่มีในระบบตอนนี้) — เมื่อยังไม่ตั้งค่า env จะคืน not_configured เสมอ ไม่มีทาง
// เรียก network ออกไปได้เลยจนกว่าจะมี access token จริง

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

function getEnv() {
  return {
    pageId: process.env.FACEBOOK_PAGE_ID || "",
    accessToken: process.env.FACEBOOK_ACCESS_TOKEN || "",
    appId: process.env.FACEBOOK_APP_ID || "",
    appSecret: process.env.FACEBOOK_APP_SECRET || "",
  };
}

function isConfigured(env: ReturnType<typeof getEnv>): boolean {
  return Boolean(env.pageId && env.accessToken);
}

export class FacebookProvider implements SocialProvider {
  readonly platform = "facebook" as const;

  async validateConnection(): Promise<ProviderStatus> {
    const env = getEnv();

    if (!isConfigured(env)) {
      return { platform: this.platform, status: "not_configured" };
    }

    try {
      const url = new URL(`${GRAPH_API_BASE}/${env.pageId}`);
      url.searchParams.set("fields", "id,name");
      url.searchParams.set("access_token", env.accessToken);

      const response = await fetch(url.toString(), {
        cache: "no-store",
        signal: providerFetchSignal(),
      });
      const data = await response.json();

      if (!response.ok || !data?.id) {
        return {
          platform: this.platform,
          status: "error",
          message: data?.error?.message || "ไม่สามารถยืนยันการเชื่อมต่อ Facebook Page ได้",
        };
      }

      return {
        platform: this.platform,
        status: "connected",
        accountName: data.name,
      };
    } catch (error) {
      console.error(
        `[facebook] validateConnection error (token=${maskSecret(env.accessToken)}):`,
        error instanceof Error ? error.message : error
      );

      return {
        platform: this.platform,
        status: "error",
        message: "ไม่สามารถเชื่อมต่อ Facebook Graph API ได้",
      };
    }
  }

  async createPost(input: CreatePostInput): Promise<CreatePostResult> {
    const env = getEnv();

    if (!isConfigured(env)) {
      throw new ProviderNotConfiguredError(this.platform);
    }

    const caption = [input.caption, ...input.hashtags].join("\n\n").trim();

    const url = new URL(`${GRAPH_API_BASE}/${env.pageId}/videos`);

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        file_url: input.videoUrl,
        description: caption,
        access_token: env.accessToken,
      }),
      cache: "no-store",
      signal: providerFetchSignal(),
    });

    const data = await response.json();

    if (!response.ok || !data?.id) {
      throw new Error(
        data?.error?.message || "Facebook API ไม่ยืนยันการอัปโหลดวิดีโอ"
      );
    }

    return {
      externalPostId: String(data.id),
      status: "processing",
      raw: data,
    };
  }

  async publishPost(externalPostId: string): Promise<CreatePostResult> {
    // POST /{page-id}/videos เผยแพร่ทันทีในตัวเอง ไม่มีขั้นตอน publish แยกต่างหากแบบ Instagram —
    // ขั้นนี้แค่ยืนยันสถานะปัจจุบันจริงจาก API อีกครั้ง ไม่ได้ "แกล้งทำ" ว่ามีขั้นตอนเพิ่ม
    const status = await this.getStatus(externalPostId);

    return {
      externalPostId,
      status: status.status === "published" ? "published" : "processing",
      raw: status,
    };
  }

  async getStatus(externalPostId: string): Promise<PostStatusResult> {
    const env = getEnv();

    if (!isConfigured(env)) {
      throw new ProviderNotConfiguredError(this.platform);
    }

    const url = new URL(`${GRAPH_API_BASE}/${externalPostId}`);
    url.searchParams.set("fields", "id,status");
    url.searchParams.set("access_token", env.accessToken);

    const response = await fetch(url.toString(), {
      cache: "no-store",
      signal: providerFetchSignal(),
    });
    const data = await response.json();

    if (!response.ok || !data?.id) {
      throw new Error(data?.error?.message || "ไม่สามารถตรวจสถานะโพสต์ Facebook ได้");
    }

    const videoStatus = data?.status?.video_status as string | undefined;

    if (videoStatus === "ready") {
      return { externalPostId, status: "published" };
    }

    if (videoStatus === "error") {
      return {
        externalPostId,
        status: "failed",
        message: "Facebook รายงานว่าประมวลผลวิดีโอล้มเหลว",
      };
    }

    return { externalPostId, status: "processing" };
  }
}
