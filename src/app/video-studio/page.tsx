"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type TimelineItem = {
  id: string;
  fileName: string;
  start: number;
  duration: number;
  index: number;
};

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

// ===== Auto Video (AI) — STEP 8 =====
// ส่วนนี้เป็นทางเลือกเพิ่มเติมสำหรับสร้างวิดีโอแบบอัตโนมัติทั้งกระบวนการผ่าน POST /api/video/auto
// ไม่แตะ state/logic ของ workflow แบบ manual เดิมด้านล่างเลย (script/audioUrl/mediaFiles/timeline/videoUrl
// ของ manual workflow ยังเป็นของเดิมทุกประการ คนละชุด state กันโดยสิ้นเชิง)

type AutoProduct = {
  id: number;
  name: string;
  model: string | null;
  master: string | null;
  year: string | null;
  price: number;
  stock: number;
};

type AutoTone = "premium" | "friendly" | "sacred" | "sales";

const autoTones: { value: AutoTone; label: string }[] = [
  { value: "premium", label: "พรีเมียม" },
  { value: "friendly", label: "เป็นกันเอง" },
  { value: "sacred", label: "เข้มขลัง" },
  { value: "sales", label: "เน้นการขาย" },
];

type ProductMediaItem = {
  id: number;
  fileName: string;
  url: string;
  type: "image" | "video";
  source: string;
  isPrimary: boolean;
  createdAt: string;
};

// ===== AI VIDEO GENERATION (STEP 14) — types ตรงกับ src/lib/aiVideoJobs.ts =====
type AiVideoJobStatus = "processing" | "published" | "failed";

type AiVideoJob = {
  id: number;
  productId: number;
  provider: string;
  status: AiVideoJobStatus;
  errorMessage: string | null;
  productMediaId: number | null;
  duration: number | null;
  fileSize: number | null;
  createdAt: string;
  updatedAt: string;
};

// ===== AI COST TRACKING — STEP 21 — types ตรงกับ src/lib/costLedger.ts (CategoryCostBreakdown /
// ClipAiCost) และ GET /api/costs/products/[id] — accounting เท่านั้น ไม่มีผลต่อการสร้าง AI ใดๆ =====
type CostBreakdownEntry = {
  generationCount: number;
  estimatedTotal: number | null;
  actualTotal: number | null;
};

// STEP 22 — ตรงกับ ImageQualityCostBreakdown ใน src/lib/costLedger.ts — quality มาจาก
// ai_cost_ledger.metadata.quality จริงเท่านั้น "unknown" คือแถวที่ไม่มี quality ที่ใช้ได้
type ImageQualityBreakdown = {
  low: CostBreakdownEntry;
  medium: CostBreakdownEntry;
  high: CostBreakdownEntry;
  unknown: CostBreakdownEntry;
};

const IMAGE_QUALITY_TILES: Array<[keyof ImageQualityBreakdown, string]> = [
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"],
  ["unknown", "Unknown"],
];

type CategoryCostBreakdown = {
  content: CostBreakdownEntry;
  image: CostBreakdownEntry;
  video: CostBreakdownEntry;
  voice: CostBreakdownEntry;
  other: CostBreakdownEntry;
  total: CostBreakdownEntry;
  imageQualityBreakdown: ImageQualityBreakdown;
};

type ClipAiCost = CategoryCostBreakdown & {
  aiVideoJobId: number;
  contentPlanId: number | null;
};

type ProductCostResponse = {
  success: boolean;
  currency: string;
  cost: CategoryCostBreakdown;
  clips: ClipAiCost[];
};

// ===== CONTENT INTELLIGENCE — STEP 19 — types ตรงกับ src/lib/contentPlans.ts /
// POST,GET /api/content/plan, GET,PATCH,DELETE /api/content/plan/[id] =====
type ContentPlanType = "facebook" | "reels" | "tiktok" | "script";
type ContentPlanAngle =
  | "product_highlight"
  | "story"
  | "educational"
  | "collector"
  | "belief_spiritual"
  | "promotion"
  | "problem_solution"
  | "faq"
  | "short_reel_hook";

const contentPlanAngleLabels: Record<ContentPlanAngle, string> = {
  product_highlight: "Product Highlight",
  story: "Story / ความเป็นมา",
  educational: "Educational",
  collector: "Collector",
  belief_spiritual: "Belief / Spiritual",
  promotion: "Promotion",
  problem_solution: "Problem → Solution",
  faq: "FAQ",
  short_reel_hook: "Short Reel Hook",
};

const contentPlanAngleOptions = Object.keys(contentPlanAngleLabels) as ContentPlanAngle[];

type ContentPlan = {
  id: number;
  productId: number;
  contentType: ContentPlanType;
  contentAngle: ContentPlanAngle;
  objective: string | null;
  targetAudience: string | null;
  hook: string | null;
  caption: string;
  cta: string | null;
  hashtags: string[];
  imagePrompt: string | null;
  videoPrompt: string | null;
  status: "draft" | "ready" | "archived";
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AutoVideoMediaItem = {
  type: string;
  url: string;
  fileName: string;
  source: string;
};

type AutoVideoTimelineItem = {
  id: string;
  fileName: string;
  start: number;
  duration: number;
  index: number;
};

type AutoVideoResponse = {
  success: boolean;
  pipeline: { status: string; step: string; productId: number };
  product: {
    id: number;
    name: string;
    model: string | null;
    master: string | null;
    year: string | null;
    price: number;
    stock: number;
  };
  content: {
    facebook: string;
    reels: string;
    tiktok: string;
    script: string;
  };
  voice: { audioUrl: string; fileName: string };
  media: {
    items: AutoVideoMediaItem[];
    count: number;
    status: string;
  };
  timeline: {
    items: AutoVideoTimelineItem[];
    duration: number;
    status: string;
  };
  video?: { videoUrl: string; fileName: string };
  nextStep: string;
  message: string;
};

// ===== SOCIAL POST (STEP 9) — types ตรงกับ src/lib/socialContent.ts / POST /api/social/prepare =====
type SocialPlatform = "facebook" | "reels" | "instagram" | "tiktok";

const socialPlatforms: { value: SocialPlatform; label: string }[] = [
  { value: "facebook", label: "Facebook" },
  { value: "reels", label: "Reels" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
];

type SocialContentPackage = {
  productId: number;
  platform: SocialPlatform;
  videoUrl: string;
  audioUrl?: string;
  product: {
    id: number;
    name: string;
    model: string | null;
    master: string | null;
    year: string | null;
    price: number;
    stock: number;
  };
  content: {
    facebook: string;
    reels: string;
    tiktok: string;
    script: string;
  };
  caption: string;
  hashtags: string[];
  status: "ready_to_post" | "draft";
};

// ===== SOCIAL POSTING (STEP 10) — types ตรงกับ src/lib/social/provider.ts / GET,POST /api/social/status,post
type SocialProviderKey = "facebook" | "instagram" | "tiktok";

const socialProviderKeys: SocialProviderKey[] = ["facebook", "instagram", "tiktok"];

const socialProviderLabels: Record<SocialProviderKey, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
};

type ProviderConnectionStatus = "connected" | "not_configured" | "error";

type ProviderStatusEntry = {
  status: ProviderConnectionStatus;
  accountName?: string;
  message?: string;
};

// "reels" ใช้ provider เดียวกับ "instagram" (ดู src/lib/social/index.ts) — ใช้ map นี้ตอนเช็คว่า
// ปุ่มโพสต์ควร disabled หรือไม่ตาม platform ที่เลือกไว้ใน SOCIAL POST section (STEP 9)
function providerKeyForPlatform(platform: SocialPlatform): SocialProviderKey {
  if (platform === "reels") return "instagram";
  return platform as SocialProviderKey;
}

// ===== SOCIAL POST QUEUE (STEP 12) — types ตรงกับ src/lib/socialPosts.ts (SocialPostRow) /
// GET,POST /api/social/queue, POST /api/social/queue/[id]/cancel
type SocialQueueStatus =
  | "draft"
  | "scheduled"
  | "processing"
  | "published"
  | "failed"
  | "cancelled";

type SocialQueueItem = {
  id: number;
  productId: number;
  platform: SocialPlatform;
  videoUrl: string;
  caption: string;
  hashtags: string[];
  status: SocialQueueStatus;
  scheduledAt: string | null;
  externalPostId: string | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

const queueStatusLabels: Record<SocialQueueStatus, string> = {
  draft: "📝 Draft",
  scheduled: "📅 Scheduled",
  processing: "⏳ Processing",
  published: "✅ Published",
  failed: "❌ Failed",
  cancelled: "🚫 Cancelled",
};

function formatDateTimeTH(iso: string | null): string {
  if (!iso) return "-";

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type PipelineStepKey =
  | "content"
  | "voice"
  | "media"
  | "timeline"
  | "render"
  | "complete";

const pipelineSteps: { key: PipelineStepKey; label: string }[] = [
  { key: "content", label: "1. Generate Content" },
  { key: "voice", label: "2. Generate Voice" },
  { key: "media", label: "3. Prepare Media" },
  { key: "timeline", label: "4. Create Timeline" },
  { key: "render", label: "5. Render Video" },
  { key: "complete", label: "6. Complete" },
];

function AutoVideoPanel() {
  const [products, setProducts] = useState<AutoProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState<number | "">("");
  const [tone, setTone] = useState<AutoTone>("premium");

  const [mediaItems, setMediaItems] = useState<ProductMediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadSectionRef = useRef<HTMLDivElement | null>(null);

  // ===== AI IMAGE GENERATION (STEP 13) — เสริมรูปสินค้าจริงเท่านั้น ไม่แทนที่ =====
  const [aiImageLoading, setAiImageLoading] = useState(false);
  const [aiImageError, setAiImageError] = useState("");
  const [aiImageConfigured, setAiImageConfigured] = useState(true);

  // ===== AI VIDEO GENERATION (STEP 14) — เสริม media ของสินค้า, opt-in เท่านั้น ไม่ auto-run
  // ใน Auto Video Pipeline ปกติ (fallback เป็น FFmpeg pipeline เดิมเสมอถ้ายัง not_configured) =====
  const [aiVideoStatus, setAiVideoStatus] = useState<{
    status: "connected" | "not_configured" | "error";
    message?: string;
  }>({ status: "not_configured" });
  const [aiVideoLoading, setAiVideoLoading] = useState(false);
  const [aiVideoError, setAiVideoError] = useState("");
  const [aiVideoJobs, setAiVideoJobs] = useState<AiVideoJob[]>([]);
  const [deletingMediaId, setDeletingMediaId] = useState<number | null>(null);
  const [mediaDeleteError, setMediaDeleteError] = useState("");

  // STEP 21 — AI Cost Tracking (accounting เท่านั้น)
  const [productCost, setProductCost] = useState<ProductCostResponse | null>(null);
  const [productCostLoading, setProductCostLoading] = useState(false);
  const [productCostError, setProductCostError] = useState("");

  // ===== CONTENT INTELLIGENCE — STEP 19 =====
  const [planCount, setPlanCount] = useState(3);
  const [planContentType, setPlanContentType] = useState<ContentPlanType | "auto">("auto");
  const [planAngles, setPlanAngles] = useState<ContentPlanAngle[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");
  const [contentPlans, setContentPlans] = useState<ContentPlan[]>([]);
  const [planActionId, setPlanActionId] = useState<number | null>(null);
  const [planActionMessages, setPlanActionMessages] = useState<Record<number, string>>({});
  const [planCopiedField, setPlanCopiedField] = useState("");
  const [planScheduleDate, setPlanScheduleDate] = useState<Record<number, string>>({});
  const [planScheduleTime, setPlanScheduleTime] = useState<Record<number, string>>({});

  const [autoLoading, setAutoLoading] = useState(false);
  const [autoError, setAutoError] = useState("");
  const [autoResult, setAutoResult] = useState<AutoVideoResponse | null>(null);

  // ===== SOCIAL POST (STEP 9) — state แยกจาก manual workflow และแยกจาก Auto Video ด้านบนโดยสิ้นเชิง
  // ยังไม่มีการโพสต์จริงไป Facebook/TikTok — แค่เตรียม Content Package ผ่าน POST /api/social/prepare =====
  const [socialPlatform, setSocialPlatform] = useState<SocialPlatform>("facebook");
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialError, setSocialError] = useState("");
  const [socialPackage, setSocialPackage] = useState<SocialContentPackage | null>(null);
  const [copiedField, setCopiedField] = useState("");

  // ===== SOCIAL POSTING (STEP 10) — สถานะการเชื่อมต่อจริงจาก GET /api/social/status เท่านั้น
  // ไม่มี fake progress ใดๆ ปุ่ม "โพสต์" จะ disabled จริงถ้า provider ยังเป็น not_configured =====
  const [providerStatus, setProviderStatus] = useState<
    Record<SocialProviderKey, ProviderStatusEntry>
  >({
    facebook: { status: "not_configured" },
    instagram: { status: "not_configured" },
    tiktok: { status: "not_configured" },
  });
  const [providerStatusLoading, setProviderStatusLoading] = useState(false);
  const [postLoading, setPostLoading] = useState(false);
  const [postError, setPostError] = useState("");
  const [postResult, setPostResult] = useState<{
    status: string;
    postId?: string;
    message: string;
  } | null>(null);

  // ===== SOCIAL POST QUEUE (STEP 12) — ตั้งเวลาโพสต์ + ดู queue/history ของสินค้าที่เลือก =====
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleResult, setScheduleResult] = useState<SocialQueueItem | null>(null);

  const [queueItems, setQueueItems] = useState<SocialQueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      try {
        setProductsLoading(true);
        const response = await fetch("/api/products", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("โหลดสินค้าไม่สำเร็จ");
        }

        const data = await response.json();

        if (!cancelled && Array.isArray(data)) {
          setProducts(data);

          if (data.length > 0) {
            setSelectedProductId(data[0].id);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) {
          setProductsLoading(false);
        }
      }
    }

    loadProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  async function loadProductMedia(productId: number) {
    try {
      setMediaLoading(true);

      const response = await fetch(`/api/products/${productId}/media`, {
        cache: "no-store",
      });

      const data = await response.json();

      if (response.ok && Array.isArray(data.items)) {
        setMediaItems(data.items);
      } else {
        setMediaItems([]);
      }
    } catch (err) {
      console.error(err);
      setMediaItems([]);
    } finally {
      setMediaLoading(false);
    }
  }

  useEffect(() => {
    if (typeof selectedProductId === "number") {
      loadProductMedia(selectedProductId);
    } else {
      setMediaItems([]);
    }
    // เปลี่ยนสินค้าแล้วต้องเคลียร์ผลลัพธ์เก่า กัน UI ค้างแสดงวิดีโอ/สถานะของสินค้าตัวก่อนหน้า
    setAutoResult(null);
    setAutoError("");
    setUploadError("");
    setSocialPackage(null);
    setSocialError("");
    setPostResult(null);
    setPostError("");
    setScheduleResult(null);
    setScheduleError("");

    if (typeof selectedProductId === "number") {
      loadQueue(selectedProductId);
      loadAiVideoJobs(selectedProductId);
      loadContentPlans(selectedProductId);
      loadProductCost(selectedProductId);
    } else {
      setQueueItems([]);
      setAiVideoJobs([]);
      setContentPlans([]);
      setProductCost(null);
      setProductCostError("");
    }

    setAiImageError("");
    setAiVideoError("");
    setMediaDeleteError("");
    setPlanError("");
    setPlanActionMessages({});
  }, [selectedProductId]);

  // STEP 21 — ต้นทุนใหม่เกิดขึ้นทุกครั้งที่มีการสร้าง media/AI video job/content plan สำเร็จ
  // (loadProductMedia / loadAiVideoJobs / loadContentPlans ถูกเรียกอยู่แล้วหลัง action เหล่านั้น
  // สำเร็จทุกจุดในไฟล์นี้) จึง refresh ต้นทุนตาม state เหล่านี้แทนการแก้ทุก call site แยกกัน
  useEffect(() => {
    if (typeof selectedProductId === "number") {
      loadProductCost(selectedProductId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaItems, aiVideoJobs, contentPlans]);

  async function loadProductCost(productId: number) {
    setProductCostLoading(true);
    setProductCostError("");

    try {
      const response = await fetch(`/api/costs/products/${productId}`, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "ไม่สามารถโหลดต้นทุน AI ของสินค้าได้");
      }

      setProductCost(data);
    } catch (err) {
      setProductCostError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setProductCost(null);
    } finally {
      setProductCostLoading(false);
    }
  }

  function formatCost(value: number | null, currency: string): string {
    if (value === null) return "-";

    return `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${currency}`;
  }

  async function loadContentPlans(productId: number) {
    try {
      const response = await fetch(`/api/content/plan?productId=${productId}&pageSize=50`, {
        cache: "no-store",
      });

      const data = await response.json();

      if (response.ok && Array.isArray(data.items)) {
        setContentPlans(data.items);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function loadAiVideoJobs(productId: number) {
    try {
      const response = await fetch(`/api/products/${productId}/ai-video/jobs`, {
        cache: "no-store",
      });

      const data = await response.json();

      if (response.ok && Array.isArray(data.jobs)) {
        setAiVideoJobs(data.jobs);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function pollAiVideoJob(productId: number, jobId: number) {
    try {
      const response = await fetch(
        `/api/products/${productId}/ai-video/jobs/${jobId}`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (!response.ok || !data.job) {
        return;
      }

      setAiVideoJobs((previous) =>
        previous.map((job) => (job.id === jobId ? data.job : job))
      );

      if (data.job.status === "processing") {
        window.setTimeout(() => pollAiVideoJob(productId, jobId), 5000);
        return;
      }

      if (data.job.status === "published") {
        // วิดีโอที่สร้างเสร็จถูก insert เข้า product_media แล้ว — โหลดรายการสื่อใหม่ให้ UI เห็นทันที
        await loadProductMedia(productId);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function generateAiVideo() {
    if (aiVideoLoading) {
      // กันการกดซ้ำระหว่างที่ยังทำงานอยู่
      return;
    }

    if (typeof selectedProductId !== "number") {
      setAiVideoError("กรุณาเลือกสินค้าก่อน");
      return;
    }

    setAiVideoLoading(true);
    setAiVideoError("");

    try {
      const response = await fetch(
        `/api/products/${selectedProductId}/ai-video/generate`,
        { method: "POST" }
      );

      const data = await response.json();

      if (response.status === 503) {
        setAiVideoStatus({ status: "not_configured" });
        throw new Error(data?.error || "ยังไม่ได้ตั้งค่า AI Video Generation");
      }

      if (!response.ok || !data.success) {
        throw new Error(data?.error || "ไม่สามารถเริ่มสร้างวิดีโอด้วย AI ได้");
      }

      await loadAiVideoJobs(selectedProductId);
      pollAiVideoJob(selectedProductId, data.jobId);
    } catch (err) {
      setAiVideoError(
        err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"
      );
    } finally {
      setAiVideoLoading(false);
    }
  }

  async function deleteMedia(mediaId: number) {
    if (deletingMediaId !== null) {
      // กันการกดซ้ำระหว่างที่ยังทำงานอยู่
      return;
    }

    if (typeof selectedProductId !== "number") {
      return;
    }

    setDeletingMediaId(mediaId);
    setMediaDeleteError("");

    try {
      const response = await fetch(
        `/api/products/${selectedProductId}/media/${mediaId}`,
        { method: "DELETE" }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "ไม่สามารถลบสื่อได้");
      }

      await loadProductMedia(selectedProductId);
    } catch (err) {
      setMediaDeleteError(
        err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"
      );
    } finally {
      setDeletingMediaId(null);
    }
  }

  // ===== CONTENT INTELLIGENCE — STEP 19 =====

  function toggleContentPlanAngle(angle: ContentPlanAngle) {
    setPlanAngles((previous) =>
      previous.includes(angle) ? previous.filter((a) => a !== angle) : [...previous, angle]
    );
  }

  async function generateContentPlans() {
    if (planLoading) {
      // กันการกดซ้ำระหว่างที่ยังทำงานอยู่
      return;
    }

    if (typeof selectedProductId !== "number") {
      setPlanError("กรุณาเลือกสินค้าก่อน");
      return;
    }

    setPlanLoading(true);
    setPlanError("");

    try {
      const response = await fetch("/api/content/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          productId: selectedProductId,
          count: planCount,
          contentType: planContentType,
          angles: planAngles.length > 0 ? planAngles : "auto",
        }),
      });

      const data = await response.json();

      if (response.status === 503) {
        throw new Error(data?.error || "ยังไม่ได้ตั้งค่า OPENAI_API_KEY");
      }

      if (!response.ok || !data.success) {
        throw new Error(data?.error || "ไม่สามารถสร้าง Content Plan ได้");
      }

      await loadContentPlans(selectedProductId);
    } catch (err) {
      setPlanError(
        err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"
      );
    } finally {
      setPlanLoading(false);
    }
  }

  function updateLocalPlanField(id: number, field: keyof ContentPlan, value: string) {
    setContentPlans((previous) =>
      previous.map((plan) => (plan.id === id ? { ...plan, [field]: value } : plan))
    );
  }

  async function savePlan(plan: ContentPlan) {
    setPlanActionId(plan.id);
    setPlanActionMessages((previous) => ({ ...previous, [plan.id]: "" }));

    try {
      const response = await fetch(`/api/content/plan/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          hook: plan.hook,
          caption: plan.caption,
          cta: plan.cta,
          objective: plan.objective,
          targetAudience: plan.targetAudience,
          imagePrompt: plan.imagePrompt,
          videoPrompt: plan.videoPrompt,
          status: "ready",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "ไม่สามารถบันทึกได้");
      }

      setContentPlans((previous) =>
        previous.map((item) => (item.id === plan.id ? data.plan : item))
      );
      setPlanActionMessages((previous) => ({ ...previous, [plan.id]: "✅ บันทึกแล้ว" }));
    } catch (err) {
      setPlanActionMessages((previous) => ({
        ...previous,
        [plan.id]: err instanceof Error ? `❌ ${err.message}` : "❌ เกิดข้อผิดพลาด",
      }));
    } finally {
      setPlanActionId(null);
    }
  }

  async function deletePlan(id: number) {
    if (typeof selectedProductId !== "number") return;

    setPlanActionId(id);

    try {
      const response = await fetch(`/api/content/plan/${id}`, { method: "DELETE" });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.error || "ไม่สามารถลบได้");
      }

      await loadContentPlans(selectedProductId);
    } catch (err) {
      console.error(err);
    } finally {
      setPlanActionId(null);
    }
  }

  async function copyPlanField(label: string, text: string) {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setPlanCopiedField(label);
      window.setTimeout(() => setPlanCopiedField(""), 2000);
    } catch (err) {
      console.error(err);
    }
  }

  function copyWholePlan(plan: ContentPlan) {
    const text = [
      `Content Type: ${plan.contentType}`,
      `Content Angle: ${contentPlanAngleLabels[plan.contentAngle]}`,
      `Objective: ${plan.objective || "-"}`,
      `Target Audience: ${plan.targetAudience || "-"}`,
      `Hook: ${plan.hook || "-"}`,
      "",
      `Caption:\n${plan.caption}`,
      "",
      `CTA: ${plan.cta || "-"}`,
      `Hashtags: ${plan.hashtags.join(" ")}`,
      "",
      `Image Prompt: ${plan.imagePrompt || "-"}`,
      `Video Prompt: ${plan.videoPrompt || "-"}`,
    ].join("\n");

    copyPlanField(`plan-${plan.id}-all`, text);
  }

  async function generateImageFromPlan(plan: ContentPlan) {
    if (typeof selectedProductId !== "number" || !plan.imagePrompt) return;

    setPlanActionId(plan.id);
    setPlanActionMessages((previous) => ({ ...previous, [plan.id]: "⏳ กำลังสร้างภาพ..." }));

    try {
      const response = await fetch(`/api/products/${selectedProductId}/media/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ prompt: plan.imagePrompt, contentPlanId: plan.id }),
      });

      const data = await response.json();

      if (response.status === 503) {
        throw new Error(data?.error || "ยังไม่ได้ตั้งค่า OPENAI_API_KEY");
      }

      if (!response.ok) {
        throw new Error(data?.error || "ไม่สามารถสร้างภาพด้วย AI ได้");
      }

      await loadProductMedia(selectedProductId);
      setPlanActionMessages((previous) => ({ ...previous, [plan.id]: "✅ สร้างภาพสำเร็จ" }));
    } catch (err) {
      setPlanActionMessages((previous) => ({
        ...previous,
        [plan.id]: err instanceof Error ? `❌ ${err.message}` : "❌ เกิดข้อผิดพลาด",
      }));
    } finally {
      setPlanActionId(null);
    }
  }

  async function generateVideoFromPlan(plan: ContentPlan) {
    if (typeof selectedProductId !== "number" || !plan.videoPrompt) return;

    setPlanActionId(plan.id);
    setPlanActionMessages((previous) => ({ ...previous, [plan.id]: "⏳ กำลังเริ่มงาน..." }));

    try {
      const response = await fetch(`/api/products/${selectedProductId}/ai-video/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ prompt: plan.videoPrompt, contentPlanId: plan.id }),
      });

      const data = await response.json();

      if (response.status === 503) {
        setPlanActionMessages((previous) => ({
          ...previous,
          [plan.id]: `⚠️ ${data?.error || "ยังไม่ได้ตั้งค่า AI Video Generation"}`,
        }));
        return;
      }

      if (!response.ok) {
        throw new Error(data?.error || "ไม่สามารถเริ่มสร้างวิดีโอด้วย AI ได้");
      }

      await loadAiVideoJobs(selectedProductId);
      setPlanActionMessages((previous) => ({ ...previous, [plan.id]: "✅ เริ่มสร้างวิดีโอแล้ว" }));
    } catch (err) {
      setPlanActionMessages((previous) => ({
        ...previous,
        [plan.id]: err instanceof Error ? `❌ ${err.message}` : "❌ เกิดข้อผิดพลาด",
      }));
    } finally {
      setPlanActionId(null);
    }
  }

  async function preparePlanSocialPost(plan: ContentPlan) {
    if (
      typeof selectedProductId !== "number" ||
      !autoResult?.video?.videoUrl ||
      plan.contentType === "script"
    ) {
      return;
    }

    setPlanActionId(plan.id);
    setPlanActionMessages((previous) => ({ ...previous, [plan.id]: "⏳ กำลังเตรียมโพสต์..." }));

    try {
      const response = await fetch("/api/social/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          productId: selectedProductId,
          platform: plan.contentType,
          videoUrl: autoResult.video.videoUrl,
          caption: plan.caption,
          hashtags: plan.hashtags,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "ไม่สามารถเตรียมโพสต์ได้");
      }

      setPlanActionMessages((previous) => ({
        ...previous,
        [plan.id]: `✅ เตรียม Content Package สำเร็จ (${data.package.status})`,
      }));
    } catch (err) {
      setPlanActionMessages((previous) => ({
        ...previous,
        [plan.id]: err instanceof Error ? `❌ ${err.message}` : "❌ เกิดข้อผิดพลาด",
      }));
    } finally {
      setPlanActionId(null);
    }
  }

  async function schedulePlanPost(plan: ContentPlan) {
    if (typeof selectedProductId !== "number" || !autoResult?.video?.videoUrl) return;
    if (plan.contentType === "script") return;

    const date = planScheduleDate[plan.id];
    const time = planScheduleTime[plan.id];

    if (!date || !time) {
      setPlanActionMessages((previous) => ({
        ...previous,
        [plan.id]: "❌ กรุณาระบุวันที่และเวลา",
      }));
      return;
    }

    const scheduledDate = new Date(`${date}T${time}`);

    if (Number.isNaN(scheduledDate.getTime())) {
      setPlanActionMessages((previous) => ({ ...previous, [plan.id]: "❌ วันที่/เวลาไม่ถูกต้อง" }));
      return;
    }

    setPlanActionId(plan.id);
    setPlanActionMessages((previous) => ({ ...previous, [plan.id]: "⏳ กำลังตั้งเวลา..." }));

    try {
      const response = await fetch("/api/social/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          productId: selectedProductId,
          platform: plan.contentType,
          videoUrl: autoResult.video.videoUrl,
          caption: plan.caption,
          hashtags: plan.hashtags,
          scheduledAt: scheduledDate.toISOString(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "ไม่สามารถตั้งเวลาโพสต์ได้");
      }

      setPlanActionMessages((previous) => ({
        ...previous,
        [plan.id]: `✅ ตั้งเวลาแล้ว — ${formatDateTimeTH(data.post.scheduledAt)}`,
      }));

      if (typeof selectedProductId === "number") {
        await loadQueue(selectedProductId);
      }
    } catch (err) {
      setPlanActionMessages((previous) => ({
        ...previous,
        [plan.id]: err instanceof Error ? `❌ ${err.message}` : "❌ เกิดข้อผิดพลาด",
      }));
    } finally {
      setPlanActionId(null);
    }
  }

  async function loadQueue(productId: number) {
    try {
      setQueueLoading(true);

      const response = await fetch(
        `/api/social/queue?productId=${productId}&pageSize=50`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (response.ok && Array.isArray(data.items)) {
        setQueueItems(data.items);
      } else {
        setQueueItems([]);
      }
    } catch (err) {
      console.error(err);
      setQueueItems([]);
    } finally {
      setQueueLoading(false);
    }
  }

  async function uploadProductImage() {
    if (typeof selectedProductId !== "number") {
      setUploadError("กรุณาเลือกสินค้าก่อน");
      return;
    }

    if (!uploadFile) {
      setUploadError("กรุณาเลือกไฟล์รูปภาพ");
      return;
    }

    setUploading(true);
    setUploadError("");

    try {
      const formData = new FormData();
      formData.append("image", uploadFile);

      const response = await fetch(
        `/api/products/${selectedProductId}/media`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "ไม่สามารถอัปโหลดรูปภาพได้");
      }

      setUploadFile(null);

      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }

      await loadProductMedia(selectedProductId);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "ไม่สามารถอัปโหลดรูปภาพได้"
      );
    } finally {
      setUploading(false);
    }
  }

  async function generateAiImage() {
    if (aiImageLoading) {
      // กันการกดซ้ำระหว่างที่ยังทำงานอยู่
      return;
    }

    if (typeof selectedProductId !== "number") {
      setAiImageError("กรุณาเลือกสินค้าก่อน");
      return;
    }

    setAiImageLoading(true);
    setAiImageError("");

    try {
      const response = await fetch(
        `/api/products/${selectedProductId}/media/generate`,
        { method: "POST" }
      );

      const data = await response.json();

      if (response.status === 503) {
        setAiImageConfigured(false);
        throw new Error(data?.error || "ยังไม่ได้ตั้งค่า AI Image Generation");
      }

      if (!response.ok || !data.success) {
        throw new Error(data?.error || "ไม่สามารถสร้างภาพด้วย AI ได้");
      }

      await loadProductMedia(selectedProductId);
    } catch (err) {
      setAiImageError(
        err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"
      );
    } finally {
      setAiImageLoading(false);
    }
  }

  function scrollToUpload() {
    uploadSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  async function generateAutoVideo() {
    if (autoLoading) {
      // กันการกดซ้ำระหว่างที่ยังทำงานอยู่
      return;
    }

    if (typeof selectedProductId !== "number") {
      setAutoError("กรุณาเลือกสินค้าก่อน");
      return;
    }

    setAutoLoading(true);
    setAutoError("");
    setAutoResult(null);

    try {
      const response = await fetch("/api/video/auto", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          productId: selectedProductId,
          tone,
        }),
      });

      const data = (await response.json()) as AutoVideoResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data?.error || "ไม่สามารถสร้างวิดีโออัตโนมัติได้");
      }

      setAutoResult(data);
      await loadProductMedia(selectedProductId);
    } catch (err) {
      setAutoError(
        err instanceof Error
          ? err.message
          : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"
      );
    } finally {
      setAutoLoading(false);
    }
  }

  async function prepareSocialPost() {
    if (socialLoading) {
      // กันการกดซ้ำระหว่างที่ยังทำงานอยู่
      return;
    }

    if (typeof selectedProductId !== "number") {
      setSocialError("กรุณาเลือกสินค้าก่อน");
      return;
    }

    if (!autoResult?.video?.videoUrl) {
      setSocialError("กรุณาสร้างวิดีโอให้เสร็จก่อน");
      return;
    }

    setSocialLoading(true);
    setSocialError("");
    setSocialPackage(null);
    setPostResult(null);
    setPostError("");

    try {
      const response = await fetch("/api/social/prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          productId: selectedProductId,
          videoUrl: autoResult.video.videoUrl,
          platform: socialPlatform,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        package?: SocialContentPackage;
        error?: string;
      };

      if (!response.ok || !data.package) {
        throw new Error(data?.error || "ไม่สามารถเตรียม Content Package ได้");
      }

      setSocialPackage(data.package);
    } catch (err) {
      setSocialError(
        err instanceof Error
          ? err.message
          : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"
      );
    } finally {
      setSocialLoading(false);
    }
  }

  async function checkProviderConnections() {
    if (providerStatusLoading) {
      // กันการกดซ้ำระหว่างที่ยังทำงานอยู่ — ไม่ยิง API ซ้ำโดยไม่จำเป็น
      return;
    }

    setProviderStatusLoading(true);

    try {
      const response = await fetch("/api/social/status", { cache: "no-store" });
      const data = await response.json();

      if (response.ok && data?.providers) {
        setProviderStatus((previous) => ({ ...previous, ...data.providers }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setProviderStatusLoading(false);
    }
  }

  useEffect(() => {
    // เช็คสถานะครั้งเดียวตอนเปิดหน้า — ผู้ใช้กด "ตรวจสอบการเชื่อมต่อ" เองได้ถ้าต้องการเช็คซ้ำ
    checkProviderConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // เช็คว่า AI Image/Video Generation พร้อมใช้งานหรือไม่ (ครั้งเดียวตอนเปิดหน้า, ยิง API เดียว
    // ได้ผลทั้งคู่) — ปุ่ม AI จะ disabled จริงถ้ายัง not_configured ไม่ใช่แค่ซ่อน error หลังกด
    let cancelled = false;

    fetch("/api/ai/media/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;

        if (data?.image) {
          setAiImageConfigured(data.image.status === "connected");
        }

        if (data?.video) {
          setAiVideoStatus({
            status: data.video.status,
            message: data.video.message,
          });
        }
      })
      .catch((err) => console.error(err));

    return () => {
      cancelled = true;
    };
  }, []);

  async function postToSocial() {
    if (postLoading) {
      // กันการกดซ้ำระหว่างที่ยังทำงานอยู่
      return;
    }

    if (typeof selectedProductId !== "number") {
      setPostError("กรุณาเลือกสินค้าก่อน");
      return;
    }

    if (!socialPackage) {
      setPostError("กรุณาเตรียม Content Package ก่อน");
      return;
    }

    const providerKey = providerKeyForPlatform(socialPackage.platform);

    if (providerStatus[providerKey]?.status !== "connected") {
      setPostError(`ยังไม่ได้ตั้งค่าการเชื่อมต่อ ${socialProviderLabels[providerKey]}`);
      return;
    }

    setPostLoading(true);
    setPostError("");
    setPostResult(null);

    try {
      const response = await fetch("/api/social/post", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          productId: selectedProductId,
          platform: socialPackage.platform,
          videoUrl: socialPackage.videoUrl,
          caption: socialPackage.caption,
          hashtags: socialPackage.hashtags,
        }),
      });

      const data = await response.json();

      if (!response.ok || data?.success !== true) {
        throw new Error(data?.message || data?.error || "ไม่สามารถโพสต์ได้");
      }

      setPostResult({
        status: data.status,
        postId: data.postId,
        message: data.message,
      });
    } catch (err) {
      setPostError(
        err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"
      );
    } finally {
      setPostLoading(false);
    }
  }

  async function scheduleSocialPostSubmit() {
    if (scheduleLoading) {
      // กันการกดซ้ำระหว่างที่ยังทำงานอยู่
      return;
    }

    if (typeof selectedProductId !== "number") {
      setScheduleError("กรุณาเลือกสินค้าก่อน");
      return;
    }

    if (!socialPackage) {
      setScheduleError("กรุณาเตรียม Content Package ก่อน");
      return;
    }

    if (!scheduleDate || !scheduleTime) {
      setScheduleError("กรุณาระบุวันที่และเวลาที่ต้องการโพสต์");
      return;
    }

    // input type="date"/"time" ให้ค่าเป็นเวลาท้องถิ่นของเบราว์เซอร์อยู่แล้ว — new Date() ตีความ
    // "YYYY-MM-DDTHH:mm" แบบ local time ให้เองตาม spec, แล้วค่อยแปลงเป็น ISO (UTC) ตอนส่งไป API
    const scheduledDate = new Date(`${scheduleDate}T${scheduleTime}`);

    if (Number.isNaN(scheduledDate.getTime())) {
      setScheduleError("วันที่/เวลาที่ระบุไม่ถูกต้อง");
      return;
    }

    setScheduleLoading(true);
    setScheduleError("");
    setScheduleResult(null);

    try {
      const response = await fetch("/api/social/queue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          productId: selectedProductId,
          platform: socialPackage.platform,
          videoUrl: socialPackage.videoUrl,
          caption: socialPackage.caption,
          hashtags: socialPackage.hashtags,
          scheduledAt: scheduledDate.toISOString(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.post) {
        throw new Error(data?.error || "ไม่สามารถตั้งเวลาโพสต์ได้");
      }

      setScheduleResult(data.post);
      await loadQueue(selectedProductId);
    } catch (err) {
      setScheduleError(
        err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"
      );
    } finally {
      setScheduleLoading(false);
    }
  }

  async function cancelQueueItem(id: number) {
    if (cancellingId !== null) {
      // กันการกดซ้ำระหว่างที่ยังทำงานอยู่
      return;
    }

    setCancellingId(id);

    try {
      const response = await fetch(`/api/social/queue/${id}/cancel`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "ไม่สามารถยกเลิกได้");
      }

      if (typeof selectedProductId === "number") {
        await loadQueue(selectedProductId);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCancellingId(null);
    }
  }

  async function copyText(label: string, text: string) {
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(label);
      window.setTimeout(() => setCopiedField(""), 2000);
    } catch (err) {
      console.error(err);
    }
  }

  const selectedProduct =
    products.find((product) => product.id === selectedProductId) || null;

  const primaryMedia =
    mediaItems.find((item) => item.isPrimary) || mediaItems[0] || null;

  // สถานะของแต่ละขั้นตอนอ้างอิงจากข้อมูลจริงใน response เท่านั้น — ไม่มีการจำลอง progress ปลอมๆ
  // ระหว่างที่ยังรอผลลัพธ์ (POST /api/video/auto เป็น request เดียวจบทุกขั้นตอน ไม่มี partial update
  // ระหว่างทาง) จึงแสดงทุกขั้นตอนเป็น "กำลังทำงาน" รวมกัน แล้วค่อยตัดสินสถานะจริงทีละขั้นจาก response
  // สุดท้ายที่ได้กลับมา
  function getStepState(
    key: PipelineStepKey
  ): "pending" | "running" | "done" | "skipped" | "error" {
    if (autoLoading) {
      return "running";
    }

    if (!autoResult) {
      return autoError ? "error" : "pending";
    }

    switch (key) {
      case "content":
        return autoResult.content?.script ? "done" : "error";
      case "voice":
        return autoResult.voice?.audioUrl ? "done" : "error";
      case "media":
        return autoResult.media?.status === "ready" ? "done" : "skipped";
      case "timeline":
        return autoResult.timeline?.status === "ready" ? "done" : "skipped";
      case "render":
        return autoResult.video?.videoUrl ? "done" : "skipped";
      case "complete":
        return autoResult.nextStep === "complete" ? "done" : "skipped";
      default:
        return "pending";
    }
  }

  function stepIcon(state: ReturnType<typeof getStepState>) {
    if (state === "done") return "✅";
    if (state === "error") return "❌";
    if (state === "skipped") return "⚠️";
    if (state === "running") return "⏳";
    return "○";
  }

  const isNoMedia = autoResult?.pipeline?.status === "no_media";
  const isVideoReady = Boolean(autoResult?.video?.videoUrl);

  return (
    <section className="mt-8 rounded-2xl border border-emerald-800 bg-emerald-950/20 p-6">
      <h2 className="text-xl font-semibold">
        🤖 Auto Video (AI) — สร้างวิดีโออัตโนมัติทั้งกระบวนการ
      </h2>

      <p className="mt-2 text-sm text-gray-400">
        เลือกสินค้า แล้วให้ระบบสร้าง Content → เสียงพากย์ → เตรียมรูปสินค้า →
        Timeline → เรนเดอร์วิดีโอ MP4 ให้อัตโนมัติ (ใช้ workflow แบบเดิมด้านล่างได้ตามปกติ
        ส่วนนี้เป็นทางเลือกเพิ่มเติม ไม่ใช่การแทนที่)
      </p>

      {/* ===== PRODUCT ===== */}
      <div className="mt-6 rounded-xl border border-gray-800 bg-gray-950 p-4">
        <h3 className="font-semibold text-gray-200">📦 PRODUCT</h3>

        <select
          value={selectedProductId}
          disabled={productsLoading}
          onChange={(event) => {
            const value = event.target.value;
            setSelectedProductId(value === "" ? "" : Number(value));
          }}
          className="mt-3 w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-white outline-none focus:border-gray-400"
        >
          <option value="">
            {productsLoading ? "กำลังโหลด..." : "เลือกสินค้า"}
          </option>

          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>

        {selectedProduct && (
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="h-32 w-32 shrink-0 overflow-hidden rounded-xl border border-gray-700 bg-gray-900">
              {primaryMedia ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={primaryMedia.url}
                  alt={selectedProduct.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-center text-xs text-gray-500">
                  ยังไม่มีรูปสินค้า
                </div>
              )}
            </div>

            <div className="flex-1 space-y-1 text-sm text-gray-300">
              <p className="text-base font-semibold text-white">
                {selectedProduct.name}
              </p>
              <p>รุ่น: {selectedProduct.model || "-"}</p>
              <p>สำนัก/วัด: {selectedProduct.master || "-"}</p>
              <p>
                ราคา: {Number(selectedProduct.price || 0).toLocaleString("th-TH")}{" "}
                บาท
              </p>
              <p>คงเหลือ: {Number(selectedProduct.stock || 0).toLocaleString("th-TH")} ชิ้น</p>
              <p className="text-gray-500">
                {mediaLoading
                  ? "กำลังโหลดรูปสินค้า..."
                  : `รูปสินค้าที่มีอยู่: ${mediaItems.length} รูป`}
              </p>
            </div>
          </div>
        )}

        {/* Product Media Upload — minimal UI ใหม่ (ไม่มี UI นี้อยู่เดิมที่ไหนเลย, reuse API เดิมจาก STEP 6) */}
        <div
          ref={uploadSectionRef}
          className="mt-4 rounded-xl border border-dashed border-gray-700 p-4"
        >
          <p className="text-sm font-medium text-gray-300">
            📤 เพิ่มรูปสินค้า (JPG, PNG, WEBP)
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              onChange={(event) =>
                setUploadFile(event.target.files?.[0] || null)
              }
              className="text-sm text-gray-300"
            />

            <button
              type="button"
              onClick={uploadProductImage}
              disabled={uploading || !uploadFile || typeof selectedProductId !== "number"}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {uploading ? "กำลังอัปโหลด..." : "อัปโหลดรูปสินค้า"}
            </button>
          </div>

          {uploadError && (
            <p className="mt-2 text-sm text-red-400">{uploadError}</p>
          )}

          {/* ===== AI IMAGE GENERATION (STEP 13) — เสริมรูปจริงเท่านั้น ไม่มีทางกลายเป็นรูป primary
              อัตโนมัติ (ดู src/lib/productMedia.ts) และไม่อ้างว่าเป็นภาพของจริง ===== */}
          <div className="mt-3 border-t border-gray-800 pt-3">
            <button
              type="button"
              onClick={generateAiImage}
              disabled={
                aiImageLoading || !aiImageConfigured || typeof selectedProductId !== "number"
              }
              className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {aiImageLoading ? "⏳ กำลังสร้างภาพ..." : "✨ สร้างรูปด้วย AI (ภาพประกอบ)"}
            </button>

            {!aiImageConfigured && (
              <p className="mt-2 text-xs text-yellow-500">
                ยังไม่ได้ตั้งค่า OPENAI_API_KEY สำหรับสร้างภาพด้วย AI
              </p>
            )}

            {aiImageError && (
              <p className="mt-2 text-sm text-red-400">{aiImageError}</p>
            )}

            <p className="mt-2 text-xs text-gray-500">
              ภาพที่สร้างด้วย AI เป็นภาพประกอบสไตล์ทั่วไปเท่านั้น ไม่ใช่ภาพของจริง — ไม่มีทางถูกตั้งเป็น
              รูปหลัก (primary) แทนรูปสินค้าจริงโดยอัตโนมัติ
            </p>
          </div>

          {/* ===== AI VIDEO GENERATION (STEP 14) — opt-in, ไม่เกี่ยวกับ Auto Video Pipeline ปกติ
              ด้านล่างเลย (pipeline ปกติยัง render ด้วย FFmpeg เหมือนเดิมทุกประการ) ===== */}
          <div className="mt-3 border-t border-gray-800 pt-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-300">🎬 AI Video Generation</p>
              <span className="text-xs">
                {aiVideoStatus.status === "connected"
                  ? "🟢 Connected"
                  : aiVideoStatus.status === "error"
                    ? "🔴 Error"
                    : "🟡 Not Configured"}
              </span>
            </div>

            <button
              type="button"
              onClick={generateAiVideo}
              disabled={
                aiVideoLoading ||
                aiVideoStatus.status !== "connected" ||
                typeof selectedProductId !== "number"
              }
              className="mt-2 rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {aiVideoLoading ? "⏳ กำลังเริ่มงาน..." : "🎬 สร้างวิดีโอด้วย AI (ภาพประกอบ)"}
            </button>

            {aiVideoStatus.status !== "connected" && (
              <p className="mt-2 text-xs text-yellow-500">
                ยังไม่ได้ตั้งค่าการเชื่อมต่อ AI Video Generation (REPLICATE_API_TOKEN)
              </p>
            )}

            {aiVideoError && (
              <p className="mt-2 text-sm text-red-400">{aiVideoError}</p>
            )}

            {aiVideoJobs.length > 0 && (
              <div className="mt-3 flex flex-col gap-3">
                {aiVideoJobs.map((job) => {
                  const media = mediaItems.find((item) => item.id === job.productMediaId);

                  return (
                    <div
                      key={job.id}
                      className="rounded-lg border border-gray-800 bg-gray-950 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-300">งาน #{job.id}</p>
                        <span className="text-xs">
                          {job.status === "published"
                            ? "✅ Succeeded"
                            : job.status === "failed"
                              ? "❌ Failed"
                              : "⏳ Processing"}
                        </span>
                      </div>

                      {job.status === "processing" && (
                        <p className="mt-1 text-xs text-gray-500">
                          กำลังสร้างวิดีโอ — สถานะจริงจาก provider ไม่ใช่ progress จำลอง
                        </p>
                      )}

                      {job.status === "failed" && (
                        <>
                          <p className="mt-1 text-xs text-red-400">
                            {job.errorMessage || "-"}
                          </p>
                          <button
                            type="button"
                            onClick={generateAiVideo}
                            disabled={aiVideoLoading}
                            className="mt-2 rounded-md border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            🔁 สร้างใหม่
                          </button>
                        </>
                      )}

                      {job.status === "published" && media && (
                        <div className="mt-2">
                          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                          <video
                            src={media.url}
                            controls
                            className="w-full max-w-xs rounded-lg border border-gray-700"
                          />
                          <p className="mt-1 text-xs text-gray-500">
                            ไฟล์: {media.fileName} · source: 🤖 AI
                            {job.duration ? ` · ${job.duration.toFixed(1)} วินาที` : ""}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {mediaItems.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {mediaItems.map((item) => (
                <div
                  key={item.id}
                  className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900"
                >
                  {item.type === "video" ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video
                      src={item.url}
                      className="h-20 w-full object-cover"
                      muted
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.url}
                      alt={item.fileName}
                      className="h-20 w-full object-cover"
                    />
                  )}
                  <p className="truncate p-1 text-[10px] text-gray-400">
                    {item.isPrimary ? "⭐ " : ""}
                    {item.source === "ai" ? "🤖 AI" : "📷 Product"}
                  </p>
                  <button
                    type="button"
                    onClick={() => deleteMedia(item.id)}
                    disabled={deletingMediaId === item.id}
                    className="w-full border-t border-gray-800 py-1 text-[10px] text-red-400 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {deletingMediaId === item.id ? "กำลังลบ..." : "🗑️ ลบ"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {mediaDeleteError && (
            <p className="mt-2 text-sm text-red-400">{mediaDeleteError}</p>
          )}
        </div>
      </div>

      {/* ===== AI COST TRACKING — STEP 21 — accounting เท่านั้น ไม่มีการจำกัด/หยุดการสร้าง AI ใดๆ
          ในส่วนนี้ รวมทุก generation (text/image/video/voice) ที่เคยเรียกจริงสำหรับสินค้านี้ ไม่ใช่
          แค่ไฟล์ล่าสุด — ดูภาพรวมทั้งระบบได้ที่หน้า /costs (AI Cost Dashboard) ===== */}
      {typeof selectedProductId === "number" && (
        <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-200">💰 Product AI Cost</h3>
            <a href="/costs" className="text-xs text-gray-500 underline hover:text-gray-300">
              ดูภาพรวมทั้งระบบ →
            </a>
          </div>

          {productCostLoading && <p className="mt-2 text-sm text-gray-500">กำลังโหลด...</p>}

          {productCostError && (
            <p className="mt-2 text-sm text-red-400">{productCostError}</p>
          )}

          {productCost && (
            <>
              <p className="mt-2 text-xs text-gray-500">
                รวมทุกครั้งที่เคยเรียก AI จริงสำหรับสินค้านี้ ({productCost.cost.total.generationCount}{" "}
                generations) — 📊 Estimated = ประมาณการ, 💰 Actual = ต้นทุนจริง
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {(
                  [
                    ["content", "📝 Content"],
                    ["image", "🖼️ Image"],
                    ["video", "🎬 Video"],
                    ["voice", "🔊 Voice"],
                    ["total", "Σ Total"],
                  ] as const
                ).map(([key, label]) => {
                  const entry = productCost.cost[key];

                  return (
                    <div key={key} className="rounded-lg border border-gray-800 bg-gray-900 p-2">
                      <p className="text-[11px] text-gray-500">{label}</p>
                      <p className="text-xs text-gray-400">
                        {entry.generationCount} ครั้ง
                      </p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {formatCost(entry.estimatedTotal, productCost.currency)}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {entry.actualTotal === null
                          ? "ยังไม่มีข้อมูลต้นทุนจริง"
                          : `💰 ${formatCost(entry.actualTotal, productCost.currency)}`}
                      </p>
                    </div>
                  );
                })}
              </div>

              {productCost.cost.image.generationCount > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-400">
                    🖼️ Image แยกตาม Quality (จาก response จริงของ OpenAI ต่อครั้ง)
                  </p>

                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {IMAGE_QUALITY_TILES.map(([key, label]) => {
                      const entry = productCost.cost.imageQualityBreakdown[key];

                      return (
                        <div
                          key={key}
                          className="rounded-lg border border-gray-800 bg-gray-900 p-2 text-xs"
                        >
                          <p className="text-gray-300">{label}</p>
                          <p className="text-gray-500">{entry.generationCount} ครั้ง</p>
                          <p className="mt-1 font-semibold text-white">
                            {formatCost(entry.estimatedTotal, productCost.currency)}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            {entry.actualTotal === null
                              ? "ยังไม่มีข้อมูลจริง"
                              : `💰 ${formatCost(entry.actualTotal, productCost.currency)}`}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {productCost.clips.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-400">🎬 ต้นทุนแยกราย Clip</p>

                  <div className="mt-2 flex flex-col gap-2">
                    {productCost.clips.map((clip) => (
                      <div
                        key={clip.aiVideoJobId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-800 bg-gray-900 p-2 text-xs"
                      >
                        <span className="text-gray-400">งาน #{clip.aiVideoJobId}</span>
                        <span className="text-gray-500">
                          Script {formatCost(clip.content.estimatedTotal, productCost.currency)} ·
                          Image {formatCost(clip.image.estimatedTotal, productCost.currency)} ·
                          Video {formatCost(clip.video.estimatedTotal, productCost.currency)} ·
                          Voice {formatCost(clip.voice.estimatedTotal, productCost.currency)}
                        </span>
                        <span className="font-semibold text-white">
                          รวม {formatCost(clip.total.estimatedTotal, productCost.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ===== CONTENT INTELLIGENCE — STEP 19 — ต่อยอด /api/content/generate (STEP 9) เดิม
          ไม่รื้อ ใช้ OPENAI_API_KEY เดียวกัน สร้างหลายมุม Content พร้อม prompt สำหรับ AI
          Image/Video Generation (STEP 13/14) และส่งต่อ /api/social/prepare, /api/social/queue
          (STEP 9/12) เดิมได้โดยไม่แก้ provider/queue architecture ===== */}
      <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950 p-4">
        <h3 className="font-semibold text-gray-200">🧠 Content Intelligence</h3>
        <p className="mt-2 text-sm text-gray-400">
          ให้ AI วิเคราะห์ข้อมูลสินค้าจริงแล้วคิด Content หลายมุมพร้อมใช้งาน — ใช้เฉพาะข้อมูลจริงในระบบ
          ไม่แต่งประวัติ รุ่น ปี วัด หรือสรรพคุณที่ไม่มีในฐานข้อมูล
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-400">จำนวน Content</label>
            <input
              type="number"
              min={1}
              max={5}
              value={planCount}
              onChange={(event) =>
                setPlanCount(Math.min(5, Math.max(1, Number(event.target.value) || 1)))
              }
              className="mt-1 w-20 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-gray-400"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400">Content Type</label>
            <select
              value={planContentType}
              onChange={(event) =>
                setPlanContentType(event.target.value as ContentPlanType | "auto")
              }
              className="mt-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-gray-400"
            >
              <option value="auto">Auto</option>
              <option value="facebook">Facebook</option>
              <option value="reels">Reels</option>
              <option value="tiktok">TikTok</option>
              <option value="script">Script</option>
            </select>
          </div>

          <button
            type="button"
            onClick={generateContentPlans}
            disabled={planLoading || typeof selectedProductId !== "number"}
            className="rounded-xl bg-white px-5 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {planLoading ? "⏳ กำลังคิดคอนเทนต์..." : "✨ คิดคอนเทนต์ด้วย AI"}
          </button>
        </div>

        <div className="mt-3">
          <p className="text-xs text-gray-400">
            เลือก Content Angle (ไม่เลือก = ให้ AI เลือกเองอัตโนมัติ)
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {contentPlanAngleOptions.map((angle) => (
              <button
                key={angle}
                type="button"
                onClick={() => toggleContentPlanAngle(angle)}
                className={
                  "rounded-full border px-3 py-1 text-xs " +
                  (planAngles.includes(angle)
                    ? "border-white bg-white text-black"
                    : "border-gray-700 bg-gray-900 text-gray-300")
                }
              >
                {contentPlanAngleLabels[angle]}
              </button>
            ))}
          </div>
        </div>

        {planError && <p className="mt-3 text-sm text-red-400">{planError}</p>}

        {contentPlans.length > 0 && (
          <div className="mt-4 flex flex-col gap-4">
            {contentPlans.map((plan) => {
              const isBusy = planActionId === plan.id;
              const canPostToSocial = plan.contentType !== "script" && isVideoReady;

              return (
                <div
                  key={plan.id}
                  className="rounded-xl border border-gray-700 bg-gray-900 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-300">
                        {plan.contentType}
                      </span>
                      <span className="rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-300">
                        {contentPlanAngleLabels[plan.contentAngle]}
                      </span>
                      <span className="rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-400">
                        {plan.status}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyWholePlan(plan)}
                      className="rounded-md border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800"
                    >
                      {planCopiedField === `plan-${plan.id}-all` ? "✓ คัดลอกแล้ว" : "📋 Copy ทั้งชุด"}
                    </button>
                  </div>

                  <p className="mt-2 text-xs text-gray-500">
                    Objective: {plan.objective || "-"} · Target: {plan.targetAudience || "-"}
                  </p>

                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Hook
                      </label>
                      <button
                        type="button"
                        onClick={() => copyPlanField(`plan-${plan.id}-hook`, plan.hook || "")}
                        className="text-xs text-gray-400 hover:text-gray-200"
                      >
                        {planCopiedField === `plan-${plan.id}-hook` ? "✓" : "📋"}
                      </button>
                    </div>
                    <input
                      value={plan.hook || ""}
                      onChange={(event) =>
                        updateLocalPlanField(plan.id, "hook", event.target.value)
                      }
                      className="w-full rounded-lg border border-gray-700 bg-gray-950 p-2 text-sm text-white outline-none focus:border-gray-400"
                    />
                  </div>

                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Caption
                      </label>
                      <button
                        type="button"
                        onClick={() => copyPlanField(`plan-${plan.id}-caption`, plan.caption)}
                        className="text-xs text-gray-400 hover:text-gray-200"
                      >
                        {planCopiedField === `plan-${plan.id}-caption` ? "✓" : "📋"}
                      </button>
                    </div>
                    <textarea
                      value={plan.caption}
                      onChange={(event) =>
                        updateLocalPlanField(plan.id, "caption", event.target.value)
                      }
                      className="min-h-[120px] w-full rounded-lg border border-gray-700 bg-gray-950 p-2 text-sm text-white outline-none focus:border-gray-400"
                    />
                  </div>

                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        CTA
                      </label>
                      <button
                        type="button"
                        onClick={() => copyPlanField(`plan-${plan.id}-cta`, plan.cta || "")}
                        className="text-xs text-gray-400 hover:text-gray-200"
                      >
                        {planCopiedField === `plan-${plan.id}-cta` ? "✓" : "📋"}
                      </button>
                    </div>
                    <input
                      value={plan.cta || ""}
                      onChange={(event) =>
                        updateLocalPlanField(plan.id, "cta", event.target.value)
                      }
                      className="w-full rounded-lg border border-gray-700 bg-gray-950 p-2 text-sm text-white outline-none focus:border-gray-400"
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-xs text-gray-500">Hashtags: {plan.hashtags.join(" ")}</p>
                    <button
                      type="button"
                      onClick={() =>
                        copyPlanField(`plan-${plan.id}-hashtags`, plan.hashtags.join(" "))
                      }
                      className="text-xs text-gray-400 hover:text-gray-200"
                    >
                      {planCopiedField === `plan-${plan.id}-hashtags` ? "✓" : "📋"}
                    </button>
                  </div>

                  {plan.imagePrompt && (
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                          Image Prompt
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            copyPlanField(`plan-${plan.id}-image`, plan.imagePrompt || "")
                          }
                          className="text-xs text-gray-400 hover:text-gray-200"
                        >
                          {planCopiedField === `plan-${plan.id}-image` ? "✓" : "📋"}
                        </button>
                      </div>
                      <p className="rounded-lg border border-gray-800 bg-gray-950 p-2 text-xs text-gray-400">
                        {plan.imagePrompt}
                      </p>
                    </div>
                  )}

                  {plan.videoPrompt && (
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                          Video Prompt
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            copyPlanField(`plan-${plan.id}-video`, plan.videoPrompt || "")
                          }
                          className="text-xs text-gray-400 hover:text-gray-200"
                        >
                          {planCopiedField === `plan-${plan.id}-video` ? "✓" : "📋"}
                        </button>
                      </div>
                      <p className="rounded-lg border border-gray-800 bg-gray-950 p-2 text-xs text-gray-400">
                        {plan.videoPrompt}
                      </p>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-800 pt-3">
                    <button
                      type="button"
                      onClick={() => savePlan(plan)}
                      disabled={isBusy}
                      className="rounded-md border border-gray-600 px-3 py-1 text-xs text-gray-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      💾 Save
                    </button>

                    <button
                      type="button"
                      onClick={() => generateImageFromPlan(plan)}
                      disabled={isBusy || !plan.imagePrompt || !aiImageConfigured}
                      className="rounded-md border border-gray-600 px-3 py-1 text-xs text-gray-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ✨ สร้างรูปจาก Prompt นี้
                    </button>

                    <button
                      type="button"
                      onClick={() => generateVideoFromPlan(plan)}
                      disabled={isBusy || !plan.videoPrompt}
                      className="rounded-md border border-gray-600 px-3 py-1 text-xs text-gray-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      🎬 สร้างวิดีโอจาก Prompt นี้
                    </button>

                    <button
                      type="button"
                      onClick={() => preparePlanSocialPost(plan)}
                      disabled={isBusy || !canPostToSocial}
                      className="rounded-md border border-gray-600 px-3 py-1 text-xs text-gray-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      📱 เตรียมโพสต์
                    </button>

                    <button
                      type="button"
                      onClick={() => deletePlan(plan.id)}
                      disabled={isBusy}
                      className="rounded-md border border-gray-700 px-3 py-1 text-xs text-red-400 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      🗑️ ลบ
                    </button>
                  </div>

                  {canPostToSocial && (
                    <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-800 pt-3">
                      <div>
                        <label className="block text-xs text-gray-400">Date</label>
                        <input
                          type="date"
                          value={planScheduleDate[plan.id] || ""}
                          onChange={(event) =>
                            setPlanScheduleDate((previous) => ({
                              ...previous,
                              [plan.id]: event.target.value,
                            }))
                          }
                          className="mt-1 rounded-lg border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-white outline-none focus:border-gray-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400">Time</label>
                        <input
                          type="time"
                          value={planScheduleTime[plan.id] || ""}
                          onChange={(event) =>
                            setPlanScheduleTime((previous) => ({
                              ...previous,
                              [plan.id]: event.target.value,
                            }))
                          }
                          className="mt-1 rounded-lg border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-white outline-none focus:border-gray-400"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => schedulePlanPost(plan)}
                        disabled={isBusy}
                        className="rounded-md border border-gray-600 px-3 py-1 text-xs text-gray-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        📅 ตั้งเวลาโพสต์
                      </button>
                    </div>
                  )}

                  {!isVideoReady && plan.contentType !== "script" && (
                    <p className="mt-2 text-xs text-yellow-500">
                      ต้องสร้างวิดีโอด้วย Auto Video ก่อนจึงจะเตรียมโพสต์/ตั้งเวลาได้
                    </p>
                  )}

                  {planActionMessages[plan.id] && (
                    <p className="mt-2 text-xs text-gray-400">{planActionMessages[plan.id]}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tone */}
      <div className="mt-4">
        <p className="text-sm font-medium text-gray-300">โทนภาษา</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {autoTones.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTone(item.value)}
              className={
                "rounded-xl border px-4 py-2 text-sm " +
                (tone === item.value
                  ? "border-white bg-white text-black"
                  : "border-gray-700 bg-gray-900 text-white")
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Auto Generate Button */}
      <button
        type="button"
        onClick={generateAutoVideo}
        disabled={autoLoading || typeof selectedProductId !== "number"}
        className="mt-5 w-full rounded-xl bg-emerald-500 px-6 py-4 text-lg font-bold text-black disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
      >
        {autoLoading ? "⏳ กำลังสร้างวิดีโออัตโนมัติ..." : "🚀 สร้างวิดีโออัตโนมัติ"}
      </button>

      {autoError && (
        <div className="mt-4 rounded-xl border border-red-800 bg-red-950/40 p-4 text-red-300">
          {autoError}
        </div>
      )}

      {/* ===== PIPELINE PROGRESS ===== */}
      {(autoLoading || autoResult || autoError) && (
        <div className="mt-6 rounded-xl border border-gray-800 bg-gray-950 p-4">
          <h3 className="font-semibold text-gray-200">⚙️ Pipeline Progress</h3>

          <div className="mt-3 space-y-2 text-sm">
            {pipelineSteps.map((step) => {
              const state = getStepState(step.key);
              return (
                <div key={step.key} className="flex items-center gap-2">
                  <span>{stepIcon(state)}</span>
                  <span
                    className={
                      state === "done"
                        ? "text-emerald-300"
                        : state === "error"
                          ? "text-red-300"
                          : state === "skipped"
                            ? "text-yellow-300"
                            : "text-gray-300"
                    }
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {autoResult && (
            <p className="mt-3 text-sm text-gray-400">{autoResult.message}</p>
          )}
        </div>
      )}

      {/* ===== NO MEDIA WARNING ===== */}
      {isNoMedia && (
        <div className="mt-4 rounded-xl border border-yellow-700 bg-yellow-950/30 p-4 text-yellow-200">
          <p>สินค้านี้ยังไม่มีรูปภาพ กรุณาเพิ่มรูปสินค้าก่อนสร้างวิดีโอ</p>
          <button
            type="button"
            onClick={scrollToUpload}
            className="mt-3 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black"
          >
            ไปเพิ่มรูปสินค้า
          </button>
        </div>
      )}

      {/* ===== CONTENT ===== */}
      {autoResult?.content?.script && (
        <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950 p-4">
          <h3 className="font-semibold text-gray-200">📝 CONTENT</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-300">
            {autoResult.content.script}
          </p>
        </div>
      )}

      {/* ===== VOICE ===== */}
      {autoResult?.voice?.audioUrl && (
        <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950 p-4">
          <h3 className="font-semibold text-gray-200">🎙️ VOICE</h3>
          <audio
            controls
            src={autoResult.voice.audioUrl}
            className="mt-3 w-full"
          />
          <p className="mt-1 text-xs text-gray-500">
            {autoResult.voice.fileName}
          </p>
        </div>
      )}

      {/* ===== MEDIA ===== */}
      {autoResult?.media?.items && autoResult.media.items.length > 0 && (
        <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950 p-4">
          <h3 className="font-semibold text-gray-200">
            🖼️ MEDIA ({autoResult.media.count} รูป)
          </h3>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {autoResult.media.items.map((item) => (
              <div
                key={item.fileName}
                className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt={item.fileName}
                  className="h-20 w-full object-cover"
                />
                <p className="truncate p-1 text-[10px] text-gray-400">
                  {item.fileName}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== TIMELINE ===== */}
      {autoResult?.timeline?.items && autoResult.timeline.items.length > 0 && (
        <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950 p-4">
          <h3 className="font-semibold text-gray-200">🎞️ TIMELINE</h3>
          <p className="mt-2 text-sm text-gray-300">
            {autoResult.timeline.items.length} Scene ·{" "}
            {formatTime(autoResult.timeline.duration)}
          </p>
        </div>
      )}

      {/* ===== VIDEO ===== */}
      {isVideoReady && autoResult?.video && (
        <div className="mt-4 rounded-xl border border-emerald-700 bg-emerald-950/30 p-4">
          <h3 className="font-semibold text-emerald-200">
            🎬 VIDEO — สร้างวิดีโอสำเร็จ
          </h3>

          <video
            controls
            src={autoResult.video.videoUrl}
            className="mt-3 w-full rounded-xl bg-black"
          />

          <div className="mt-3 space-y-1 text-sm text-gray-300">
            <p>Video URL: {autoResult.video.videoUrl}</p>
            <p>File name: {autoResult.video.fileName}</p>
            <p>Duration: {formatTime(autoResult.timeline.duration)}</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href={autoResult.video.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-white px-5 py-3 font-semibold text-black"
            >
              ▶️ เปิดวิดีโอ
            </a>

            <a
              href={autoResult.video.videoUrl}
              download={autoResult.video.fileName}
              className="rounded-xl bg-gray-800 px-5 py-3 font-semibold text-white hover:bg-gray-700"
            >
              ⬇️ ดาวน์โหลดวิดีโอ
            </a>
          </div>
        </div>
      )}

      {/* ===== SOCIAL POST (STEP 9) — เตรียม Content Package เท่านั้น ยังไม่โพสต์ Facebook/TikTok จริง ===== */}
      {isVideoReady && autoResult?.content && (
        <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950 p-4">
          <h3 className="font-semibold text-gray-200">
            📣 SOCIAL POST — เตรียม Content Package สำหรับโพสต์
          </h3>

          <p className="mt-2 text-sm text-gray-400">
            เตรียมแคปชันและแฮชแท็กให้พร้อม แล้วโพสต์จริงได้เมื่อเชื่อมต่อบัญชีแล้วเท่านั้น —
            ถ้ายังไม่ได้ตั้งค่า Access Token ปุ่มโพสต์จะถูกปิดใช้งานเสมอ
          </p>

          {/* ===== SOCIAL POSTING (STEP 10) — สถานะการเชื่อมต่อจริงจาก GET /api/social/status ===== */}
          <div className="mt-4 rounded-lg border border-gray-700 bg-gray-900 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Provider Status
              </p>
              <button
                type="button"
                onClick={checkProviderConnections}
                disabled={providerStatusLoading}
                className="rounded-md border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {providerStatusLoading ? "⏳ กำลังตรวจสอบ..." : "ตรวจสอบการเชื่อมต่อ"}
              </button>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {socialProviderKeys.map((key) => {
                const entry = providerStatus[key];
                const isConnected = entry.status === "connected";
                const isError = entry.status === "error";

                return (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-md border border-gray-800 bg-gray-950 px-3 py-2"
                  >
                    <span className="text-sm text-gray-200">
                      {socialProviderLabels[key]}
                    </span>
                    <span className="text-xs">
                      {isConnected
                        ? `🟢 Connected${entry.accountName ? ` (${entry.accountName})` : ""}`
                        : isError
                          ? "🔴 Error"
                          : "🟡 Not Connected"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Caption ทั้งสองแพลตฟอร์มมาจาก content ของ /api/video/auto โดยตรง ไม่ต้องเรียก API เพิ่ม */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-700 bg-gray-900 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Facebook Caption
                </p>
                <button
                  type="button"
                  onClick={() =>
                    copyText("facebook", autoResult.content.facebook)
                  }
                  className="rounded-md border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800"
                >
                  {copiedField === "facebook" ? "✓ คัดลอกแล้ว" : "คัดลอก"}
                </button>
              </div>
              <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-gray-300">
                {autoResult.content.facebook || "-"}
              </p>
            </div>

            <div className="rounded-lg border border-gray-700 bg-gray-900 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  TikTok Caption
                </p>
                <button
                  type="button"
                  onClick={() =>
                    copyText("tiktok", autoResult.content.tiktok)
                  }
                  className="rounded-md border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800"
                >
                  {copiedField === "tiktok" ? "✓ คัดลอกแล้ว" : "คัดลอก"}
                </button>
              </div>
              <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-gray-300">
                {autoResult.content.tiktok || "-"}
              </p>
            </div>
          </div>

          {/* เลือก Platform แล้วเรียก POST /api/social/prepare เพื่อเตรียม Content Package จริง */}
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-300">Platform</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {socialPlatforms.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setSocialPlatform(item.value)}
                  className={
                    "rounded-xl border px-4 py-2 text-sm " +
                    (socialPlatform === item.value
                      ? "border-white bg-white text-black"
                      : "border-gray-700 bg-gray-900 text-white")
                  }
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={prepareSocialPost}
            disabled={socialLoading}
            className="mt-4 rounded-xl bg-white px-5 py-3 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {socialLoading
              ? "⏳ กำลังเตรียม Content Package..."
              : "📦 เตรียม Content Package"}
          </button>

          {socialError && (
            <p className="mt-3 text-sm text-red-400">{socialError}</p>
          )}

          {socialPackage && (
            <div className="mt-4 rounded-lg border border-emerald-700 bg-emerald-950/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white">
                  {socialPackage.status === "ready_to_post"
                    ? "✅ Ready to Post"
                    : "📝 Draft"}
                </span>
                <span className="rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-300">
                  Platform: {socialPackage.platform}
                </span>
              </div>

              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Caption ({socialPackage.platform})
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      copyText("package-caption", socialPackage.caption)
                    }
                    className="rounded-md border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800"
                  >
                    {copiedField === "package-caption"
                      ? "✓ คัดลอกแล้ว"
                      : "คัดลอก"}
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-sm text-gray-300">
                  {socialPackage.caption || "-"}
                </p>
              </div>

              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Hashtags
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {socialPackage.hashtags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <p className="mt-3 truncate text-xs text-gray-500">
                Video URL: {socialPackage.videoUrl}
              </p>

              {/* ===== SOCIAL POSTING (STEP 10) — โพสต์จริง ===== */}
              {(() => {
                const providerKey = providerKeyForPlatform(socialPackage.platform);
                const isConnected = providerStatus[providerKey]?.status === "connected";

                return (
                  <div className="mt-4 border-t border-emerald-900 pt-4">
                    <button
                      type="button"
                      onClick={postToSocial}
                      disabled={postLoading || !isConnected}
                      className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {postLoading ? "⏳ กำลังโพสต์..." : "🚀 โพสต์"}
                    </button>

                    {!isConnected && (
                      <p className="mt-2 text-xs text-yellow-500">
                        ยังไม่ได้ตั้งค่าการเชื่อมต่อ {socialProviderLabels[providerKey]}{" "}
                        — ปุ่มโพสต์จะเปิดใช้งานเมื่อมี Access Token จริงใน .env เท่านั้น
                      </p>
                    )}

                    {postError && (
                      <p className="mt-2 text-sm text-red-400">{postError}</p>
                    )}

                    {postResult && (
                      <p className="mt-2 text-sm text-emerald-400">
                        ✅ {postResult.message}
                        {postResult.postId ? ` (postId: ${postResult.postId})` : ""}
                      </p>
                    )}

                    {/* ===== SOCIAL POST QUEUE (STEP 12) — ตั้งเวลาโพสต์แทนการโพสต์ทันที ===== */}
                    <div className="mt-4 border-t border-emerald-900 pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        📅 Schedule
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Platform: {socialProviderLabels[providerKey]}
                      </p>

                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <div>
                          <label className="block text-xs text-gray-400">Date</label>
                          <input
                            type="date"
                            value={scheduleDate}
                            onChange={(event) => setScheduleDate(event.target.value)}
                            className="mt-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-gray-400"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400">Time</label>
                          <input
                            type="time"
                            value={scheduleTime}
                            onChange={(event) => setScheduleTime(event.target.value)}
                            className="mt-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-gray-400"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={scheduleSocialPostSubmit}
                          disabled={scheduleLoading}
                          className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {scheduleLoading ? "⏳ กำลังตั้งเวลา..." : "ตั้งเวลาโพสต์"}
                        </button>
                      </div>

                      {scheduleError && (
                        <p className="mt-2 text-sm text-red-400">{scheduleError}</p>
                      )}

                      {scheduleResult && (
                        <p className="mt-2 text-sm text-emerald-400">
                          ✅ Scheduled — {formatDateTimeTH(scheduleResult.scheduledAt)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ===== SOCIAL POST QUEUE (STEP 12) — POST HISTORY ของสินค้าที่เลือกอยู่ ===== */}
          <div className="mt-4 border-t border-gray-800 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              POST HISTORY
            </p>

            {queueLoading && (
              <p className="mt-2 text-xs text-gray-500">กำลังโหลด...</p>
            )}

            {!queueLoading && queueItems.length === 0 && (
              <p className="mt-2 text-xs text-gray-500">ยังไม่มีประวัติการโพสต์/ตั้งเวลาสำหรับสินค้านี้</p>
            )}

            <div className="mt-2 flex flex-col gap-2">
              {queueItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-gray-800 bg-gray-950 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-gray-200">
                      {socialProviderLabels[providerKeyForPlatform(item.platform)] ||
                        item.platform}
                    </span>
                    <span className="text-xs text-gray-400">
                      {queueStatusLabels[item.status]}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-gray-500">
                    {item.status === "scheduled" || item.status === "processing"
                      ? `เวลา: ${formatDateTimeTH(item.scheduledAt)}`
                      : item.status === "published"
                        ? `เผยแพร่: ${formatDateTimeTH(item.publishedAt)}`
                        : `อัปเดตล่าสุด: ${formatDateTimeTH(item.updatedAt)}`}
                  </p>

                  {item.errorMessage && (
                    <p className="mt-1 text-xs text-red-400">{item.errorMessage}</p>
                  )}

                  {item.externalPostId && (
                    <p className="mt-1 text-xs text-gray-500">
                      postId: {item.externalPostId}
                    </p>
                  )}

                  {(item.status === "draft" || item.status === "scheduled") && (
                    <button
                      type="button"
                      onClick={() => cancelQueueItem(item.id)}
                      disabled={cancellingId === item.id}
                      className="mt-2 rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {cancellingId === item.id ? "⏳ กำลังยกเลิก..." : "ยกเลิก"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
// ===== End Auto Video (AI) =====

// ===== SOCIAL ANALYTICS DASHBOARD — STEP 16 =====
// ตรงกับ src/lib/socialAnalytics.ts / GET /api/social/analytics — แสดงภาพรวมทุกสินค้า
// (ไม่ผูกกับ selectedProductId ใน AutoVideoPanel เพราะ Dashboard ควรเห็นภาพรวมทั้งระบบ)
// จำนวนโพสต์ (Total/Published/Failed/Scheduled) เป็นข้อมูลจริงจาก social_posts เสมอ ส่วนตัวเลข
// engagement (Views/Likes/Comments/Shares) จะว่างเปล่า/แสดง "ยังไม่มีข้อมูล" จนกว่าจะมีการเชื่อมต่อ
// Facebook/Instagram/TikTok จริงและดึงสถิติจริงเข้ามา — ไม่มี mock number ใดๆ ในไฟล์นี้

type AnalyticsMetrics = {
  impressions: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  clicks: number | null;
};

type PlatformBreakdownEntry = {
  platform: SocialPlatform;
  totalPosts: number;
  publishedPosts: number;
  postsWithAnalytics: number;
  totals: AnalyticsMetrics;
};

type TopPerformingPostEntry = {
  socialPostId: number;
  productId: number;
  platform: SocialPlatform;
  caption: string;
  engagementRate: number | null;
  metrics: AnalyticsMetrics;
  fetchedAt: string;
};

type DashboardSummary = {
  totalPosts: number;
  statusCounts: Record<SocialQueueStatus, number>;
  postsWithAnalytics: number;
  totals: AnalyticsMetrics;
  analyticsAvailable: boolean;
  platformBreakdown: PlatformBreakdownEntry[];
  topPerformingPosts: TopPerformingPostEntry[];
};

function formatMetric(value: number | null): string {
  return value === null ? "-" : value.toLocaleString("th-TH");
}

function AnalyticsDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadSummary() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/social/analytics", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok || !data.summary) {
        throw new Error(data?.error || "ไม่สามารถโหลดข้อมูล Analytics ได้");
      }

      setSummary(data.summary);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  return (
    <section className="mt-8 rounded-2xl border border-sky-900 bg-sky-950/20 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">📊 Social Analytics Dashboard</h2>
        <button
          type="button"
          onClick={loadSummary}
          disabled={loading}
          className="rounded-md border border-gray-600 px-3 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "⏳ กำลังโหลด..." : "🔄 รีเฟรช"}
        </button>
      </div>

      <p className="mt-2 text-sm text-gray-400">
        ภาพรวมโพสต์ทุกสินค้า/ทุกแพลตฟอร์ม — จำนวนโพสต์เป็นข้อมูลจริงเสมอ ส่วนสถิติ engagement
        (Views/Likes/Comments/Shares) จะแสดงเมื่อเชื่อมต่อ Facebook/Instagram/TikTok จริงแล้วเท่านั้น
      </p>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {summary && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p className="text-xs text-gray-500">Total Posts</p>
              <p className="mt-1 text-2xl font-bold">{summary.totalPosts}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p className="text-xs text-gray-500">✅ Published</p>
              <p className="mt-1 text-2xl font-bold">{summary.statusCounts.published}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p className="text-xs text-gray-500">❌ Failed</p>
              <p className="mt-1 text-2xl font-bold">{summary.statusCounts.failed}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p className="text-xs text-gray-500">📅 Scheduled</p>
              <p className="mt-1 text-2xl font-bold">{summary.statusCounts.scheduled}</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p className="text-xs text-gray-500">👁️ Views</p>
              <p className="mt-1 text-xl font-semibold">{formatMetric(summary.totals.views)}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p className="text-xs text-gray-500">❤️ Likes</p>
              <p className="mt-1 text-xl font-semibold">{formatMetric(summary.totals.likes)}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p className="text-xs text-gray-500">💬 Comments</p>
              <p className="mt-1 text-xl font-semibold">
                {formatMetric(summary.totals.comments)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p className="text-xs text-gray-500">🔁 Shares</p>
              <p className="mt-1 text-xl font-semibold">{formatMetric(summary.totals.shares)}</p>
            </div>
          </div>

          {!summary.analyticsAvailable && (
            <p className="mt-4 rounded-lg border border-yellow-900 bg-yellow-950/20 p-3 text-sm text-yellow-500">
              ยังไม่มีข้อมูล Analytics จากแพลตฟอร์ม
            </p>
          )}

          {summary.platformBreakdown.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                แยกตามแพลตฟอร์ม
              </p>
              <div className="mt-2 flex flex-col gap-2">
                {summary.platformBreakdown.map((entry) => (
                  <div
                    key={entry.platform}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-800 bg-gray-950 p-3 text-sm"
                  >
                    <span className="font-medium text-gray-200">
                      {socialProviderLabels[providerKeyForPlatform(entry.platform)] ||
                        entry.platform}
                    </span>
                    <span className="text-xs text-gray-400">
                      โพสต์ทั้งหมด {entry.totalPosts} · Published {entry.publishedPosts} ·
                      มี Analytics {entry.postsWithAnalytics} รายการ
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              🏆 Top Performing Posts
            </p>

            {summary.topPerformingPosts.length === 0 ? (
              <p className="mt-2 text-xs text-gray-500">ยังไม่มีข้อมูล Analytics จากแพลตฟอร์ม</p>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                {summary.topPerformingPosts.map((post) => (
                  <div
                    key={post.socialPostId}
                    className="rounded-lg border border-gray-800 bg-gray-950 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-200">
                        {socialProviderLabels[providerKeyForPlatform(post.platform)] ||
                          post.platform}{" "}
                        — Product #{post.productId}
                      </span>
                      <span className="text-xs text-gray-400">
                        Engagement Rate:{" "}
                        {post.engagementRate !== null
                          ? `${(post.engagementRate * 100).toFixed(2)}%`
                          : "-"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-gray-500">{post.caption}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
// ===== End Social Analytics Dashboard =====

// ===== WORKER STATUS — STEP 17, ต่อยอด persistence ใน STEP 18 =====
// ตรงกับ src/lib/socialWorker.ts / GET,POST /api/social/worker/status,run
//
// ปุ่ม "Run Worker" เรียก POST /api/social/worker/run ตรงๆ โดยไม่ส่ง secret ใดๆ — endpoint นี้
// ต้องการ WORKER_TRIGGER_SECRET ผ่าน header เสมอ (ดูคอมเมนต์ในไฟล์ route) ซึ่ง UI ฝั่ง browser
// ไม่มีที่เก็บ secret อย่างปลอดภัย จึงตั้งใจไม่แนบ secret มาด้วย — ปุ่มนี้จะได้ค่า not_configured/
// unauthorized ตรงๆ จาก server จริงเสมอ (แสดงผลตามจริง ไม่ fake ว่าเรียกสำเร็จ) เหมาะสำหรับดูสถานะ
// และทดสอบว่า endpoint ตอบถูกต้อง — การรัน worker จริงควรใช้ `pnpm social:worker` หรือ curl
// พร้อม header จากเครื่อง/cron ที่ถือ secret ไว้อย่างปลอดภัยแทน
//
// STEP 18: สถานะนี้อ่านจาก DB (social_worker_runs) แล้ว ไม่หายเมื่อ dev server restart อีกต่อไป
type WorkerRunRecord = {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "completed" | "failed";
  processed: number | null;
  published: number | null;
  failed: number | null;
  retried: number | null;
  skipped: number | null;
  recovered: number | null;
  errorMessage: string | null;
};

type WorkerStatusState = {
  state: "never_run" | "idle" | "running";
  lastRun: WorkerRunRecord | null;
  lastCompletedRun: WorkerRunRecord | null;
};

function WorkerStatusPanel() {
  const [status, setStatus] = useState<WorkerStatusState | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerMessage, setTriggerMessage] = useState("");

  async function loadStatus() {
    try {
      const response = await fetch("/api/social/worker/status", { cache: "no-store" });
      const data = await response.json();

      if (response.ok && data.success) {
        setStatus({
          state: data.state,
          lastRun: data.lastRun,
          lastCompletedRun: data.lastCompletedRun,
        });
      }
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function triggerWorker() {
    if (triggering) {
      // กันการกดซ้ำระหว่างที่ยังทำงานอยู่
      return;
    }

    setTriggering(true);
    setTriggerMessage("");

    try {
      const response = await fetch("/api/social/worker/run", { method: "POST" });
      const data = await response.json();

      if (response.status === 503) {
        setTriggerMessage("⚠️ ยังไม่ได้ตั้งค่า WORKER_TRIGGER_SECRET บนเซิร์ฟเวอร์");
      } else if (response.status === 401) {
        setTriggerMessage("⚠️ ไม่ได้รับอนุญาต (ปุ่มนี้ไม่ได้แนบ secret — ใช้ pnpm social:worker แทน)");
      } else if (response.status === 409) {
        setTriggerMessage("⚠️ Worker กำลังทำงานอยู่แล้ว");
      } else if (!response.ok) {
        setTriggerMessage(`❌ ${data?.error || "ไม่สามารถรัน worker ได้"}`);
      } else {
        setTriggerMessage("✅ รัน worker สำเร็จ");
      }

      await loadStatus();
    } catch (err) {
      setTriggerMessage(
        err instanceof Error ? `❌ ${err.message}` : "❌ เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"
      );
    } finally {
      setTriggering(false);
    }
  }

  const stateLabel =
    status?.state === "running"
      ? "🔵 Running"
      : status?.state === "never_run"
        ? "⚪ Never Run"
        : "⚪ Idle";

  const displayRun = status?.lastRun ?? null;

  return (
    <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-950 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">⚙️ Worker Status</h2>
        <button
          type="button"
          onClick={triggerWorker}
          disabled={triggering}
          className="rounded-md border border-gray-600 px-3 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {triggering ? "⏳ กำลังรัน..." : "▶️ Run Worker"}
        </button>
      </div>

      <p className="mt-2 text-sm text-gray-400">
        ประมวลผล social_posts ที่ถึงเวลาโพสต์ (scheduled_at ≤ ตอนนี้) — การรันจริงตามตารางเวลาควรใช้
        `pnpm social:worker` จาก cron/scheduler ภายนอก ไม่ใช่ตั้งเวลาอัตโนมัติในตัว dev server เอง
        สถานะนี้บันทึกลงฐานข้อมูลจริง ไม่หายเมื่อ server รีสตาร์ท
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-300">
          {stateLabel}
        </span>
        <span className="text-xs text-gray-500">
          Last Run:{" "}
          {displayRun ? formatDateTimeTH(displayRun.startedAt) : "ยังไม่มีประวัติการทำงาน"}
        </span>
      </div>

      {displayRun && (
        <div className="mt-2 text-xs text-gray-500">
          <p>
            Last Result — status: {displayRun.status}
            {displayRun.status !== "running" && (
              <>
                , processed: {displayRun.processed ?? 0}, published: {displayRun.published ?? 0},
                failed: {displayRun.failed ?? 0}, retried: {displayRun.retried ?? 0}, skipped:{" "}
                {displayRun.skipped ?? 0}, recovered: {displayRun.recovered ?? 0}
              </>
            )}
          </p>
          {displayRun.errorMessage && (
            <p className="mt-1 text-red-400">{displayRun.errorMessage}</p>
          )}
        </div>
      )}

      {!displayRun && <p className="mt-2 text-xs text-gray-500">ยังไม่มีประวัติการทำงาน</p>}

      {triggerMessage && <p className="mt-2 text-xs text-gray-400">{triggerMessage}</p>}
    </section>
  );
}
// ===== End Worker Status =====

function VideoStudioContent() {
  const searchParams = useSearchParams();

  const [script, setScript] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [audioDuration, setAudioDuration] = useState(0);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [status, setStatus] = useState("");
  const [rendering, setRendering] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");

  // STEP 14 — Product Media Library picker สำหรับ Manual Workflow เท่านั้น (ไม่แตะ state/logic ของ
  // AutoVideoPanel เลย คนละชุด state กันโดยสิ้นเชิงเหมือนเดิม) — ให้เลือกรูป/คลิปที่มีอยู่แล้วใน
  // คลังสื่อของสินค้า (GET /api/products/[id]/media เดิม ไม่แก้ endpoint นี้) แทนการอัปโหลดจากเครื่อง
  // ซ้ำ แล้วแปลงเป็น File ใส่เข้า mediaFiles ตัวเดิมทุกประการ — createTimeline()/renderVideo() ด้านล่าง
  // จึงทำงานเหมือนเดิมทุกบรรทัด ไม่ต้องแก้เลย
  const [libraryProducts, setLibraryProducts] = useState<AutoProduct[]>([]);
  const [libraryProductId, setLibraryProductId] = useState<number | "">("");
  const [libraryMedia, setLibraryMedia] = useState<ProductMediaItem[]>([]);
  const [libraryMediaLoading, setLibraryMediaLoading] = useState(false);
  const [libraryAdding, setLibraryAdding] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const scriptFromUrl = searchParams.get("script");
    const audioUrlFromUrl = searchParams.get("audioUrl");

    if (scriptFromUrl) {
      setScript(scriptFromUrl);
    }

    if (audioUrlFromUrl) {
      setAudioUrl(audioUrlFromUrl);
      setStatus("✅ รับสคริปต์และเสียงพากย์จาก Voice Studio แล้ว");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!audioUrl) {
      setAudioDuration(0);
      return;
    }

    setAudioDuration(0);

    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.load();
  }, [audioUrl]);

  function updateAudioDuration() {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const duration = audio.duration;

    if (Number.isFinite(duration) && duration > 0) {
      setAudioDuration(duration);
      setStatus(`✅ อ่านความยาวเสียงแล้ว ${formatTime(duration)}`);
    }
  }

  function handleMediaChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const files = Array.from(event.target.files || []);

    const validFiles = files.filter(
      (file) =>
        file.type.startsWith("image/") ||
        file.type.startsWith("video/")
    );

    setMediaFiles(validFiles);
    setTimeline([]);

    if (validFiles.length !== files.length) {
      setStatus("ระบบรับเฉพาะไฟล์รูปภาพหรือวิดีโอ");
    } else {
      setStatus("");
    }
  }

  // STEP 14 — โหลดรายชื่อสินค้าครั้งเดียวตอนเปิดหน้า (fetch แยกของ Manual Workflow เอง ไม่ใช้ state
  // ของ AutoVideoPanel ร่วมกัน ตามหลักการเดิมของไฟล์นี้ที่แยก state ทั้งสอง workflow ออกจากกัน)
  useEffect(() => {
    fetch("/api/products")
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => setLibraryProducts(Array.isArray(data) ? data : []))
      .catch(() => setLibraryProducts([]));
  }, []);

  // STEP 14 — โหลดคลังสื่อของสินค้าที่เลือก (GET /api/products/[id]/media เดิม ไม่มีการแก้ endpoint นี้)
  useEffect(() => {
    if (typeof libraryProductId !== "number") {
      setLibraryMedia([]);
      return;
    }

    setLibraryMediaLoading(true);

    fetch(`/api/products/${libraryProductId}/media`)
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((data) => setLibraryMedia(Array.isArray(data.items) ? data.items : []))
      .catch(() => setLibraryMedia([]))
      .finally(() => setLibraryMediaLoading(false));
  }, [libraryProductId]);

  // STEP 14 — ดึงไฟล์จริงจาก URL คลังสื่อ (ไฟล์รูป/วิดีโอที่มีอยู่แล้วบนดิสก์ ไม่มีการเรียก AI ใดๆ
  // ทั้งสิ้น) แปลงเป็น File แล้วต่อเข้า mediaFiles ตัวเดิม — createTimeline()/renderVideo() ด้านล่าง
  // ไม่ต้องรู้เลยว่าไฟล์มาจากเครื่องผู้ใช้หรือจากคลังสื่อสินค้า เพราะสุดท้ายเป็น File เหมือนกันหมด
  async function addLibraryMediaToSelection(item: ProductMediaItem) {
    if (mediaFiles.some((file) => file.name === item.fileName)) {
      setStatus(`ไฟล์ "${item.fileName}" ถูกเพิ่มไว้แล้ว`);
      return;
    }

    setLibraryAdding(true);

    try {
      const response = await fetch(item.url);

      if (!response.ok) {
        throw new Error("ไม่สามารถโหลดไฟล์จากคลังสื่อสินค้าได้");
      }

      const blob = await response.blob();
      const file = new File([blob], item.fileName, {
        type: blob.type || (item.type === "video" ? "video/mp4" : "image/jpeg"),
      });

      setMediaFiles((current) => [...current, file]);
      setTimeline([]);
      setStatus(`✅ เพิ่ม "${item.fileName}" จากคลังสื่อสินค้าแล้ว`);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "ไม่สามารถเพิ่มไฟล์จากคลังสื่อสินค้าได้"
      );
    } finally {
      setLibraryAdding(false);
    }
  }

  async function renderVideo() {
    if (!script.trim()) {
      setStatus("กรุณาระบุสคริปต์ก่อน");
      return;
    }

    if (!audioUrl) {
      setStatus("กรุณาสร้างเสียงพากย์ก่อน");
      return;
    }

    if (mediaFiles.length === 0) {
      setStatus("กรุณาเลือกรูปภาพหรือวิดีโออย่างน้อย 1 ไฟล์");
      return;
    }

    if (timeline.length === 0) {
      setStatus("กรุณาสร้าง Timeline ก่อน");
      return;
    }

    setRendering(true);
    setVideoUrl("");
    setStatus("🎬 กำลังสร้างวิดีโอ MP4...");

    try {
      const formData = new FormData();

      formData.append("timeline", JSON.stringify(timeline));
      formData.append("script", script);
      formData.append("audioUrl", audioUrl);

      mediaFiles.forEach((file) => {
        formData.append("media", file, file.name);
      });

      const response = await fetch("/api/video/render", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || "ไม่สามารถสร้างวิดีโอได้"
        );
      }

      if (!data.videoUrl) {
        throw new Error("Server ไม่ได้ส่ง videoUrl กลับมา");
      }

      setVideoUrl(data.videoUrl);
      setStatus("✅ สร้างวิดีโอ MP4 สำเร็จแล้ว");
    } catch (error) {
      console.error("renderVideo error:", error);

      setStatus(
        error instanceof Error
          ? `❌ ${error.message}`
          : "❌ ไม่สามารถสร้างวิดีโอได้"
      );
    } finally {
      setRendering(false);
    }
  }
  function createTimeline() {
    if (!script.trim()) {
      setStatus("กรุณาระบุสคริปต์ก่อน");
      return;
    }

    if (!audioDuration) {
      updateAudioDuration();

      if (!audioDuration) {
        setStatus("กำลังอ่านความยาวเสียง กรุณารอสักครู่");
        return;
      }
    }

    if (mediaFiles.length === 0) {
      setStatus("กรุณาเลือกรูปภาพหรือวิดีโออย่างน้อย 1 ไฟล์");
      return;
    }

    const durationPerFile = audioDuration / mediaFiles.length;

    const newTimeline: TimelineItem[] = mediaFiles.map(
      (file, index) => ({
        id: `${file.name}-${file.size}-${index}`,
        fileName: file.name,
        start: index * durationPerFile,
        duration: durationPerFile,
        index: index + 1,
      })
    );

    setTimeline(newTimeline);
    setStatus(`✅ สร้าง Timeline สำเร็จ ${newTimeline.length} Scene`);
  }

  return (
    <main className="min-h-screen bg-black p-6 text-white">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold">
          🎬 Video Studio
        </h1>

        <p className="mt-2 text-gray-400">
          สร้างวิดีโอสำหรับ THAI AMULET TH
        </p>

        <AutoVideoPanel />

        <AnalyticsDashboard />

        <WorkerStatusPanel />

        <div className="mt-10 border-t border-gray-800 pt-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            หรือสร้างแบบ Manual (ทีละขั้นตอนด้วยตนเอง)
          </p>
        </div>

        <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-950 p-6">
          <h2 className="text-xl font-semibold">
            📝 1. สคริปต์
          </h2>

          <textarea
            value={script}
            onChange={(event) => setScript(event.target.value)}
            placeholder="ใส่สคริปต์สำหรับวิดีโอ..."
            className="mt-4 min-h-[220px] w-full rounded-xl border border-gray-700 bg-gray-900 p-4 text-white outline-none focus:border-gray-400"
          />
        </section>

        <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-950 p-6">
          <h2 className="text-xl font-semibold">
            🎙️ 2. เสียงพากย์
          </h2>

          <p className="mt-2 text-sm text-gray-400">
            เสียงพากย์ที่สร้างจาก Voice Studio
          </p>

          {audioUrl ? (
            <div className="mt-4 rounded-xl bg-gray-900 p-4">
              <p className="font-medium">
                🔊 เสียงพากย์พร้อมใช้งาน
              </p>

              <audio
                ref={audioRef}
                controls
                preload="metadata"
                src={audioUrl}
                onLoadedMetadata={updateAudioDuration}
                onDurationChange={updateAudioDuration}
                onCanPlay={updateAudioDuration}
                onLoadedData={updateAudioDuration}
                className="mt-4 w-full"
              />

              {audioDuration > 0 && (
                <p className="mt-3 text-sm text-gray-400">
                  ความยาวเสียง:{" "}
                  <span className="text-white">
                    {formatTime(audioDuration)}
                  </span>
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-gray-700 p-5 text-gray-500">
              ยังไม่มีเสียงพากย์
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-950 p-6">
          <h2 className="text-xl font-semibold">
            🖼️ 3. รูปภาพ / คลิป
          </h2>

          <input
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleMediaChange}
            className="mt-4 block w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm"
          />

          <div className="mt-6 rounded-xl border border-gray-800 bg-black/40 p-4">
            <p className="text-sm font-medium text-gray-300">
              หรือเลือกจากคลังสื่อของสินค้าที่มีอยู่แล้ว (ไม่ต้องอัปโหลดซ้ำ)
            </p>

            <select
              value={libraryProductId}
              onChange={(event) => {
                const value = event.target.value;
                setLibraryProductId(value ? Number(value) : "");
              }}
              className="mt-3 w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white outline-none focus:border-gray-400"
            >
              <option value="">-- เลือกสินค้า --</option>
              {libraryProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>

            {libraryMediaLoading && (
              <p className="mt-3 text-sm text-gray-500">กำลังโหลดคลังสื่อ...</p>
            )}

            {!libraryMediaLoading &&
              typeof libraryProductId === "number" &&
              libraryMedia.length === 0 && (
                <p className="mt-3 text-sm text-gray-500">สินค้านี้ยังไม่มีสื่อในคลัง</p>
              )}

            {libraryMedia.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {libraryMedia.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={libraryAdding}
                    onClick={() => addLibraryMediaToSelection(item)}
                    className="rounded-lg border border-gray-700 bg-gray-900 p-2 text-left text-xs hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {item.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.url}
                        alt={item.fileName}
                        className="h-20 w-full rounded object-cover"
                      />
                    ) : (
                      // STEP 15 — preview เฟรมแรกของวิดีโอจริงแทน placeholder เดิม (video/type ยัง
                      // ระบุชัดด้วย badge มุมขวาล่างเหมือนเดิม ไม่มี controls/autoplay เพื่อให้ใช้เป็น
                      // thumbnail เฉยๆ เหมือน <img> ด้านบน ไม่ใช่ video player)
                      <div className="relative h-20 w-full overflow-hidden rounded bg-gray-800">
                        <video
                          src={item.url}
                          muted
                          preload="metadata"
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px]">
                          🎬 วิดีโอ
                        </span>
                      </div>
                    )}

                    <p className="mt-2 truncate text-gray-300">{item.fileName}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {mediaFiles.length > 0 && (
            <div className="mt-4">
              <p className="font-medium">
                📁 เลือกแล้ว {mediaFiles.length} ไฟล์
              </p>

              <div className="mt-3 space-y-2">
                {mediaFiles.map((file) => (
                  <div
                    key={`${file.name}-${file.size}`}
                    className="rounded-lg bg-gray-900 p-3 text-sm"
                  >
                    {file.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-950 p-6">
          <h2 className="text-xl font-semibold">
            🎞️ 4. Timeline
          </h2>

          {timeline.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-gray-700 p-8 text-center text-gray-500">
              Timeline จะถูกสร้างอัตโนมัติจากเสียงและรูป/คลิป
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {timeline.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-gray-700 bg-gray-900 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      Scene {item.index}
                    </span>

                    <span className="text-sm text-gray-400">
                      {formatTime(item.start)} →{" "}
                      {formatTime(item.start + item.duration)}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-gray-300">
                    🖼️ {item.fileName}
                  </p>

                  <p className="mt-1 text-sm text-gray-500">
                    ระยะเวลา {formatTime(item.duration)}
                  </p>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            disabled={!script.trim() || !audioUrl || mediaFiles.length === 0}
            onClick={createTimeline}
            className="mt-5 rounded-xl bg-white px-6 py-3 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            🎬 สร้าง Timeline อัตโนมัติ
          </button>
          {timeline.length > 0 && (
            <button
              type="button"
              disabled={rendering}
              onClick={renderVideo}
              className="mt-4 rounded-xl bg-white px-6 py-3 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {rendering
                ? "⏳ กำลังสร้างวิดีโอ..."
                : "🎥 สร้างวิดีโอ MP4"}
            </button>
          )}
        </section>

        {videoUrl && (
          <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-950 p-6">
            <h2 className="text-xl font-semibold">
              🎬 วิดีโอที่สร้างเสร็จแล้ว
            </h2>

            <video
              controls
              src={videoUrl}
              className="mt-4 w-full rounded-xl bg-black"
            />

            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={videoUrl}
                download
                className="rounded-xl bg-white px-6 py-3 font-semibold text-black"
              >
                ⬇️ ดาวน์โหลดวิดีโอ MP4
              </a>
            </div>
          </section>
        )}
        {status && (
          <div className="mt-6 rounded-xl border border-gray-700 bg-gray-900 p-4">
            {status}
          </div>
        )}
      </div>
    </main>
  );
}
export default function VideoStudioPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-black p-6 text-white">
          <div className="mx-auto max-w-5xl">
            <p className="text-gray-400">กำลังโหลด Video Studio...</p>
          </div>
        </main>
      }
    >
      <VideoStudioContent />
    </Suspense>
  );
}
