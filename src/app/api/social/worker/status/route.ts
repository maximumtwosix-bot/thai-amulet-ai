import { NextResponse } from "next/server";
import { getWorkerStatus } from "@/lib/socialWorker";

export const runtime = "nodejs";

// GET /api/social/worker/status — อ่านสถานะเท่านั้น ไม่มี side effect ไม่ต้อง auth (เหมือน
// GET /api/social/status, GET /api/social/queue) — ไม่มีทางเปิดเผย secret เพราะ getWorkerStatus()
// คืนแค่ idle/running + สรุปผลลัพธ์ครั้งล่าสุด ไม่เคยแตะ environment variable เลย
export async function GET() {
  try {
    const status = getWorkerStatus();

    return NextResponse.json({ success: true, ...status });
  } catch (error) {
    console.error("GET /api/social/worker/status error:", error);

    return NextResponse.json(
      { error: "ไม่สามารถตรวจสถานะ worker ได้" },
      { status: 500 }
    );
  }
}
