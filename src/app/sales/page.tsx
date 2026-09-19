"use client";

import Link from "next/link";
import AppSidebar from "@/components/AppSidebar";

const summaryCards = [
  {
    icon: "💰",
    label: "ยอดขายวันนี้",
    value: "฿0",
    hint: "ยอดขายรวมวันนี้",
    trend: "↑ 12% จากเมื่อวาน",
    trendUp: true,
  },
  {
    icon: "🧾",
    label: "ออเดอร์วันนี้",
    value: "0",
    hint: "คำสั่งซื้อวันนี้",
    trend: "↑ 8% จากเมื่อวาน",
    trendUp: true,
  },
  {
    icon: "📊",
    label: "ค่าเฉลี่ยต่อบิล",
    value: "฿0",
    hint: "ยอดเฉลี่ยต่อออเดอร์",
    trend: "↓ 3% จากเมื่อวาน",
    trendUp: false,
  },
  {
    icon: "🏆",
    label: "สินค้าขายดี",
    value: "-",
    hint: "ยังไม่มีข้อมูล",
    trend: null,
    trendUp: false,
  },
];

export default function SalesPage() {
  return (
    <main className="min-h-screen bg-black bg-[linear-gradient(to_right,#f59e0b08_1px,transparent_1px),linear-gradient(to_bottom,#f59e0b08_1px,transparent_1px)] bg-[size:24px_24px] text-neutral-200">
      <header className="border-b border-neutral-800 bg-black text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-bold tracking-wide">THAI AMULET TH</h1>
            <p className="text-sm text-neutral-400">AI Content &amp; Business System</p>
          </div>

          <div className="rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
            ระบบใช้งานภายใน
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        <AppSidebar />

        <section className="flex-1 p-6 md:p-10">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-neutral-400">ยินดีต้อนรับ</p>
              <h2 className="mt-1 text-3xl font-bold text-white">ยอดขาย</h2>
              <p className="mt-2 text-neutral-400">
                ภาพรวมและสถิติการขายของร้าน THAI AMULET TH
              </p>
            </div>

            <Link
              href="/orders/new"
              className="bg-amber-500 text-black px-4 py-2 rounded-xl hover:bg-amber-400 font-bold text-sm transition-all shadow-[0_0_15px_rgba(245, 158, 11,0.2)] flex items-center gap-2 w-fit"
            >
              + สร้างออเดอร์ใหม่
            </Link>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg shadow-[0_0_15px_rgba(245,158,11,0.05)] p-5 transition-all hover:border-amber-500/50 hover:shadow-[0_0_15px_rgba(245, 158, 11,0.1)]"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-neutral-400">{card.label}</p>
                  <span className="text-xl text-amber-500">{card.icon}</span>
                </div>
                <p className="mt-2 text-3xl font-bold tracking-wider text-amber-400 drop-shadow-md">{card.value}</p>
                <p className="mt-2 text-xs text-neutral-400">{card.hint}</p>
                {card.trend && (
                  <div
                    className={`mt-2 flex items-center gap-1 text-xs font-medium ${
                      card.trendUp ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    <span>{card.trend}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg shadow-[0_0_15px_rgba(245,158,11,0.05)] p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">📈 กราฟยอดขายย้อนหลัง 7 วัน</h3>
                <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-400">
                  เร็วๆ นี้
                </span>
              </div>

              <div className="mt-6 flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-neutral-700 bg-black/30 text-center">
                <span className="text-3xl text-neutral-500">📊</span>
                <p className="mt-3 text-sm font-medium text-neutral-500">
                  ยังไม่มีข้อมูลกราฟ
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  จะแสดงยอดขายย้อนหลัง 7 วันเมื่อเชื่อมต่อข้อมูลจริง
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg shadow-[0_0_15px_rgba(245,158,11,0.05)] p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">🧾 ออเดอร์ล่าสุด</h3>
                <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-400">
                  เร็วๆ นี้
                </span>
              </div>

              <div className="mt-6 flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-neutral-700 bg-black/30 text-center">
                <span className="text-3xl text-neutral-500">🧾</span>
                <p className="mt-3 text-sm font-medium text-neutral-500">
                  ยังไม่มีออเดอร์ล่าสุด
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  รายการออเดอร์ล่าสุดจะแสดงที่นี่
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
