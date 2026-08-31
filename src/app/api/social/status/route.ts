import { NextResponse } from "next/server";
import { distinctProviders } from "@/lib/social";

export const runtime = "nodejs";

// GET /api/social/status — ตรวจสถานะการเชื่อมต่อของทั้ง 3 แพลตฟอร์ม
// ไม่มีทางเปิดเผย token/secret ใน response นี้ — provider.validateConnection() คืนแค่
// {status, accountName?, message?} เท่านั้น ไม่เคยส่ง credential กลับมาเลย
export async function GET() {
  try {
    const results = await Promise.all(
      distinctProviders.map((provider) => provider.validateConnection())
    );

    const providers: Record<
      string,
      { status: string; accountName?: string; message?: string }
    > = {};

    for (const result of results) {
      providers[result.platform] = {
        status: result.status,
        ...(result.accountName ? { accountName: result.accountName } : {}),
        ...(result.message ? { message: result.message } : {}),
      };
    }

    return NextResponse.json({ success: true, providers });
  } catch (error) {
    console.error("GET /api/social/status error:", error);

    return NextResponse.json(
      { error: "ไม่สามารถตรวจสถานะการเชื่อมต่อได้" },
      { status: 500 }
    );
  }
}
