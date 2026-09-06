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

// STEP 113 — additive session payload extension (STEP 112 Option A design, item 1 only — NO
// ownership enforcement anywhere yet, this STEP only makes the session CAPABLE of carrying a
// verified taxpayer identity for a later STEP to consume). taxpayerProfileId is deliberately the
// ONLY new field — never taxpayer name/tax ID/VAT/WHT data, per that design's explicit "don't put
// sensitive tax data in the session" instruction. Optional so every existing (pre-STEP-113) token
// keeps verifying exactly as before: a payload missing this field is not malformed, just "no
// taxpayer bound yet".
type SessionPayload = {
  exp: number;
  taxpayerProfileId?: number;
};

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    // ตั้งใจ throw ตรงนี้ (ไม่ fallback เป็นค่า default ใดๆ) — ถ้าไม่ตั้ง SESSION_SECRET ระบบต้อง
    // ล้มเหลวชัดเจนทันที ไม่ใช่เดินหน้าเซ็น/ตรวจ session ด้วยค่าลับที่คาดเดาได้
    throw new Error("SESSION_SECRET is not configured");
  }

  return secret;
}

// Exported (STEP 78) so src/lib/assistantTools.ts can sign/verify the Local AI Assistant's
// order-status confirmation token with the SAME secret and algorithm as the session cookie above,
// rather than a second, independently-implemented HMAC — one signing primitive for the whole app.
// Signature/behavior of this function is otherwise completely unchanged from STEP 28.
export function signPayload(payload: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

// เปรียบเทียบสตริงแบบ timing-safe เสมอ (ทั้งกรณี username และ password) — ป้องกัน timing attack ที่
// อาจใช้เดา credential ทีละตัวอักษรจากเวลาตอบสนองที่ต่างกัน ความยาวไม่เท่ากันถือว่าไม่ตรงทันที แต่ยังคง
// รัน timingSafeEqual กับตัวมันเองก่อน เพื่อไม่ให้ทางลัด (early return) เผยให้เห็นความแตกต่างของเวลาที่
// ชัดเจนเกินไประหว่างกรณี "ความยาวผิด" กับ "ความยาวถูกแต่ค่าไม่ตรง"
//
// Exported (STEP 78) for the same reason as signPayload above — reused as-is, unchanged, by the
// Assistant confirmation token verifier.
export function timingSafeStringEqual(a: string, b: string): boolean {
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

// taxpayerProfileId is OPTIONAL and, when given, MUST already be a server-validated, real
// taxpayer_profiles id (STEP 113's security requirement: "MUST NOT be accepted blindly from...
// arbitrary client input") — this function itself does not query the database to re-check that,
// because its only caller (src/app/api/auth/login/route.ts) already obtains the id exclusively
// from src/lib/sessionBootstrap.ts's resolveBootstrapTaxpayerProfileId(), which reads it directly
// off a real DB query (listTaxpayerProfiles({ isActive: true })) — never off any client input.
// Only a finite positive integer is ever embedded; anything else is silently omitted rather than
// embedding a malformed value.
export function createSessionToken(taxpayerProfileId?: number | null): string {
  const exp = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;

  const payloadObject: SessionPayload = { exp };

  if (
    typeof taxpayerProfileId === "number" &&
    Number.isInteger(taxpayerProfileId) &&
    taxpayerProfileId > 0
  ) {
    payloadObject.taxpayerProfileId = taxpayerProfileId;
  }

  const payload = Buffer.from(JSON.stringify(payloadObject)).toString("base64url");
  const signature = signPayload(payload);

  return `${payload}.${signature}`;
}

// Single source of truth for "is this token's signature valid and not expired, and if so, what
// does its payload actually say" — both verifySessionToken() and resolveSessionTaxpayerId() below
// go through this one function, so there is exactly one place that decides whether a payload is
// trusted, never two independently-maintained checks that could drift apart.
function decodeVerifiedPayload(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;

  const parts = token.split(".");

  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  const expectedSignature = signPayload(payload);

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

    if (typeof data.exp !== "number" || Date.now() > data.exp) return null;

    const taxpayerProfileId =
      typeof data.taxpayerProfileId === "number" &&
      Number.isInteger(data.taxpayerProfileId) &&
      data.taxpayerProfileId > 0
        ? data.taxpayerProfileId
        : undefined;

    return { exp: data.exp, taxpayerProfileId };
  } catch {
    return null;
  }
}

// Signature, return type, and every existing pass/fail case are byte-for-byte unchanged from
// before STEP 113 — src/proxy.ts calls this exact function with this exact contract and needed
// zero changes. Internally it now shares decodeVerifiedPayload() with resolveSessionTaxpayerId()
// below, rather than re-implementing the same signature/expiry check a second time.
export function verifySessionToken(token: string | undefined | null): boolean {
  return decodeVerifiedPayload(token) !== null;
}

// STEP 113 — the "resolveSessionTaxpayer()" helper: returns the taxpayer identity bound into an
// ALREADY-VERIFIED session token, or null if the token is missing/tampered/expired/malformed, OR
// simply carries no taxpayer identity yet (an old, pre-STEP-113 session; a session bootstrapped
// with zero or more-than-one active taxpayer_profiles — see src/lib/sessionBootstrap.ts). Callers
// MUST treat null as "no taxpayer identity available" and fail closed for any operation that
// requires one — this STEP does not add any such caller yet (no ownership checks exist), but this
// is the one function a later STEP will call to get that answer safely. Never trusts a
// client-supplied taxpayerProfileId from anywhere else — the ONLY input is the signed cookie
// token itself, verified via the exact same decodeVerifiedPayload() path as authentication.
export function resolveSessionTaxpayerId(token: string | undefined | null): number | null {
  const payload = decodeVerifiedPayload(token);

  if (!payload) return null;

  return payload.taxpayerProfileId ?? null;
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
