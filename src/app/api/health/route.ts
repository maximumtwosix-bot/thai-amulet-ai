import { NextResponse } from "next/server";
import db from "@/lib/db";
import { isAiImageGenerationConfigured } from "@/lib/ai/imageGeneration";
import { isVideoGenerationConfigured } from "@/lib/ai/video";
import { getLatestWorkerRun } from "@/lib/socialWorkerRuns";

export const runtime = "nodejs";

// GET /api/health — STEP 18
//
// ห้ามเรียก external provider จริงเด็ดขาด (Facebook/Instagram/TikTok/Replicate) — aiImage/aiVideo
// เช็คแค่ "ตั้งค่า credential ไว้หรือยัง" (configured/not_configured) ไม่เคยเช็คว่า "เชื่อมต่อได้จริง
// หรือไม่" (connected) เพราะนั่นต้องยิง network request จริง — health check ต้องไม่มี side effect
// ใดๆ ต่อระบบภายนอกเลย ไม่ว่ากรณีใด
//
// database คือตัวเดียวที่ทำให้ HTTP status เป็น 503 ได้ (critical) — ส่วน socialWorker/aiImage/
// aiVideo เป็นข้อมูลประกอบเท่านั้น ไม่กระทบ overall HTTP status
export async function GET() {
  let databaseStatus: "ok" | "error" = "ok";

  try {
    db.prepare("SELECT 1").get();
  } catch (error) {
    console.error("GET /api/health database check error:", error);
    databaseStatus = "error";
  }

  let socialWorkerStatus: "ok" | "never_run" | "error" = "never_run";

  try {
    const lastRun = getLatestWorkerRun();

    if (lastRun) {
      socialWorkerStatus = lastRun.status === "failed" ? "error" : "ok";
    }
  } catch (error) {
    console.error("GET /api/health socialWorker check error:", error);
    socialWorkerStatus = "error";
  }

  const body = {
    app: "ok" as const,
    database: databaseStatus,
    socialWorker: socialWorkerStatus,
    aiImage: isAiImageGenerationConfigured() ? "configured" : "not_configured",
    aiVideo: isVideoGenerationConfigured() ? "configured" : "not_configured",
  };

  return NextResponse.json(body, { status: databaseStatus === "ok" ? 200 : 503 });
}
