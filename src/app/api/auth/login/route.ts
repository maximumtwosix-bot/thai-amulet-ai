import { NextResponse } from "next/server";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  verifyCredentials,
} from "@/lib/auth";
import { resolveBootstrapTaxpayerProfileId } from "@/lib/sessionBootstrap";

export const runtime = "nodejs";

// STEP 28 — deliberately intentionally NOT protected by src/proxy.ts (must be reachable while
// logged out). Returns one generic error message for both "unknown username" and "wrong password"
// so a failed attempt never reveals which field was incorrect.
export async function POST(request: Request) {
  try {
    let body: any;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "รูปแบบคำขอไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const username = typeof body?.username === "string" ? body.username : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!username.trim() || !password) {
      return NextResponse.json(
        { success: false, error: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน" },
        { status: 400 }
      );
    }

    if (!verifyCredentials(username, password)) {
      return NextResponse.json(
        { success: false, error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" },
        { status: 401 }
      );
    }

    // STEP 113 — bootstrap resolution only, never guessed: exactly one active taxpayer_profiles
    // row binds the new session to it; zero or more-than-one leaves the session unbound (still
    // fully authenticated, per existing behavior) and reports which case it was. No taxpayer is
    // created or modified here.
    const bootstrap = resolveBootstrapTaxpayerProfileId();
    const boundTaxpayerProfileId =
      bootstrap.status === "BOUND" ? bootstrap.taxpayerProfileId : undefined;

    const token = createSessionToken(boundTaxpayerProfileId);

    const response = NextResponse.json({ success: true, taxpayerBootstrap: bootstrap.status });

    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return response;
  } catch (error) {
    console.error("POST /api/auth/login error:", error);

    return NextResponse.json(
      { success: false, error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}
