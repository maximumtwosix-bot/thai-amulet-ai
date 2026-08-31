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

// TikTok Content Posting API
// ต้องมี TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET + TIKTOK_ACCESS_TOKEN
// (client key/secret ใช้ยืนยันตัวตนแอปตอน validate เท่านั้น — ไฟล์นี้ไม่ implement OAuth flow เอง
// สมมติว่า TIKTOK_ACCESS_TOKEN ได้มาจากขั้นตอน OAuth ที่ทำนอกระบบนี้แล้ว)
//
// หมายเหตุ: เรียก API จริงตาม spec เอกสารทางการ ยังไม่เคยทดสอบกับ credentials จริง —
// ไม่มี env ที่ตั้งค่าไว้ในระบบตอนนี้ จะคืน not_configured เสมอ ไม่ยิง network request ออกไปเลย

const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";

function getEnv() {
  return {
    clientKey: process.env.TIKTOK_CLIENT_KEY || "",
    clientSecret: process.env.TIKTOK_CLIENT_SECRET || "",
    accessToken: process.env.TIKTOK_ACCESS_TOKEN || "",
  };
}

function isConfigured(env: ReturnType<typeof getEnv>): boolean {
  return Boolean(env.clientKey && env.clientSecret && env.accessToken);
}

export class TikTokProvider implements SocialProvider {
  readonly platform = "tiktok" as const;

  async validateConnection(): Promise<ProviderStatus> {
    const env = getEnv();

    if (!isConfigured(env)) {
      return { platform: this.platform, status: "not_configured" };
    }

    try {
      const url = new URL(`${TIKTOK_API_BASE}/user/info/`);
      url.searchParams.set("fields", "open_id,display_name");

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${env.accessToken}` },
        cache: "no-store",
        signal: providerFetchSignal(),
      });

      const data = await response.json();

      if (!response.ok || data?.error?.code !== "ok") {
        return {
          platform: this.platform,
          status: "error",
          message: data?.error?.message || "ไม่สามารถยืนยันการเชื่อมต่อ TikTok ได้",
        };
      }

      return {
        platform: this.platform,
        status: "connected",
        accountName: data?.data?.user?.display_name,
      };
    } catch (error) {
      console.error(
        `[tiktok] validateConnection error (token=${maskSecret(env.accessToken)}):`,
        error instanceof Error ? error.message : error
      );

      return {
        platform: this.platform,
        status: "error",
        message: "ไม่สามารถเชื่อมต่อ TikTok API ได้",
      };
    }
  }

  async createPost(input: CreatePostInput): Promise<CreatePostResult> {
    const env = getEnv();

    if (!isConfigured(env)) {
      throw new ProviderNotConfiguredError(this.platform);
    }

    const caption = [input.caption, ...input.hashtags].join(" ").trim();

    const url = new URL(`${TIKTOK_API_BASE}/post/publish/video/init/`);

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: caption,
          privacy_level: "SELF_ONLY", // ปลอดภัยไว้ก่อนเป็นค่าเริ่มต้น — เปลี่ยนเป็น public ต้องตั้งใจทำเอง
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: input.videoUrl,
        },
      }),
      cache: "no-store",
      signal: providerFetchSignal(),
    });

    const data = await response.json();

    if (!response.ok || !data?.data?.publish_id) {
      throw new Error(data?.error?.message || "TikTok API ไม่ยืนยันการเริ่มอัปโหลดวิดีโอ");
    }

    return {
      externalPostId: String(data.data.publish_id),
      status: "processing",
      raw: data,
    };
  }

  async publishPost(externalPostId: string): Promise<CreatePostResult> {
    // TikTok ไม่มีขั้นตอน "publish" แยกจาก init — init เริ่ม pipeline แบบ async ไปเลย
    // ขั้นนี้แค่ตรวจสถานะจริงอีกครั้ง ไม่ได้เพิ่ม network call ที่ไม่มีอยู่จริงใน API
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

    const url = new URL(`${TIKTOK_API_BASE}/post/publish/status/fetch/`);

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ publish_id: externalPostId }),
      cache: "no-store",
      signal: providerFetchSignal(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error?.message || "ไม่สามารถตรวจสถานะโพสต์ TikTok ได้");
    }

    const publishStatus = data?.data?.status as string | undefined;

    if (publishStatus === "PUBLISH_COMPLETE") {
      return { externalPostId, status: "published" };
    }

    if (publishStatus === "FAILED") {
      return {
        externalPostId,
        status: "failed",
        message: data?.data?.fail_reason || "TikTok รายงานว่าอัปโหลดวิดีโอล้มเหลว",
      };
    }

    return { externalPostId, status: "processing" };
  }
}
