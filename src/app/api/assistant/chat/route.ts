import { NextRequest, NextResponse } from "next/server";

// STEP 70 — Local AI Assistant backend foundation. Plain chat only: no tools, no database access,
// no RAG, no function calling — this route is a thin, streaming proxy to a local Ollama instance
// and nothing else. Session-gated entirely via the existing src/proxy.ts allowlist
// (isProtectedApi()'s "/api/assistant/" rule) — this file deliberately does not re-check auth
// itself, matching the convention already used by every other admin API route in this codebase
// (e.g. src/app/api/orders/[id]/status/route.ts).
//
// Deliberately calls ONLY http://127.0.0.1:11434 (Ollama, installed and smoke-tested in STEP 69).
// Never calls OpenAI/Anthropic and never imports src/lib/ai/imageGeneration.ts,
// src/lib/contentIntelligence.ts, or src/lib/voice.ts — those are separate, paid-per-use systems
// for unrelated features (image/content/voice generation) and must stay untouched by this feature.

const OLLAMA_BASE_URL = "http://127.0.0.1:11434";
// STEP 69 — the one model pulled and smoke-tested (Thai + English + basic arithmetic all verified
// working). Hardcoded here rather than an env var — this is foundation-only scope; making the
// model/endpoint configurable is a reasonable future improvement, not needed yet.
const OLLAMA_MODEL = "qwen2.5:3b";
// STEP 69 observed 10-60+ second CPU-only inference latency (worst case ~57s on a cold model
// load). 120s gives real responses room to complete without waiting forever on a genuinely dead
// Ollama process.
const OLLAMA_TIMEOUT_MS = 120_000;

type ChatRole = "system" | "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

function isValidMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;

  const v = value as Record<string, unknown>;

  return (
    (v.role === "system" || v.role === "user" || v.role === "assistant") &&
    typeof v.content === "string" &&
    v.content.trim().length > 0
  );
}

export async function POST(request: NextRequest) {
  let body: any;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body (must be JSON)" },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object" || !Array.isArray(body.messages)) {
    return NextResponse.json(
      { success: false, error: "messages is required and must be a non-empty array" },
      { status: 400 }
    );
  }

  const messages: unknown[] = body.messages;

  if (messages.length === 0) {
    return NextResponse.json(
      { success: false, error: "messages must contain at least one message" },
      { status: 400 }
    );
  }

  if (!messages.every(isValidMessage)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Each message must have role in ('system','user','assistant') and non-empty string content",
      },
      { status: 400 }
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  let upstream: Response;

  try {
    upstream = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: true,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { success: false, error: "AI assistant timed out. Please try again." },
        { status: 504 }
      );
    }

    // Connection refused (Ollama not running) lands here too — never leak the raw error, which
    // could include internal paths/stack details.
    console.error("Assistant chat: Ollama unreachable:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Local AI assistant is not available right now. Make sure Ollama is running locally.",
      },
      { status: 502 }
    );
  }

  clearTimeout(timeoutId);

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    console.error("Assistant chat: Ollama returned an error:", upstream.status, text);

    // Covers "model not found" (Ollama 404s if OLLAMA_MODEL was ever removed/renamed) and any
    // other upstream failure uniformly — the client never needs to distinguish these cases yet.
    return NextResponse.json(
      { success: false, error: "The local AI model returned an error. It may not be installed." },
      { status: 502 }
    );
  }

  // Proxy Ollama's own streaming response straight through, unmodified: newline-delimited JSON,
  // each line shaped { message: { role, content }, done: boolean, ... } — Ollama's native
  // /api/chat streaming format. No new protocol invented; a future chat UI (STEP 74) reads this
  // directly.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
