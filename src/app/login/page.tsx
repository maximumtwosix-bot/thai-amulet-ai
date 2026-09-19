"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

// STEP 28 — public login page (never protected by src/proxy.ts). Validates the "next" redirect
// target client-side before navigating, to avoid an open-redirect via a crafted ?next= query param
// (mirrors isSafeRedirectPath() in src/lib/auth.ts, kept duplicated here since this is a Client
// Component and that file is server-only — see the same client/server split convention already
// established in finance/page.tsx and tax/page.tsx for constants that must not pull in db.ts).
function isSafeRedirectPath(path: string | null): path is string {
  if (!path) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.includes("://")) return false;

  return true;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (submitting) {
      // กันการกดซ้ำระหว่างที่ยังตรวจสอบอยู่
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "เข้าสู่ระบบไม่สำเร็จ");
      }

      const nextParam = searchParams.get("next");
      const destination = isSafeRedirectPath(nextParam) ? nextParam : "/";

      router.push(destination);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เข้าสู่ระบบไม่สำเร็จ");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black bg-[linear-gradient(to_right,#f59e0b08_1px,transparent_1px),linear-gradient(to_bottom,#f59e0b08_1px,transparent_1px)] bg-[size:24px_24px] p-6">
      <div className="w-full max-w-sm rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg p-8 shadow-[0_0_40px_rgba(245,158,11,0.1)]">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image
            src="/logo.jpg"
            alt="Thai Amulet Logo"
            width={90}
            height={90}
            className="mx-auto mb-4 rounded-full border-2 border-amber-500/50 shadow-[0_0_15px_rgba(245, 158, 11,0.3)]"
          />
          <h1 className="mt-4 text-xl font-bold tracking-wide text-white">
            THAI AMULET <span className="text-amber-500">AI</span>
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            เข้าสู่ระบบหลังบ้าน — สำหรับผู้ดูแลระบบเท่านั้น
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">ชื่อผู้ใช้</label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-neutral-800 bg-black px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">รหัสผ่าน</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-black px-3 py-2 pr-10 text-sm text-white placeholder-neutral-600 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-amber-500"
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-900/50 bg-red-950/40 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-amber-500 py-3 font-bold text-black transition-all hover:bg-amber-400 disabled:opacity-50"
          >
            {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-black bg-[linear-gradient(to_right,#f59e0b08_1px,transparent_1px),linear-gradient(to_bottom,#f59e0b08_1px,transparent_1px)] bg-[size:24px_24px] p-6">
          <p className="text-sm text-neutral-500">กำลังโหลด...</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
