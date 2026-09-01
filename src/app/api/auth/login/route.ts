import { NextResponse } from "next/server";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  verifyCredentials,
} from "@/lib/auth";

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

    const token = createSessionToken();

    const response = NextResponse.json({ success: true });

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
