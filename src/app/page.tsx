"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const menuItems = [
  { icon: "🏠", title: "Dashboard", desc: "ภาพรวมระบบ", href: "/" },
  { icon: "📝", title: "สร้างโพสต์", desc: "Facebook / TikTok", href: "/content" },
  { icon: "🎬", title: "สร้างคลิป", desc: "Reels / TikTok", href: "/video-studio" },
  { icon: "🖼️", title: "จัดการรูปภาพ", desc: "โปสเตอร์สินค้า", href: "/video-studio" },
  { icon: "📦", title: "สินค้า", desc: "จัดการข้อมูลสินค้า", href: "/products" },
  { icon: "🧾", title: "ออเดอร์", desc: "จัดการคำสั่งซื้อ", href: "/orders" },
  { icon: "👤", title: "ลูกค้า", desc: "รายชื่อลูกค้า", href: "/customers" },
  { icon: "💰", title: "การเงิน", desc: "รายรับ-รายจ่าย", href: "/finance" },
  { icon: "🏦", title: "บัญชีธนาคาร", desc: "จัดการบัญชีธนาคาร", href: "/bank" },
  { icon: "📑", title: "สรุปภาษี", desc: "รายงานสำหรับทำบัญชี", href: "/tax" },
  { icon: "🤖", title: "ผู้ช่วย AI", desc: "ถามข้อมูลร้านค้า", href: "/assistant" },
  { icon: "📊", title: "ยอดขาย", desc: "ดูสถิติการขาย", href: null },
  { icon: "⚙️", title: "ตั้งค่า", desc: "ตั้งค่าระบบ", href: null },
];

export default function Home() {
  const [active, setActive] = useState("Dashboard");
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-neutral-100 text-neutral-900">
      <header className="border-b border-neutral-200 bg-black text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-bold tracking-wide">
              THAI AMULET TH
            </h1>
            <p className="text-sm text-neutral-400">
              AI Content &amp; Business System
            </p>
          </div>

          <div className="rounded-full border border-yellow-600/50 px-4 py-2 text-sm text-yellow-400">
            ระบบใช้งานภายใน
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        <aside className="hidden min-h-[calc(100vh-89px)] w-64 border-r border-neutral-200 bg-white p-4 md:block">
          <p className="mb-4 px-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            เมนูหลัก
          </p>

          <div className="space-y-2">
            {menuItems.map((item) => {
              const isActive = item.href !== null && pathname === item.href;

              if (item.href === null) {
                return (
                  <div
                    key={item.title}
                    aria-disabled="true"
                    title="ยังไม่พร้อมใช้งาน"
                    className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl p-3 text-left text-neutral-400"
                  >
                    <span className="text-xl opacity-50">{item.icon}</span>

                    <span className="flex-1">
                      <span className="block text-sm font-semibold">
                        {item.title}
                      </span>
                      <span className="block text-xs text-neutral-400">
                        {item.desc}
                      </span>
                    </span>

                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-400">
                      เร็วๆ นี้
                    </span>
                  </div>
                );
              }

              return (
                <Link
                  key={item.title}
                  href={item.href}
                  className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${
                    isActive
                      ? "bg-black text-white"
                      : "text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  <span className="text-xl">{item.icon}</span>

                  <span>
                    <span className="block text-sm font-semibold">
                      {item.title}
                    </span>
                    <span
                      className={`block text-xs ${
                        isActive ? "text-neutral-400" : "text-neutral-500"
                      }`}
                    >
                      {item.desc}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </aside>

        <section className="flex-1 p-6 md:p-10">
          <div className="mb-8">
            <p className="text-sm text-neutral-500">ยินดีต้อนรับ</p>
            <h2 className="mt-1 text-3xl font-bold">{active}</h2>
            <p className="mt-2 text-neutral-500">
              ระบบจัดการงาน THAI AMULET TH สำหรับใช้งานภายใน
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-neutral-500">สินค้า</p>
              <p className="mt-2 text-3xl font-bold">0</p>
              <p className="mt-2 text-xs text-neutral-400">
                รายการสินค้าในระบบ
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-neutral-500">ออเดอร์วันนี้</p>
              <p className="mt-2 text-3xl font-bold">0</p>
              <p className="mt-2 text-xs text-neutral-400">
                คำสั่งซื้อวันนี้
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-neutral-500">ยอดขายวันนี้</p>
              <p className="mt-2 text-3xl font-bold">฿0</p>
              <p className="mt-2 text-xs text-neutral-400">
                ยอดขายรวมวันนี้
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-neutral-500">คอนเทนต์</p>
              <p className="mt-2 text-3xl font-bold">0</p>
              <p className="mt-2 text-xs text-neutral-400">
                งานคอนเทนต์ที่สร้าง
              </p>
            </div>

            {/* STEP 21 — ลิงก์ไปหน้า AI Cost Dashboard (src/app/costs/page.tsx) ไม่ใช่ stat card
                หลอกแบบด้านบน เพราะดึงข้อมูลจริงจาก /api/costs/summary */}
            <a
              href="/costs"
              className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:border-black hover:shadow-md"
            >
              <p className="text-sm text-neutral-500">ต้นทุน AI</p>
              <p className="mt-2 text-3xl font-bold">💰</p>
              <p className="mt-2 text-xs text-neutral-400">
                ดู AI Cost Dashboard
              </p>
            </a>
          </div>

          <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
            <h3 className="text-xl font-bold">
              🚀 เริ่มสร้างระบบของเรา
            </h3>

            <p className="mt-2 max-w-2xl text-neutral-500">
              ขั้นแรกสร้าง Dashboard ก่อน จากนั้นเราจะค่อย ๆ
              เพิ่มระบบสร้างคอนเทนต์ สินค้า ออเดอร์ และสถิติการขาย
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["📝", "สร้างโพสต์ Facebook"],
                ["🎬", "สร้างสคริปต์ Reels"],
                ["🖼️", "สร้างโปสเตอร์"],
              ].map(([icon, title]) => (
                <button
                  key={title}
                  onClick={() => setActive(title)}
                  className="rounded-xl border border-neutral-200 p-5 text-left transition hover:border-black hover:shadow-md"
                >
                  <span className="text-2xl">{icon}</span>
                  <p className="mt-3 font-semibold">{title}</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    เริ่มต้นใช้งาน
                  </p>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}