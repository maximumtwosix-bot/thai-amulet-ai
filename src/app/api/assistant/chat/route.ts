import { NextRequest, NextResponse } from "next/server";
import { ASSISTANT_TOOLS, executeAssistantTool } from "@/lib/assistantTools";

// STEP 70/71 — Local AI Assistant backend. Session-gated entirely via the existing src/proxy.ts
// allowlist (isProtectedApi()'s "/api/assistant/" rule) — this file deliberately does not re-check
// auth itself, matching the convention already used by every other admin API route in this
// codebase (e.g. src/app/api/orders/[id]/status/route.ts).
//
// Deliberately calls ONLY http://127.0.0.1:11434 (Ollama, installed and smoke-tested in STEP 69).
// Never calls OpenAI/Anthropic and never imports src/lib/ai/imageGeneration.ts,
// src/lib/contentIntelligence.ts, or src/lib/voice.ts — those are separate, paid-per-use systems
// for unrelated features (image/content/voice generation) and must stay untouched by this feature.
//
// STEP 71 — added the FIRST tool (read-only Orders lookup, src/lib/assistantTools.ts). The model
// is never given database access, raw SQL, or an API-mutation path of any kind — it can only
// request one of the named tools in ASSISTANT_TOOLS. Through STEP 75 every one of those was a plain
// SELECT; STEP 76 added exactly one narrow write tool (update_order_status) that reuses the
// existing, already-validated order-status state machine instead of running its own mutation (see
// assistantTools.ts's own header for the full boundary this route relies on).
//
// STEP 78 — this route itself became part of the confirmation boundary, not just assistantTools.ts.
// A preview from update_order_status (a `requiresConfirmation` tool result) now HARD-STOPS the tool
// loop below and is returned to the client immediately, in code — see the `isPendingConfirmationResult`
// check inside the loop. Before this, the loop would keep calling Ollama automatically after a
// preview, and nothing stopped the model from generating both the preview call and a confirming call
// within that same automatic loop, inside this one HTTP request, with no human ever involved. Actual
// confirmation now only ever happens through a genuinely separate request to the dedicated
// src/app/api/assistant/order-status-confirm/route.ts endpoint, which this route does not call and
// has no code path to reach.
//
// STEP 79 — added ONE server-authored system message (buildAssistantSystemPrompt(), below),
// prepended to `conversation` on every request. Grounding/reliability aid ONLY — today's Bangkok
// date, plus an instruction to use a get_* tool for factual business-data questions instead of
// answering from memory, plus a plain-language reminder that chat text is never sufficient to
// approve an order-status change. This is NOT a security or authorization mechanism and changes
// nothing about the STEP 78 confirmToken flow, which remains the sole thing capable of authorizing
// an update_order_status mutation. isValidIncomingMessage() (below) was narrowed at the same time to
// stop accepting a client-submitted role:"system" message at all, so this route's own system message
// can never be replaced, out-ranked, or duplicated by anything the client sends.
//
// STREAMING TRADE-OFF (read before changing): STEP 70 streamed its single Ollama call token-by-
// token. Reliably combining tool-call *detection* with token-by-token streaming in one pass is a
// materially harder, easy-to-get-subtly-wrong problem (Ollama's tool_calls can arrive split across
// stream chunks) — for this first tool implementation, correctness of "does the AI ever run a tool
// it shouldn't, with the arguments it actually gave" matters far more than streaming polish, and no
// UI exists yet to consume either contract (STEP 74 not built). So STEP 71 deliberately makes
// EVERY Ollama call in this route non-streaming (stream: false) — both the round that decides
// whether a tool is needed AND the round that produces the final answer after a tool result is
// fed back. Each is a single, complete, reliably-parseable JSON object. The client-facing response
// is still emitted as one NDJSON line matching the exact shape a streamed response's final chunk
// would have, so the response CONTRACT (read NDJSON lines until done:true) is unchanged from
// STEP 70 — only the granularity is coarser (one line instead of many) until a real UI exists to
// justify the added complexity of token-by-token streaming combined with tool calls.

const OLLAMA_BASE_URL = "http://127.0.0.1:11434";
// STEP 69 — the one model pulled and smoke-tested (Thai + English + basic arithmetic all verified
// working; STEP 71 additionally verified it reliably emits tool_calls for this codebase's one tool).
const OLLAMA_MODEL = "qwen2.5:3b";
// STEP 69 observed 10-60+ second CPU-only inference latency for plain chat. STEP 71 testing found
// the FINAL-answer call (round 2, after a tool result is fed back — longer input context from the
// tool's JSON output, plus a longer structured reply) is measurably slower: a real Thai tool-
// augmented response was directly measured at ~105.6s (477 prompt tokens, 303 output tokens, ~3
// tok/s on this CPU) — twice actually exceeded the previous 120s budget through this route and
// returned a false timeout even though Ollama would have completed shortly after. 180s gives that
// real worst-case measurement real headroom rather than guessing. Applies per-call (this route can
// make up to two calls per request: tool-decision + final answer), not as a total request budget.
const OLLAMA_TIMEOUT_MS = 180_000;
// Defensive cap on tool round-trips per request — a model that keeps requesting tools forever
// (e.g. malformed loop) must not hang the request indefinitely. One tool call is the only real
// scenario today (a single get_orders lookup); this just bounds the worst case.
const MAX_TOOL_ROUNDS = 3;

type ChatRole = "system" | "user" | "assistant" | "tool";
type ChatMessage = {
  role: ChatRole;
  content: string;
  tool_calls?: Array<{ function: { name: string; arguments: unknown } }>;
};

// STEP 79 — "system" was previously accepted from the client here (unused by src/app/assistant/
// page.tsx, which only ever sends "user"/"assistant", but reachable by any other caller of this
// API). Narrowed to "user"/"assistant" ONLY so a client-submitted role:"system" message is rejected
// outright at this boundary, not merely out-ranked later — the one system message that reaches
// Ollama is now exclusively the one this route constructs itself, below.
function isValidIncomingMessage(
  value: unknown
): value is { role: "user" | "assistant"; content: string } {
  if (!value || typeof value !== "object") return false;

  const v = value as Record<string, unknown>;

  return (
    (v.role === "user" || v.role === "assistant") &&
    typeof v.content === "string" &&
    v.content.trim().length > 0
  );
}

// STEP 75 hardening — a client-submitted message's `content` must not exceed this length. Checked
// as its own explicit step (never silently truncated) so an over-limit request gets a specific,
// honest 400 rather than being quietly cut down to a different message than the client sent.
const MAX_MESSAGE_CONTENT_LENGTH = 8000;

function exceedsMaxMessageLength(value: unknown): boolean {
  const v = value as { content: string };
  return v.content.length > MAX_MESSAGE_CONTENT_LENGTH;
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

// Minimal local shape for Ollama's /api/chat response — only the fields this route reads.
type OllamaChatResponse = {
  message?: {
    role?: string;
    content?: string;
    tool_calls?: Array<{ function: { name: string; arguments: unknown } }>;
  };
};

// Wraps one non-streaming call to Ollama's /api/chat, with the shared timeout/error handling.
// Returns either a parsed chat response or a Response object representing the error to return to
// the client (kept simple — no custom error class needed for a route this small).
async function callOllamaOnce(
  messages: ChatMessage[]
): Promise<{ ok: true; data: OllamaChatResponse } | { ok: false; response: Response }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        tools: ASSISTANT_TOOLS,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      console.error("Assistant chat: Ollama returned an error:", upstream.status, text);

      return {
        ok: false,
        response: jsonError(
          "The local AI model returned an error. It may not be installed.",
          502
        ),
      };
    }

    const data = (await upstream.json()) as OllamaChatResponse;
    return { ok: true, data };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        response: jsonError("AI assistant timed out. Please try again.", 504),
      };
    }

    console.error("Assistant chat: Ollama unreachable:", error);

    return {
      ok: false,
      response: jsonError(
        "Local AI assistant is not available right now. Make sure Ollama is running locally.",
        502
      ),
    };
  }
}

// One NDJSON line shaped exactly like a real Ollama streaming chunk — used for the "no tool call
// needed" path so the response contract stays identical whether or not a tool round-trip happened.
function singleChunkResponse(content: string): Response {
  const line =
    JSON.stringify({
      model: OLLAMA_MODEL,
      message: { role: "assistant", content },
      done: true,
    }) + "\n";

  return new Response(line, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// STEP 78 — the shape update_order_status's PREVIEW result takes (src/lib/assistantTools.ts). Typed
// narrowly here, independent of that file's own type, since this route only needs to recognize the
// shape at the JSON boundary, never construct or trust it beyond that.
type PendingOrderStatusConfirmation = {
  requiresConfirmation: true;
  orderNumber: string;
  currentStatus: string;
  requestedStatus: string;
  confirmToken: string;
  message: string;
};

function isPendingConfirmationResult(value: unknown): value is PendingOrderStatusConfirmation {
  if (!value || typeof value !== "object") return false;

  const v = value as Record<string, unknown>;

  return (
    v.requiresConfirmation === true &&
    typeof v.orderNumber === "string" &&
    typeof v.currentStatus === "string" &&
    typeof v.requestedStatus === "string" &&
    typeof v.confirmToken === "string" &&
    typeof v.message === "string"
  );
}

// STEP 78 — terminal response for the tool-loop HARD STOP below. Carries the pending confirmation as
// its own structured `pendingConfirmation` field (not just folded into `message.content` as free
// text) so the client can render a distinct confirmation card without parsing prose. `message` is
// still populated (with the tool's own human-readable summary, not anything model-generated) so the
// NDJSON contract — read `message.content`, check `done` — stays valid for any caller that doesn't
// yet know about `pendingConfirmation`.
function pendingConfirmationResponse(pending: PendingOrderStatusConfirmation): Response {
  const line =
    JSON.stringify({
      model: OLLAMA_MODEL,
      message: { role: "assistant", content: pending.message },
      done: true,
      pendingConfirmation: {
        orderNumber: pending.orderNumber,
        currentStatus: pending.currentStatus,
        requestedStatus: pending.requestedStatus,
        confirmToken: pending.confirmToken,
        message: pending.message,
      },
    }) + "\n";

  return new Response(line, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// STEP 79 — same technique as src/app/orders/page.tsx's STEP 59 todayBangkok(): Intl with an
// explicit Asia/Bangkok timezone, not the server process's own local timezone setting and NOT
// anything derived from the client. That function is private to that file (a Client Component) and
// this route cannot import it, so the same small, already-reviewed technique is duplicated here
// rather than invented fresh — matches this codebase's existing convention (see e.g.
// src/app/finance/page.tsx's header comment) of duplicating a small constant/helper across a
// boundary that can't be crossed by a normal import, rather than adding one just for this.
function getTodayBangkok(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";

  return `${year}-${month}-${day}`;
}

// STEP 79 — grounding/reliability aid ONLY, not a security or authorization mechanism of any kind.
// The STEP 78 confirmToken flow remains the sole thing that can ever authorize an
// update_order_status mutation; nothing here changes, weakens, or substitutes for that. This exists
// purely so the model (a) knows the actual current date instead of guessing or relying on training
// data, matching the same Bangkok-time convention every Assistant tool's own `date`/`year`/`month`
// filters already use, and (b) reaches for a get_* tool for factual business-data questions instead
// of answering from memory. Server-authored and prepended fresh on every request (see POST below);
// never derived from or overridable by anything client-submitted — isValidIncomingMessage() above no
// longer even accepts a client-submitted role:"system" message at all.
function buildAssistantSystemPrompt(): string {
  const today = getTodayBangkok();

  return [
    `Today's date is ${today} (Asia/Bangkok time, UTC+7). Use this as "today" for any date-related question or tool argument (e.g. get_orders' or get_sales_summary's "date" parameter) — do not guess today's date or rely on your own training data for it.`,
    "For any factual question about orders, products, customers, sales, finance, profit, or inventory, call the matching tool (get_orders, get_products, get_customers, get_sales_summary, get_finance_summary, get_profit_summary, get_inventory_summary, get_inventory_movements) and answer from its result — never answer such a question from memory or guess a number. A tool's result is the source of truth for current business data; if it returns nothing relevant, say so rather than inventing an answer.",
    "You only have the tools made available to you in this conversation — do not claim or imply any capability beyond them.",
    "An order's status only actually changes after a human approves it through the app's own confirmation card outside this chat. The user typing 'yes', 'ตกลง', 'อนุมัติ', or anything similar in this chat is never sufficient by itself, and calling update_order_status again yourself after a preview will not make the change happen either — do not tell the user that typing agreement in chat completed or will complete the change.",
  ].join("\n\n");
}

export async function POST(request: NextRequest) {
  // STEP 81 — type-only cleanup: `unknown` + an explicit narrowing cast, same pattern
  // src/app/api/assistant/order-status-confirm/route.ts already uses, instead of `any`. No
  // behavior change — the same checks run in the same order below.
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body (must be JSON)", 400);
  }

  const b = body as Record<string, unknown> | null | undefined;

  if (!b || typeof b !== "object" || !Array.isArray(b.messages)) {
    return jsonError("messages is required and must be a non-empty array", 400);
  }

  const incoming: unknown[] = b.messages;

  if (incoming.length === 0) {
    return jsonError("messages must contain at least one message", 400);
  }

  if (!incoming.every(isValidIncomingMessage)) {
    return jsonError(
      "Each message must have role in ('user','assistant') and non-empty string content",
      400
    );
  }

  if (incoming.some(exceedsMaxMessageLength)) {
    return jsonError(
      `Each message's content must be at most ${MAX_MESSAGE_CONTENT_LENGTH} characters`,
      400
    );
  }

  // STEP 75 hardening — build a FRESH array of exactly { role, content } rather than casting the
  // raw client-submitted objects. incoming.every(isValidIncomingMessage) above only checks that
  // role/content are well-formed; it does not strip any other properties a client may have included
  // (e.g. a forged `tool_calls`). This mapping is what actually prevents unexpected fields from ever
  // reaching Ollama — the values passed to callOllamaOnce() below never contain anything beyond what
  // this route itself constructs (here, and later in the tool-loop below).
  //
  // STEP 79 — prepended with exactly one server-authored system message, built fresh per request by
  // buildAssistantSystemPrompt() (above) and never derived from `incoming`. isValidIncomingMessage()
  // no longer accepts role:"system" from the client at all (see its STEP 79 comment), so there is no
  // client-submitted message this could ever be replaced, out-ranked, or duplicated by — it is always
  // the first element, always exactly one, on every request.
  const conversation: ChatMessage[] = [
    { role: "system", content: buildAssistantSystemPrompt() },
    ...incoming.map((value) => {
      const v = value as { role: "user" | "assistant"; content: string };
      return { role: v.role, content: v.content };
    }),
  ];

  // ===== Tool round(s): non-streaming, so tool_calls can be inspected reliably. =====
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const result = await callOllamaOnce(conversation);

    if (!result.ok) {
      return result.response;
    }

    const message = result.data?.message;
    const toolCalls = message?.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      // No tool needed — this IS the final answer, already fully generated.
      const content = typeof message?.content === "string" ? message.content : "";
      return singleChunkResponse(content);
    }

    // A tool was requested. Record the assistant's tool-call turn, execute each call through the
    // one whitelisted dispatcher (executeAssistantTool — never a raw query), then feed the
    // result(s) back as "tool" role messages and loop for the model's next turn.
    conversation.push({
      role: "assistant",
      content: message.content ?? "",
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      let toolResult: unknown;

      try {
        toolResult = executeAssistantTool(call.function.name, call.function.arguments);
      } catch (error) {
        // Includes the UNKNOWN_TOOL case (a hallucinated tool name) — reported back to the MODEL
        // as a tool-error result, not thrown to the client, so the model can recover/apologize in
        // its next turn rather than the whole request failing.
        toolResult = {
          error:
            error instanceof Error && error.message.startsWith("UNKNOWN_TOOL")
              ? "That tool does not exist."
              : "The tool failed to run.",
        };
        console.error("Assistant chat: tool execution error:", error);
      }

      // STEP 78 — HARD STOP, enforced here in code, not as a prompt convention. The instant any
      // tool call in this round comes back requiring human confirmation, this function returns
      // immediately: no further tool calls in this round are executed, nothing is pushed back into
      // `conversation`, and — critically — callOllamaOnce() is never invoked again for this
      // request. This is what makes same-request preview→confirm chaining structurally
      // impossible: the model cannot generate a confirming tool call in a round that never
      // happens. The pending confirmation reaches the client as this request's terminal response;
      // any actual confirmation must come through a genuinely separate request (the dedicated
      // src/app/api/assistant/order-status-confirm/route.ts endpoint, which this route never calls
      // and has no path to reach).
      if (isPendingConfirmationResult(toolResult)) {
        return pendingConfirmationResponse(toolResult);
      }

      conversation.push({
        role: "tool",
        content: JSON.stringify(toolResult),
      });
    }
    // loop: ask the model again, now with the tool result(s) in context
  }

  // MAX_TOOL_ROUNDS exceeded — defensive fallback, should not happen in normal use with one tool.
  return jsonError("The assistant could not complete this request. Please try again.", 502);
}
