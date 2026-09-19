"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import AppSidebar from "@/components/AppSidebar";
import { SearchIcon } from "@/components/icons";

const CHART_PERIOD_OPTIONS = ["วันนี้", "สัปดาห์นี้", "เดือนนี้", "ปีนี้", "กำหนดเอง"] as const;
type ChartPeriod = (typeof CHART_PERIOD_OPTIONS)[number];

function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function currentIsoMonth(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

// Illustrative-only placeholder values (0-100 scale) for the 30-day sales mockup area chart below
// — no real sales data is wired up yet, this is purely a visual stand-in until a real chart is
// connected.
const SALES_TREND_MOCK = [
  45, 52, 38, 61, 70, 55, 48, 65, 80, 72, 58, 63, 75, 90, 68, 55, 62, 78, 85, 70, 60, 50, 66, 73,
  88, 95, 80, 68, 74, 82,
];

// ===== Smooth SVG area-chart geometry, computed once at module load (static mock data) =====
const CHART_WIDTH = 700;
const CHART_HEIGHT = 220;
const CHART_PAD_TOP = 12;
const CHART_PAD_BOTTOM = 6;

const chartPoints = SALES_TREND_MOCK.map((value, index) => {
  const x = (index / (SALES_TREND_MOCK.length - 1)) * CHART_WIDTH;
  const usableHeight = CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM;
  const y = CHART_PAD_TOP + usableHeight * (1 - value / 100);
  return { x, y };
});

// Smooth curve through the points: each segment's Bezier control points sit at the horizontal
// midpoint between the two points, at each point's own y — a simple, dependency-free way to get a
// visually smooth line through discrete data without a charting library.
function buildSmoothLinePath(points: { x: number; y: number }[]): string {
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

const chartLinePath = buildSmoothLinePath(chartPoints);
const chartAreaPath = `${chartLinePath} L ${chartPoints[chartPoints.length - 1].x} ${CHART_HEIGHT} L ${chartPoints[0].x} ${CHART_HEIGHT} Z`;

// Reflective highlight dots on the line's local peaks only, not every point.
const chartPeakPoints = chartPoints.filter((_, index) => SALES_TREND_MOCK[index] >= 85);

const CHART_Y_AXIS_LABELS = ["30k", "20k", "10k", "0k"];

// Illustrative-only mock recent-order feed — no real orders API is wired up yet.
const RECENT_ORDERS_MOCK = [
  { name: "คุณสมชาย ใจดี", time: "2 นาทีที่แล้ว", amount: 1590 },
  { name: "คุณวรรณา พงษ์ไพร", time: "18 นาทีที่แล้ว", amount: 3200 },
  { name: "คุณอนุชา ทองดี", time: "1 ชั่วโมงที่แล้ว", amount: 850 },
  { name: "คุณปิยะดา แสงจันทร์", time: "3 ชั่วโมงที่แล้ว", amount: 2100 },
];

const dateInputClass =
  "cursor-pointer rounded-md border border-amber-500/30 bg-neutral-900/80 px-2 py-1 text-xs text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.1)] outline-none focus:border-amber-400 focus:outline-none";

const selectClass =
  "cursor-pointer rounded-lg border border-amber-500/40 bg-neutral-900/80 px-3 py-1.5 text-xs text-amber-500 backdrop-blur-md outline-none focus:border-amber-400 focus:outline-none";

export default function Home() {
  const [selectedDate, setSelectedDate] = useState(() => todayIsoDate());
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("เดือนนี้");
  const [customMonth, setCustomMonth] = useState(() => currentIsoMonth());

  // Mock-only reactive figure — there is no real sales API behind this. Re-"fetches" (i.e. rolls a
  // new pseudo-random number after a short delay) whenever the date or chart period changes, purely
  // so the filter controls feel like they do something, per this STEP's explicit request.
  const [mockSalesAmount, setMockSalesAmount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setIsRefreshing(true);

    const timer = setTimeout(() => {
      setMockSalesAmount(Math.floor(Math.random() * 15000) + 500);
      setIsRefreshing(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [selectedDate, chartPeriod, customMonth]);

  return (
    <main className="min-h-screen bg-black bg-[linear-gradient(to_right,#f59e0b08_1px,transparent_1px),linear-gradient(to_bottom,#f59e0b08_1px,transparent_1px)] bg-[size:24px_24px] text-neutral-200">
      <header className="border-b border-neutral-800 bg-black text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 shrink-0">
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-amber-500 border-r-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.6)] animate-[spin_3s_linear_infinite]" />
              <Image
                src="/logo.jpg"
                alt="Logo"
                width={40}
                height={40}
                className="absolute inset-0 h-full w-full rounded-full border border-amber-500/40 object-cover"
              />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-wide text-white">THAI AMULET TH</h1>
              <p className="text-xs text-neutral-400">AI Content &amp; Business Operating System</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse"></span>
              ระบบใช้งานภายใน
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        <AppSidebar />

        <section className="flex-1 p-8">
          <div className="mb-8 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white">Dashboard ภาพรวม</h2>
              <p className="text-sm text-neutral-400">ระบบจัดการร้านพระเครื่อง ยอดขาย รายการเดินบัญชี และคอนเทนต์ AI</p>
            </div>
            <div className="text-xs text-neutral-400 bg-neutral-950/60 backdrop-blur-lg border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] rounded-lg px-3 py-1.5 w-fit">
              อัปเดตข้อมูลล่าสุด: <span className="font-semibold text-amber-500">วันนี้</span>
            </div>
          </div>

          <form
            action="https://www.google.com/search"
            target="_blank"
            method="GET"
            className="relative mb-6"
          >
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              name="q"
              placeholder="ค้นหาข้อมูลพระเครื่อง, ราคาตลาด, หรือพิมพ์เพื่อค้นหาผ่าน Google..."
              className="w-full rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg py-4 pl-12 pr-4 text-white placeholder-neutral-600 shadow-[0_0_20px_rgba(0,0,0,0.5)] outline-none focus:border-amber-500"
            />
          </form>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg shadow-[0_0_15px_rgba(245,158,11,0.05)] p-5 transition-all duration-300 hover:border-amber-500/50 hover:shadow-[0_0_20px_rgba(245,158,11,0.15)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">ยอดขายวันนี้</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className={dateInputClass}
                  />
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-800 text-xl border border-neutral-700/50">💰</div>
              </div>
              <div className="mt-4">
                <div
                  className={`text-3xl font-bold tracking-wider text-amber-400 drop-shadow-md transition-opacity ${
                    isRefreshing ? "opacity-50" : "opacity-100"
                  }`}
                >
                  ฿{mockSalesAmount.toLocaleString()}
                </div>
                <p className="mt-1 text-xs text-neutral-400">ยอดรวมคำสั่งซื้อที่ชำระเงินแล้ว</p>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg shadow-[0_0_15px_rgba(245,158,11,0.05)] p-5 transition-all duration-300 hover:border-amber-500/50 hover:shadow-[0_0_20px_rgba(245,158,11,0.15)]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">ออเดอร์วันนี้</span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-800 text-xl border border-neutral-700/50">🧾</div>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-extrabold tracking-tight text-white">0</div>
                <p className="mt-1 text-xs text-neutral-400">รายการสั่งซื้อทั้งหมด</p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex h-[260px] flex-col rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg shadow-[0_0_15px_rgba(245,158,11,0.05)] p-6 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-bold text-white">สถิติยอดขาย 30 วันย้อนหลัง</h3>
                <div className="flex items-center gap-2">
                  <select
                    value={chartPeriod}
                    onChange={(e) => setChartPeriod(e.target.value as ChartPeriod)}
                    className={selectClass}
                  >
                    {CHART_PERIOD_OPTIONS.map((option) => (
                      <option key={option} value={option} className="bg-neutral-900 text-amber-500">
                        {option}
                      </option>
                    ))}
                  </select>
                  {chartPeriod === "กำหนดเอง" && (
                    <input
                      type="month"
                      value={customMonth}
                      onChange={(e) => setCustomMonth(e.target.value)}
                      className={dateInputClass}
                    />
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-1 gap-2">
                <div className="flex flex-col justify-between py-1 text-right text-[10px] text-neutral-500">
                  {CHART_Y_AXIS_LABELS.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>

                <div className="relative flex-1">
                  <div className="absolute inset-0 flex flex-col justify-between">
                    {[0, 1, 2, 3, 4].map((line) => (
                      <div key={line} className="border-t border-neutral-800" />
                    ))}
                  </div>

                  <svg
                    viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                    preserveAspectRatio="none"
                    className="absolute inset-0 h-full w-full overflow-visible"
                  >
                    <defs>
                      <linearGradient id="salesAreaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(245, 158, 11, 0.5)" />
                        <stop offset="100%" stopColor="rgba(245, 158, 11, 0)" />
                      </linearGradient>
                    </defs>
                    <path d={chartAreaPath} fill="url(#salesAreaGradient)" stroke="none" />
                    <path
                      d={chartLinePath}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                    {chartPeakPoints.map((point) => (
                      <circle
                        key={`${point.x}-${point.y}`}
                        cx={point.x}
                        cy={point.y}
                        r={4.5}
                        fill="#fbbf24"
                        stroke="#000"
                        strokeWidth={1.5}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                  </svg>
                </div>
              </div>

              <div className="mt-2 flex justify-between pl-6 text-xs text-neutral-500">
                <span>1 ก.ย.</span>
                <span>10 ก.ย.</span>
                <span>19 ก.ย.</span>
                <span>30 ก.ย.</span>
              </div>
            </div>

            <div className="h-[260px] overflow-hidden rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg shadow-[0_0_15px_rgba(245,158,11,0.05)] p-6 lg:col-span-1">
              <h3 className="text-base font-bold text-white">ออเดอร์ล่าสุด</h3>

              <div className="mt-4 space-y-3">
                {RECENT_ORDERS_MOCK.map((order, index) => (
                  <div key={order.name} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-sm font-semibold text-amber-400">
                        {order.name.charAt(0)}
                        {index === 0 && (
                          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse ring-2 ring-neutral-900" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{order.name}</p>
                        <p className="text-xs text-neutral-500">{order.time}</p>
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-emerald-400">
                      +฿{order.amount.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
