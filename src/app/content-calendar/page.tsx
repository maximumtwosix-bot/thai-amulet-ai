"use client";

// ===== CONTENT CALENDAR — STEP 20 =====
// หน้าใหม่แยกต่างหาก (ไม่ใช่ section ใน Video Studio) เพราะ Calendar เป็นมุมมองข้าม "ทุกสินค้า"
// ตามวันที่/เวลา ต่างจาก Video Studio ที่ทำงานทีละสินค้าเป็นหลัก — ตรงกับ pattern เดิมของโปรเจกต์
// ที่แยกหน้าตาม feature (/products, /content, /content-studio, /video-studio, /voice-studio)
//
// ไม่มี queue/provider/AI logic ใหม่ในไฟล์นี้เลย — เรียกใช้ API ที่มีอยู่แล้วทั้งหมด
// (/api/content/calendar, /api/content/plan (STEP 19), /api/products/[id]/media/generate (STEP 13),
// /api/products/[id]/ai-video/generate (STEP 14), /api/social/prepare (STEP 9))

import { useEffect, useState } from "react";

type SocialPlatform = "facebook" | "reels" | "instagram" | "tiktok";
type ContentType = "facebook" | "reels" | "tiktok" | "script";
type ContentAngle =
  | "product_highlight"
  | "story"
  | "educational"
  | "collector"
  | "belief_spiritual"
  | "promotion"
  | "problem_solution"
  | "faq"
  | "short_reel_hook";

const angleLabels: Record<ContentAngle, string> = {
  product_highlight: "Product Highlight",
  story: "Story",
  educational: "Educational",
  collector: "Collector",
  belief_spiritual: "Belief/Spiritual",
  promotion: "Promotion",
  problem_solution: "Problem→Solution",
  faq: "FAQ",
  short_reel_hook: "Short Reel Hook",
};

const angleOptions = Object.keys(angleLabels) as ContentAngle[];

const statusLabels: Record<string, string> = {
  draft: "📝 Draft",
  planned: "📋 Planned",
  ready: "✅ Ready",
  scheduled: "📅 Scheduled",
  published: "🎉 Published",
  failed: "❌ Failed",
  cancelled: "🚫 Cancelled",
};

type CalendarItem = {
  id: number;
  contentPlanId: number | null;
  productId: number;
  platform: SocialPlatform | null;
  contentType: ContentType;
  contentAngle: ContentAngle | null;
  scheduledAt: string;
  status: string;
  socialPostId: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type Product = {
  id: number;
  name: string;
  category: string | null;
};

type ContentPlanDetail = {
  id: number;
  caption: string;
  hashtags: string[];
  imagePrompt: string | null;
  videoPrompt: string | null;
};

type WeeklySlot = {
  scheduledAt: string;
  productId: number;
  platform: SocialPlatform;
  contentType: ContentType;
  contentAngle: ContentAngle;
  objective: string;
};

function formatBangkok(iso: string, withDate = true): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    ...(withDate
      ? { day: "2-digit", month: "2-digit", year: "numeric" }
      : {}),
    hour: "2-digit",
    minute: "2-digit",
  });
}

function bangkokDatePart(date: Date): string {
  // en-CA locale ให้รูปแบบ YYYY-MM-DD ตรงๆ — ใช้แปลงเวลาปัจจุบันเป็น "วันที่ตามเวลากรุงเทพ" ที่แท้จริง
  // (ไม่ใช้ UTC date part ตรงๆ เพราะจะเพี้ยนได้ถ้าเวลาข้ามเที่ยงคืนของสองโซนไม่ตรงกัน)
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

function getBangkokRange(mode: "today" | "week" | "month"): { startIso: string; endIso: string } {
  const now = new Date();
  const todayPart = bangkokDatePart(now);

  if (mode === "today") {
    return {
      startIso: new Date(`${todayPart}T00:00:00+07:00`).toISOString(),
      endIso: new Date(`${todayPart}T23:59:59+07:00`).toISOString(),
    };
  }

  if (mode === "week") {
    const [y, m, d] = todayPart.split("-").map(Number);
    const localMidnight = new Date(`${todayPart}T00:00:00+07:00`);
    const dayOfWeek = new Date(y, m - 1, d).getDay(); // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const start = new Date(localMidnight);
    start.setUTCDate(start.getUTCDate() + mondayOffset);

    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    end.setUTCHours(end.getUTCHours() + 23, 59, 59);

    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }

  // month
  const [y, m] = todayPart.split("-").map(Number);
  const start = new Date(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01T00:00:00+07:00`);
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  const end = new Date(
    `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+07:00`
  );
  end.setUTCSeconds(end.getUTCSeconds() - 1);

  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export default function ContentCalendarPage() {
  const [viewMode, setViewMode] = useState<"today" | "week" | "month" | "list">("week");
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [products, setProducts] = useState<Product[]>([]);

  const [planCache, setPlanCache] = useState<Record<number, ContentPlanDetail>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [actionMessages, setActionMessages] = useState<Record<number, string>>({});
  const [actionBusyId, setActionBusyId] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState("");
  const [videoUrlInputs, setVideoUrlInputs] = useState<Record<number, string>>({});

  // "+ เพิ่ม Content" form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [formProductId, setFormProductId] = useState<number | "">("");
  const [formContentType, setFormContentType] = useState<ContentType>("facebook");
  const [formPlatform, setFormPlatform] = useState<SocialPlatform>("facebook");
  const [formAngle, setFormAngle] = useState<ContentAngle | "">("");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("");
  const [formError, setFormError] = useState("");
  const [formWarning, setFormWarning] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  // "✨ AI วางแผน 7 วัน" state
  const [showPlanner, setShowPlanner] = useState(false);
  const [plannerDays, setPlannerDays] = useState(7);
  const [plannerPostsPerDay, setPlannerPostsPerDay] = useState(1);
  const [plannerPlatforms, setPlannerPlatforms] = useState<SocialPlatform[]>(["facebook"]);
  const [plannerStartDate, setPlannerStartDate] = useState("");
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [plannerError, setPlannerError] = useState("");
  const [plannerPreview, setPlannerPreview] = useState<WeeklySlot[] | null>(null);
  const [plannerConfirming, setPlannerConfirming] = useState(false);

  async function loadItems() {
    try {
      setLoading(true);
      setError("");

      let url = "/api/content/calendar";

      if (viewMode !== "list") {
        const { startIso, endIso } = getBangkokRange(viewMode);
        url += `?startDate=${encodeURIComponent(startIso)}&endDate=${encodeURIComponent(endIso)}`;
      }

      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "ไม่สามารถโหลด Content Calendar ได้");
      }

      setItems(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  useEffect(() => {
    fetch("/api/products", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setProducts(data);
      })
      .catch((err) => console.error(err));
  }, []);

  function productName(id: number): string {
    return products.find((p) => p.id === id)?.name || `#${id}`;
  }

  async function loadPlanDetail(planId: number): Promise<ContentPlanDetail | null> {
    if (planCache[planId]) return planCache[planId];

    try {
      const response = await fetch(`/api/content/plan/${planId}`, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) return null;

      const detail: ContentPlanDetail = {
        id: data.plan.id,
        caption: data.plan.caption,
        hashtags: data.plan.hashtags,
        imagePrompt: data.plan.imagePrompt,
        videoPrompt: data.plan.videoPrompt,
      };

      setPlanCache((previous) => ({ ...previous, [planId]: detail }));
      return detail;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  async function togglePreview(item: CalendarItem) {
    if (expandedId === item.id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(item.id);

    if (item.contentPlanId) {
      await loadPlanDetail(item.contentPlanId);
    }
  }

  function setMessage(id: number, message: string) {
    setActionMessages((previous) => ({ ...previous, [id]: message }));
  }

  async function generateContentForItem(item: CalendarItem) {
    setActionBusyId(item.id);
    setMessage(item.id, "⏳ กำลังสร้าง Content ด้วย AI...");

    try {
      const response = await fetch("/api/content/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          productId: item.productId,
          count: 1,
          contentType: item.contentType,
          angles: item.contentAngle ? [item.contentAngle] : "auto",
        }),
      });

      const data = await response.json();

      if (response.status === 503) {
        setMessage(item.id, `⚠️ ${data?.error || "ยังไม่ได้ตั้งค่า OPENAI_API_KEY"}`);
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(data?.error || "ไม่สามารถสร้าง Content ได้");
      }

      const newPlan = data.plans[0];

      const patchResponse = await fetch(`/api/content/calendar/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ contentPlanId: newPlan.id, status: "ready" }),
      });

      const patchData = await patchResponse.json();

      if (!patchResponse.ok) {
        throw new Error(patchData?.error || "สร้าง Content สำเร็จ แต่เชื่อมเข้า Calendar ไม่สำเร็จ");
      }

      setItems((previous) => previous.map((i) => (i.id === item.id ? patchData.item : i)));
      setMessage(item.id, "✅ สร้าง Content สำเร็จ");
    } catch (err) {
      setMessage(item.id, err instanceof Error ? `❌ ${err.message}` : "❌ เกิดข้อผิดพลาด");
    } finally {
      setActionBusyId(null);
    }
  }

  async function generateImage(item: CalendarItem) {
    const plan = item.contentPlanId ? await loadPlanDetail(item.contentPlanId) : null;

    if (!plan?.imagePrompt) {
      setMessage(item.id, "❌ ไม่มี Image Prompt");
      return;
    }

    setActionBusyId(item.id);
    setMessage(item.id, "⏳ กำลังสร้างภาพ...");

    try {
      const response = await fetch(`/api/products/${item.productId}/media/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ prompt: plan.imagePrompt, contentPlanId: item.contentPlanId }),
      });

      const data = await response.json();

      if (response.status === 503) {
        setMessage(item.id, `⚠️ ${data?.error || "ยังไม่ได้ตั้งค่า OPENAI_API_KEY"}`);
        return;
      }

      if (!response.ok) throw new Error(data?.error || "ไม่สามารถสร้างภาพได้");

      setMessage(item.id, "✅ สร้างภาพสำเร็จ (source: ai, ไม่ใช่รูปหลักอัตโนมัติ)");
    } catch (err) {
      setMessage(item.id, err instanceof Error ? `❌ ${err.message}` : "❌ เกิดข้อผิดพลาด");
    } finally {
      setActionBusyId(null);
    }
  }

  async function generateVideo(item: CalendarItem) {
    const plan = item.contentPlanId ? await loadPlanDetail(item.contentPlanId) : null;

    if (!plan?.videoPrompt) {
      setMessage(item.id, "❌ ไม่มี Video Prompt");
      return;
    }

    setActionBusyId(item.id);
    setMessage(item.id, "⏳ กำลังเริ่มงาน...");

    try {
      const response = await fetch(`/api/products/${item.productId}/ai-video/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ prompt: plan.videoPrompt, contentPlanId: item.contentPlanId }),
      });

      const data = await response.json();

      if (response.status === 503) {
        setMessage(item.id, `⚠️ ${data?.error || "ยังไม่ได้ตั้งค่า AI Video Generation (Not Configured)"}`);
        return;
      }

      if (!response.ok) throw new Error(data?.error || "ไม่สามารถเริ่มสร้างวิดีโอได้");

      setMessage(item.id, "✅ เริ่มสร้างวิดีโอแล้ว (ตรวจสถานะที่ Video Studio)");
    } catch (err) {
      setMessage(item.id, err instanceof Error ? `❌ ${err.message}` : "❌ เกิดข้อผิดพลาด");
    } finally {
      setActionBusyId(null);
    }
  }

  async function preparePost(item: CalendarItem) {
    const videoUrl = videoUrlInputs[item.id];

    if (!videoUrl) {
      setMessage(item.id, "❌ กรุณาระบุ Video URL ก่อน (จากวิดีโอที่ render แล้วใน Video Studio)");
      return;
    }

    const plan = item.contentPlanId ? await loadPlanDetail(item.contentPlanId) : null;

    setActionBusyId(item.id);
    setMessage(item.id, "⏳ กำลังเตรียมโพสต์...");

    try {
      const response = await fetch("/api/social/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          productId: item.productId,
          platform: item.platform,
          videoUrl,
          caption: plan?.caption,
          hashtags: plan?.hashtags,
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data?.error || "ไม่สามารถเตรียมโพสต์ได้");

      setMessage(item.id, `✅ เตรียม Content Package สำเร็จ (${data.package.status})`);
    } catch (err) {
      setMessage(item.id, err instanceof Error ? `❌ ${err.message}` : "❌ เกิดข้อผิดพลาด");
    } finally {
      setActionBusyId(null);
    }
  }

  async function scheduleItem(item: CalendarItem) {
    const videoUrl = videoUrlInputs[item.id];

    if (!videoUrl) {
      setMessage(item.id, "❌ กรุณาระบุ Video URL ก่อน");
      return;
    }

    setActionBusyId(item.id);
    setMessage(item.id, "⏳ กำลังตั้งเวลา...");

    try {
      const response = await fetch(`/api/content/calendar/${item.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ videoUrl }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data?.error || "ไม่สามารถตั้งเวลาได้");

      setItems((previous) => previous.map((i) => (i.id === item.id ? data.item : i)));
      setMessage(item.id, "✅ ตั้งเวลาเข้าคิวสำเร็จ (ยังไม่โพสต์จริงจนกว่า worker จะยืนยัน)");
    } catch (err) {
      setMessage(item.id, err instanceof Error ? `❌ ${err.message}` : "❌ เกิดข้อผิดพลาด");
    } finally {
      setActionBusyId(null);
    }
  }

  async function cancelItem(item: CalendarItem) {
    setActionBusyId(item.id);

    try {
      const response = await fetch(`/api/content/calendar/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ status: "cancelled" }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data?.error || "ไม่สามารถยกเลิกได้");

      setItems((previous) => previous.map((i) => (i.id === item.id ? data.item : i)));
      setMessage(item.id, "✅ ยกเลิกแล้ว");
    } catch (err) {
      setMessage(item.id, err instanceof Error ? `❌ ${err.message}` : "❌ เกิดข้อผิดพลาด");
    } finally {
      setActionBusyId(null);
    }
  }

  async function deleteItem(item: CalendarItem) {
    setActionBusyId(item.id);

    try {
      const response = await fetch(`/api/content/calendar/${item.id}`, { method: "DELETE" });
      const data = await response.json();

      if (!response.ok) throw new Error(data?.error || "ไม่สามารถลบได้");

      setItems((previous) => previous.filter((i) => i.id !== item.id));
    } catch (err) {
      setMessage(item.id, err instanceof Error ? `❌ ${err.message}` : "❌ เกิดข้อผิดพลาด");
    } finally {
      setActionBusyId(null);
    }
  }

  async function copyField(label: string, text: string) {
    if (!text) return;

    // STEP 20.21: primary path ใช้ Clipboard API ปกติ — ถ้าถูกบล็อกโดย browser/session
    // restriction (เช่น document ไม่ focus ในสภาพแวดล้อม automation) ให้ fallback ไปใช้
    // document.execCommand('copy') ผ่าน textarea ชั่วคราว ซึ่งใช้ event ทาง DOM โดยตรงแทน
    // Clipboard API async permission — ใช้งานได้จริงในเบราว์เซอร์จริงของผู้ใช้เสมอ
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(label);
      window.setTimeout(() => setCopiedField(""), 2000);
      return;
    } catch (err) {
      console.error("clipboard.writeText failed, falling back:", err);
    }

    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);

      if (ok) {
        setCopiedField(label);
        window.setTimeout(() => setCopiedField(""), 2000);
      } else {
        setCopiedField("");
      }
    } catch (err) {
      console.error("execCommand fallback also failed:", err);
    }
  }

  async function submitAddForm() {
    if (formLoading) return;

    if (!formProductId || !formDate || !formTime) {
      setFormError("กรุณากรอกข้อมูลให้ครบ");
      return;
    }

    const scheduledDate = new Date(`${formDate}T${formTime}`);

    if (Number.isNaN(scheduledDate.getTime())) {
      setFormError("วันที่/เวลาไม่ถูกต้อง");
      return;
    }

    setFormLoading(true);
    setFormError("");
    setFormWarning("");

    try {
      const response = await fetch("/api/content/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          productId: formProductId,
          contentType: formContentType,
          platform: formContentType === "script" ? undefined : formPlatform,
          contentAngle: formAngle || undefined,
          scheduledAt: scheduledDate.toISOString(),
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data?.error || "ไม่สามารถสร้างรายการได้");

      if (data.warning) {
        setFormWarning(data.warning);
      }

      setShowAddForm(false);
      setFormAngle("");
      setFormDate("");
      setFormTime("");
      await loadItems();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
    } finally {
      setFormLoading(false);
    }
  }

  async function runWeeklyPlanner() {
    if (plannerLoading) return;

    setPlannerLoading(true);
    setPlannerError("");
    setPlannerPreview(null);

    try {
      const response = await fetch("/api/content/calendar/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          productIds: "all",
          days: plannerDays,
          postsPerDay: plannerPostsPerDay,
          platforms: plannerPlatforms,
          startDate: plannerStartDate
            ? new Date(plannerStartDate).toISOString()
            : new Date().toISOString(),
          preferredTimes: ["10:00", "18:00"],
        }),
      });

      const data = await response.json();

      if (response.status === 503) {
        throw new Error(data?.error || "ยังไม่ได้ตั้งค่า OPENAI_API_KEY");
      }

      if (!response.ok || !data.success) {
        throw new Error(data?.error || "ไม่สามารถวางแผนได้");
      }

      setPlannerPreview(data.slots);
    } catch (err) {
      setPlannerError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
    } finally {
      setPlannerLoading(false);
    }
  }

  async function confirmWeeklyPlan() {
    if (!plannerPreview || plannerConfirming) return;

    setPlannerConfirming(true);

    try {
      for (const slot of plannerPreview) {
        await fetch("/api/content/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            productId: slot.productId,
            platform: slot.platform,
            contentType: slot.contentType,
            contentAngle: slot.contentAngle,
            scheduledAt: slot.scheduledAt,
            notes: slot.objective,
          }),
        });
      }

      setPlannerPreview(null);
      setShowPlanner(false);
      await loadItems();
    } catch (err) {
      setPlannerError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดระหว่างบันทึก");
    } finally {
      setPlannerConfirming(false);
    }
  }

  return (
    <main className="min-h-screen bg-black p-6 text-white">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold">📅 Content Calendar</h1>
        <p className="mt-2 text-gray-400">
          วางแผนคอนเทนต์ล่วงหน้าสำหรับทุกสินค้า — เวลาแสดงผลเป็นเวลาไทย (Asia/Bangkok)
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {(["today", "week", "month", "list"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={
                "rounded-xl border px-4 py-2 text-sm " +
                (viewMode === mode
                  ? "border-white bg-white text-black"
                  : "border-gray-700 bg-gray-900 text-white")
              }
            >
              {mode === "today" ? "Today" : mode === "week" ? "Week" : mode === "month" ? "Month" : "List"}
            </button>
          ))}

          <div className="flex-1" />

          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="rounded-xl border border-gray-600 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800"
          >
            + เพิ่ม Content
          </button>

          <button
            type="button"
            onClick={() => setShowPlanner((v) => !v)}
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black"
          >
            ✨ AI วางแผน 7 วัน
          </button>
        </div>

        {showAddForm && (
          <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950 p-4">
            <h3 className="font-semibold text-gray-200">+ เพิ่ม Content ใหม่</h3>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs text-gray-400">สินค้า</label>
                <select
                  value={formProductId}
                  onChange={(e) => setFormProductId(e.target.value ? Number(e.target.value) : "")}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 p-2 text-sm text-white"
                >
                  <option value="">เลือกสินค้า</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400">Content Type</label>
                <select
                  value={formContentType}
                  onChange={(e) => setFormContentType(e.target.value as ContentType)}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 p-2 text-sm text-white"
                >
                  <option value="facebook">Facebook</option>
                  <option value="reels">Reels</option>
                  <option value="tiktok">TikTok</option>
                  <option value="script">Script</option>
                </select>
              </div>

              {formContentType !== "script" && (
                <div>
                  <label className="block text-xs text-gray-400">Platform</label>
                  <select
                    value={formPlatform}
                    onChange={(e) => setFormPlatform(e.target.value as SocialPlatform)}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 p-2 text-sm text-white"
                  >
                    <option value="facebook">Facebook</option>
                    <option value="reels">Reels</option>
                    <option value="instagram">Instagram</option>
                    <option value="tiktok">TikTok</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-400">Content Angle</label>
                <select
                  value={formAngle}
                  onChange={(e) => setFormAngle(e.target.value as ContentAngle | "")}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 p-2 text-sm text-white"
                >
                  <option value="">(ไม่ระบุ)</option>
                  {angleOptions.map((a) => (
                    <option key={a} value={a}>
                      {angleLabels[a]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400">วันที่</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 p-2 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400">เวลา</label>
                <input
                  type="time"
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 p-2 text-sm text-white"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={submitAddForm}
              disabled={formLoading}
              className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {formLoading ? "⏳ กำลังบันทึก..." : "บันทึก"}
            </button>

            {formError && <p className="mt-2 text-sm text-red-400">{formError}</p>}
            {formWarning && <p className="mt-2 text-sm text-yellow-500">⚠️ {formWarning}</p>}
          </div>
        )}

        {showPlanner && (
          <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950 p-4">
            <h3 className="font-semibold text-gray-200">✨ AI วางแผน Content Calendar</h3>

            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-xs text-gray-400">จำนวนวัน</label>
                <input
                  type="number"
                  min={1}
                  max={14}
                  value={plannerDays}
                  onChange={(e) => setPlannerDays(Number(e.target.value) || 1)}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 p-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400">โพสต์/วัน</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={plannerPostsPerDay}
                  onChange={(e) => setPlannerPostsPerDay(Number(e.target.value) || 1)}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 p-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400">วันเริ่มต้น</label>
                <input
                  type="date"
                  value={plannerStartDate}
                  onChange={(e) => setPlannerStartDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 p-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400">Platforms</label>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(["facebook", "reels", "instagram", "tiktok"] as SocialPlatform[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() =>
                        setPlannerPlatforms((prev) =>
                          prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                        )
                      }
                      className={
                        "rounded-full border px-2 py-1 text-xs " +
                        (plannerPlatforms.includes(p)
                          ? "border-white bg-white text-black"
                          : "border-gray-700 text-gray-300")
                      }
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={runWeeklyPlanner}
              disabled={plannerLoading || plannerPlatforms.length === 0}
              className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {plannerLoading ? "⏳ กำลังวางแผน..." : "🤖 ให้ AI เสนอแผน"}
            </button>

            {plannerError && <p className="mt-2 text-sm text-red-400">{plannerError}</p>}

            {plannerPreview && (
              <div className="mt-4">
                <p className="text-sm font-semibold text-gray-300">
                  📋 Preview — ตรวจสอบก่อนยืนยัน ({plannerPreview.length} รายการ)
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {plannerPreview.map((slot, index) => (
                    <div
                      key={index}
                      className="rounded-lg border border-gray-700 bg-gray-900 p-2 text-xs"
                    >
                      <p className="text-gray-200">
                        {formatBangkok(slot.scheduledAt)} — {productName(slot.productId)} —{" "}
                        {slot.platform} / {angleLabels[slot.contentAngle]}
                      </p>
                      <p className="mt-1 text-gray-500">{slot.objective}</p>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={confirmWeeklyPlan}
                  disabled={plannerConfirming}
                  className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {plannerConfirming ? "⏳ กำลังบันทึก..." : "✅ ยืนยันและบันทึกทั้งหมด"}
                </button>
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        {loading && <p className="mt-4 text-sm text-gray-500">กำลังโหลด...</p>}

        {!loading && items.length === 0 && (
          <p className="mt-6 text-sm text-gray-500">ยังไม่มีรายการในช่วงเวลานี้</p>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {items.map((item) => {
            const plan = item.contentPlanId ? planCache[item.contentPlanId] : null;
            const isBusy = actionBusyId === item.id;
            const isExpanded = expandedId === item.id;

            return (
              <div key={item.id} className="rounded-xl border border-gray-800 bg-gray-950 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-100">{productName(item.productId)}</span>
                    <span className="rounded-full bg-gray-800 px-2 py-1 text-xs text-gray-300">
                      {item.contentType}
                    </span>
                    {item.platform && (
                      <span className="rounded-full bg-gray-800 px-2 py-1 text-xs text-gray-300">
                        {item.platform}
                      </span>
                    )}
                    {item.contentAngle && (
                      <span className="rounded-full bg-gray-800 px-2 py-1 text-xs text-gray-400">
                        {angleLabels[item.contentAngle]}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{formatBangkok(item.scheduledAt)}</span>
                    <span className="rounded-full bg-gray-800 px-2 py-1 text-xs">
                      {statusLabels[item.status] || item.status}
                    </span>
                  </div>
                </div>

                {item.notes && <p className="mt-2 text-xs text-gray-500">{item.notes}</p>}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => togglePreview(item)}
                    className="rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800"
                  >
                    👁 {isExpanded ? "ซ่อน" : "Preview"}
                  </button>

                  {item.status === "draft" && (
                    <button
                      type="button"
                      onClick={() => generateContentForItem(item)}
                      disabled={isBusy}
                      className="rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40"
                    >
                      ✨ สร้าง Content ด้วย AI
                    </button>
                  )}

                  {(item.status === "planned" || item.status === "ready") && plan && (
                    <>
                      {plan.imagePrompt && (
                        <button
                          type="button"
                          onClick={() => generateImage(item)}
                          disabled={isBusy}
                          className="rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40"
                        >
                          🖼 Generate Image
                        </button>
                      )}
                      {plan.videoPrompt && (
                        <button
                          type="button"
                          onClick={() => generateVideo(item)}
                          disabled={isBusy}
                          className="rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40"
                        >
                          🎬 Generate Video
                        </button>
                      )}
                    </>
                  )}

                  {(item.status === "planned" || item.status === "ready") && item.platform && (
                    <>
                      <button
                        type="button"
                        onClick={() => preparePost(item)}
                        disabled={isBusy}
                        className="rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40"
                      >
                        📤 Prepare Post
                      </button>
                      <button
                        type="button"
                        onClick={() => scheduleItem(item)}
                        disabled={isBusy}
                        className="rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40"
                      >
                        📅 Schedule
                      </button>
                    </>
                  )}

                  {(item.status === "draft" ||
                    item.status === "planned" ||
                    item.status === "ready" ||
                    item.status === "scheduled") && (
                    <button
                      type="button"
                      onClick={() => cancelItem(item)}
                      disabled={isBusy}
                      className="rounded-md border border-gray-700 px-2 py-1 text-xs text-red-400 hover:bg-gray-800 disabled:opacity-40"
                    >
                      ❌ Cancel
                    </button>
                  )}

                  {(item.status === "draft" || item.status === "cancelled") &&
                    item.socialPostId === null && (
                      <button
                        type="button"
                        onClick={() => deleteItem(item)}
                        disabled={isBusy}
                        className="rounded-md border border-gray-700 px-2 py-1 text-xs text-red-400 hover:bg-gray-800 disabled:opacity-40"
                      >
                        🗑️ ลบ
                      </button>
                    )}
                </div>

                {(item.status === "planned" || item.status === "ready") && item.platform && (
                  <input
                    type="text"
                    placeholder="Video URL (เช่น /generated/video/xxx.mp4 จาก Video Studio)"
                    value={videoUrlInputs[item.id] || ""}
                    onChange={(e) =>
                      setVideoUrlInputs((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                    className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-900 p-2 text-xs text-white"
                  />
                )}

                {isExpanded && plan && (
                  <div className="mt-3 rounded-lg border border-gray-800 bg-gray-900 p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Caption</span>
                      <button
                        type="button"
                        onClick={() => copyField(`cal-${item.id}-caption`, plan.caption)}
                        className="text-gray-400 hover:text-gray-200"
                      >
                        {copiedField === `cal-${item.id}-caption` ? "✓ Copied" : "📋 Copy Caption"}
                      </button>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-gray-300">{plan.caption}</p>

                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-gray-400">Hashtags: {plan.hashtags.join(" ")}</span>
                      <button
                        type="button"
                        onClick={() =>
                          copyField(`cal-${item.id}-hashtags`, plan.hashtags.join(" "))
                        }
                        className="text-gray-400 hover:text-gray-200"
                      >
                        {copiedField === `cal-${item.id}-hashtags` ? "✓ Copied" : "📋 Copy Hashtags"}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        copyField(
                          `cal-${item.id}-package`,
                          `${plan.caption}\n\n${plan.hashtags.join(" ")}`
                        )
                      }
                      className="mt-2 rounded-md border border-gray-700 px-2 py-1 text-gray-300 hover:bg-gray-800"
                    >
                      {copiedField === `cal-${item.id}-package`
                        ? "✓ Copied"
                        : "📋 Copy Content Package ทั้งชุด"}
                    </button>
                  </div>
                )}

                {isExpanded && !plan && !item.contentPlanId && (
                  <p className="mt-3 text-xs text-gray-500">
                    ยังไม่มี Content Plan สำหรับรายการนี้ — กด &quot;✨ สร้าง Content ด้วย AI&quot;
                  </p>
                )}

                {actionMessages[item.id] && (
                  <p className="mt-2 text-xs text-gray-400">{actionMessages[item.id]}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
