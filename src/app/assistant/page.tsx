"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

// STEP 74 — Local AI Assistant chat UI. Client Component (same client/server-boundary reasoning
// documented in src/app/customers/page.tsx etc.) — talks ONLY to this codebase's own
// POST /api/assistant/chat (STEP 70/71/72/73), which itself talks ONLY to the local Ollama instance.
// This page never calls Ollama directly, never imports src/lib/assistantTools.ts, and has no
// awareness of tool names/SQL/the database — it only ever sends {role, content} chat turns and
// renders the {role, content} reply it gets back, exactly like any other chat client.
//
// STREAMING NOTE — read before "fixing" the long wait: src/app/api/assistant/chat/route.ts
// deliberately makes every Ollama call non-streaming (STEP 71's documented trade-off) and only
// returns its Response after the ENTIRE reply is ready — so there is nothing to stream from this
// page's side either; a normal fetch()+await is the correct client for this contract, not
// ReadableStream reading. Real measured latencies during STEP 71-73 testing ranged from ~30s to
// ~190s on this CPU-only machine (worse for Thai + tool-calling turns), so the loading state below is
// a persistent "still working" indicator with elapsed seconds, not a spinner sized for a quick request.
//
// STEP 78 — this page gained a second, narrower capability: rendering a pending order-status
// confirmation and letting the human Approve/Cancel it. Approve does NOT go through sendMessage()/
// Ollama at all — it POSTs the server-issued opaque confirmToken straight to the dedicated
// /api/assistant/order-status-confirm endpoint (see that route's own header). Nothing here parses or
// acts on natural language like "yes"/"ตกลง"/"อนุมัติ" typed into the textarea; the only way a status
// change actually applies is the Approve button below, which is why the textarea/send button are
// disabled while a confirmation is pending — this UI is the human-in-the-loop checkpoint, not the
// chat text.
type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type PendingConfirmation = {
  orderNumber: string;
  currentStatus: string;
  requestedStatus: string;
  confirmToken: string;
  message: string;
};

function isPendingConfirmation(value: unknown): value is PendingConfirmation {
  if (!value || typeof value !== "object") return false;

  const v = value as Record<string, unknown>;

  return (
    typeof v.orderNumber === "string" &&
    typeof v.currentStatus === "string" &&
    typeof v.requestedStatus === "string" &&
    typeof v.confirmToken === "string" &&
    typeof v.message === "string"
  );
}

function parseAssistantReply(raw: string): { content: string; pendingConfirmation: PendingConfirmation | null } {
  // The route's response body is NDJSON — one JSON object per line, each shaped like an Ollama
  // streaming chunk ({ message: { content }, done }), plus an optional STEP 78 `pendingConfirmation`
  // field. STEP 71 always sends exactly one line (see the note above), but this reads the LAST
  // non-empty line rather than assuming line count, so it stays correct even if a future STEP
  // changes the route to emit more than one line without this page needing to change.
  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);

  if (lines.length === 0) {
    throw new Error("EMPTY_RESPONSE");
  }

  const lastLine = lines[lines.length - 1];
  const parsed = JSON.parse(lastLine) as {
    message?: { content?: string };
    pendingConfirmation?: unknown;
  };

  return {
    content: typeof parsed.message?.content === "string" ? parsed.message.content : "",
    pendingConfirmation: isPendingConfirmation(parsed.pendingConfirmation)
      ? parsed.pendingConfirmation
      : null,
  };
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // STEP 78 — pending order-status confirmation state, entirely separate from `messages`. Not part
  // of the chat history sent back to the server on the next turn (see sendMessage() below) — it's a
  // one-off local UI checkpoint that Approve/Cancel resolve on their own, outside the LLM loop.
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  // STEP 80 — re-entrancy lock for approvePending(), separate from the `confirming` STATE above.
  // `confirming` still drives the button's visual disabled/label rendering, but a React state
  // closure only reflects a new value after a re-render — two click events dispatched before that
  // re-render (a fast double-click, or any programmatic double-fire) can both read the OLD
  // `confirming === false` from their own stale closures and both fire a confirm request. A ref is
  // mutated synchronously and is visible to every call immediately, regardless of render timing, so
  // it closes that gap at the client. Server-side, this was never a data-integrity risk either way —
  // the STEP 78 token's live-status re-check already rejects a second request as a mismatch once the
  // first applies — this purely fixes the confusing "error" a double-click could show for a change
  // that actually already succeeded.
  const confirmingRef = useRef(false);

  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, pending]);

  // Elapsed-time ticker while a request is in flight — purely a UI reassurance for the long real
  // latencies documented above, not a client-side timeout (the request itself is left to run; the
  // server enforces its own OLLAMA_TIMEOUT_MS per call).
  useEffect(() => {
    if (!loading) return;

    const startedAt = Date.now();
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [loading]);

  async function sendMessage() {
    const trimmed = input.trim();

    if (!trimmed || loading || pending) return;

    setError("");

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setElapsedSeconds(0);
    setLoading(true);

    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      const rawText = await response.text();

      if (!response.ok) {
        let apiError = "ผู้ช่วย AI ไม่สามารถตอบกลับได้";
        try {
          const parsed = JSON.parse(rawText) as { error?: string };
          if (parsed?.error) apiError = parsed.error;
        } catch {
          // rawText wasn't JSON — keep the generic message above.
        }
        throw new Error(apiError);
      }

      const { content, pendingConfirmation } = parseAssistantReply(rawText);

      // STEP 78 — a pending confirmation replaces the normal chat bubble for this turn with the
      // dedicated card below (rendered from `pending` state), instead of adding assistant text that
      // would just repeat the same order/status details in prose.
      if (pendingConfirmation) {
        setConfirmError("");
        setPending(pendingConfirmation);
      } else {
        setMessages((current) => [...current, { role: "assistant", content }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ผู้ช่วย AI ไม่สามารถตอบกลับได้");
      // Roll back the just-added user message's turn isn't done here — the user's own message stays
      // visible in history (matches ordinary chat UX: your sent message doesn't disappear just
      // because the reply failed), they can simply try sending another message.
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // STEP 78 — Approve. Deliberately does NOT call /api/assistant/chat or touch Ollama in any way —
  // it sends the opaque confirmToken straight to the dedicated confirmation endpoint. This is the
  // actual human-approval action; nothing the model says or does can substitute for this click.
  async function approvePending() {
    // STEP 80 — the ref check/set happens synchronously, before any await, so a second call
    // triggered before React re-renders (see the confirmingRef comment above) sees the lock
    // immediately and returns here instead of firing a second request.
    if (!pending || confirmingRef.current) return;
    confirmingRef.current = true;

    setConfirming(true);
    setConfirmError("");

    try {
      const response = await fetch("/api/assistant/order-status-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber: pending.orderNumber,
          requestedStatus: pending.requestedStatus,
          confirmToken: pending.confirmToken,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถยืนยันการเปลี่ยนสถานะได้");
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `✅ อัปเดตออเดอร์ ${pending.orderNumber} เป็นสถานะ "${pending.requestedStatus}" เรียบร้อยแล้ว`,
        },
      ]);
      setPending(null);
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "ไม่สามารถยืนยันการเปลี่ยนสถานะได้");
    } finally {
      confirmingRef.current = false;
      setConfirming(false);
    }
  }

  // Cancel — purely local. No request is sent anywhere, so nothing capable of mutating the order is
  // ever issued.
  function cancelPending() {
    setPending(null);
    setConfirmError("");
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto flex max-w-3xl flex-col" style={{ minHeight: "calc(100vh - 3rem)" }}>
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🤖 ผู้ช่วย AI</h1>
            <p className="mt-1 text-sm text-slate-500">
              อ่านข้อมูลออเดอร์ สินค้า ลูกค้า ยอดขาย การเงิน กำไร และสต็อกได้ และ &ldquo;เสนอ&rdquo;
              เปลี่ยนสถานะออเดอร์ได้ — แต่จะเปลี่ยนจริงก็ต่อเมื่อคุณกด &ldquo;อนุมัติ&rdquo; ยืนยันเองเท่านั้น
              ข้อมูลประเภทอื่นนอกจากสถานะออเดอร์ ผู้ช่วยไม่สามารถแก้ไขได้โดยตรง
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="w-fit rounded-xl border bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              ← กลับหน้าแรก
            </Link>
            <LogoutButton />
          </div>
        </div>

        <section className="flex flex-1 flex-col rounded-2xl border bg-white shadow-sm">
          <div className="flex-1 space-y-4 overflow-y-auto p-5" style={{ minHeight: "50vh" }}>
            {messages.length === 0 && !loading && (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
                ลองถามเช่น &ldquo;มีสินค้าอะไรบ้าง&rdquo;, &ldquo;ยอดขายวันนี้เท่าไร&rdquo;, &ldquo;สต็อกสินค้าตอนนี้เป็นยังไง&rdquo;
                <br />
                <span className="mt-1 block text-xs text-slate-400">
                  ⏳ AI รันบนเครื่องนี้เอง อาจใช้เวลาตอบ 30 วินาที ถึง 3 นาที โปรดรอสักครู่
                </span>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === "user"
                      ? "bg-slate-900 text-white"
                      : "border bg-slate-50 text-slate-800"
                  }`}
                >
                  {m.content || (
                    <span className="italic text-slate-400">
                      (ไม่ได้รับคำตอบ — โปรดลองถามอีกครั้ง)
                    </span>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl border bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
                  🤔 กำลังคิด... ({elapsedSeconds} วินาที)
                </div>
              </div>
            )}

            {/* STEP 78 — distinct confirmation card, not ordinary chat text. The confirmToken itself
                is never rendered here — only the human-readable order/status fields and message. */}
            {pending && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-slate-800">
                  <p className="font-semibold text-amber-800">⚠️ ต้องการการยืนยันจากคุณ</p>
                  <dl className="mt-2 space-y-0.5">
                    <div>
                      <dt className="inline text-slate-500">คำสั่งซื้อ: </dt>
                      <dd className="inline font-mono">{pending.orderNumber}</dd>
                    </div>
                    <div>
                      <dt className="inline text-slate-500">สถานะปัจจุบัน: </dt>
                      <dd className="inline font-medium">{pending.currentStatus}</dd>
                    </div>
                    <div>
                      <dt className="inline text-slate-500">สถานะที่ขอเปลี่ยน: </dt>
                      <dd className="inline font-medium">{pending.requestedStatus}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-slate-600">{pending.message}</p>

                  {confirmError && (
                    <p className="mt-2 rounded-lg bg-red-100 px-2 py-1 text-xs text-red-700">
                      {confirmError}
                    </p>
                  )}

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={approvePending}
                      disabled={confirming}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {confirming ? "กำลังยืนยัน..." : "✅ อนุมัติ"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelPending}
                      disabled={confirming}
                      className="rounded-lg border px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div ref={scrollAnchorRef} />
          </div>

          {error && (
            <div className="mx-5 mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-end gap-3 border-t p-4">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading || !!pending}
              placeholder={
                pending
                  ? "โปรดกด \"อนุมัติ\" หรือ \"ยกเลิก\" ด้านบนก่อน"
                  : "พิมพ์คำถาม... (Enter เพื่อส่ง, Shift+Enter ขึ้นบรรทัดใหม่)"
              }
              rows={2}
              className="flex-1 resize-none rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-50"
            />

            <button
              type="button"
              onClick={sendMessage}
              disabled={loading || !!pending || !input.trim()}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {loading ? "กำลังส่ง..." : "ส่ง"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
