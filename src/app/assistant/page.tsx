"use client";

import { useEffect, useRef, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import BackLink from "@/components/BackLink";
import {
  BotIcon,
  CapCutIcon,
  ClaudeIcon,
  DolaIcon,
  GeminiIcon,
  GitHubIcon,
  GoogleIcon,
  MessageCircleIcon,
  PhayaIcon,
  SparklesIcon,
} from "@/components/icons";

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

// Sidebar "รูปแบบคอนเทนต์" — เติมคำถามสำเร็จรูปลง textarea เท่านั้น ไม่ได้ยิง request เอง และไม่ใช่
// tool/endpoint ใหม่ใดๆ — ยังคงเป็นข้อความธรรมดาที่ส่งผ่าน sendMessage()/POST /api/assistant/chat
// เดิมทุกประการ ผู้ใช้แก้ไขข้อความก่อนกดส่งได้เสมอ
type ContentPreset = {
  id: string;
  icon: string;
  label: string;
  prompt: string;
};

const CONTENT_PRESETS: ContentPreset[] = [
  {
    id: "sale-caption",
    icon: "🛍️",
    label: "แคปชั่นขายของ",
    prompt: "ช่วยเขียนแคปชั่นขายพระเครื่อง เน้นจุดเด่นและความน่าเชื่อถือ สั้น กระชับ ดึงดูดให้อยากสั่งซื้อ พร้อมแฮชแท็กท้ายโพสต์",
  },
  {
    id: "tiktok-script",
    icon: "🎬",
    label: "สคริปต์ TikTok",
    prompt: "ช่วยเขียนสคริปต์วิดีโอ TikTok ความยาวประมาณ 30 วินาที แนะนำพระเครื่อง มี Hook เปิดเรื่องที่น่าสนใจในช่วง 3 วินาทีแรก",
  },
  {
    id: "history-article",
    icon: "📜",
    label: "บทความประวัติพระ",
    prompt: "ช่วยเขียนบทความสั้นๆ เล่าประวัติความเป็นมาและความศักดิ์สิทธิ์ของพระเครื่องรุ่นนี้ ในโทนที่น่าเชื่อถือและขลัง",
  },
  {
    id: "facebook-ad",
    icon: "📢",
    label: "โฆษณา Facebook",
    prompt: "ช่วยเขียนข้อความโฆษณา Facebook Ads สำหรับพระเครื่อง เน้นกระตุ้นให้ตัดสินใจสั่งซื้อทันที",
  },
  {
    id: "hashtags",
    icon: "#️⃣",
    label: "แฮชแท็กแนะนำ",
    prompt: "ช่วยแนะนำแฮชแท็กภาษาไทยและอังกฤษสำหรับโพสต์ขายพระเครื่อง เพื่อเพิ่มการมองเห็นบนโซเชียล",
  },
];

// ปุ่มลัดเปิดหน้าเว็บจัดการ API ของผู้ให้บริการ AI ภายนอก — เป็นแค่ลิงก์ target="_blank" ธรรมดา
// ไม่มีการเชื่อมต่อ/เรียก API ใดๆ จากหน้านี้ ไม่กระทบ POST /api/assistant/chat เดิมแต่อย่างใด
type ExternalAiTool = {
  id: string;
  label: string;
  href: string;
  icon: typeof BotIcon;
};

const EXTERNAL_AI_TOOLS: ExternalAiTool[] = [
  { id: "openai", label: "OpenAI API", href: "https://platform.openai.com/", icon: BotIcon },
  {
    id: "gemini",
    label: "Google Gemini / AI Studio",
    href: "https://aistudio.google.com/",
    icon: SparklesIcon,
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    href: "https://chatgpt.com/",
    icon: MessageCircleIcon,
  },
  {
    id: "google-flow",
    label: "Google Flow",
    href: "https://flow.google.com/",
    icon: GoogleIcon,
  },
  {
    id: "google-gemini",
    label: "Google Gemini",
    href: "https://gemini.google.com/",
    icon: GeminiIcon,
  },
  { id: "dola", label: "Dola AI", href: "https://www.dola.com/chat/", icon: DolaIcon },
  { id: "phaya", label: "Phaya", href: "https://phaya.io/", icon: PhayaIcon },
  { id: "github", label: "GitHub", href: "https://github.com/", icon: GitHubIcon },
  { id: "claude", label: "Claude", href: "https://claude.ai/", icon: ClaudeIcon },
  { id: "capcut", label: "CapCut", href: "https://www.capcut.com/", icon: CapCutIcon },
];

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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  function applyPreset(preset: ContentPreset) {
    if (loading || pending) return;
    setSelectedPresetId(preset.id);
    setInput(preset.prompt);
    textareaRef.current?.focus();
  }

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
    setSelectedPresetId(null);

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
    <main className="min-h-screen bg-black bg-[linear-gradient(to_right,#f59e0b08_1px,transparent_1px),linear-gradient(to_bottom,#f59e0b08_1px,transparent_1px)] bg-[size:24px_24px] p-6">
      <div className="mx-auto flex max-w-6xl flex-col" style={{ minHeight: "calc(100vh - 3rem)" }}>
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">🤖 ผู้ช่วย AI</h1>
            <p className="mt-1 text-sm text-neutral-500">
              คิดคอนเทนต์และแคปชั่นพระเครื่องได้ (เลือกรูปแบบจากด้านซ้าย) และอ่านข้อมูลออเดอร์ สินค้า
              ลูกค้า ยอดขาย การเงิน กำไร และสต็อกได้ พร้อม &ldquo;เสนอ&rdquo;เปลี่ยนสถานะออเดอร์ — แต่จะ
              เปลี่ยนจริงก็ต่อเมื่อคุณกด &ldquo;อนุมัติ&rdquo; ยืนยันเองเท่านั้น
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <BackLink href="/" label="กลับหน้าแรก" />
            <LogoutButton />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4 md:flex-row">
          <aside className="shrink-0 rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg shadow-[0_0_15px_rgba(245,158,11,0.05)] p-4 md:w-64">
            <p className="mb-3 px-1 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
              รูปแบบคอนเทนต์
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-1">
              {CONTENT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  disabled={loading || !!pending}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all hover:bg-amber-500/10 hover:text-amber-500 hover:shadow-[0_0_15px_rgba(245,158,11,0.15)] disabled:cursor-not-allowed disabled:opacity-40 ${
                    selectedPresetId === preset.id
                      ? "border border-amber-500/40 bg-amber-500/10 text-amber-400"
                      : "border border-transparent text-neutral-400"
                  }`}
                >
                  <span className="text-base">{preset.icon}</span>
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="flex flex-1 flex-col rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg shadow-[0_0_15px_rgba(245,158,11,0.05)]">
          <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
            <p className="text-xs font-medium text-neutral-500">เครื่องมือ AI ภายนอก</p>
            <div className="flex items-center gap-2">
              <a
                href="/notes"
                target="_blank"
                rel="noopener noreferrer"
                title="เปิดสมุดโน้ต"
                className="flex h-8 items-center gap-1.5 rounded-lg border border-amber-500/20 bg-neutral-950/60 px-2.5 text-xs font-medium text-neutral-400 transition-all hover:border-amber-400 hover:text-amber-500 hover:shadow-[0_0_10px_rgba(245,158,11,0.4)]"
              >
                📝 เปิดสมุดโน้ต
              </a>
              {EXTERNAL_AI_TOOLS.map((tool) => {
                const Icon = tool.icon;
                return (
                  <a
                    key={tool.id}
                    href={tool.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={tool.label}
                    aria-label={tool.label}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/20 bg-neutral-950/60 text-neutral-400 transition-all hover:border-amber-400 hover:text-amber-500 hover:shadow-[0_0_10px_rgba(245,158,11,0.4)]"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                );
              })}
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5" style={{ minHeight: "50vh" }}>
            {messages.length === 0 && !loading && (
              <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-center text-sm text-neutral-500">
                เลือกรูปแบบคอนเทนต์ด้านซ้าย หรือลองถามเช่น &ldquo;มีสินค้าอะไรบ้าง&rdquo;, &ldquo;ยอดขายวันนี้เท่าไร&rdquo;
                <br />
                <span className="mt-1 block text-xs text-neutral-500">
                  ⏳ AI รันบนเครื่องนี้เอง อาจใช้เวลาตอบ 30 วินาที ถึง 3 นาที โปรดรอสักครู่
                </span>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === "user"
                      ? "border border-neutral-700 bg-neutral-800 text-white"
                      : "border border-amber-500/20 bg-amber-500/10 text-amber-50"
                  }`}
                >
                  {m.content || (
                    <span className="italic text-neutral-500">
                      (ไม่ได้รับคำตอบ — โปรดลองถามอีกครั้ง)
                    </span>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl border border-amber-500/10 bg-amber-500/5 px-4 py-2.5 text-sm text-neutral-400">
                  🤔 กำลังคิด... ({elapsedSeconds} วินาที)
                </div>
              </div>
            )}

            {/* STEP 78 — distinct confirmation card, not ordinary chat text. The confirmToken itself
                is never rendered here — only the human-readable order/status fields and message. */}
            {pending && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl border-2 border-amber-900/50 bg-amber-950/40 px-4 py-3 text-sm text-neutral-100">
                  <p className="font-semibold text-amber-400">⚠️ ต้องการการยืนยันจากคุณ</p>
                  <dl className="mt-2 space-y-0.5">
                    <div>
                      <dt className="inline text-neutral-500">คำสั่งซื้อ: </dt>
                      <dd className="inline font-mono">{pending.orderNumber}</dd>
                    </div>
                    <div>
                      <dt className="inline text-neutral-500">สถานะปัจจุบัน: </dt>
                      <dd className="inline font-medium">{pending.currentStatus}</dd>
                    </div>
                    <div>
                      <dt className="inline text-neutral-500">สถานะที่ขอเปลี่ยน: </dt>
                      <dd className="inline font-medium">{pending.requestedStatus}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-neutral-400">{pending.message}</p>

                  {confirmError && (
                    <p className="mt-2 rounded-lg bg-red-950/40 px-2 py-1 text-xs text-red-400">
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
                      className="rounded-lg border border-neutral-700 px-4 py-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
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
            <div className="mx-5 mb-3 rounded-xl border border-red-900/50 bg-red-950/40 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex items-end gap-3 border-t border-neutral-800 p-4">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading || !!pending}
              placeholder={
                pending
                  ? "โปรดกด \"อนุมัติ\" หรือ \"ยกเลิก\" ด้านบนก่อน"
                  : "พิมพ์คำถาม หรือเลือกรูปแบบคอนเทนต์ด้านซ้าย... (Enter เพื่อส่ง, Shift+Enter ขึ้นบรรทัดใหม่)"
              }
              rows={2}
              className="flex-1 resize-none rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 disabled:opacity-50"
            />

            <button
              type="button"
              onClick={sendMessage}
              disabled={loading || !!pending || !input.trim()}
              className="rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 px-5 py-2.5 text-sm font-medium text-black shadow-[0_0_15px_rgba(245,158,11,0.4)] hover:from-amber-400 hover:to-amber-300 disabled:opacity-50"
            >
              {loading ? "กำลังส่ง..." : "ส่ง"}
            </button>
          </div>
          </section>
        </div>
      </div>
    </main>
  );
}
