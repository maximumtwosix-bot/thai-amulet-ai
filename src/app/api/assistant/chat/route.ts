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
// request one of the named tools in ASSISTANT_TOOLS, and every one of those is a plain SELECT
// (see assistantTools.ts's own header for why that's structurally guaranteed, not just convention).
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

function isValidIncomingMessage(
  value: unknown
): value is { role: "system" | "user" | "assistant"; content: string } {
  if (!value || typeof value !== "object") return false;

  const v = value as Record<string, unknown>;

  return (
    (v.role === "system" || v.role === "user" || v.role === "assistant") &&
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

export async function POST(request: NextRequest) {
  let body: any;

  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body (must be JSON)", 400);
  }

  if (!body || typeof body !== "object" || !Array.isArray(body.messages)) {
    return jsonError("messages is required and must be a non-empty array", 400);
  }

  const incoming: unknown[] = body.messages;

  if (incoming.length === 0) {
    return jsonError("messages must contain at least one message", 400);
  }

  if (!incoming.every(isValidIncomingMessage)) {
    return jsonError(
      "Each message must have role in ('system','user','assistant') and non-empty string content",
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
  const conversation: ChatMessage[] = incoming.map((value) => {
    const v = value as { role: "system" | "user" | "assistant"; content: string };
    return { role: v.role, content: v.content };
  });

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
