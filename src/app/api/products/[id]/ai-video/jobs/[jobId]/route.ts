import { NextResponse } from "next/server";
import { getAiVideoJobById, markAiVideoJobFailed, markAiVideoJobPublished } from "@/lib/aiVideoJobs";
import { getVideoProvider } from "@/lib/ai/video";
import { downloadVideoToDisk } from "@/lib/ai/video/storage";
import { insertProductMedia } from "@/lib/productMedia";
import { calculateEstimatedCost } from "@/lib/costConfig";
import { finalizeAiGenerationCostByAiVideoJobId } from "@/lib/costLedger";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; jobId: string }>;
};

function parseId(raw: string): number | null {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

// GET /api/products/[id]/ai-video/jobs/[jobId] — ตรวจสถานะ job จริง
//
// ถ้า job นี้ published/failed อยู่แล้วใน DB คืนค่าจาก DB ตรงๆ ไม่ยิง network ซ้ำ (ผลจบแล้วไม่เปลี่ยน)
// ถ้ายัง processing จะ poll provider จริงอีกครั้ง — ถ้า provider ยืนยันว่าสำเร็จแล้ว จะดาวน์โหลด
// ไฟล์จริงมาเก็บและ insert เข้า product_media (type:"video", source:"ai") ตอนนั้นเท่านั้น
// ห้ามรายงาน published ถ้า provider ไม่ยืนยันสถานะ succeeded จริง
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id, jobId: rawJobId } = await context.params;
    const productId = parseId(id);
    const jobId = parseId(rawJobId);

    if (productId === null || jobId === null) {
      return NextResponse.json(
        { error: "รหัสสินค้าหรือรหัสงานไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const job = getAiVideoJobById(productId, jobId);

    if (!job) {
      return NextResponse.json(
        { error: `ไม่พบงานสร้างวิดีโอรหัส ${jobId} สำหรับสินค้านี้` },
        { status: 404 }
      );
    }

    // job จบแล้ว (published/failed) — คืนผลจริงจาก DB โดยตรง ไม่ต้อง poll provider ซ้ำอีก
    if (job.status !== "processing") {
      return NextResponse.json({ success: true, job });
    }

    if (!job.externalJobId) {
      return NextResponse.json({ success: true, job });
    }

    const provider = getVideoProvider();
    const status = await provider.getJobStatus(job.externalJobId);

    if (status.status === "processing") {
      return NextResponse.json({ success: true, job });
    }

    if (status.status === "failed") {
      markAiVideoJobFailed(job.id, status.message);

      // STEP 21: finalize ledger เป็น failed — เก็บ estimated_cost เดิมที่ตั้งไว้ตอนเริ่มงานไว้ (ไม่ล้าง
      // ทิ้ง เพราะเป็นค่าประมาณการของ "ความพยายามสร้าง" ไม่ใช่ผลลัพธ์ที่สำเร็จ) actual_cost ไม่มีทาง
      // รู้ได้จาก Replicate API นี้อยู่แล้ว จึงไม่ส่งค่าใดๆ เข้าไป (คงเป็น NULL)
      finalizeAiGenerationCostByAiVideoJobId(job.id, {
        status: "failed",
        metadataPatch: { error: status.message },
      });

      return NextResponse.json({
        success: true,
        job: { ...job, status: "failed", errorMessage: status.message },
      });
    }

    // status.status === "succeeded" — ดาวน์โหลดไฟล์จริงมาเก็บก่อนเสมอ ยังไม่ถือว่า published
    // จนกว่าจะยืนยันว่าไฟล์มีอยู่จริงบนดิสก์ (downloadVideoToDisk ทำการยืนยันนี้ให้แล้ว)
    try {
      const downloaded = await downloadVideoToDisk(status.videoUrl);

      const media = insertProductMedia({
        productId,
        fileName: downloaded.fileName,
        imageUrl: downloaded.videoUrl,
        source: "ai",
        type: "video",
      });

      markAiVideoJobPublished(job.id, media.id, downloaded.duration, downloaded.size);

      // STEP 21: ตอนนี้รู้ duration จริงแล้ว (ยืนยันด้วย ffprobe ใน downloadVideoToDisk) — คำนวณ
      // estimated cost ใหม่จาก duration จริงถ้ามีตั้งราคาแบบต่อวินาทีไว้ (แม่นกว่า flat estimate ตอน
      // เริ่มงาน) actual_cost ยังคง NULL เสมอ เพราะ Replicate ไม่มี endpoint คืนค่าใช้จ่ายจริงต่อ
      // prediction ให้ในสถาปัตยกรรมนี้
      const refinedEstimate = calculateEstimatedCost({
        provider: "replicate",
        operation: "video",
        durationSeconds: downloaded.duration,
      });

      finalizeAiGenerationCostByAiVideoJobId(job.id, {
        status: "succeeded",
        durationSeconds: downloaded.duration,
        mediaId: media.id,
        estimatedCost: refinedEstimate.cost,
        metadataPatch: { pricingReason: refinedEstimate.reason, fileSize: downloaded.size },
      });

      return NextResponse.json({
        success: true,
        job: {
          ...job,
          status: "published",
          productMediaId: media.id,
          duration: downloaded.duration,
          fileSize: downloaded.size,
        },
        media,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "ไม่สามารถบันทึกวิดีโอที่สร้างเสร็จแล้วได้";

      markAiVideoJobFailed(job.id, message);

      finalizeAiGenerationCostByAiVideoJobId(job.id, {
        status: "failed",
        metadataPatch: { error: message },
      });

      return NextResponse.json({
        success: true,
        job: { ...job, status: "failed", errorMessage: message },
      });
    }
  } catch (error) {
    console.error("GET /api/products/[id]/ai-video/jobs/[jobId] error:", error);

    return NextResponse.json(
      { error: "ไม่สามารถตรวจสถานะงานสร้างวิดีโอด้วย AI ได้" },
      { status: 500 }
    );
  }
}
