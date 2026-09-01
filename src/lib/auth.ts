import crypto from "node:crypto";

// STEP 28 — minimal back-office authentication for a single internal admin user.
//
// No user table, no external auth library — this is an environment-configured single-credential
// gate (ADMIN_USERNAME/ADMIN_PASSWORD) plus a self-issued, HMAC-signed session cookie. Verified
// against Node's built-in `crypto` module, which is available here because src/proxy.ts (STEP 28)
// runs on the Node.js runtime by default in this Next.js version (proxy.js defaults to Node.js
// runtime as of Next 16 — see node_modules/next/dist/docs/.../proxy.md, "Runtime" section; the
// deprecated `runtime` export is not settable on proxy files at all, so this is not a choice we
// made, it's the platform default). No password is ever stored anywhere except as an environment
// variable — never in the database, never in a cookie, never logged.

export const SESSION_COOKIE_NAME = "taa_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    // ตั้งใจ throw ตรงนี้ (ไม่ fallback เป็นค่า default ใดๆ) — ถ้าไม่ตั้ง SESSION_SECRET ระบบต้อง
    // ล้มเหลวชัดเจนทันที ไม่ใช่เดินหน้าเซ็น/ตรวจ session ด้วยค่าลับที่คาดเดาได้
    throw new Error("SESSION_SECRET is not configured");
  }

  return secret;
}

function signPayload(payload: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

// เปรียบเทียบสตริงแบบ timing-safe เสมอ (ทั้งกรณี username และ password) — ป้องกัน timing attack ที่
// อาจใช้เดา credential ทีละตัวอักษรจากเวลาตอบสนองที่ต่างกัน ความยาวไม่เท่ากันถือว่าไม่ตรงทันที แต่ยังคง
// รัน timingSafeEqual กับตัวมันเองก่อน เพื่อไม่ให้ทางลัด (early return) เผยให้เห็นความแตกต่างของเวลาที่
// ชัดเจนเกินไประหว่างกรณี "ความยาวผิด" กับ "ความยาวถูกแต่ค่าไม่ตรง"
function timingSafeStringEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  if (bufferA.length !== bufferB.length) {
    crypto.timingSafeEqual(bufferA, bufferA);
    return false;
  }

  return crypto.timingSafeEqual(bufferA, bufferB);
}

export function verifyCredentials(username: string, password: string): boolean {
  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedUsername || !expectedPassword) {
    return false;
  }

  const usernameOk = timingSafeStringEqual(username, expectedUsername);
  const passwordOk = timingSafeStringEqual(password, expectedPassword);

  return usernameOk && passwordOk;
}

export function createSessionToken(): string {
  const exp = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  const signature = signPayload(payload);

  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;

  const parts = token.split(".");

  if (parts.length !== 2) return false;

  const [payload, signature] = parts;
  const expectedSignature = signPayload(payload);

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) return false;
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

    if (typeof data.exp !== "number" || Date.now() > data.exp) return false;

    return true;
  } catch {
    return false;
  }
}

// กันการเปิด redirect ไปโดเมนอื่น (open redirect) หลัง login สำเร็จ — รับเฉพาะ path ภายในเว็บนี้เอง
// ที่ขึ้นต้นด้วย "/" เดี่ยว (ไม่ใช่ "//" ซึ่งเบราว์เซอร์ตีความเป็น protocol-relative URL ไปโดเมนอื่นได้)
// และต้องไม่มี "://" ปนอยู่เลย
export function isSafeRedirectPath(path: string | null | undefined): path is string {
  if (!path) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.includes("://")) return false;

  return true;
}
