import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

// STEP 28 — back-office authentication gate.
//
// File name/export are "proxy"/"proxy.ts", not "middleware"/"middleware.ts" — this Next.js version
// (16.3.2) deprecated and renamed middleware to proxy (see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md). Proxy defaults
// to the Node.js runtime here (not Edge), which is why src/lib/auth.ts can safely use Node's
// built-in `crypto` module.
//
// Deliberately narrow allowlist of protected paths, checked with exact/precise string logic in this
// function body — NOT relied upon purely via the `matcher` config below, because this Next version's
// own matcher docs note that a bare path like "/about" also matches "/about/team" (prefix-style),
// which would be wrong for us: "/api/products" must protect only the top-level list/create/edit/
// delete route, NOT "/api/products/[id]/media" or "/api/products/[id]/ai-video/*" (those are
// video/AI-adjacent and explicitly out of scope for this STEP — must keep working exactly as before,
// unauthenticated, unchanged). The `matcher` config below is only a coarse net to make sure proxy
// actually runs on these prefixes; the real decision is 100% in isProtectedPage()/isProtectedApi().
//
// /api/health is intentionally never protected (must keep working for monitoring, per instructions).
// /login and /api/auth/* are intentionally never protected (must be reachable while logged out).
// Video Studio / AI Video / Voice Studio / Social / Content Studio routes are intentionally never
// matched here at all — untouched, exactly as instructed.

function isProtectedPage(pathname: string): boolean {
  if (pathname === "/products") return true;
  if (pathname === "/inventory") return true;
  if (pathname === "/orders" || pathname.startsWith("/orders/")) return true;
  if (pathname === "/finance") return true;
  if (pathname === "/tax") return true;
  // STEP 36 — new page, new prefix (unlike STEP 29/31/32/34's routes, which all landed under an
  // already-protected prefix like /orders/* or /api/transactions/*, this one needs its own rule)
  if (pathname === "/customers") return true;

  // STEP 74 — Local AI Assistant chat UI. New page, new prefix, same reasoning as /customers above.
  if (pathname === "/assistant") return true;

  // STEP B.4 — Bank Account UI page. Exact match only, same as /customers, /assistant, /tax above —
  // no /bank/[id] sub-route exists yet (no UI at all exists yet, per STEP B.4's scope), so there is
  // no sub-route requirement to design for; a prefix rule (pathname.startsWith("/bank/")) would be
  // speculative. When a future STEP adds a /bank/[id] page this rule extends the same way /orders
  // did (STEP 29/31/32/34) — not before.
  if (pathname === "/bank") return true;

  // STEP C.5 — Bank Statement Import UI. This is the STEP the comment above anticipated: /bank now
  // has a real sub-route (/bank/statements, /bank/statements/[id]), so this extends the same way
  // /orders did — prefix match, matching src/app/bank/statements/[id]/page.tsx's real route shape.
  if (pathname === "/bank/statements" || pathname.startsWith("/bank/statements/")) return true;

  // STEP D.7 — Reconciliation UI. Same extension pattern again — /bank/reconciliation,
  // /bank/reconciliation/[id].
  if (pathname === "/bank/reconciliation" || pathname.startsWith("/bank/reconciliation/")) return true;

  return false;
}

// STEP A.5 — sensitive Finance evidence files served as static assets under public/generated/.
// Next.js Proxy runs BEFORE filesystem routes (public/, _next/static/, etc. — see execution order in
// node_modules/next/dist/docs/.../proxy.md), and explicitly documents that a matched path in
// `public/` is subject to Proxy exactly like a page/API route ("Proxy runs on every request,
// including... assets in the public/ folder"). That means these two prefixes can be gated with the
// SAME session-cookie check already used everywhere else in this file, with ZERO change to how the
// files are written, read, or referenced (finance/page.tsx's plain <img src="/generated/...">/
// <a href> keeps working as-is once the browser has a valid session cookie — no new API route, no
// file move).
//
// Deliberately narrow — ONLY these two prefixes, not all of /generated/:
//   /generated/transaction-attachments/  (STEP 21/82 — receipt/slip evidence; the :path* below covers
//     BOTH the legacy flat layout `transaction-{id}-{uuid}.ext` AND the STEP 82 nested
//     {income|expense}/{YYYY}/{MM}/... layout equally, since it matches any number of trailing
//     segments)
//   /generated/ai-slip-previews/  (STEP 29/82 — pre-confirmation AI slip preview copies; same
//     sensitivity class as the evidence above)
// Every other /generated/ subfolder (product-media, ai-images, ai-video, video, voice,
// order-delivery-proofs) is INTENTIONALLY left untouched — those must stay publicly fetchable
// without login for Social/Content posting (Facebook/TikTok/etc. fetch them directly) and for
// order-fulfillment proofs, which are out of scope for this STEP.
//
// Path traversal: request.nextUrl.pathname is already URL-normalized by Next.js before Proxy ever
// runs (standard `.`/`..` segment collapsing), so a crafted path either resolves to a real path
// inside one of these two prefixes (and is correctly gated) or outside them (and was never sensitive
// to begin with) — no extra sanitization is added here, matching this file's existing convention of
// trusting Next's own request normalization rather than re-implementing it.
// STEP C.2 — bank statement source files (CSV/etc. uploads) are AT LEAST as sensitive as the
// transaction-attachments evidence above (a full slice of real transaction history, often including
// counterparty names/references embedded in bank description text) — gated the exact same way, same
// reasoning, same convention. No file-upload code exists yet in STEP C.2 (that starts at STEP C.3),
// but the path is protected now so nothing can ever land here unauthenticated once it does — same
// "protect the path before the feature exists" approach STEP B.4 used for /bank before the page did.
function isProtectedGeneratedFile(pathname: string): boolean {
  if (pathname.startsWith("/generated/transaction-attachments/")) return true;
  if (pathname.startsWith("/generated/ai-slip-previews/")) return true;
  if (pathname.startsWith("/generated/bank-statements/")) return true;

  return false;
}

function isProtectedApi(pathname: string): boolean {
  // GET (list) / POST (create) / PATCH (edit, ?id=) / DELETE (?id=) all share this exact pathname
  if (pathname === "/api/products") return true;

  // Stock adjustment is real inventory business logic, not a video/media sub-route — protect it
  // specifically without touching sibling sub-routes like .../media or .../ai-video/*
  if (/^\/api\/products\/\d+\/stock-adjustment$/.test(pathname)) return true;

  if (pathname === "/api/orders" || pathname.startsWith("/api/orders/")) return true;
  if (pathname.startsWith("/api/inventory/")) return true;

  // Covers /api/transactions, /api/transactions/[id], and the nested attachments routes
  if (pathname === "/api/transactions" || pathname.startsWith("/api/transactions/")) return true;

  if (pathname.startsWith("/api/tax/")) return true;

  // STEP 36 — covers /api/customers and /api/customers/[id]; new prefix, needs its own rule (same
  // reasoning as the /customers page rule above).
  if (pathname === "/api/customers" || pathname.startsWith("/api/customers/")) return true;

  // STEP 37 — new prefix (no dedicated /profit page — the report is embedded in the existing,
  // already-protected /tax page), needs its own rule same as /api/customers above.
  if (pathname.startsWith("/api/profit/")) return true;

  // STEP 70 — Local AI Assistant backend. New prefix, needs its own rule same as /api/customers/
  // /api/profit above. Session-gated the same way as every other admin API in this codebase — no
  // new auth mechanism, this route relies entirely on this existing gate (same convention already
  // documented on /api/orders/[id]/status/route.ts etc.: the route itself does not re-check auth).
  if (pathname.startsWith("/api/assistant/")) return true;

  // STEP B.3 — Bank Account API. New prefix, needs its own rule same as /api/customers/
  // /api/profit above — this is the minimal, necessary change identified by the STEP B.3 audit
  // (without it, /api/bank-accounts/* would be a public, unauthenticated API, which the account-
  // number security requirement for this feature cannot allow). No other proxy logic changed.
  if (pathname === "/api/bank-accounts" || pathname.startsWith("/api/bank-accounts/")) return true;

  // STEP C.2 — Bank Statement API. No route file exists yet (STEP C.3 builds the actual upload/
  // preview/confirm endpoints) — protected now, same reasoning as isProtectedGeneratedFile() above:
  // the path is gated before the feature exists, not after.
  if (pathname === "/api/bank-statements" || pathname.startsWith("/api/bank-statements/")) return true;

  // STEP D.6 — Reconciliation API. New prefix, needs its own rule same as /api/bank-accounts/
  // /api/bank-statements above — per the approved STEP D.5 audit contract.
  if (pathname === "/api/reconciliation" || pathname.startsWith("/api/reconciliation/")) return true;

  return false;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const needsAuth =
    isProtectedPage(pathname) || isProtectedApi(pathname) || isProtectedGeneratedFile(pathname);

  if (!needsAuth) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (verifySessionToken(token)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // STEP A.5 — a static file request (evidence image/preview), not a page navigation or a JSON API
  // call. Neither of those two existing branches is appropriate here: a redirect would hand back the
  // /login page's HTML as if it were the requested image, and a JSON body makes no sense for an
  // <img src>/<a href>. A plain 401 correctly fails the resource load (broken-image icon on screen,
  // no content ever served) without leaking anything or requiring a matching UI change.
  if (isProtectedGeneratedFile(pathname)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/products",
    "/inventory",
    "/orders",
    "/orders/:path*",
    "/finance",
    "/tax",
    "/customers",
    "/assistant",
    // STEP B.4 — see isProtectedPage() above.
    "/bank",
    // STEP C.5 — see isProtectedPage() above.
    "/bank/statements",
    "/bank/statements/:path*",
    // STEP D.7 — see isProtectedPage() above.
    "/bank/reconciliation",
    "/bank/reconciliation/:path*",
    "/api/products",
    "/api/products/:path*",
    "/api/orders",
    "/api/orders/:path*",
    "/api/inventory/:path*",
    "/api/transactions",
    "/api/transactions/:path*",
    "/api/tax/:path*",
    "/api/customers",
    "/api/customers/:path*",
    "/api/profit/:path*",
    "/api/assistant/:path*",
    // STEP B.3 — see isProtectedApi() above.
    "/api/bank-accounts",
    "/api/bank-accounts/:path*",
    // STEP C.2 — see isProtectedApi() above.
    "/api/bank-statements",
    "/api/bank-statements/:path*",
    // STEP D.6 — see isProtectedApi() above.
    "/api/reconciliation",
    "/api/reconciliation/:path*",
    // STEP A.5 — see isProtectedGeneratedFile() above for exactly which two prefixes and why only
    // these two (not all of /generated/).
    "/generated/transaction-attachments/:path*",
    "/generated/ai-slip-previews/:path*",
    // STEP C.2 — see isProtectedGeneratedFile() above.
    "/generated/bank-statements/:path*",
  ],
};
