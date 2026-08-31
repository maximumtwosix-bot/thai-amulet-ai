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

// Instagram Graph API — Reels publishing (2-step: create container → media_publish)
// ต้องมี INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_BUSINESS_ACCOUNT_ID
//
// หมายเหตุ: เรียก Graph API จริงตาม spec เอกสารทางการ ยังไม่เคยทดสอบกับ credentials จริง —
// ไม่มี env ที่ตั้งค่าไว้ในระบบตอนนี้ จะคืน not_configured เสมอ ไม่ยิง network request ออกไปเลย

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

function getEnv() {
  return {
    accountId: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || "",
    accessToken: process.env.INSTAGRAM_ACCESS_TOKEN || "",
  };
}

function isConfigured(env: ReturnType<typeof getEnv>): boolean {
  return Boolean(env.accountId && env.accessToken);
}

export class InstagramProvider implements SocialProvider {
  readonly platform = "instagram" as const;

  async validateConnection(): Promise<ProviderStatus> {
    const env = getEnv();

    if (!isConfigured(env)) {
      return { platform: this.platform, status: "not_configured" };
    }

    try {
      const url = new URL(`${GRAPH_API_BASE}/${env.accountId}`);
      url.searchParams.set("fields", "id,username");
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
          message:
            data?.error?.message || "ไม่สามารถยืนยันการเชื่อมต่อ Instagram Business Account ได้",
        };
      }

      return {
        platform: this.platform,
        status: "connected",
        accountName: data.username,
      };
    } catch (error) {
      console.error(
        `[instagram] validateConnection error (token=${maskSecret(env.accessToken)}):`,
        error instanceof Error ? error.message : error
      );

      return {
        platform: this.platform,
        status: "error",
        message: "ไม่สามารถเชื่อมต่อ Instagram Graph API ได้",
      };
    }
  }

  async createPost(input: CreatePostInput): Promise<CreatePostResult> {
    const env = getEnv();

    if (!isConfigured(env)) {
      throw new ProviderNotConfiguredError(this.platform);
    }

    const caption = [input.caption, ...input.hashtags].join("\n\n").trim();

    // ขั้นที่ 1: สร้าง media container (ยังไม่เผยแพร่จริง)
    const url = new URL(`${GRAPH_API_BASE}/${env.accountId}/media`);

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        media_type: "REELS",
        video_url: input.videoUrl,
        caption,
        access_token: env.accessToken,
      }),
      cache: "no-store",
      signal: providerFetchSignal(),
    });

    const data = await response.json();

    if (!response.ok || !data?.id) {
      throw new Error(
        data?.error?.message || "Instagram API ไม่ยืนยันการสร้าง media container"
      );
    }

    return {
      externalPostId: String(data.id), // creation_id — ยังไม่ใช่ published post id
      status: "processing",
      raw: data,
    };
  }

  async publishPost(externalPostId: string): Promise<CreatePostResult> {
    const env = getEnv();

    if (!isConfigured(env)) {
      throw new ProviderNotConfiguredError(this.platform);
    }

    // ขั้นที่ 2: เผยแพร่ container ที่สร้างไว้จาก createPost() จริง — Instagram บังคับ 2 ขั้นตอนนี้เสมอ
    const url = new URL(`${GRAPH_API_BASE}/${env.accountId}/media_publish`);

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: externalPostId,
        access_token: env.accessToken,
      }),
      cache: "no-store",
      signal: providerFetchSignal(),
    });

    const data = await response.json();

    if (!response.ok || !data?.id) {
      throw new Error(
        data?.error?.message || "Instagram API ไม่ยืนยันการเผยแพร่โพสต์"
      );
    }

    return {
      externalPostId: String(data.id), // published media id — คนละตัวกับ creation_id
      status: "published",
      raw: data,
    };
  }

  async getStatus(externalPostId: string): Promise<PostStatusResult> {
    const env = getEnv();

    if (!isConfigured(env)) {
      throw new ProviderNotConfiguredError(this.platform);
    }

    const url = new URL(`${GRAPH_API_BASE}/${externalPostId}`);
    url.searchParams.set("fields", "status_code");
    url.searchParams.set("access_token", env.accessToken);

    const response = await fetch(url.toString(), {
      cache: "no-store",
      signal: providerFetchSignal(),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error?.message || "ไม่สามารถตรวจสถานะโพสต์ Instagram ได้");
    }

    const statusCode = data?.status_code as string | undefined;

    if (statusCode === "FINISHED" || statusCode === "PUBLISHED") {
      return { externalPostId, status: "published" };
    }

    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      return {
        externalPostId,
        status: "failed",
        message: "Instagram รายงานว่าประมวลผลวิดีโอล้มเหลว",
      };
    }

    return { externalPostId, status: "processing" };
  }
}
