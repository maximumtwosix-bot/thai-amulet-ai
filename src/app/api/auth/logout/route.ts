import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

// STEP 28 — clears the session cookie. Not protected by src/proxy.ts on purpose (a user whose
// session already expired must still be able to call this without being redirected to /login first).
export async function POST() {
  const response = NextResponse.json({ success: true });

  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
