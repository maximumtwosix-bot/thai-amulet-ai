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
      className="w-fit rounded-xl border bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
    >
      🚪 {loading ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
    </button>
  );
}
