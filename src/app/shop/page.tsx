"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  SearchIcon,
  SparklesIcon,
  XIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GridLargeIcon,
  GridSmallIcon,
  StarIcon,
} from "@/components/icons";

// Storefront ("/shop") — a customer-facing product showcase, intentionally standalone: no
// AppSidebar, no backend/admin chrome. Catalogue data comes from the public, unauthenticated
// GET /api/shop/products feed (src/app/api/shop/products/route.ts), which only ever returns
// products with status = 'active' and never the admin-only fields (cost/stock/category/...) that
// /api/products exposes. Checkout posts to the equally public POST /api/shop/checkout
// (src/app/api/shop/checkout/route.ts), which reuses the existing orders/customers system — a real
// order lands in the same /orders admin list an admin-created one would. "สนใจติดต่อ" stays as a
// mailto fallback alongside the real "สั่งซื้อสินค้า" buy flow. Page-level <title>/description live
// in shop/layout.tsx since a client component can't export `metadata`.
type ShopProduct = {
  id: number;
  name: string;
  temple: string | null;
  era: string | null;
  description: string | null;
  price: number;
  badge: string | null;
  imageUrl: string | null;
  gallery: string[];
  monkImage: string | null;
  monkHistory: string | null;
};

// "📝 มีใบเซอร์" was dropped from the storefront per this STEP — only ⭐/👑 remain.
const FILTER_OPTIONS = [
  { label: "ทั้งหมด", value: "ทั้งหมด" },
  { label: "⭐ ยอดนิยม", value: "⭐ ยอดนิยม" },
  { label: "👑 หายาก", value: "👑 หายาก" },
] as const;

const SORT_OPTIONS = [
  { label: "แนะนำ", value: "featured" },
  { label: "ราคา: ต่ำ → สูง", value: "price-asc" },
  { label: "ราคา: สูง → ต่ำ", value: "price-desc" },
  { label: "ชื่อ ก → ฮ", value: "name" },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]["value"];

type ViewSize = "large" | "small";

// Real reviews now come from GET/POST /api/reviews (src/app/api/reviews/route.ts) — both
// customer-submitted (this modal's write form) and admin-created (src/app/reviews/page.tsx) rows
// share this exact same shape.
type ReviewItem = {
  id: number;
  customerName: string;
  rating: number;
  comment: string | null;
  imageUrl: string | null;
  createdAt: string;
};

const GRID_COLUMNS_CLASS: Record<ViewSize, string> = {
  large: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  small: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
};

const CARD_IMAGE_HEIGHT_CLASS: Record<ViewSize, string> = {
  large: "h-64 sm:h-72",
  small: "h-40 sm:h-44",
};

type PaymentMethod = "transfer" | "cod";

type ModalStage = "view" | "checkout" | "success";

function formatThb(amount: number): string {
  return new Intl.NumberFormat("th-TH").format(amount);
}

function mailtoHref(product: ShopProduct): string {
  return `mailto:info@thaiamulet.example?subject=${encodeURIComponent(`สนใจสอบถาม: ${product.name}`)}`;
}

// Used only when a product has no uploaded image yet — a short tag pulled from its own name so the
// placeholder tile still reads as "this specific product", not a generic box.
function placeholderLabel(name: string): string {
  const firstWord = name.trim().split(/\s+/)[0] ?? name;
  return firstWord.length > 12 ? `${firstWord.slice(0, 12)}…` : firstWord;
}

// Product image tile — a real uploaded-photo carousel when the product has one (with prev/next
// arrows + dot indicators for size "modal", where there's room), or the amber placeholder card
// otherwise. `size="card"` never shows carousel controls (grid cards are click-to-open, not
// browsable in place) and always shows just the first/primary image.
function ProductGallery({
  product,
  size,
  index,
  onIndexChange,
}: {
  product: ShopProduct;
  size: "card" | "modal";
  index: number;
  onIndexChange: (next: number) => void;
}) {
  const images = product.gallery;
  const hasImages = images.length > 0;
  const showControls = size === "modal" && images.length > 1;

  if (hasImages) {
    const src = images[Math.min(index, images.length - 1)];
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={product.name} className="h-full w-full object-cover" />

        {showControls && (
          <>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onIndexChange((index - 1 + images.length) % images.length);
              }}
              aria-label="รูปก่อนหน้า"
              className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-amber-400/40 bg-black/60 text-amber-300 backdrop-blur-md transition-colors hover:border-amber-400 hover:text-amber-200"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onIndexChange((index + 1) % images.length);
              }}
              aria-label="รูปถัดไป"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-amber-400/40 bg-black/60 text-amber-300 backdrop-blur-md transition-colors hover:border-amber-400 hover:text-amber-200"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {images.map((_, dotIndex) => (
                <span
                  key={dotIndex}
                  className={`h-1.5 w-1.5 rounded-full transition-all ${
                    dotIndex === index ? "w-4 bg-amber-400" : "bg-amber-100/30"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </>
    );
  }

  const iconSize = size === "modal" ? "h-12 w-12" : "h-8 w-8";
  const labelClass =
    size === "modal"
      ? "rounded-full border border-amber-500/30 bg-black/40 px-6 py-2.5 text-base font-medium tracking-wide text-amber-400/80"
      : "rounded-full border border-amber-500/30 bg-black/40 px-5 py-2 text-sm font-medium tracking-wide text-amber-400/80";

  return (
    <div className={`relative flex flex-col items-center gap-${size === "modal" ? "3" : "2"}`}>
      <SparklesIcon className={`${iconSize} text-amber-400/30`} />
      <span className={labelClass}>{placeholderLabel(product.name)}</span>
    </div>
  );
}

const emptyCheckoutForm = {
  customerName: "",
  customerPhone: "",
  customerAddress: "",
  paymentMethod: "" as PaymentMethod | "",
};

export default function ShopPage() {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTER_OPTIONS)[number]["value"]>("ทั้งหมด");
  const [sort, setSort] = useState<SortValue>("featured");
  const [viewSize, setViewSize] = useState<ViewSize>("large");

  const [quickViewId, setQuickViewId] = useState<number | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [modalStage, setModalStage] = useState<ModalStage>("view");

  const [checkoutForm, setCheckoutForm] = useState(emptyCheckoutForm);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [successOrderNumber, setSuccessOrderNumber] = useState("");

  // UI-only for now, per this STEP's explicit scope — no review database/API exists yet.
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewHoverRating, setReviewHoverRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewImageFile, setReviewImageFile] = useState<File | null>(null);
  const [reviewImagePreviewUrl, setReviewImagePreviewUrl] = useState<string | null>(null);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  function setReviewImage(file: File | undefined | null) {
    if (reviewImagePreviewUrl) URL.revokeObjectURL(reviewImagePreviewUrl);
    if (!file) {
      setReviewImageFile(null);
      setReviewImagePreviewUrl(null);
      return;
    }
    setReviewImageFile(file);
    setReviewImagePreviewUrl(URL.createObjectURL(file));
  }

  // Site-wide review modal ("⭐ รีวิวจากลูกค้า / เขียนรีวิว" button) — deliberately separate state
  // from the per-product review fields above (that one's scoped to whichever product is open in
  // Quick View; this one isn't tied to any single product). Backed by the real GET/POST
  // /api/reviews endpoint (src/app/api/reviews/route.ts) — unlike the per-product fields above,
  // which stay UI-only per their own STEP's scope.
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [siteReviews, setSiteReviews] = useState<ReviewItem[]>([]);
  const [siteReviewsLoading, setSiteReviewsLoading] = useState(false);
  const [siteReviewName, setSiteReviewName] = useState("");
  const [siteReviewRating, setSiteReviewRating] = useState(0);
  const [siteReviewHoverRating, setSiteReviewHoverRating] = useState(0);
  const [siteReviewComment, setSiteReviewComment] = useState("");
  const [siteReviewImageFile, setSiteReviewImageFile] = useState<File | null>(null);
  const [siteReviewImagePreviewUrl, setSiteReviewImagePreviewUrl] = useState<string | null>(null);
  const [siteReviewSubmitting, setSiteReviewSubmitting] = useState(false);
  const [siteReviewError, setSiteReviewError] = useState("");
  const [siteReviewSubmitted, setSiteReviewSubmitted] = useState(false);
  const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);

  function setSiteReviewImage(file: File | undefined | null) {
    if (siteReviewImagePreviewUrl) URL.revokeObjectURL(siteReviewImagePreviewUrl);
    if (!file) {
      setSiteReviewImageFile(null);
      setSiteReviewImagePreviewUrl(null);
      return;
    }
    setSiteReviewImageFile(file);
    setSiteReviewImagePreviewUrl(URL.createObjectURL(file));
  }

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      try {
        setLoading(true);
        setLoadError("");
        const response = await fetch("/api/shop/products", { cache: "no-store" });
        if (!response.ok) throw new Error("โหลดข้อมูลสินค้าไม่สำเร็จ");
        const data = await response.json();
        if (!cancelled) setProducts(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setLoadError("ไม่สามารถโหลดข้อมูลสินค้าได้ กรุณาลองใหม่อีกครั้ง");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProducts();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = products.filter((product) => {
      const matchesFilter = filter === "ทั้งหมด" || product.badge === filter;
      const matchesSearch =
        query === "" ||
        product.name.toLowerCase().includes(query) ||
        (product.temple ?? "").toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });

    const sorted = [...filtered];
    if (sort === "price-asc") sorted.sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") sorted.sort((a, b) => b.price - a.price);
    else if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name, "th"));

    return sorted;
  }, [products, search, filter, sort]);

  const quickViewProduct = products.find((product) => product.id === quickViewId) ?? null;

  function openQuickView(productId: number) {
    setQuickViewId(productId);
    setGalleryIndex(0);
    setModalStage("view");
    setCheckoutForm(emptyCheckoutForm);
    setCheckoutError("");
    setSuccessOrderNumber("");
    setReviewRating(0);
    setReviewHoverRating(0);
    setReviewComment("");
    setReviewImage(null);
    setReviewSubmitted(false);
  }

  function closeQuickView() {
    setQuickViewId(null);
  }

  useEffect(() => {
    if (!quickViewProduct) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeQuickView();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickViewProduct]);

  function closeReviewModal() {
    setReviewModalOpen(false);
    setSiteReviewName("");
    setSiteReviewRating(0);
    setSiteReviewHoverRating(0);
    setSiteReviewComment("");
    setSiteReviewImage(null);
    setSiteReviewError("");
    setSiteReviewSubmitted(false);
    setEnlargedImageUrl(null);
  }

  useEffect(() => {
    if (!reviewModalOpen) return;

    let cancelled = false;

    async function loadSiteReviews() {
      try {
        setSiteReviewsLoading(true);
        const response = await fetch("/api/reviews", { cache: "no-store" });
        if (!response.ok) throw new Error("โหลดรีวิวไม่สำเร็จ");
        const data = await response.json();
        if (!cancelled) setSiteReviews(Array.isArray(data) ? data : []);
      } catch {
        // Silently ignored — the write-review form below still works even if the list fails to
        // load; there's just no history shown above it.
      } finally {
        if (!cancelled) setSiteReviewsLoading(false);
      }
    }

    loadSiteReviews();
    return () => {
      cancelled = true;
    };
  }, [reviewModalOpen]);

  useEffect(() => {
    if (!reviewModalOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (enlargedImageUrl) setEnlargedImageUrl(null);
      else closeReviewModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewModalOpen, enlargedImageUrl]);

  async function submitSiteReview() {
    if (!siteReviewName.trim()) {
      setSiteReviewError("กรุณาระบุชื่อของคุณ");
      return;
    }
    if (siteReviewRating < 1) {
      setSiteReviewError("กรุณาให้คะแนน 1-5 ดาว");
      return;
    }

    try {
      setSiteReviewSubmitting(true);
      setSiteReviewError("");

      const formData = new FormData();
      formData.append("customerName", siteReviewName);
      formData.append("rating", String(siteReviewRating));
      formData.append("comment", siteReviewComment);
      if (siteReviewImageFile) formData.append("image", siteReviewImageFile);

      const response = await fetch("/api/reviews", { method: "POST", body: formData });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "ไม่สามารถส่งรีวิวได้");
      }

      setSiteReviews((current) => [data, ...current]);
      setSiteReviewSubmitted(true);
    } catch (err) {
      setSiteReviewError(err instanceof Error ? err.message : "ไม่สามารถส่งรีวิวได้");
    } finally {
      setSiteReviewSubmitting(false);
    }
  }

  async function submitCheckout() {
    if (!quickViewProduct) return;

    if (!checkoutForm.customerName.trim()) {
      setCheckoutError("กรุณากรอกชื่อ-นามสกุล");
      return;
    }
    if (!checkoutForm.customerPhone.trim()) {
      setCheckoutError("กรุณากรอกเบอร์โทรศัพท์");
      return;
    }
    if (!checkoutForm.customerAddress.trim()) {
      setCheckoutError("กรุณากรอกที่อยู่จัดส่ง");
      return;
    }
    if (!checkoutForm.paymentMethod) {
      setCheckoutError("กรุณาเลือกวิธีชำระเงิน");
      return;
    }

    try {
      setCheckoutSubmitting(true);
      setCheckoutError("");

      const response = await fetch("/api/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: quickViewProduct.id,
          quantity: 1,
          customerName: checkoutForm.customerName,
          customerPhone: checkoutForm.customerPhone,
          customerAddress: checkoutForm.customerAddress,
          paymentMethod: checkoutForm.paymentMethod,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "ไม่สามารถสั่งซื้อสินค้าได้");
      }

      setSuccessOrderNumber(data.orderNumber);
      setModalStage("success");
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "ไม่สามารถสั่งซื้อสินค้าได้");
    } finally {
      setCheckoutSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black bg-[linear-gradient(to_right,#f59e0b08_1px,transparent_1px),linear-gradient(to_bottom,#f59e0b08_1px,transparent_1px)] bg-[size:24px_24px] text-neutral-200">
      {/* Ambient gold radial glows — purely decorative depth behind the flat black backdrop. */}
      <div className="pointer-events-none absolute -left-40 -top-40 -z-10 h-[32rem] w-[32rem] rounded-full bg-amber-500/10 blur-[140px]" />
      <div className="pointer-events-none absolute -right-40 top-1/3 -z-10 h-[28rem] w-[28rem] rounded-full bg-amber-400/10 blur-[140px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 -z-10 h-[26rem] w-[26rem] rounded-full bg-amber-600/10 blur-[140px]" />

      <header className="border-b border-amber-500/10 bg-black/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="relative h-11 w-11 shrink-0">
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-amber-500 border-r-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.6)] animate-[spin_3s_linear_infinite]" />
              <Image
                src="/logo.jpg"
                alt="THAI AMULET TH"
                width={44}
                height={44}
                className="absolute inset-[3px] h-full w-full rounded-full border border-amber-500/40 object-cover"
              />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-wide text-white">THAI AMULET TH</h1>
              <p className="text-xs text-neutral-400">ร้านพระเครื่องแท้ คัดสรรจากวัดชื่อดัง</p>
            </div>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            พร้อมให้บริการ
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-12 text-center">
        <div className="relative mx-auto mb-5 h-20 w-20 shrink-0">
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-amber-500 border-r-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.5)] animate-[spin_3s_linear_infinite]" />
          <Image
            src="/logo.jpg"
            alt="THAI AMULET TH"
            width={80}
            height={80}
            className="absolute inset-[4px] h-[calc(100%-8px)] w-[calc(100%-8px)] rounded-full border border-amber-500/40 object-cover"
          />
        </div>

        <h2 className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-600 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
          พระใหม่ยอดนิยม
        </h2>

        <button
          type="button"
          onClick={() => setReviewModalOpen(true)}
          className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-neutral-950/60 px-4 py-2 backdrop-blur-md transition-all hover:border-amber-400 hover:bg-amber-500/10 hover:shadow-[0_0_15px_rgba(245,158,11,0.25)]"
        >
          <StarIcon className="h-4 w-4 text-amber-400" filled />
          <span className="text-xs font-medium text-amber-300">รีวิวจากลูกค้า / เขียนรีวิว</span>
        </button>
      </section>

      <section className="sticky top-0 z-20 border-y border-amber-500/10 bg-black/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-xs">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาพระเครื่อง หรือวัด..."
              className="w-full rounded-xl border border-amber-500/20 bg-neutral-950/60 py-2 pl-9 pr-3 text-sm text-neutral-200 placeholder:text-neutral-600 outline-none transition-colors focus:border-amber-400/60"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                    filter === option.value
                      ? "border-amber-400/70 bg-amber-500/15 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]"
                      : "border-neutral-800 text-neutral-400 hover:border-amber-500/30 hover:text-amber-400"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortValue)}
              className="cursor-pointer rounded-full border border-amber-500/20 bg-neutral-950/60 px-3 py-1.5 text-xs font-medium text-amber-300 outline-none focus:border-amber-400/60"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  เรียงตาม: {option.label}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1 rounded-full border border-amber-500/20 bg-neutral-950/60 p-1">
              <button
                type="button"
                onClick={() => setViewSize("large")}
                aria-label="แสดงภาพใหญ่"
                title="ภาพใหญ่"
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                  viewSize === "large"
                    ? "bg-amber-500/20 text-amber-300"
                    : "text-neutral-500 hover:text-amber-400"
                }`}
              >
                <GridLargeIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewSize("small")}
                aria-label="แสดงภาพเล็ก"
                title="ภาพเล็ก"
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                  viewSize === "small"
                    ? "bg-amber-500/20 text-amber-300"
                    : "text-neutral-500 hover:text-amber-400"
                }`}
              >
                <GridSmallIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-10">
        {loading ? (
          <p className="py-16 text-center text-sm text-neutral-500">กำลังโหลดสินค้า...</p>
        ) : loadError ? (
          <p className="py-16 text-center text-sm text-red-400">{loadError}</p>
        ) : products.length === 0 ? (
          <p className="py-16 text-center text-sm text-neutral-500">ยังไม่มีสินค้าเปิดขายในขณะนี้</p>
        ) : visibleProducts.length === 0 ? (
          <p className="py-16 text-center text-sm text-neutral-500">
            ไม่พบพระเครื่องที่ตรงกับเงื่อนไขการค้นหา
          </p>
        ) : (
          <div className={`grid gap-6 ${GRID_COLUMNS_CLASS[viewSize]}`}>
            {visibleProducts.map((product) => (
              <article
                key={product.id}
                className="group flex flex-col overflow-hidden rounded-2xl border border-amber-500/20 bg-neutral-950/40 backdrop-blur-xl shadow-[0_0_15px_rgba(245,158,11,0.05)] transition-all duration-300 hover:-translate-y-1.5 hover:border-amber-400/60 hover:shadow-[0_0_35px_rgba(245,158,11,0.3)]"
              >
                <button
                  type="button"
                  onClick={() => openQuickView(product.id)}
                  className={`relative flex w-full items-center justify-center overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-950 to-black ${CARD_IMAGE_HEIGHT_CLASS[viewSize]}`}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#f59e0b26_0%,transparent_70%)]" />

                  {product.badge && (
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.35)] backdrop-blur-md">
                      {product.badge}
                    </span>
                  )}

                  <span className="absolute bottom-2 right-2 rounded-full border border-amber-400/30 bg-black/50 px-2.5 py-1 text-[10px] font-medium text-neutral-300 opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100">
                    ดูรายละเอียด
                  </span>

                  <ProductGallery product={product} size="card" index={0} onIndexChange={() => {}} />
                </button>

                <div className="flex flex-1 flex-col gap-2 p-5">
                  <h3 className="text-base font-bold leading-snug text-white">{product.name}</h3>
                  <p className="text-xs text-neutral-400">{product.temple || "-"}</p>
                  <p className="text-[11px] text-neutral-600">{product.era || ""}</p>

                  <div className="mt-2 flex items-center justify-between">
                    <span className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-600 bg-clip-text text-lg font-bold text-transparent">
                      ฿{formatThb(product.price)}
                    </span>
                  </div>

                  <a
                    href={mailtoHref(product)}
                    className="mt-3 flex items-center justify-center rounded-xl border border-amber-300/40 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 px-4 py-2.5 text-sm font-semibold text-black shadow-[0_0_15px_rgba(245,158,11,0.35)] transition-all duration-300 hover:from-amber-400 hover:via-amber-300 hover:to-amber-400 hover:shadow-[0_0_25px_rgba(245,158,11,0.6)]"
                  >
                    สนใจติดต่อ
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-amber-500/10 bg-black py-6 text-center text-xs text-neutral-600">
        © {new Date().getFullYear()} THAI AMULET TH — สงวนลิขสิทธิ์
      </footer>

      {quickViewProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={closeQuickView}
        >
          <div
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-amber-500/30 bg-neutral-950/95 shadow-[0_0_50px_rgba(245,158,11,0.25)]"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeQuickView}
              aria-label="ปิด"
              className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-amber-500/30 bg-black/60 text-neutral-400 transition-colors hover:border-amber-400 hover:text-amber-400"
            >
              <XIcon className="h-4 w-4" />
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2">
              <div className="flex max-h-[85vh] flex-col overflow-y-auto sm:border-r sm:border-amber-500/10">
                <div className="relative flex aspect-square shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-950 to-black">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#f59e0b26_0%,transparent_70%)]" />
                  {quickViewProduct.badge && (
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.35)] backdrop-blur-md">
                      {quickViewProduct.badge}
                    </span>
                  )}
                  <ProductGallery
                    product={quickViewProduct}
                    size="modal"
                    index={galleryIndex}
                    onIndexChange={setGalleryIndex}
                  />
                </div>

                {(quickViewProduct.monkImage || quickViewProduct.monkHistory) && (
                  <div className="border-t border-amber-500/10 bg-neutral-950/60 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-amber-500/40 bg-gradient-to-br from-neutral-900 via-neutral-950 to-black text-xl shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                        {quickViewProduct.monkImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={quickViewProduct.monkImage}
                            alt={quickViewProduct.temple || ""}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          "🙏"
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-amber-300">
                          {quickViewProduct.temple || "ประวัติพระเกจิ / หลวงพ่อ"}
                        </p>
                        <p className="text-[11px] text-neutral-500">ประวัติและพุทธคุณ</p>
                      </div>
                    </div>
                    {quickViewProduct.monkHistory && (
                      <p className="mt-3 text-xs leading-relaxed text-neutral-400">
                        {quickViewProduct.monkHistory}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {modalStage === "view" && (
                <div className="flex max-h-[85vh] flex-col gap-3 overflow-y-auto p-6">
                  <h3 className="text-xl font-bold leading-snug text-white">{quickViewProduct.name}</h3>
                  <p className="text-sm text-amber-300">{quickViewProduct.temple || "-"}</p>
                  <p className="text-xs text-neutral-500">{quickViewProduct.era || ""}</p>
                  {quickViewProduct.description && (
                    <p className="text-sm leading-relaxed text-neutral-400">
                      {quickViewProduct.description}
                    </p>
                  )}

                  <span className="mt-1 bg-gradient-to-r from-amber-200 via-amber-400 to-amber-600 bg-clip-text text-2xl font-bold text-transparent">
                    ฿{formatThb(quickViewProduct.price)}
                  </span>

                  <button
                    type="button"
                    onClick={() => setModalStage("checkout")}
                    className="mt-2 flex items-center justify-center rounded-xl border border-amber-300/40 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 px-4 py-3 text-sm font-semibold text-black shadow-[0_0_15px_rgba(245,158,11,0.35)] transition-all duration-300 hover:from-amber-400 hover:via-amber-300 hover:to-amber-400 hover:shadow-[0_0_25px_rgba(245,158,11,0.6)]"
                  >
                    สั่งซื้อสินค้า
                  </button>

                  <a
                    href={mailtoHref(quickViewProduct)}
                    className="flex items-center justify-center rounded-xl border border-amber-500/30 bg-black/30 px-4 py-2.5 text-sm font-medium text-amber-300 transition-colors hover:border-amber-400 hover:bg-amber-500/10"
                  >
                    สนใจติดต่อ
                  </a>

                  <div className="mt-4 border-t border-amber-500/10 pt-4">
                    <h4 className="text-sm font-semibold text-white">รีวิวจากลูกค้า / เขียนรีวิว</h4>

                    {reviewSubmitted ? (
                      <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-300">
                        ขอบคุณสำหรับรีวิว! 🙏
                      </p>
                    ) : (
                      <div className="mt-3 flex flex-col gap-2.5">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setReviewRating(star)}
                              onMouseEnter={() => setReviewHoverRating(star)}
                              onMouseLeave={() => setReviewHoverRating(0)}
                              aria-label={`ให้คะแนน ${star} ดาว`}
                              className="text-amber-400"
                            >
                              <StarIcon
                                className="h-6 w-6"
                                filled={star <= (reviewHoverRating || reviewRating)}
                              />
                            </button>
                          ))}
                        </div>

                        <textarea
                          className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                          rows={3}
                          placeholder="เล่าประสบการณ์การใช้งาน/ความประทับใจของคุณ..."
                          value={reviewComment}
                          onChange={(e) => setReviewComment(e.target.value)}
                        />

                        <label className="flex cursor-pointer items-center gap-2 self-start rounded-lg border border-amber-500/25 bg-black/20 px-3 py-1.5 text-xs font-medium text-amber-300/90 transition-colors hover:border-amber-400 hover:bg-amber-500/10">
                          🖼️ {reviewImageFile ? "เปลี่ยนรูปภาพ" : "แนบรูปภาพ"}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => setReviewImage(e.target.files?.[0])}
                          />
                        </label>

                        {reviewImagePreviewUrl && (
                          <div className="relative h-20 w-20">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={reviewImagePreviewUrl}
                              alt="ตัวอย่างรูปที่แนบ"
                              className="h-full w-full rounded-lg object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => setReviewImage(null)}
                              aria-label="เอารูปนี้ออก"
                              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-700 text-[10px] text-white"
                            >
                              ×
                            </button>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => setReviewSubmitted(true)}
                          className="flex items-center justify-center rounded-xl border border-amber-500/30 bg-black/30 px-4 py-2.5 text-sm font-medium text-amber-300 transition-colors hover:border-amber-400 hover:bg-amber-500/10"
                        >
                          ส่งรีวิว
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {modalStage === "checkout" && (
                <div className="flex max-h-[85vh] flex-col gap-3 overflow-y-auto p-6">
                  <button
                    type="button"
                    onClick={() => setModalStage("view")}
                    className="mb-1 flex items-center gap-1 self-start text-xs font-medium text-neutral-500 hover:text-amber-400"
                  >
                    <ChevronLeftIcon className="h-3.5 w-3.5" />
                    กลับ
                  </button>

                  <h3 className="text-base font-bold text-white">สั่งซื้อ: {quickViewProduct.name}</h3>
                  <p className="text-sm text-amber-300">
                    ฿{formatThb(quickViewProduct.price)}
                  </p>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-400">
                      ชื่อ-นามสกุล
                    </label>
                    <input
                      className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                      placeholder="ชื่อผู้รับ"
                      value={checkoutForm.customerName}
                      onChange={(e) =>
                        setCheckoutForm((current) => ({ ...current, customerName: e.target.value }))
                      }
                      disabled={checkoutSubmitting}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-400">
                      เบอร์โทรศัพท์
                    </label>
                    <input
                      className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                      placeholder="08X-XXX-XXXX"
                      value={checkoutForm.customerPhone}
                      onChange={(e) =>
                        setCheckoutForm((current) => ({ ...current, customerPhone: e.target.value }))
                      }
                      disabled={checkoutSubmitting}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-400">
                      ที่อยู่จัดส่ง
                    </label>
                    <textarea
                      className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                      rows={3}
                      placeholder="บ้านเลขที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์"
                      value={checkoutForm.customerAddress}
                      onChange={(e) =>
                        setCheckoutForm((current) => ({ ...current, customerAddress: e.target.value }))
                      }
                      disabled={checkoutSubmitting}
                    />
                  </div>

                  <div>
                    <p className="mb-1.5 text-xs font-medium text-neutral-400">วิธีชำระเงิน</p>
                    <div className="flex flex-col gap-2">
                      {(
                        [
                          { value: "transfer", label: "โอนเงินผ่านบัญชีธนาคาร" },
                          { value: "cod", label: "เก็บเงินปลายทาง (COD)" },
                        ] as const
                      ).map((option) => (
                        <label
                          key={option.value}
                          className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                            checkoutForm.paymentMethod === option.value
                              ? "border-amber-400/70 bg-amber-500/10 text-amber-300"
                              : "border-neutral-700 text-neutral-300 hover:border-amber-500/30"
                          }`}
                        >
                          <input
                            type="radio"
                            name="paymentMethod"
                            value={option.value}
                            checked={checkoutForm.paymentMethod === option.value}
                            onChange={() =>
                              setCheckoutForm((current) => ({
                                ...current,
                                paymentMethod: option.value,
                              }))
                            }
                            disabled={checkoutSubmitting}
                            className="accent-amber-500"
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {checkoutError && <p className="text-sm text-red-400">{checkoutError}</p>}

                  <button
                    type="button"
                    onClick={submitCheckout}
                    disabled={checkoutSubmitting}
                    className="mt-1 flex items-center justify-center rounded-xl border border-amber-300/40 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 px-4 py-3 text-sm font-semibold text-black shadow-[0_0_15px_rgba(245,158,11,0.35)] transition-all duration-300 hover:from-amber-400 hover:via-amber-300 hover:to-amber-400 hover:shadow-[0_0_25px_rgba(245,158,11,0.6)] disabled:opacity-50"
                  >
                    {checkoutSubmitting ? "กำลังบันทึกคำสั่งซื้อ..." : "ยืนยันการสั่งซื้อ"}
                  </button>
                </div>
              )}

              {modalStage === "success" && (
                <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <span className="text-4xl">🎉</span>
                  <h3 className="text-lg font-bold text-white">สั่งซื้อสำเร็จ!</h3>
                  <p className="text-sm text-neutral-400">
                    ขอบคุณสำหรับการสั่งซื้อ ทีมงานจะติดต่อกลับเพื่อยืนยันคำสั่งซื้อของคุณเร็วๆ นี้
                  </p>
                  <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-300">
                    เลขที่คำสั่งซื้อ: {successOrderNumber}
                  </p>
                  <button
                    type="button"
                    onClick={closeQuickView}
                    className="mt-2 rounded-xl border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-300 hover:bg-neutral-800"
                  >
                    ปิดหน้าต่าง
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {reviewModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={closeReviewModal}
        >
          <div
            className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-neutral-950/95 shadow-[0_0_50px_rgba(245,158,11,0.25)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-amber-500/10 p-5">
              <h3 className="text-base font-bold text-white">รีวิวจากลูกค้า</h3>
              <button
                type="button"
                onClick={closeReviewModal}
                aria-label="ปิด"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-500/30 bg-black/60 text-neutral-400 transition-colors hover:border-amber-400 hover:text-amber-400"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex flex-col gap-3">
                {siteReviewsLoading ? (
                  <p className="py-6 text-center text-sm text-neutral-500">กำลังโหลดรีวิว...</p>
                ) : siteReviews.length === 0 ? (
                  <p className="py-6 text-center text-sm text-neutral-500">
                    ยังไม่มีรีวิว เป็นคนแรกที่รีวิวสิ!
                  </p>
                ) : (
                  siteReviews.map((review) => (
                    <div
                      key={review.id}
                      className="flex gap-3 rounded-xl border border-amber-500/15 bg-black/30 p-3"
                    >
                      {review.imageUrl ? (
                        <button
                          type="button"
                          onClick={() => setEnlargedImageUrl(review.imageUrl)}
                          className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-amber-500/20"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={review.imageUrl}
                            alt={`รูปแนบรีวิวของ ${review.customerName}`}
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-neutral-900 via-neutral-950 to-black text-2xl">
                          🙏
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-0.5 text-amber-400">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <StarIcon key={star} className="h-3.5 w-3.5" filled={star <= review.rating} />
                          ))}
                        </div>
                        {review.comment && (
                          <p className="mt-0.5 text-sm leading-snug text-neutral-300">{review.comment}</p>
                        )}
                        <p className="mt-1 text-xs font-medium text-amber-300/80">{review.customerName}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-5 border-t border-amber-500/10 pt-4">
                <h4 className="text-sm font-semibold text-white">เขียนรีวิว</h4>

                {siteReviewSubmitted ? (
                  <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-300">
                    ขอบคุณสำหรับรีวิว! 🙏
                  </p>
                ) : (
                  <div className="mt-3 flex flex-col gap-2.5">
                    <input
                      className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                      placeholder="ชื่อของคุณ"
                      value={siteReviewName}
                      onChange={(e) => setSiteReviewName(e.target.value)}
                      disabled={siteReviewSubmitting}
                    />

                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setSiteReviewRating(star)}
                          onMouseEnter={() => setSiteReviewHoverRating(star)}
                          onMouseLeave={() => setSiteReviewHoverRating(0)}
                          aria-label={`ให้คะแนน ${star} ดาว`}
                          className="text-amber-400"
                        >
                          <StarIcon
                            className="h-6 w-6"
                            filled={star <= (siteReviewHoverRating || siteReviewRating)}
                          />
                        </button>
                      ))}
                    </div>

                    <textarea
                      className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                      rows={3}
                      placeholder="เล่าประสบการณ์การใช้งาน/ความประทับใจของคุณ..."
                      value={siteReviewComment}
                      onChange={(e) => setSiteReviewComment(e.target.value)}
                      disabled={siteReviewSubmitting}
                    />

                    <label className="flex cursor-pointer items-center gap-2 self-start rounded-lg border border-amber-500/25 bg-black/30 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:border-amber-400 hover:bg-amber-500/10">
                      📷 {siteReviewImageFile ? "เปลี่ยนรูปภาพ" : "อัปโหลดรูปภาพ"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={siteReviewSubmitting}
                        onChange={(e) => setSiteReviewImage(e.target.files?.[0])}
                      />
                    </label>

                    {siteReviewImagePreviewUrl && (
                      <div className="relative h-20 w-20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={siteReviewImagePreviewUrl}
                          alt="ตัวอย่างรูปที่แนบ"
                          className="h-full w-full rounded-lg object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setSiteReviewImage(null)}
                          aria-label="เอารูปนี้ออก"
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-700 text-[10px] text-white"
                        >
                          ×
                        </button>
                      </div>
                    )}

                    {siteReviewError && <p className="text-sm text-red-400">{siteReviewError}</p>}

                    <button
                      type="button"
                      onClick={submitSiteReview}
                      disabled={siteReviewSubmitting}
                      className="flex items-center justify-center rounded-xl border border-amber-300/40 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 px-4 py-2.5 text-sm font-semibold text-black shadow-[0_0_15px_rgba(245,158,11,0.35)] transition-all duration-300 hover:from-amber-400 hover:via-amber-300 hover:to-amber-400 hover:shadow-[0_0_25px_rgba(245,158,11,0.6)] disabled:opacity-50"
                    >
                      {siteReviewSubmitting ? "กำลังส่งรีวิว..." : "ส่งรีวิว"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {enlargedImageUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-6"
          onClick={() => setEnlargedImageUrl(null)}
        >
          <button
            type="button"
            onClick={() => setEnlargedImageUrl(null)}
            aria-label="ปิด"
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full border border-amber-500/30 bg-black/60 text-neutral-400 hover:border-amber-400 hover:text-amber-400"
          >
            <XIcon className="h-4 w-4" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enlargedImageUrl}
            alt="รูปแนบรีวิวขนาดใหญ่"
            className="max-h-[85vh] max-w-full rounded-xl object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </main>
  );
}
