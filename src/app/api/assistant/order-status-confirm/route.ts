import { NextRequest, NextResponse } from "next/server";
import { applyConfirmedOrderStatusChange } from "@/lib/assistantTools";

// STEP 78 — dedicated, narrow endpoint completing an ALREADY-PREVIEWED update_order_status
// confirmation. This is the deterministic "second leg" of that one Assistant write tool, not a new
// Assistant capability of its own: it accepts only { orderNumber, requestedStatus, confirmToken },
// verifies the signed token, and — only if that verification passes — calls the SAME
// applyConfirmedOrderStatusChange() (src/lib/assistantTools.ts) that update_order_status's own
// confirm path calls, which itself calls the one existing updateOrderStatus() state machine
// (src/lib/orders.ts, STEP 32; also what PATCH /api/orders/[id]/status and the Order Detail page's
// status buttons use). No new mutation logic exists here or anywhere else for this change.
//
// Deliberately never calls Ollama. The human's Approve click on the pending-confirmation card
// (src/app/assistant/page.tsx) IS the authorization for an already-fully-specified, already-token-
// verified action — no further LLM judgment is needed, and involving the model again would only
// reopen the exact same-turn chaining risk STEP 78 closes in src/app/api/assistant/chat/route.ts.
//
// Protected by the existing src/proxy.ts allowlist: isProtectedApi() already matches every path
// starting with "/api/assistant/" (STEP 70), and the `matcher` config already includes
// "/api/assistant/:path*" (also STEP 70) — this new nested route is covered automatically. No
// proxy.ts change was made or is needed. An unauthenticated request never reaches the code below;
// proxy.ts returns 401 JSON before this handler runs, same as every other protected /api/ route.
//
// Narrowly scoped on purpose: this route does not accept a raw order id, does not accept an
// arbitrary status without a token bound to it, does not expose any other table, and cannot be
// reused for any mutation other than the one applyConfirmedOrderStatusChange() already performs.

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body (must be JSON)" },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { success: false, error: "Request body must be a JSON object" },
      { status: 400 }
    );
  }

  const b = body as Record<string, unknown>;

  const result = applyConfirmedOrderStatusChange({
    orderNumber: typeof b.orderNumber === "string" ? b.orderNumber : undefined,
    requestedStatus: typeof b.requestedStatus === "string" ? b.requestedStatus : undefined,
    // Passed through as-is (not narrowed to string here) — applyConfirmedOrderStatusChange() does
    // its own type check and rejects anything that isn't a valid, verifiable token string.
    confirmToken: b.confirmToken,
  });

  if ("success" in result && result.success) {
    return NextResponse.json({ success: true, data: result }, { status: 200 });
  }

  const message = "error" in result ? result.error : "Failed to confirm the order status change.";

  return NextResponse.json({ success: false, error: message }, { status: 409 });
}
