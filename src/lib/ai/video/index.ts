import { ReplicateVideoProvider } from "@/lib/ai/video/replicateProvider";
import type { VideoGenerationProvider } from "@/lib/ai/video/provider";

const provider = new ReplicateVideoProvider();

export function getVideoProvider(): VideoGenerationProvider {
  return provider;
}

// STEP 18 — เช็คแค่ว่า credential ตั้งค่าไว้หรือไม่ (ไม่มี network call เด็ดขาด ต่างจาก
// provider.validateConnection() ที่ถ้า configured แล้วจะยิง request จริงไปยัง Replicate) —
// ใช้โดย GET /api/health เท่านั้น เพราะ health check ห้ามเรียก external provider จริงไม่ว่ากรณีใด
export function isVideoGenerationConfigured(): boolean {
  return Boolean(process.env.REPLICATE_API_TOKEN);
}

export type {
  VideoGenerationProvider,
  VideoProviderStatus,
  VideoJobStatusResult,
} from "@/lib/ai/video/provider";
