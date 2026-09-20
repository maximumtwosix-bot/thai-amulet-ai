"use client";

import { useEffect, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import BackLink from "@/components/BackLink";
import { StarIcon, UploadCloudIcon, XIcon } from "@/components/icons";

// STEP 104 — admin review management. Reads/writes the exact same public GET/POST /api/reviews
// endpoint the storefront's Review Modal (src/app/shop/page.tsx) uses — there is no separate
// "admin-only" reviews API; this page is what's session-gated (src/proxy.ts), not the data.
type Review = {
  id: number;
  customerName: string;
  rating: number;
  comment: string | null;
  imageUrl: string | null;
  createdAt: string;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  async function loadReviews() {
    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/reviews", { cache: "no-store" });
      if (!response.ok) throw new Error("ไม่สามารถโหลดรีวิวได้");
      const data = await response.json();
      setReviews(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError("ไม่สามารถโหลดรีวิวได้");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReviews();
  }, []);

  function setImage(file: File | undefined | null) {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    if (!file) {
      setImageFile(null);
      setImagePreviewUrl(null);
      return;
    }
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  }

  function closeForm() {
    setShowForm(false);
    setCustomerName("");
    setRating(0);
    setHoverRating(0);
    setComment("");
    setImage(null);
    setFormError("");
  }

  async function addReview() {
    if (!customerName.trim()) {
      setFormError("กรุณาระบุชื่อผู้รีวิว");
      return;
    }
    if (rating < 1) {
      setFormError("กรุณาให้คะแนน 1-5 ดาว");
      return;
    }

    try {
      setSaving(true);
      setFormError("");

      const formData = new FormData();
      formData.append("customerName", customerName);
      formData.append("rating", String(rating));
      formData.append("comment", comment);
      if (imageFile) formData.append("image", imageFile);

      const response = await fetch("/api/reviews", { method: "POST", body: formData });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "ไม่สามารถเพิ่มรีวิวได้");
      }

      setReviews((current) => [data, ...current]);
      closeForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "ไม่สามารถเพิ่มรีวิวได้");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-black bg-[linear-gradient(to_right,#f59e0b08_1px,transparent_1px),linear-gradient(to_bottom,#f59e0b08_1px,transparent_1px)] bg-[size:24px_24px] p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">⭐ จัดการรีวิว</h1>
            <p className="mt-1 text-sm text-neutral-400">
              รีวิวที่ลูกค้าส่งจากหน้าร้านค้า และรีวิวที่แอดมินเพิ่มเอง แสดงผลรวมกันบนหน้าร้านค้า
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <BackLink href="/" label="กลับหน้าแรก" />
            <button
              onClick={() => setShowForm(true)}
              className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-amber-400"
            >
              + เพิ่มรีวิว
            </button>
            <LogoutButton />
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg shadow-[0_0_15px_rgba(245,158,11,0.05)]">
          {loading ? (
            <div className="p-10 text-center text-sm text-neutral-500">กำลังโหลดรีวิว...</div>
          ) : reviews.length === 0 ? (
            <div className="p-10 text-center text-sm text-neutral-500">
              <p className="text-lg">ยังไม่มีรีวิว</p>
              <p className="mt-2 text-sm">กดปุ่ม &quot;+ เพิ่มรีวิว&quot; เพื่อเริ่มเพิ่มรีวิว</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-black/40 text-neutral-500">
                  <tr>
                    <th className="p-4">รูปภาพ</th>
                    <th className="p-4">ผู้รีวิว</th>
                    <th className="p-4">คะแนน</th>
                    <th className="p-4">ข้อความ</th>
                    <th className="p-4">วันที่</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((review) => (
                    <tr key={review.id} className="border-t border-neutral-800 hover:bg-neutral-800/60">
                      <td className="p-4">
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-amber-500/20 bg-neutral-950/60">
                          {review.imageUrl ? (
                            <a href={review.imageUrl} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={review.imageUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </a>
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-neutral-600">
                              ไม่มีรูป
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4 font-medium text-white">{review.customerName}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-0.5 text-amber-400">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <StarIcon key={star} className="h-4 w-4" filled={star <= review.rating} />
                          ))}
                        </div>
                      </td>
                      <td className="max-w-xs p-4 text-neutral-300">{review.comment || "-"}</td>
                      <td className="p-4 text-neutral-500">{formatDate(review.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {showForm && (
        <div
          role="presentation"
          onClick={closeForm}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="เพิ่มรีวิว"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-amber-500/20 bg-neutral-950/95 backdrop-blur-lg shadow-[0_0_40px_rgba(245,158,11,0.15)] p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">เพิ่มรีวิว</h2>
              <button
                type="button"
                onClick={closeForm}
                aria-label="ปิด"
                className="rounded-xl p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-white"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <input
                className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                placeholder="ชื่อผู้รีวิว"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />

              <div>
                <p className="mb-1.5 text-xs font-medium text-neutral-400">คะแนน</p>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      aria-label={`ให้คะแนน ${star} ดาว`}
                      className="text-amber-400"
                    >
                      <StarIcon className="h-6 w-6" filled={star <= (hoverRating || rating)} />
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                rows={3}
                placeholder="ข้อความรีวิว"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />

              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  setImage(e.dataTransfer.files?.[0]);
                }}
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-amber-500/40 bg-black/30 p-6 text-center transition-colors hover:border-amber-500 hover:bg-amber-500/5"
              >
                {imagePreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imagePreviewUrl}
                    alt="ตัวอย่างรูปรีวิว"
                    className="h-32 w-32 rounded-xl object-cover"
                  />
                ) : (
                  <>
                    <UploadCloudIcon className="h-8 w-8 text-amber-500" />
                    <p className="text-sm font-medium text-neutral-300">
                      📷 แนบรูปภาพ (แชท/พัสดุ/สินค้าที่ได้รับ) — ไม่บังคับ
                    </p>
                    <p className="text-xs text-neutral-500">รองรับไฟล์รูปภาพ (JPG, PNG)</p>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setImage(e.target.files?.[0])}
                />
                {imagePreviewUrl && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setImage(null);
                    }}
                    className="text-xs font-medium text-red-400 hover:underline"
                  >
                    เอารูปนี้ออก
                  </button>
                )}
              </label>

              {formError && <p className="text-sm text-red-400">{formError}</p>}

              <div className="mt-1 flex gap-3">
                <button
                  onClick={addReview}
                  disabled={saving}
                  className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
                >
                  {saving ? "กำลังบันทึก..." : "บันทึกรีวิว"}
                </button>
                <button
                  onClick={closeForm}
                  disabled={saving}
                  className="rounded-xl border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
