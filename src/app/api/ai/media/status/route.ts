import { NextResponse } from "next/server";
import { isAiImageGenerationConfigured } from "@/lib/ai/imageGeneration";
import { getVideoProvider } from "@/lib/ai/video";

export const runtime = "nodejs";

// GET /api/ai/media/status — เช็คว่า AI Image/Video Generation พร้อมใช้งานหรือไม่
// ไม่มีทางเปิดเผย token/key ใน response นี้ — คืนแค่ status/message เท่านั้น
//
// STEP 14: video ใช้ provider จริง (Replicate) แทน stub "unavailable" ถาวรของ STEP 13 แล้ว —
// validateConnection() เช็ค credential ก่อนเสมอ ไม่ยิง network request ถ้ายังไม่ตั้งค่า
export async function GET() {
  try {
    const imageConfigured = isAiImageGenerationConfigured();
    const videoProvider = getVideoProvider();
    const videoStatus = await videoProvider.validateConnection();

    return NextResponse.json({
      success: true,
      image: {
        status: imageConfigured ? "connected" : "not_configured",
      },
      video: {
        provider: videoProvider.name,
        status: videoStatus.status,
        ...(videoStatus.message ? { message: videoStatus.message } : {}),
      },
    });
  } catch (error) {
    console.error("GET /api/ai/media/status error:", error);

    return NextResponse.json(
      { error: "ไม่สามารถตรวจสถานะ AI Media Generation ได้" },
      { status: 500 }
    );
  }
}
