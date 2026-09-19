"use client";

import { LogOutIcon } from "./icons";

export default function DashboardLogoutButton() {
  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="flex w-full items-center gap-2 rounded-xl border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 transition-all hover:border-rose-500 hover:bg-rose-950/30 hover:text-rose-400"
    >
      <LogOutIcon className="h-4 w-4" />
      ออกจากระบบ
    </button>
  );
}
