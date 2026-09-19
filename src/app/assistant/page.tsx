"use client";

import { useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import BackLink from "@/components/BackLink";
import NotesWorkspace from "@/components/NotesWorkspace";
import AssistantChatDrawer from "@/components/AssistantChatDrawer";
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

// /assistant is now primarily the Content Workspace ("สมุดโน้ต", NotesWorkspace) plus quick access
// to external AI tools — the local Ollama-backed chatbot (STEP 70-80, see AssistantChatDrawer's own
// header comment) is CPU-bound and slow, so it no longer sits on the main screen by default. It
// still exists, fully intact, inside a slide-over Drawer opened on demand via the "เรียกใช้ผู้ช่วย AI"
// button below, so it's only ever running when actually needed instead of being the default view.
//
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

export default function AssistantPage() {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <main className="min-h-screen bg-black bg-[linear-gradient(to_right,#f59e0b08_1px,transparent_1px),linear-gradient(to_bottom,#f59e0b08_1px,transparent_1px)] bg-[size:24px_24px] p-6">
      <div className="mx-auto flex max-w-6xl flex-col" style={{ minHeight: "calc(100vh - 3rem)" }}>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">📓 สมุดโน้ต &amp; เครื่องมือ AI</h1>
            <p className="mt-1 text-sm text-neutral-500">
              คิดคอนเทนต์และแคปชั่นพระเครื่อง จัดเก็บเป็นโฟลเดอร์/โน้ต และเข้าถึงเครื่องมือ AI ภายนอกได้ทันที
              — เรียกใช้ผู้ช่วย AI ภายในระบบเฉพาะเมื่อจำเป็น เพื่อประหยัดทรัพยากรเครื่อง
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 px-4 py-2.5 text-sm font-medium text-black shadow-[0_0_15px_rgba(245,158,11,0.4)] hover:from-amber-400 hover:to-amber-300"
            >
              <BotIcon className="h-4 w-4" />
              เรียกใช้ผู้ช่วย AI
            </button>
            <BackLink href="/" label="กลับหน้าแรก" />
            <LogoutButton />
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg shadow-[0_0_15px_rgba(245,158,11,0.05)] p-3">
          <p className="mr-1 shrink-0 text-xs font-medium text-neutral-500">เครื่องมือ AI ภายนอก:</p>
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
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/20 bg-black/30 text-neutral-400 transition-all hover:border-amber-400 hover:text-amber-500 hover:shadow-[0_0_10px_rgba(245,158,11,0.4)]"
              >
                <Icon className="h-4 w-4" />
              </a>
            );
          })}
        </div>

        <NotesWorkspace />
      </div>

      <AssistantChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
    </main>
  );
}
