"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

// STEP B.5 — Client Component, so this duplicates the plain shape of the API's response types
// locally rather than importing src/lib/bankAccounts.ts (which imports ./db → better-sqlite3 —
// same client/server boundary constraint already documented in src/app/finance/page.tsx and
// src/app/customers/page.tsx).

type Classification = "BUSINESS" | "PERSONAL" | "MIXED";
type AccountType = "SAVINGS" | "CURRENT" | "OTHER";

// Matches GET /api/bank-accounts' response shape exactly (src/app/api/bank-accounts/route.ts,
// toListItem()) — accountNumber is NEVER present here, only the server-masked accountNumberMasked.
type BankAccountListItem = {
  id: number;
  bankName: string;
  accountName: string;
  accountNumberMasked: string;
  accountType: AccountType | null;
  currency: string;
  classification: Classification;
  purpose: string | null;
  isActive: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

// Matches GET /api/bank-accounts/[id]'s response shape — the ONLY endpoint that ever returns the
// real accountNumber. Never derived/reconstructed from BankAccountListItem.
type BankAccountDetail = Omit<BankAccountListItem, "accountNumberMasked"> & {
  accountNumber: string;
};

const CLASSIFICATIONS: Classification[] = ["BUSINESS", "PERSONAL", "MIXED"];
const ACCOUNT_TYPES: AccountType[] = ["SAVINGS", "CURRENT", "OTHER"];

const classificationLabels: Record<Classification, string> = {
  BUSINESS: "ธุรกิจ",
  PERSONAL: "ส่วนตัว",
  MIXED: "ธุรกิจ + ส่วนตัว",
};

const classificationBadgeClass: Record<Classification, string> = {
  BUSINESS: "bg-blue-50 text-blue-700",
  PERSONAL: "bg-amber-50 text-amber-700",
  MIXED: "bg-purple-50 text-purple-700",
};

const accountTypeLabels: Record<AccountType, string> = {
  SAVINGS: "ออมทรัพย์",
  CURRENT: "กระแสรายวัน",
  OTHER: "อื่นๆ",
};

// STEP B.5 — form state keeps classification/accountType as "" until the user actively picks one.
// classification "" is invalid and blocked by validateForm() before any request is sent — there is
// intentionally no BUSINESS/PERSONAL default. accountType "" maps to null (unspecified) on submit —
// unlike classification, accountType is genuinely optional per the real API contract
// (src/lib/bankAccounts.ts: accountType is nullable; only classification is NOT NULL with no
// default). currency defaults to "THB" (pre-filled, editable) so it is never blank on submit without
// forcing the user through an extra required-field prompt for something that already has a sensible
// default.
const emptyForm = {
  bankName: "",
  accountName: "",
  accountNumber: "",
  accountType: "" as "" | AccountType,
  currency: "THB",
  classification: "" as "" | Classification,
  purpose: "",
  note: "",
};

type StatusFilter = "" | "true" | "false";

// STEP B.5 — shape of every /api/bank-accounts* JSON response (success or error). `data` is typed
// per call site via the generic so each fetch keeps real field types instead of `any`.
type ApiResponse<T = unknown> = {
  success?: boolean;
  data?: T;
  error?: string;
  count?: number;
};

// STEP B.5 — the ONLY place allowed to read a JSON error body's `error` string. 401/500 are mapped
// to fixed, safe Thai text regardless of what the server sent (never trust/display a raw 500 body);
// 400/404/409 show the server's own message, which is always a fixed, safe, pre-written Thai string
// (see src/app/api/bank-accounts/route.ts and [id]/route.ts's errorToResponse() — never an
// interpolated field value, so this can never surface an account number).
function friendlyErrorMessage(status: number, data: ApiResponse<unknown> | null): string {
  if (status === 401) {
    return "เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่";
  }

  if (status === 500) {
    return "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง";
  }

  if (typeof data?.error === "string" && data.error.trim()) {
    return data.error;
  }

  if (status === 404) {
    return "ไม่พบบัญชีธนาคารนี้";
  }

  return "เกิดข้อผิดพลาดบางอย่าง กรุณาลองใหม่อีกครั้ง";
}

export default function BankAccountsPage() {
  const [accounts, setAccounts] = useState<BankAccountListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [classificationFilter, setClassificationFilter] = useState<"" | Classification>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLoadingId, setEditLoadingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [showAccountNumber, setShowAccountNumber] = useState(false);

  const [statusChangingId, setStatusChangingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // STEP B.5 — server-side filtering only, via the real query params GET /api/bank-accounts
  // supports (search matches bankName/accountName only — accountNumber is never searchable, by
  // design, since it is sensitive and the API itself never exposes it in list results). No
  // client-side re-filtering of an already-loaded array.
  async function loadAccounts() {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (classificationFilter) params.set("classification", classificationFilter);
      if (statusFilter) params.set("isActive", statusFilter);

      const query = params.toString();
      const response = await fetch(`/api/bank-accounts${query ? `?${query}` : ""}`, {
        cache: "no-store",
      });

      let data: ApiResponse<BankAccountListItem[]> | null = null;
      try {
        data = await response.json();
      } catch {
        // handled by the !response.ok check below
      }

      if (!response.ok || !data?.success) {
        throw new Error(friendlyErrorMessage(response.status, data));
      }

      setAccounts(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ไม่สามารถโหลดรายการบัญชีธนาคารได้");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // STEP B.5 — same 300ms debounce as src/app/customers/page.tsx, so typing in the search box
    // doesn't fire a request per keystroke. Filter changes (classification/status) also flow
    // through this single effect so there is one request path, not two.
    const timer = setTimeout(() => {
      loadAccounts();
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, classificationFilter, statusFilter]);

  function updateForm<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startCreate() {
    setEditingId(null);
    setFormError("");
    setShowAccountNumber(false);
    setForm(emptyForm);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // STEP B.5 — Edit NEVER uses the list row's data as the source of accountNumber (the list only
  // ever has accountNumberMasked). Always fetches GET /api/bank-accounts/[id] fresh, which is the
  // only endpoint the real API contract allows to return the full number. If that fetch fails, the
  // form is never opened (nothing to populate it with) — the error is shown on the page's existing
  // error banner instead, and the account row's "แก้ไข" button reverts to its normal state.
  async function startEdit(id: number) {
    setEditLoadingId(id);
    setError("");

    try {
      const response = await fetch(`/api/bank-accounts/${id}`, { cache: "no-store" });

      let data: ApiResponse<BankAccountDetail> | null = null;
      try {
        data = await response.json();
      } catch {
        // handled below
      }

      if (!response.ok || !data?.success) {
        throw new Error(friendlyErrorMessage(response.status, data));
      }

      const detail = data.data as BankAccountDetail;

      setFormError("");
      setShowAccountNumber(false);
      setForm({
        bankName: detail.bankName,
        accountName: detail.accountName,
        accountNumber: detail.accountNumber,
        accountType: detail.accountType ?? "",
        currency: detail.currency,
        classification: detail.classification,
        purpose: detail.purpose ?? "",
        note: detail.note ?? "",
      });
      setEditingId(id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "ไม่สามารถโหลดข้อมูลบัญชีนี้ได้");
    } finally {
      setEditLoadingId(null);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setShowAccountNumber(false);
  }

  // STEP B.5 — client-side checks are UX only (fail fast, no round-trip for an obviously-empty
  // field); the API's own validation in src/lib/bankAccounts.ts is the real authority and is never
  // bypassed by anything here. classification has no default anywhere in this form, so an empty
  // selection is caught here exactly the same way the server would reject it (INVALID_CLASSIFICATION).
  function validateForm(): string | null {
    if (!form.bankName.trim()) return "กรุณาระบุชื่อธนาคาร";
    if (!form.accountName.trim()) return "กรุณาระบุชื่อบัญชี";
    if (!form.accountNumber.trim()) return "กรุณาระบุเลขที่บัญชี";
    if (!form.currency.trim()) return "กรุณาระบุสกุลเงิน";
    if (!form.classification) return "กรุณาเลือกประเภทการใช้งานบัญชี (ธุรกิจ / ส่วนตัว / ธุรกิจ + ส่วนตัว)";
    if (!CLASSIFICATIONS.includes(form.classification)) return "ประเภทการใช้งานบัญชีไม่ถูกต้อง";
    if (form.accountType && !ACCOUNT_TYPES.includes(form.accountType)) {
      return "ประเภทบัญชีไม่ถูกต้อง";
    }

    return null;
  }

  // STEP B.5 — the edit form intentionally has no isActive control at all: activate/deactivate is
  // exclusively the dedicated list-row action below (its own confirmation, its own PATCH call), per
  // this STEP's UI spec. Omitting isActive from this PATCH body leaves it untouched — PATCH
  // /api/bank-accounts/[id] only ever changes fields explicitly present in the request body (see
  // src/lib/bankAccounts.ts updateBankAccount()), so this can never accidentally flip a status.
  async function submitForm() {
    const validationError = validateForm();

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError("");
    setSaving(true);

    try {
      const payload = {
        bankName: form.bankName.trim(),
        accountName: form.accountName.trim(),
        accountNumber: form.accountNumber.trim(),
        accountType: form.accountType || null,
        currency: form.currency.trim(),
        classification: form.classification,
        purpose: form.purpose.trim() || null,
        note: form.note.trim() || null,
      };

      const response = await fetch(
        editingId ? `/api/bank-accounts/${editingId}` : "/api/bank-accounts",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      let data: ApiResponse<BankAccountDetail> | null = null;
      try {
        data = await response.json();
      } catch {
        // handled below
      }

      if (!response.ok || !data?.success) {
        throw new Error(friendlyErrorMessage(response.status, data));
      }

      cancelEdit();
      await loadAccounts();
    } catch (err) {
      // STEP B.5 — on error the form stays open with whatever the user typed (including
      // accountNumber) so they don't have to re-enter everything; only a safe, server-provided or
      // fixed message is shown, never the raw response.
      setFormError(err instanceof Error ? err.message : "ไม่สามารถบันทึกข้อมูลบัญชีธนาคารได้");
    } finally {
      setSaving(false);
    }
  }

  // STEP B.5 — deactivate/reactivate is a single shared handler (same PATCH endpoint, same
  // src/lib/bankAccounts.ts updateBankAccount() isActive path already proven in B.2/B.3) — the only
  // difference is the confirmation copy and the target value.
  async function toggleActive(account: BankAccountListItem) {
    const confirmMessage = account.isActive
      ? `ยืนยันปิดใช้งานบัญชี "${account.bankName} - ${account.accountName}" หรือไม่?\nข้อมูลบัญชีจะไม่ถูกลบ และสามารถเปิดใช้งานใหม่ได้ภายหลัง`
      : `ยืนยันเปิดใช้งานบัญชี "${account.bankName} - ${account.accountName}" อีกครั้งหรือไม่?`;

    if (!window.confirm(confirmMessage)) return;

    setStatusChangingId(account.id);
    setError("");

    try {
      const response = await fetch(`/api/bank-accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !account.isActive }),
      });

      let data: ApiResponse<BankAccountDetail> | null = null;
      try {
        data = await response.json();
      } catch {
        // handled below
      }

      if (!response.ok || !data?.success) {
        throw new Error(friendlyErrorMessage(response.status, data));
      }

      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ไม่สามารถเปลี่ยนสถานะบัญชีได้");
    } finally {
      setStatusChangingId(null);
    }
  }

  // STEP B.5 — no optimistic delete: the row stays in the list until the server confirms success,
  // then the list is reloaded from GET /api/bank-accounts (the real source of truth), never spliced
  // out of local state ahead of the response. If the API ever blocks this (STEP C/D adding a linked-
  // data guard), the server's error is shown as-is and the row correctly remains — this UI never
  // claims a delete succeeded on its own.
  async function deleteAccount(account: BankAccountListItem) {
    const confirmMessage = `ยืนยันลบบัญชี "${account.bankName} - ${account.accountName}" หรือไม่?\nการลบบัญชีเป็นการลบถาวรและไม่สามารถกู้คืนได้`;

    if (!window.confirm(confirmMessage)) return;

    setDeletingId(account.id);
    setError("");

    try {
      const response = await fetch(`/api/bank-accounts/${account.id}`, { method: "DELETE" });

      let data: ApiResponse<{ id: number }> | null = null;
      try {
        data = await response.json();
      } catch {
        // handled below
      }

      if (!response.ok || !data?.success) {
        throw new Error(friendlyErrorMessage(response.status, data));
      }

      if (editingId === account.id) {
        cancelEdit();
      }

      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ไม่สามารถลบบัญชีธนาคารได้");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🏦 บัญชีธนาคาร</h1>
            <p className="mt-1 text-sm text-slate-500">
              จัดการบัญชีธนาคารที่เกี่ยวข้องกับรายรับ/รายจ่าย และการกระทบยอดในอนาคต
            </p>
            <p className="mt-1 text-xs text-slate-400">
              บัญชีเหล่านี้จะถูกใช้เชื่อมกับ Bank Statement, Reconciliation และ Tax &amp; Accounting
              Center ในขั้นถัดไปของระบบ
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/bank/statements"
              className="w-fit rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
            >
              📄 นำเข้า Bank Statement
            </Link>
            <Link
              href="/bank/reconciliation"
              className="w-fit rounded-xl border bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              🔗 Reconciliation
            </Link>
            <Link
              href="/"
              className="w-fit rounded-xl border bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              ← กลับหน้าแรก
            </Link>
            <LogoutButton />
          </div>
        </div>

        <section className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {editingId ? `✏️ แก้ไขบัญชีธนาคาร #${editingId}` : "➕ เพิ่มบัญชีธนาคาร"}
            </h2>

            {!editingId && (
              <button
                type="button"
                onClick={startCreate}
                className="hidden rounded-xl border px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 sm:block"
                title="ล้างฟอร์ม"
              >
                ล้างฟอร์ม
              </button>
            )}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">ธนาคาร *</label>
              <input
                type="text"
                value={form.bankName}
                onChange={(e) => updateForm("bankName", e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                placeholder="เช่น ธนาคารกสิกรไทย"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">ชื่อบัญชี *</label>
              <input
                type="text"
                value={form.accountName}
                onChange={(e) => updateForm("accountName", e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                placeholder="ชื่อเจ้าของบัญชีตามสมุดบัญชี"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">เลขที่บัญชี *</label>
              <div className="flex items-center gap-2">
                <input
                  type={showAccountNumber ? "text" : "password"}
                  autoComplete="off"
                  value={form.accountNumber}
                  onChange={(e) => updateForm("accountNumber", e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="เลขที่บัญชีธนาคาร"
                />
                <button
                  type="button"
                  onClick={() => setShowAccountNumber((v) => !v)}
                  className="shrink-0 rounded-xl border px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  title={showAccountNumber ? "ซ่อนเลขที่บัญชี" : "แสดงเลขที่บัญชี"}
                >
                  {showAccountNumber ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">ประเภทบัญชี (ถ้ามี)</label>
              <select
                value={form.accountType}
                onChange={(e) => updateForm("accountType", e.target.value as "" | AccountType)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
              >
                <option value="">ไม่ระบุ</option>
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {accountTypeLabels[t]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">สกุลเงิน *</label>
              <input
                type="text"
                value={form.currency}
                onChange={(e) => updateForm("currency", e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                placeholder="THB"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                ประเภทการใช้งานบัญชี *
              </label>
              <select
                value={form.classification}
                onChange={(e) =>
                  updateForm("classification", e.target.value as "" | Classification)
                }
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
              >
                <option value="">-- เลือกประเภทการใช้งาน --</option>
                {CLASSIFICATIONS.map((c) => (
                  <option key={c} value={c}>
                    {classificationLabels[c]}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                วัตถุประสงค์ (ถ้ามี)
              </label>
              <input
                type="text"
                value={form.purpose}
                onChange={(e) => updateForm("purpose", e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                placeholder="เช่น รับเงินขายพระเครื่องออนไลน์"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                หมายเหตุ (ถ้ามี)
              </label>
              <input
                type="text"
                value={form.note}
                onChange={(e) => updateForm("note", e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>
          </div>

          {formError && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={submitForm}
              disabled={saving}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : editingId ? "บันทึกการแก้ไข" : "บันทึกบัญชีธนาคาร"}
            </button>

            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className="rounded-xl border px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
            )}
          </div>
        </section>

        <section className="rounded-2xl border bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b p-5 md:flex-row md:flex-wrap md:items-center md:justify-between">
            <h2 className="text-lg font-semibold text-slate-900">รายการบัญชีธนาคารทั้งหมด</h2>

            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อธนาคารหรือชื่อบัญชี..."
                className="w-full max-w-xs rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
              />

              <select
                value={classificationFilter}
                onChange={(e) =>
                  setClassificationFilter(e.target.value as "" | Classification)
                }
                className="rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
              >
                <option value="">ทุกประเภทการใช้งาน</option>
                {CLASSIFICATIONS.map((c) => (
                  <option key={c} value={c}>
                    {classificationLabels[c]}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
              >
                <option value="">ทุกสถานะ</option>
                <option value="true">ใช้งานอยู่</option>
                <option value="false">ปิดใช้งาน</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
              <button
                type="button"
                onClick={() => loadAccounts()}
                className="ml-3 font-medium underline hover:no-underline"
              >
                ลองใหม่
              </button>
            </div>
          )}

          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">
              กำลังโหลดรายการบัญชีธนาคาร...
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center text-sm text-slate-500">
              <p>
                {search.trim() || classificationFilter || statusFilter
                  ? "ไม่พบบัญชีธนาคารที่ค้นหา"
                  : "ยังไม่มีบัญชีธนาคารในระบบ"}
              </p>
              {!search.trim() && !classificationFilter && !statusFilter && (
                <button
                  type="button"
                  onClick={startCreate}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  ➕ เพิ่มบัญชีธนาคารแรก
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-4">ธนาคาร</th>
                    <th className="p-4">ชื่อบัญชี</th>
                    <th className="p-4">เลขที่บัญชี</th>
                    <th className="p-4">ประเภทบัญชี</th>
                    <th className="p-4">ประเภทการใช้งาน</th>
                    <th className="p-4">วัตถุประสงค์</th>
                    <th className="p-4">สถานะ</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>

                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id} className="border-t hover:bg-slate-50">
                      <td className="p-4 font-medium text-slate-900">{account.bankName}</td>
                      <td className="p-4 text-slate-600">{account.accountName}</td>
                      <td className="p-4 font-mono text-slate-600">
                        {account.accountNumberMasked}
                      </td>
                      <td className="p-4 text-slate-600">
                        {account.accountType ? accountTypeLabels[account.accountType] : "-"}
                      </td>
                      <td className="p-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${classificationBadgeClass[account.classification]}`}
                        >
                          {classificationLabels[account.classification]}
                        </span>
                      </td>
                      <td className="p-4 max-w-xs text-slate-600">{account.purpose || "-"}</td>
                      <td className="p-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            account.isActive
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {account.isActive ? "ใช้งานอยู่" : "ปิดใช้งาน"}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            onClick={() => startEdit(account.id)}
                            disabled={editLoadingId === account.id}
                            className="rounded-xl border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                          >
                            {editLoadingId === account.id ? "กำลังโหลด..." : "แก้ไข"}
                          </button>

                          <button
                            onClick={() => toggleActive(account)}
                            disabled={statusChangingId === account.id}
                            className="rounded-xl border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                          >
                            {statusChangingId === account.id
                              ? "กำลังบันทึก..."
                              : account.isActive
                                ? "ปิดใช้งาน"
                                : "เปิดใช้งาน"}
                          </button>

                          <button
                            onClick={() => deleteAccount(account)}
                            disabled={deletingId === account.id}
                            className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            {deletingId === account.id ? "กำลังลบ..." : "ลบ"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
