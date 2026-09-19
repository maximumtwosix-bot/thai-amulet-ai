"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import BackLink from "@/components/BackLink";

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
  UPLOADED: "bg-neutral-800 text-neutral-400",
  VALIDATING: "bg-neutral-800 text-neutral-400",
  PREVIEW_READY: "bg-amber-950/40 text-amber-400",
  IMPORTING: "bg-neutral-800 text-neutral-400",
  IMPORTED: "bg-emerald-950/40 text-emerald-400",
  FAILED: "bg-red-950/40 text-red-400",
  CANCELLED: "bg-neutral-800 text-neutral-400",
};
export function statusLabel(status: string): string {
  return statusLabels[status] ?? status;
}
export function statusBadge(status: string): string {
  return statusBadgeClass[status] ?? "bg-neutral-800 text-neutral-400";
}

// Exact message strings the backend uses to distinguish the two duplicate reasons (verified from
// src/app/api/bank-statements/route.ts's classifyDuplicates() / [id]/confirm/route.ts) — the ONLY
// reliable way to tell them apart client-side, since a row's mere presence of a bankTransactionId
// does not by itself guarantee it collided on that field specifically.
export const BANK_ID_DUPLICATE_MESSAGE = "พบเลขอ้างอิงธุรกรรมนี้ในระบบแล้ว (ธนาคารระบุ ID ซ้ำ)";

type RowCategory = "NEW" | "INVALID" | "WARNING" | "INFORMATIONAL" | "DUPLICATE_CANDIDATE" | "IMPORTED";

export const categoryLabels: Record<RowCategory, string> = {
  NEW: "ใช้งานได้",
  WARNING: "คำเตือน",
  INVALID: "ผิดพลาด",
  INFORMATIONAL: "ข้อมูลเสริม",
  DUPLICATE_CANDIDATE: "รายการซ้ำ",
  IMPORTED: "นำเข้าแล้ว",
};
export const categoryBadgeClass: Record<RowCategory, string> = {
  NEW: "bg-emerald-950/40 text-emerald-400",
  WARNING: "bg-amber-950/40 text-amber-400",
  INVALID: "bg-red-950/40 text-red-400",
  INFORMATIONAL: "bg-neutral-800 text-neutral-400",
  DUPLICATE_CANDIDATE: "bg-purple-950/40 text-purple-400",
  IMPORTED: "bg-emerald-950/40 text-emerald-400",
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
  // STEP E.7 — matches GET /api/bank-statements/[id]'s sourceFileType field, added in STEP E.6.1.
  // Read-only display value from trusted server/DB state — this page never lets the client change
  // or spoof it.
  sourceFileType?: "CSV" | "PDF";
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
  // STEP E.7 — matches GET's own field (STEP E.6.1): true when this is a password-protected PDF
  // whose row-level detail cannot be reconstructed by a read-only request (which never has a
  // password) — row-level detail becomes available only via Confirm, which does accept one.
  pdfRequiresPasswordForPreview?: boolean;
};

// STEP E.7 — must name a real entry in the server's trusted registry
// (src/lib/bankStatementPdfLayouts.ts, STEP E.6). Duplicated here as a plain string constant for
// the same reason src/app/bank/statements/page.tsx duplicates FIXED_PDF_PREVIEW_LAYOUT rather than
// importing src/lib/* into a Client Component (transitively pulls in node:crypto via
// bankStatementCsv.ts). This is NEVER exposed as a user-editable field anywhere in this file — the
// user does not choose a layout; there is exactly one trusted option today.
export const TRUSTED_PDF_LAYOUT_ID = "GENERIC_DATE_DESC_DEBIT_CREDIT_BALANCE_V1";

// STEP E.7 — extracted as a standalone, exported, pure function (no closure over component state)
// specifically so this security-critical request shape can be unit-tested directly (this project
// has no DOM-testing framework and STEP E.7 forbids adding one — see
// src/app/bank/statements/[id]/__tests__/page.security.test.ts). Behavior is byte-for-byte what
// submitConfirm() below already computed inline before this extraction — never guesses/invents a
// field; `layoutId`/`password` are added ONLY for a PDF statement, exactly as before.
export function buildConfirmRequestBody(
  sourceFileType: "CSV" | "PDF" | undefined,
  overrideRowNumbers: Set<number>,
  pdfPassword: string
): Record<string, unknown> {
  const body: Record<string, unknown> = { overrideDuplicateRowNumbers: Array.from(overrideRowNumbers) };

  if (sourceFileType === "PDF") {
    body.layoutId = TRUSTED_PDF_LAYOUT_ID;
    if (pdfPassword) body.password = pdfPassword;
  }

  return body;
}

type ApiResponse<T = unknown> = {
  success?: boolean;
  data?: T;
  error?: string;
};

export function friendlyErrorMessage(status: number, data: ApiResponse<unknown> | null): string {
  if (status === 401) return "เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่";
  if (status === 500) return "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง";
  if (typeof data?.error === "string" && data.error.trim()) return data.error;
  return "เกิดข้อผิดพลาดบางอย่าง กรุณาลองใหม่อีกครั้ง";
}

export function isPreviewRow(row: PreviewRow | ImportedRow): row is PreviewRow {
  return !("date" in row);
}

export function formatSatang(value: number | null | undefined): string {
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
  // STEP E.7 — PDF confirm password. Component-memory only: never written to localStorage/
  // sessionStorage/a cookie/a URL, never logged, never sent anywhere except as this one JSON field
  // on submit (POST .../confirm). This is a REQUIRED re-entry, not a re-use of whatever the upload
  // page's own password field held — that value never leaves the upload page's own component state
  // and this page never receives it (docs/BANK_STATEMENT_PDF_IMPORT_POLICY.md §3 / STEP E.6 —
  // password is never persisted across the upload -> confirm boundary).
  const [pdfPassword, setPdfPassword] = useState("");
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
      // STEP C.5/C.6 — CSV body carries ONLY the user's review decision; never a mapping. The
      // server exclusively uses the mapping it already persisted at upload time.
      //
      // STEP E.7 — PDF body ADDITIONALLY carries `layoutId` (a fixed, non-user-editable constant —
      // never a regex/layout the user authored; the server's own trusted registry,
      // src/lib/bankStatementPdfLayouts.ts, is the sole authority regardless of what this value is,
      // per STEP E.6) and `password`, read fresh from this page's own component-memory state (never
      // the upload page's password — that value never reaches this page at all). See
      // buildConfirmRequestBody()'s own comment for why this is a standalone, unit-tested function.
      const body = buildConfirmRequestBody(statement?.sourceFileType, overrideRowNumbers, pdfPassword);

      const response = await fetch(`/api/bank-statements/${statementId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      let data: ApiResponse<{
        statementId: number;
        status: string;
        imported?: number;
        skippedDuplicates?: number;
        fatalError?: { code: string; message: string };
      }> | null = null;
      try {
        data = await response.json();
      } catch {
        // handled below
      }

      if (!response.ok || !data?.success) {
        throw new Error(friendlyErrorMessage(response.status, data));
      }

      // STEP E.7 fix — confirm has always been able to return `{success:true, data:{status:
      // "FAILED", fatalError}}` at HTTP 200 (STEP C.4's own defensive "re-derivation itself
      // discovered a fatal error" path) — this was never actually checked here before, only
      // theoretical for CSV (should not happen in practice, per that path's own comment), but very
      // real and common for PDF (an incorrect password is exactly this shape). Checked BEFORE
      // treating anything as a successful import, mirroring src/app/bank/statements/page.tsx's own
      // upload-response handling.
      if (data.data?.status === "FAILED") {
        setConfirmError(data.data.fatalError?.message || "ไม่สามารถยืนยันการนำเข้าได้");
        return;
      }

      if (data.data) {
        setConfirmResult({
          imported: data.data.imported ?? 0,
          skippedDuplicates: data.data.skippedDuplicates ?? 0,
        });
      }
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "ไม่สามารถยืนยันการนำเข้าได้");
    } finally {
      setConfirming(false);
      // STEP E.7 — cleared after every confirm attempt without exception: FAILED is a terminal
      // status (src/lib/bankStatements.ts's ALLOWED_STATUS_TRANSITIONS — no transition out of it),
      // so there is never a legitimate "fix the password and retry on this same statement" flow —
      // a wrong password, a corrupted file, or any other confirm failure all equally mean the only
      // way forward is re-uploading as a brand-new statement (a different page, with its own fresh
      // password field), so retaining this value here would serve no purpose.
      setPdfPassword("");
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
    <main className="min-h-screen bg-black bg-[linear-gradient(to_right,#f59e0b08_1px,transparent_1px),linear-gradient(to_bottom,#f59e0b08_1px,transparent_1px)] bg-[size:24px_24px] p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">📄 รายละเอียด Bank Statement</h1>
            {statement && (
              <p className="mt-1 text-sm text-neutral-500">
                {statement.bankName} - {statement.accountName} ({statement.accountNumberMasked})
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <BackLink href="/bank/statements" label="กลับรายการ Statement" />
            <LogoutButton />
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-400">
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
          <div className="rounded-2xl border bg-neutral-900 p-10 text-center text-sm text-neutral-500 shadow-sm">
            กำลังโหลดข้อมูล Statement...
          </div>
        ) : !statement ? null : (
          <>
            {/* ===== Metadata card ===== */}
            <section className="mb-6 rounded-2xl border bg-neutral-900 p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-white">{statement.sourceFileName}</h2>
                    {/* STEP E.7 — file type shown explicitly, read from trusted server state. */}
                    {statement.sourceFileType && (
                      <span className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs font-medium text-neutral-400">
                        {statement.sourceFileType}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-neutral-500">
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
                <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-400">
                  <p className="font-medium">นำเข้าไม่สำเร็จ: {statement.errorSummary || "เกิดข้อผิดพลาด"}</p>
                  <p className="mt-2">
                    {statement.sourceFileType === "PDF"
                      ? "กรุณาตรวจสอบไฟล์ PDF หรือรหัสผ่าน แล้วอัปโหลดใหม่"
                      : "กรุณาแก้ไขไฟล์ CSV หรือการตั้งค่าคอลัมน์ (Mapping) แล้วอัปโหลดใหม่"}
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
                  <p className="text-xs text-neutral-500">ทั้งหมด</p>
                  <p className="mt-1 text-xl font-bold text-white">{statement.summary.total ?? "-"}</p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-xs text-neutral-500">ใช้งานได้ / รายการใหม่</p>
                  <p className="mt-1 text-xl font-bold text-emerald-400">{statement.summary.valid ?? "-"}</p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-xs text-neutral-500">รายการซ้ำ</p>
                  <p className="mt-1 text-xl font-bold text-purple-400">{statement.summary.duplicate ?? "-"}</p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-xs text-neutral-500">รายการผิดพลาด</p>
                  <p className="mt-1 text-xl font-bold text-red-400">{statement.summary.invalid ?? "-"}</p>
                </div>
              </div>
            </section>

            {/* ===== Confirm section (PREVIEW_READY only) ===== */}
            {statement.status === "PREVIEW_READY" && !confirmResult && (
              <section className="mb-6 rounded-2xl border bg-neutral-900 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-white">ยืนยันการนำเข้า</h2>
                <div className="mt-3 space-y-1 text-sm text-neutral-300">
                  <p>
                    ยืนยันนำเข้ารายการใหม่ {statement.summary.valid ?? 0} รายการ
                    {overrideRowNumbers.size > 0 && ` + รายการซ้ำที่เลือกนำเข้า ${overrideRowNumbers.size} รายการ`}
                  </p>
                  {(statement.summary.duplicate ?? 0) > 0 && (
                    <p className="text-neutral-500">
                      รายการซ้ำ {(statement.summary.duplicate ?? 0) - overrideRowNumbers.size} รายการจะไม่ถูกนำเข้า
                    </p>
                  )}
                  {(statement.summary.invalid ?? 0) > 0 && (
                    <p className="text-neutral-500">
                      รายการผิดพลาด {statement.summary.invalid} รายการจะไม่ถูกนำเข้า
                    </p>
                  )}
                </div>

                {/* ===== STEP E.7 — PDF password re-entry. Never reused from the upload page's own
                    password state (that value never reaches this page) — the user must type it
                    again here, per docs/BANK_STATEMENT_PDF_IMPORT_POLICY.md §3 / STEP E.6's
                    "password is never persisted across the upload -> confirm boundary" decision. ===== */}
                {statement.sourceFileType === "PDF" && (
                  <div className="mt-4 max-w-sm">
                    <label htmlFor="confirm-pdf-password" className="mb-1 block text-xs font-medium text-neutral-500">
                      รหัสผ่านไฟล์ PDF{statement.pdfRequiresPasswordForPreview ? " *" : " (กรอกเฉพาะกรณีไฟล์มีรหัสผ่าน)"}
                    </label>
                    <input
                      id="confirm-pdf-password"
                      type="password"
                      autoComplete="off"
                      value={pdfPassword}
                      onChange={(e) => setPdfPassword(e.target.value)}
                      placeholder={statement.pdfRequiresPasswordForPreview ? "จำเป็นต้องกรอกรหัสผ่าน" : "เว้นว่างไว้ถ้าไฟล์ไม่มีรหัสผ่าน"}
                      className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      ต้องกรอกรหัสผ่านใหม่ทุกครั้งที่ยืนยันการนำเข้า — ระบบไม่บันทึกรหัสผ่านไว้ที่ใดทั้งสิ้น
                    </p>
                  </div>
                )}

                {confirmError && (
                  <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/40 p-3 text-sm text-red-400">
                    {confirmError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={submitConfirm}
                  disabled={
                    confirming ||
                    (statement.sourceFileType === "PDF" && statement.pdfRequiresPasswordForPreview && !pdfPassword)
                  }
                  className="mt-4 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {confirming ? "กำลังยืนยันการนำเข้า..." : "✅ ยืนยันนำเข้า"}
                </button>
              </section>
            )}

            {confirmResult && (
              <section className="mb-6 rounded-2xl border border-emerald-900/50 bg-emerald-950/40 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-emerald-400">นำเข้าสำเร็จ</h2>
                <p className="mt-2 text-sm text-emerald-400">
                  นำเข้าแล้ว {confirmResult.imported} รายการ — ข้ามรายการซ้ำ {confirmResult.skippedDuplicates}{" "}
                  รายการ
                </p>
              </section>
            )}

            {/* ===== Row review table ===== */}
            <section className="rounded-2xl border bg-neutral-900 shadow-sm">
              <div className="flex items-center justify-between border-b p-5">
                <h2 className="text-lg font-semibold text-white">
                  รายการธุรกรรม {statement.pagination.total > 0 && `(${statement.pagination.total} รายการ)`}
                </h2>
                {statement.status === "PREVIEW_READY" && overridableDuplicateCount > 0 && (
                  <p className="text-xs text-neutral-500">
                    เลือก &quot;นำเข้ารายการนี้ด้วย&quot; สำหรับรายการซ้ำที่มั่นใจว่าเป็นรายการที่แตกต่างกันจริง
                  </p>
                )}
              </div>

              {statement.rows.length === 0 ? (
                <div className="p-10 text-center text-sm text-neutral-500">
                  {/* STEP E.7 — a password-protected PDF has no row-level detail to show here (GET
                      never has a password to decrypt with, STEP E.6.1) — explained honestly rather
                      than shown as a generic empty state; row-level detail becomes visible only
                      after Confirm, which does accept a freshly-entered password. */}
                  {statement.pdfRequiresPasswordForPreview
                    ? "ไฟล์ PDF นี้มีการป้องกันด้วยรหัสผ่าน — ระบบจะแสดงรายการโดยละเอียดหลังจากกรอกรหัสผ่านและยืนยันการนำเข้า"
                    : statement.fatalError?.message || "ไม่มีรายการให้แสดง"}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1000px] text-left text-sm">
                      <thead className="bg-black text-neutral-400">
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
                            <tr key={`${rowNumber}-${idx}`} className="border-t hover:bg-black">
                              <td className="p-3 text-neutral-500">{rowNumber}</td>
                              <td className="p-3 whitespace-nowrap text-neutral-300">{date ?? "-"}</td>
                              <td className="p-3 max-w-xs truncate text-neutral-300" title={description ?? ""}>
                                {description || "-"}
                              </td>
                              <td className="p-3 text-neutral-300">{formatSatang(debit)}</td>
                              <td className="p-3 text-neutral-300">{formatSatang(credit)}</td>
                              <td className="p-3 font-medium text-white">{formatSatang(amount)}</td>
                              <td className="p-3 text-neutral-500">{formatSatang(balance)}</td>
                              <td className="p-3 text-neutral-500">{bankTransactionId || "-"}</td>
                              <td className="p-3">
                                <span
                                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${categoryBadgeClass[category] ?? "bg-neutral-800 text-neutral-400"}`}
                                >
                                  {categoryLabels[category] ?? category}
                                </span>
                              </td>
                              <td className="p-3 max-w-xs text-xs text-neutral-500">
                                {preview?.message || "-"}
                              </td>
                              {statement.status === "PREVIEW_READY" && (
                                <td className="p-3">
                                  {isOverridableDuplicate && (
                                    <label className="flex items-center gap-2 text-xs text-neutral-400">
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
                      className="rounded-xl border px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                    >
                      ← ก่อนหน้า
                    </button>
                    <p className="text-xs text-neutral-500">
                      หน้า {statement.pagination.page} — แสดง {statement.rows.length} จาก{" "}
                      {statement.pagination.total} รายการ
                    </p>
                    <button
                      type="button"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={!statement.pagination.hasNext || loading}
                      className="rounded-xl border px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                    >
                      ถัดไป →
                    </button>
                  </div>
                </>
              )}
            </section>

            {statement.status === "IMPORTED" && (
              <p className="mt-4 text-center text-xs text-neutral-500">
                ข้อมูลชุดนี้เป็นหลักฐานต้นฉบับจากธนาคาร (source evidence) ไม่สามารถแก้ไขได้
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
