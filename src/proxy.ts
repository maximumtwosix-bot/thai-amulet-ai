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

  return false;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const needsAuth = isProtectedPage(pathname) || isProtectedApi(pathname);

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
  ],
};
