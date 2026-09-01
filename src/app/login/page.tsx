"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">🔒 เข้าสู่ระบบหลังบ้าน</h1>
        <p className="mt-1 text-sm text-slate-500">THAI AMULET TH — สำหรับผู้ดูแลระบบเท่านั้น</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">ชื่อผู้ใช้</label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">รหัสผ่าน</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
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
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <p className="text-sm text-slate-500">กำลังโหลด...</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
