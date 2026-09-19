"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// STEP 28 — shared logout control for the 5 protected back-office pages (products, inventory,
// orders, finance, tax). One small component instead of duplicating the fetch+redirect logic in
// each page.
export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    if (loading) return;

    setLoading(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="flex items-center gap-2 rounded-xl border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 transition-all hover:border-rose-500 hover:bg-rose-950/30 hover:text-rose-400 hover:shadow-[0_0_15px_rgba(244,63,94,0.15)] disabled:opacity-50"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      {loading ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
    </button>
  );
}
