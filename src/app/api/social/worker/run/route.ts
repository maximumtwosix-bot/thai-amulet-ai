import { NextResponse } from "next/server";
import { runSocialWorker, WorkerAlreadyRunningError } from "@/lib/socialWorker";

export const runtime = "nodejs";

// POST /api/social/worker/run — manual/administrator trigger เท่านั้น
//
// โปรเจกต์นี้ไม่มีระบบ authentication/authorization อยู่เลย (ตรวจสอบแล้วทั้ง codebase — ไม่มี
// middleware.ts, session, หรือ user table ใดๆ) จึงใช้ pattern เดียวกับทุก credential ในระบบนี้
// (OPENAI_API_KEY / REPLICATE_API_TOKEN / FACEBOOK_* ฯลฯ): ต้องตั้งค่า WORKER_TRIGGER_SECRET ผ่าน
// environment variable ก่อนเท่านั้นจึงจะเรียก endpoint นี้ได้ — ถ้ายังไม่ตั้งค่า ระบบปฏิเสธคำขอ
// ทุกครั้งโดยอัตโนมัติ (ปลอดภัยไว้ก่อน ไม่ใช่เปิดรับโดย default) ไม่มีทาง bypass ได้
function isAuthorized(request: Request): { authorized: boolean; configured: boolean } {
  const secret = process.env.WORKER_TRIGGER_SECRET || "";

  if (!secret) {
    return { authorized: false, configured: false };
  }

  const header =
    request.headers.get("x-worker-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

  return { authorized: header === secret, configured: true };
}

export async function POST(request: Request) {
  try {
    const { authorized, configured } = isAuthorized(request);

    if (!configured) {
      return NextResponse.json(
        {
          success: false,
          status: "not_configured",
          error: "ยังไม่ได้ตั้งค่า WORKER_TRIGGER_SECRET — ไม่สามารถเรียก worker ได้",
        },
        { status: 503 }
      );
    }

    if (!authorized) {
      return NextResponse.json(
        { success: false, error: "ไม่ได้รับอนุญาตให้เรียก worker (secret ไม่ถูกต้อง)" },
        { status: 401 }
      );
    }

    const result = await runSocialWorker();

    return NextResponse.json({
      success: true,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      summary: result.summary,
    });
  } catch (error) {
    if (error instanceof WorkerAlreadyRunningError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 409 }
      );
    }

    console.error("POST /api/social/worker/run error:", error);

    return NextResponse.json(
      { error: "ไม่สามารถรัน worker ได้" },
      { status: 500 }
    );
  }
}
