import {
  maskSecret,
  providerFetchSignal,
  VideoProviderNotConfiguredError,
  type CreateVideoJobInput,
  type CreateVideoJobResult,
  type VideoGenerationProvider,
  type VideoJobStatusResult,
  type VideoProviderStatus,
} from "@/lib/ai/video/provider";

// Replicate — เลือกเป็น AI Video provider ของ STEP 14 เพราะ:
//   1. เป็น platform-level aggregator ไม่ผูกกับโมเดลเดียว — ลดความเสี่ยงจาก provider/model
//      deprecation แบบที่เจอกับ OpenAI Sora ใน STEP 13 (Sora ปิดตัว 24 ก.ย. 2569)
//   2. REST API เดียว (Predictions API) ใช้ได้กับทุกโมเดลบน platform รวมถึง video generation
//   3. เป็น async job-based โดยธรรมชาติ (create → poll) ตรงกับที่ STEP 14 กำหนดไว้ตั้งแต่ต้น
//   4. ไม่ต้องติดตั้ง SDK ใหม่ เรียกผ่าน fetch ตรงๆ แบบเดียวกับ src/lib/social/*.ts (STEP 10)
//
// โมเดลที่ใช้จริงตั้งค่าได้ผ่าน REPLICATE_VIDEO_MODEL (ไม่ hardcode ผูกกับโมเดลเดียวถาวร)
// ค่า default เป็นเพียงตัวอย่างที่ใช้งานได้จริง ณ ตอนเขียนโค้ดนี้ — ควรตรวจสอบ/อัปเดตให้ตรงกับ
// catalog ปัจจุบันของ Replicate ก่อนใช้งานจริง เพราะ pricing/availability ของแต่ละโมเดลเปลี่ยนได้
const DEFAULT_MODEL = "minimax/video-01";
const REPLICATE_API_BASE = "https://api.replicate.com/v1";

function getEnv() {
  return {
    apiToken: process.env.REPLICATE_API_TOKEN || "",
    model: process.env.REPLICATE_VIDEO_MODEL || DEFAULT_MODEL,
  };
}

function isConfigured(env: ReturnType<typeof getEnv>): boolean {
  return Boolean(env.apiToken);
}

export class ReplicateVideoProvider implements VideoGenerationProvider {
  readonly name = "replicate";

  async validateConnection(): Promise<VideoProviderStatus> {
    const env = getEnv();

    if (!isConfigured(env)) {
      return { provider: this.name, status: "not_configured" };
    }

    try {
      const response = await fetch(`${REPLICATE_API_BASE}/account`, {
        headers: { Authorization: `Bearer ${env.apiToken}` },
        cache: "no-store",
        signal: providerFetchSignal(),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          provider: this.name,
          status: "error",
          message: data?.detail || "ไม่สามารถยืนยันการเชื่อมต่อ Replicate ได้",
        };
      }

      return { provider: this.name, status: "connected" };
    } catch (error) {
      console.error(
        `[replicate] validateConnection error (token=${maskSecret(env.apiToken)}):`,
        error instanceof Error ? error.message : error
      );

      return {
        provider: this.name,
        status: "error",
        message: "ไม่สามารถเชื่อมต่อ Replicate API ได้",
      };
    }
  }

  async createJob(input: CreateVideoJobInput): Promise<CreateVideoJobResult> {
    const env = getEnv();

    if (!isConfigured(env)) {
      throw new VideoProviderNotConfiguredError(this.name);
    }

    const response = await fetch(
      `${REPLICATE_API_BASE}/models/${env.model}/predictions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: { prompt: input.prompt },
        }),
        cache: "no-store",
        signal: providerFetchSignal(),
      }
    );

    const data = await response.json();

    if (!response.ok || !data?.id) {
      throw new Error(data?.detail || "Replicate API ไม่ยืนยันการเริ่มสร้างวิดีโอ");
    }

    return { externalJobId: String(data.id), status: "processing" };
  }

  async getJobStatus(externalJobId: string): Promise<VideoJobStatusResult> {
    const env = getEnv();

    if (!isConfigured(env)) {
      throw new VideoProviderNotConfiguredError(this.name);
    }

    const response = await fetch(
      `${REPLICATE_API_BASE}/predictions/${externalJobId}`,
      {
        headers: { Authorization: `Bearer ${env.apiToken}` },
        cache: "no-store",
        signal: providerFetchSignal(),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.detail || "ไม่สามารถตรวจสถานะงานสร้างวิดีโอได้");
    }

    if (data.status === "succeeded") {
      const output = Array.isArray(data.output) ? data.output[0] : data.output;

      if (typeof output !== "string" || !output) {
        return {
          status: "failed",
          message: "Replicate รายงานว่าสำเร็จ แต่ไม่มี URL วิดีโอส่งกลับมา",
        };
      }

      return { status: "succeeded", videoUrl: output };
    }

    if (data.status === "failed" || data.status === "canceled") {
      return {
        status: "failed",
        message: data?.error || "Replicate รายงานว่าสร้างวิดีโอล้มเหลว",
      };
    }

    return { status: "processing" };
  }
}
