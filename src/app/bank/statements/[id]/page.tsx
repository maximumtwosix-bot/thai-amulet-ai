"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

// STEP C.5 — Client Component; types copied field-for-field from the ACTUAL current API responses
// (src/app/api/bank-statements/[id]/route.ts, src/app/api/bank-statements/[id]/confirm/route.ts),
// same convention as src/app/bank/page.tsx / src/app/bank/statements/page.tsx.

const statusLabels: Record<string, string> = {
  UPLOADED: "กำลังอัปโหลด",
  VALIDATING: "กำลังตรวจสอบ",
  PREVIEW_READY: "รอตรวจสอบ",
  IMPORTING: "กำลังนำเข้า",
  IMPORTED: "นำเข้าแล้ว",
  FAILED: "นำเข้าไม่สำเร็จ",
  CANCELLED: "ยกเลิกแล้ว",
};
const statusBadgeClass: Record<string, string> = {
  UPLOADED: "bg-slate-100 text-slate-600",
  VALIDATING: "bg-slate-100 text-slate-600",
  PREVIEW_READY: "bg-amber-50 text-amber-700",
  IMPORTING: "bg-slate-100 text-slate-600",
  IMPORTED: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-600",
};
function statusLabel(status: string): string {
  return statusLabels[status] ?? status;
}
function statusBadge(status: string): string {
  return statusBadgeClass[status] ?? "bg-slate-100 text-slate-600";
}

// Exact message strings the backend uses to distinguish the two duplicate reasons (verified from
// src/app/api/bank-statements/route.ts's classifyDuplicates() / [id]/confirm/route.ts) — the ONLY
// reliable way to tell them apart client-side, since a row's mere presence of a bankTransactionId
// does not by itself guarantee it collided on that field specifically.
const BANK_ID_DUPLICATE_MESSAGE = "พบเลขอ้างอิงธุรกรรมนี้ในระบบแล้ว (ธนาคารระบุ ID ซ้ำ)";

type RowCategory = "NEW" | "INVALID" | "WARNING" | "INFORMATIONAL" | "DUPLICATE_CANDIDATE" | "IMPORTED";

const categoryLabels: Record<RowCategory, string> = {
  NEW: "ใช้งานได้",
  WARNING: "คำเตือน",
  INVALID: "ผิดพลาด",
  INFORMATIONAL: "ข้อมูลเสริม",
  DUPLICATE_CANDIDATE: "รายการซ้ำ",
  IMPORTED: "นำเข้าแล้ว",
};
const categoryBadgeClass: Record<RowCategory, string> = {
  NEW: "bg-emerald-50 text-emerald-700",
  WARNING: "bg-amber-50 text-amber-700",
  INVALID: "bg-red-50 text-red-700",
  INFORMATIONAL: "bg-slate-100 text-slate-600",
  DUPLICATE_CANDIDATE: "bg-purple-50 text-purple-700",
  IMPORTED: "bg-emerald-50 text-emerald-700",
};

// Preview-shape row (PREVIEW_READY / FAILED-fatalError) — matches ParsedRowResult from
// src/lib/bankStatementCsv.ts as returned by GET /api/bank-statements/[id].
type PreviewRow = {
  rowNumber: number;
  category: string;
  message?: string;
  canonical?: {
    transactionDate: string;
    description: string | null;
    debit: number | null;
    credit: number | null;
    amount: number;
    balance: number | null;
    bankTransactionId: string | null;
    reference: string | null;
    duplicateFingerprint: string;
  };
  raw?: Record<string, string>;
};

// Imported-shape row — matches GET /[id]'s IMPORTED-status row mapping exactly.
type ImportedRow = {
  rowNumber: number | null;
  date: string;
  description: string | null;
  debit: number | null;
  credit: number | null;
  amount: number;
  balance: number | null;
  bankTransactionId: string | null;
  category: "IMPORTED";
};

type StatementDetail = {
  id: number;
  bankAccountId: number;
  bankName: string | null;
  accountName: string | null;
  accountNumberMasked: string | null;
  sourceFileName: string;
  status: string;
  statementPeriodFrom: string | null;
  statementPeriodTo: string | null;
  errorSummary: string | null;
  importedAt: string | null;
  createdAt: string;
  updatedAt: string;
  mapping: Record<string, unknown> | null;
  summary: { total: number | null; valid: number | null; invalid: number | null; duplicate: number | null };
  pagination: { page: number; pageSize: number; total: number; hasNext: boolean; hasPrevious: boolean };
  rows: (PreviewRow | ImportedRow)[];
  fatalError?: { code: string; message: string };
};

type ApiResponse<T = unknown> = {
  success?: boolean;
  data?: T;
  error?: string;
};

function friendlyErrorMessage(status: number, data: ApiResponse<unknown> | null): string {
  if (status === 401) return "เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่";
  if (status === 500) return "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง";
  if (typeof data?.error === "string" && data.error.trim()) return data.error;
  return "เกิดข้อผิดพลาดบางอย่าง กรุณาลองใหม่อีกครั้ง";
}

function isPreviewRow(row: PreviewRow | ImportedRow): row is PreviewRow {
  return !("date" in row);
}

function formatSatang(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const baht = Math.floor(abs / 100);
  const satang = String(abs % 100).padStart(2, "0");
  return `${sign}${baht.toLocaleString("th-TH")}.${satang}`;
}

export default function BankStatementDetailPage() {
  const params = useParams();
  const statementId = Number(params?.id);

  const [statement, setStatement] = useState<StatementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(100);

  const [overrideRowNumbers, setOverrideRowNumbers] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [confirmResult, setConfirmResult] = useState<{ imported: number; skippedDuplicates: number } | null>(
    null
  );

  const loadStatement = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/bank-statements/${statementId}?page=${targetPage}&pageSize=${pageSize}`,
          { cache: "no-store" }
        );

        let data: ApiResponse<StatementDetail> | null = null;
        try {
          data = await response.json();
        } catch {
          // handled below
        }

        if (!response.ok || !data?.success) {
          throw new Error(friendlyErrorMessage(response.status, data));
        }

        setStatement(data.data ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "ไม่สามารถโหลดข้อมูล Statement ได้");
      } finally {
        setLoading(false);
      }
    },
    [statementId, pageSize]
  );

  // Same established pattern as src/app/bank/statements/page.tsx.
  useEffect(() => {
    if (Number.isInteger(statementId) && statementId > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadStatement(page);
    } else {
      setLoading(false);
      setError("Statement ID ไม่ถูกต้อง");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statementId, page]);

  function toggleOverride(rowNumber: number) {
    setOverrideRowNumbers((current) => {
      const next = new Set(current);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }

  async function submitConfirm() {
    setConfirmError("");
    setConfirming(true);

    try {
      // STEP C.5/C.6 — body carries ONLY the user's review decision; never a mapping. The server
      // exclusively uses the mapping it already persisted at upload time.
      const response = await fetch(`/api/bank-statements/${statementId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrideDuplicateRowNumbers: Array.from(overrideRowNumbers) }),
      });

      let data: ApiResponse<{ statementId: number; status: string; imported: number; skippedDuplicates: number }> | null =
        null;
      try {
        data = await response.json();
      } catch {
        // handled below
      }

      if (!response.ok || !data?.success) {
        throw new Error(friendlyErrorMessage(response.status, data));
      }

      if (data.data) {
        setConfirmResult({ imported: data.data.imported, skippedDuplicates: data.data.skippedDuplicates });
      }
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "ไม่สามารถยืนยันการนำเข้าได้");
    } finally {
      setConfirming(false);
      // Always resync with server truth after a confirm attempt, success or failure — never trust
      // local state alone (STEP C.5 §17: use server response, reload statement state on conflict).
      await loadStatement(page);
    }
  }

  const overridableDuplicateCount =
    statement?.rows.filter(
      (r) => isPreviewRow(r) && r.category === "DUPLICATE_CANDIDATE" && r.message !== BANK_ID_DUPLICATE_MESSAGE
    ).length ?? 0;

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">📄 รายละเอียด Bank Statement</h1>
            {statement && (
              <p className="mt-1 text-sm text-slate-500">
                {statement.bankName} - {statement.accountName} ({statement.accountNumberMasked})
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/bank/statements"
              className="w-fit rounded-xl border bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              ← กลับรายการ Statement
            </Link>
            <LogoutButton />
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
            <button
              type="button"
              onClick={() => loadStatement(page)}
              className="ml-3 font-medium underline hover:no-underline"
            >
              ลองใหม่
            </button>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
            กำลังโหลดข้อมูล Statement...
          </div>
        ) : !statement ? null : (
          <>
            {/* ===== Metadata card ===== */}
            <section className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{statement.sourceFileName}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    ช่วงวันที่:{" "}
                    {statement.statementPeriodFrom && statement.statementPeriodTo
                      ? `${statement.statementPeriodFrom} - ${statement.statementPeriodTo}`
                      : "-"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium ${statusBadge(statement.status)}`}
                >
                  {statusLabel(statement.status)}
                </span>
              </div>

              {statement.status === "FAILED" && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <p className="font-medium">นำเข้าไม่สำเร็จ: {statement.errorSummary || "เกิดข้อผิดพลาด"}</p>
                  <p className="mt-2">
                    กรุณาแก้ไขไฟล์ CSV หรือการตั้งค่าคอลัมน์ (Mapping) แล้วอัปโหลดใหม่
                  </p>
                  <Link
                    href="/bank/statements"
                    className="mt-3 inline-block rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                  >
                    อัปโหลดใหม่
                  </Link>
                </div>
              )}

              {/* Summary cards */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border p-4">
                  <p className="text-xs text-slate-500">ทั้งหมด</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{statement.summary.total ?? "-"}</p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-xs text-slate-500">ใช้งานได้ / รายการใหม่</p>
                  <p className="mt-1 text-xl font-bold text-emerald-700">{statement.summary.valid ?? "-"}</p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-xs text-slate-500">รายการซ้ำ</p>
                  <p className="mt-1 text-xl font-bold text-purple-700">{statement.summary.duplicate ?? "-"}</p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-xs text-slate-500">รายการผิดพลาด</p>
                  <p className="mt-1 text-xl font-bold text-red-700">{statement.summary.invalid ?? "-"}</p>
                </div>
              </div>
            </section>

            {/* ===== Confirm section (PREVIEW_READY only) ===== */}
            {statement.status === "PREVIEW_READY" && !confirmResult && (
              <section className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">ยืนยันการนำเข้า</h2>
                <div className="mt-3 space-y-1 text-sm text-slate-700">
                  <p>
                    ยืนยันนำเข้ารายการใหม่ {statement.summary.valid ?? 0} รายการ
                    {overrideRowNumbers.size > 0 && ` + รายการซ้ำที่เลือกนำเข้า ${overrideRowNumbers.size} รายการ`}
                  </p>
                  {(statement.summary.duplicate ?? 0) > 0 && (
                    <p className="text-slate-500">
                      รายการซ้ำ {(statement.summary.duplicate ?? 0) - overrideRowNumbers.size} รายการจะไม่ถูกนำเข้า
                    </p>
                  )}
                  {(statement.summary.invalid ?? 0) > 0 && (
                    <p className="text-slate-500">
                      รายการผิดพลาด {statement.summary.invalid} รายการจะไม่ถูกนำเข้า
                    </p>
                  )}
                </div>

                {confirmError && (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {confirmError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={submitConfirm}
                  disabled={confirming}
                  className="mt-4 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {confirming ? "กำลังยืนยันการนำเข้า..." : "✅ ยืนยันนำเข้า"}
                </button>
              </section>
            )}

            {confirmResult && (
              <section className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-emerald-900">นำเข้าสำเร็จ</h2>
                <p className="mt-2 text-sm text-emerald-800">
                  นำเข้าแล้ว {confirmResult.imported} รายการ — ข้ามรายการซ้ำ {confirmResult.skippedDuplicates}{" "}
                  รายการ
                </p>
              </section>
            )}

            {/* ===== Row review table ===== */}
            <section className="rounded-2xl border bg-white shadow-sm">
              <div className="flex items-center justify-between border-b p-5">
                <h2 className="text-lg font-semibold text-slate-900">
                  รายการธุรกรรม {statement.pagination.total > 0 && `(${statement.pagination.total} รายการ)`}
                </h2>
                {statement.status === "PREVIEW_READY" && overridableDuplicateCount > 0 && (
                  <p className="text-xs text-slate-500">
                    เลือก &quot;นำเข้ารายการนี้ด้วย&quot; สำหรับรายการซ้ำที่มั่นใจว่าเป็นรายการที่แตกต่างกันจริง
                  </p>
                )}
              </div>

              {statement.rows.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  {statement.fatalError?.message || "ไม่มีรายการให้แสดง"}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1000px] text-left text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="p-3">#</th>
                          <th className="p-3">วันที่</th>
                          <th className="p-3">รายละเอียด</th>
                          <th className="p-3">เดบิต</th>
                          <th className="p-3">เครดิต</th>
                          <th className="p-3">จำนวนเงิน</th>
                          <th className="p-3">ยอดคงเหลือ</th>
                          <th className="p-3">รหัสธุรกรรมธนาคาร</th>
                          <th className="p-3">สถานะ</th>
                          <th className="p-3">เหตุผล</th>
                          {statement.status === "PREVIEW_READY" && <th className="p-3">นำเข้ารายการนี้ด้วย</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {statement.rows.map((row, idx) => {
                          const preview = isPreviewRow(row) ? row : null;
                          const category = (preview?.category ?? "IMPORTED") as RowCategory;
                          const canonical = preview?.canonical;
                          const imported = !preview ? (row as ImportedRow) : null;

                          const date = canonical?.transactionDate ?? imported?.date ?? null;
                          const description =
                            canonical?.description ??
                            imported?.description ??
                            (preview?.raw
                              ? Object.values(preview.raw).filter(Boolean).join(" · ")
                              : null);
                          const debit = canonical?.debit ?? imported?.debit ?? null;
                          const credit = canonical?.credit ?? imported?.credit ?? null;
                          const amount = canonical?.amount ?? imported?.amount ?? null;
                          const balance = canonical?.balance ?? imported?.balance ?? null;
                          const bankTransactionId =
                            canonical?.bankTransactionId ?? imported?.bankTransactionId ?? null;
                          const rowNumber = preview?.rowNumber ?? imported?.rowNumber ?? idx;

                          const isBankIdDuplicate =
                            category === "DUPLICATE_CANDIDATE" && preview?.message === BANK_ID_DUPLICATE_MESSAGE;
                          const isOverridableDuplicate =
                            category === "DUPLICATE_CANDIDATE" && !isBankIdDuplicate;

                          return (
                            <tr key={`${rowNumber}-${idx}`} className="border-t hover:bg-slate-50">
                              <td className="p-3 text-slate-500">{rowNumber}</td>
                              <td className="p-3 whitespace-nowrap text-slate-700">{date ?? "-"}</td>
                              <td className="p-3 max-w-xs truncate text-slate-700" title={description ?? ""}>
                                {description || "-"}
                              </td>
                              <td className="p-3 text-slate-700">{formatSatang(debit)}</td>
                              <td className="p-3 text-slate-700">{formatSatang(credit)}</td>
                              <td className="p-3 font-medium text-slate-900">{formatSatang(amount)}</td>
                              <td className="p-3 text-slate-500">{formatSatang(balance)}</td>
                              <td className="p-3 text-slate-500">{bankTransactionId || "-"}</td>
                              <td className="p-3">
                                <span
                                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${categoryBadgeClass[category] ?? "bg-slate-100 text-slate-600"}`}
                                >
                                  {categoryLabels[category] ?? category}
                                </span>
                              </td>
                              <td className="p-3 max-w-xs text-xs text-slate-500">
                                {preview?.message || "-"}
                              </td>
                              {statement.status === "PREVIEW_READY" && (
                                <td className="p-3">
                                  {isOverridableDuplicate && (
                                    <label className="flex items-center gap-2 text-xs text-slate-600">
                                      <input
                                        type="checkbox"
                                        checked={overrideRowNumbers.has(rowNumber)}
                                        onChange={() => toggleOverride(rowNumber)}
                                      />
                                      นำเข้ารายการนี้ด้วย
                                    </label>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* ===== Pagination ===== */}
                  <div className="flex items-center justify-between border-t p-4">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={!statement.pagination.hasPrevious || loading}
                      className="rounded-xl border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      ← ก่อนหน้า
                    </button>
                    <p className="text-xs text-slate-500">
                      หน้า {statement.pagination.page} — แสดง {statement.rows.length} จาก{" "}
                      {statement.pagination.total} รายการ
                    </p>
                    <button
                      type="button"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={!statement.pagination.hasNext || loading}
                      className="rounded-xl border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      ถัดไป →
                    </button>
                  </div>
                </>
              )}
            </section>

            {statement.status === "IMPORTED" && (
              <p className="mt-4 text-center text-xs text-slate-400">
                ข้อมูลชุดนี้เป็นหลักฐานต้นฉบับจากธนาคาร (source evidence) ไม่สามารถแก้ไขได้
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
