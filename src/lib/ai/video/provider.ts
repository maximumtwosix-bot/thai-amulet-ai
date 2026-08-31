// AI Video Generation provider architecture — STEP 14
//
// สืบเนื่องจาก STEP 13 ที่พบว่า OpenAI Sora (ตัวเดียวที่มี SDK ติดตั้งอยู่แล้ว) deprecated และจะปิด
// ตัวถาวร 24 ก.ย. 2569 — STEP 14 นี้เลือก provider ใหม่ (ดู replicateProvider.ts) และวาง
// architecture เป็น async job-based ตั้งแต่ต้น (create → poll status → download) เพราะ video
// generation ใช้เวลานาน (นาทีขึ้นไป) ไม่เหมาะกับ blocking request แบบที่ image generation ทำได้
//
// กติกาเดียวกับ src/lib/social/provider.ts (STEP 10) ทุกประการ: ห้าม fake success, ห้าม log
// token/secret เต็มค่า, ต้องมี timeout ทุก network call — reuse maskSecret()/providerFetchSignal()
// จากไฟล์เดิมตรงๆ แทนที่จะเขียน utility ซ้ำ

export { maskSecret, providerFetchSignal } from "@/lib/social/provider";

export type VideoProviderConnectionStatus = "connected" | "not_configured" | "error";

export type VideoProviderStatus = {
  provider: string;
  status: VideoProviderConnectionStatus;
  message?: string;
};

export type CreateVideoJobInput = {
  prompt: string;
};

export type CreateVideoJobResult = {
  externalJobId: string;
  status: "processing";
};

export type VideoJobStatusResult =
  | { status: "processing" }
  | { status: "succeeded"; videoUrl: string }
  | { status: "failed"; message: string };

export interface VideoGenerationProvider {
  readonly name: string;

  /** เช็ค credential ก่อนเสมอ ไม่ยิง network request ถ้ายังไม่ตั้งค่า */
  validateConnection(): Promise<VideoProviderStatus>;

  /** เริ่ม async job — คืนแค่ job id จริงจาก API เท่านั้น ไม่มีทาง fake */
  createJob(input: CreateVideoJobInput): Promise<CreateVideoJobResult>;

  /** ตรวจสถานะ job จริง — videoUrl ต้องเป็น URL ของไฟล์จริงที่ provider ยืนยันว่าสร้างเสร็จเท่านั้น */
  getJobStatus(externalJobId: string): Promise<VideoJobStatusResult>;
}

export class VideoProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`ยังไม่ได้ตั้งค่าการเชื่อมต่อ ${provider}`);
    this.name = "VideoProviderNotConfiguredError";
  }
}
