"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

// STEP C.5 — Client Component; duplicates plain response-shape types locally rather than importing
// src/lib/* (which import ./db → better-sqlite3), matching the exact convention already established
// in src/app/bank/page.tsx/src/app/finance/page.tsx. Types below are copied field-for-field from the
// ACTUAL current API responses (STEP C.4/C.6) — not guessed.

type Classification = "BUSINESS" | "PERSONAL" | "MIXED";

// Matches GET /api/bank-accounts?isActive=true's response shape (src/app/api/bank-accounts/route.ts).
type BankAccountListItem = {
  id: number;
  bankName: string;
  accountName: string;
  accountNumberMasked: string;
  classification: Classification;
  isActive: boolean;
};

const classificationLabels: Record<Classification, string> = {
  BUSINESS: "ธุรกิจ",
  PERSONAL: "ส่วนตัว",
  MIXED: "ธุรกิจ + ส่วนตัว",
};

// Matches src/lib/bankStatementCsv.ts's BankStatementColumnMapping exactly — the four formats are
// the ONLY ones that STEP C.4 supports; MM/DD/YYYY is deliberately never offered (STEP C.3 §5).
type DateFormat = "YYYY-MM-DD" | "DD/MM/YYYY" | "DD-MM-YYYY" | "YYYY/MM/DD";
const DATE_FORMATS: DateFormat[] = ["YYYY-MM-DD", "DD/MM/YYYY", "DD-MM-YYYY", "YYYY/MM/DD"];
const dateFormatExample: Record<DateFormat, string> = {
  "YYYY-MM-DD": "เช่น 2026-08-05",
  "DD/MM/YYYY": "เช่น 05/08/2026",
  "DD-MM-YYYY": "เช่น 05-08-2026",
  "YYYY/MM/DD": "เช่น 2026/08/05",
};

type MoneyKind = "separate_columns" | "amount_with_direction" | "signed_amount";

// Matches GET /api/bank-statements' response shape (src/app/api/bank-statements/route.ts,
// toListItem()) — never sourceFileUrl/sourceFileHash/columnMapping (STEP C.6's explicit "GET
// metadata ไม่เปิด file path").
type BankStatementListItem = {
  id: number;
  bankAccountId: number;
  bankName: string | null;
  accountName: string | null;
  accountNumberMasked: string | null;
  sourceFileName: string;
  status: string;
  statementPeriodFrom: string | null;
  statementPeriodTo: string | null;
  rowCountTotal: number | null;
  rowCountValid: number | null;
  rowCountInvalid: number | null;
  rowCountDuplicate: number | null;
  createdAt: string;
  updatedAt: string;
};

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

// STEP C.5 §19 — must not crash on an unexpected status value.
function statusLabel(status: string): string {
  return statusLabels[status] ?? status;
}
function statusBadge(status: string): string {
  return statusBadgeClass[status] ?? "bg-slate-100 text-slate-600";
}

type ApiResponse<T = unknown> = {
  success?: boolean;
  data?: T;
  error?: string;
  count?: number;
};

// Same friendly-error-message convention as src/app/bank/page.tsx — 401/500 mapped to fixed safe
// Thai text regardless of what the server actually sent; 400/404/409 show the server's own
// pre-written safe message.
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
  return "เกิดข้อผิดพลาดบางอย่าง กรุณาลองใหม่อีกครั้ง";
}

// STEP C.5 §6 — client-side header sniff for populating mapping dropdowns ONLY. This is NOT the
// real CSV parser (that is src/lib/bankStatementCsv.ts, server-side, RFC-4180-safe) — this is a
// best-effort read of just the first line, for display/selection convenience. A quoted header
// containing a comma would misalign here, but that only affects which option labels are shown; the
// actual upload always goes through the real server-side parser regardless of what this produced.
function sniffHeaderRow(text: string): string[] {
  const firstLine = text.split(/\r\n|\r|\n/, 1)[0] ?? "";
  return firstLine
    .split(",")
    .map((h) => h.trim().replace(/^"|"$/g, ""))
    .filter((h) => h.length > 0);
}

const emptyMappingForm = {
  dateColumn: "",
  dateFormat: "" as "" | DateFormat,
  descriptionColumn: "",
  balanceColumn: "",
  bankTransactionIdColumn: "",
  referenceColumn: "",
  moneyKind: "separate_columns" as MoneyKind,
  debitColumn: "",
  creditColumn: "",
  amountColumn: "",
  directionColumn: "",
  creditValues: "",
  debitValues: "",
  positiveMeans: "credit" as "credit" | "debit",
};

export default function BankStatementsPage() {
  const router = useRouter();

  const [accounts, setAccounts] = useState<BankAccountListItem[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<number | "">("");

  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mappingForm, setMappingForm] = useState(emptyMappingForm);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [alreadyImportedNotice, setAlreadyImportedNotice] = useState<{
    existingStatementId: number;
    existingStatementStatus: string;
  } | null>(null);

  const [statements, setStatements] = useState<BankStatementListItem[]>([]);
  const [statementsLoading, setStatementsLoading] = useState(true);
  const [statementsError, setStatementsError] = useState("");

  async function loadAccounts() {
    setAccountsLoading(true);
    setAccountsError("");

    try {
      const response = await fetch("/api/bank-accounts?isActive=true", { cache: "no-store" });
      let data: ApiResponse<BankAccountListItem[]> | null = null;
      try {
        data = await response.json();
      } catch {
        // handled below
      }

      if (!response.ok || !data?.success) {
        throw new Error(friendlyErrorMessage(response.status, data));
      }

      setAccounts(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      setAccountsError(err instanceof Error ? err.message : "ไม่สามารถโหลดรายการบัญชีธนาคารได้");
    } finally {
      setAccountsLoading(false);
    }
  }

  async function loadStatements() {
    setStatementsLoading(true);
    setStatementsError("");

    try {
      const response = await fetch("/api/bank-statements", { cache: "no-store" });
      let data: ApiResponse<BankStatementListItem[]> | null = null;
      try {
        data = await response.json();
      } catch {
        // handled below
      }

      if (!response.ok || !data?.success) {
        throw new Error(friendlyErrorMessage(response.status, data));
      }

      setStatements(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      setStatementsError(err instanceof Error ? err.message : "ไม่สามารถโหลดรายการ Statement ได้");
    } finally {
      setStatementsLoading(false);
    }
  }

  // Same established mount-time-fetch pattern as every other page in this codebase
  // (src/app/orders/page.tsx, src/app/bank/page.tsx, etc.) — the set-state-in-effect rule only fails
  // to fire on those by coincidence of their dependency-array shape, not because they follow a
  // different pattern.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAccounts();
    loadStatements();
  }, []);

  function updateMappingForm<K extends keyof typeof emptyMappingForm>(
    key: K,
    value: (typeof emptyMappingForm)[K]
  ) {
    setMappingForm((current) => ({ ...current, [key]: value }));
  }

  async function onFileChange(selected: File | null) {
    setFile(selected);
    setCsvHeaders([]);
    setUploadError("");
    setAlreadyImportedNotice(null);

    if (!selected) return;

    try {
      const text = await selected.text();
      setCsvHeaders(sniffHeaderRow(text));
    } catch {
      // Header sniff is advisory only — a failure here doesn't block anything; the real parse
      // happens server-side on submit regardless.
      setCsvHeaders([]);
    }
  }

  // STEP C.5 §6 — blocks submit on an obviously-ambiguous mapping (the same source column picked
  // for two different target fields) BEFORE the request is ever sent — a fast client-side check,
  // never a substitute for server-side validation (which remains authoritative regardless).
  function validateMapping(): string | null {
    if (!selectedAccountId) return "กรุณาเลือกบัญชีธนาคาร";
    if (!file) return "กรุณาเลือกไฟล์ CSV";
    if (!mappingForm.dateColumn) return "กรุณาเลือกคอลัมน์วันที่";
    if (!mappingForm.dateFormat) return "กรุณาเลือกรูปแบบวันที่";

    const selectedColumns: string[] = [mappingForm.dateColumn];
    const pushIfSet = (v: string) => {
      if (v) selectedColumns.push(v);
    };
    pushIfSet(mappingForm.descriptionColumn);
    pushIfSet(mappingForm.balanceColumn);
    pushIfSet(mappingForm.bankTransactionIdColumn);
    pushIfSet(mappingForm.referenceColumn);

    if (mappingForm.moneyKind === "separate_columns") {
      if (!mappingForm.debitColumn || !mappingForm.creditColumn) {
        return "กรุณาเลือกคอลัมน์เดบิตและเครดิตให้ครบ";
      }
      pushIfSet(mappingForm.debitColumn);
      pushIfSet(mappingForm.creditColumn);
    } else if (mappingForm.moneyKind === "amount_with_direction") {
      if (!mappingForm.amountColumn || !mappingForm.directionColumn) {
        return "กรุณาเลือกคอลัมน์จำนวนเงินและคอลัมน์ทิศทางให้ครบ";
      }
      if (!mappingForm.creditValues.trim() || !mappingForm.debitValues.trim()) {
        return "กรุณาระบุค่าที่หมายถึงเครดิตและเดบิตในคอลัมน์ทิศทาง";
      }
      pushIfSet(mappingForm.amountColumn);
      pushIfSet(mappingForm.directionColumn);
    } else {
      if (!mappingForm.amountColumn) return "กรุณาเลือกคอลัมน์จำนวนเงิน";
      pushIfSet(mappingForm.amountColumn);
    }

    const seen = new Set<string>();
    for (const col of selectedColumns) {
      if (seen.has(col)) {
        return `คอลัมน์ "${col}" ถูกเลือกซ้ำในหลายฟิลด์ กรุณาแก้ไข mapping`;
      }
      seen.add(col);
    }

    return null;
  }

  async function submitUpload() {
    const validationError = validateMapping();
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    setUploadError("");
    setAlreadyImportedNotice(null);
    setUploading(true);

    try {
      const mapping =
        mappingForm.moneyKind === "separate_columns"
          ? {
              dateColumn: mappingForm.dateColumn,
              dateFormat: mappingForm.dateFormat,
              descriptionColumn: mappingForm.descriptionColumn || undefined,
              balanceColumn: mappingForm.balanceColumn || undefined,
              bankTransactionIdColumn: mappingForm.bankTransactionIdColumn || undefined,
              referenceColumn: mappingForm.referenceColumn || undefined,
              money: {
                kind: "separate_columns",
                debitColumn: mappingForm.debitColumn,
                creditColumn: mappingForm.creditColumn,
              },
            }
          : mappingForm.moneyKind === "amount_with_direction"
            ? {
                dateColumn: mappingForm.dateColumn,
                dateFormat: mappingForm.dateFormat,
                descriptionColumn: mappingForm.descriptionColumn || undefined,
                balanceColumn: mappingForm.balanceColumn || undefined,
                bankTransactionIdColumn: mappingForm.bankTransactionIdColumn || undefined,
                referenceColumn: mappingForm.referenceColumn || undefined,
                money: {
                  kind: "amount_with_direction",
                  amountColumn: mappingForm.amountColumn,
                  directionColumn: mappingForm.directionColumn,
                  creditValues: mappingForm.creditValues.split(",").map((v) => v.trim()).filter(Boolean),
                  debitValues: mappingForm.debitValues.split(",").map((v) => v.trim()).filter(Boolean),
                },
              }
            : {
                dateColumn: mappingForm.dateColumn,
                dateFormat: mappingForm.dateFormat,
                descriptionColumn: mappingForm.descriptionColumn || undefined,
                balanceColumn: mappingForm.balanceColumn || undefined,
                bankTransactionIdColumn: mappingForm.bankTransactionIdColumn || undefined,
                referenceColumn: mappingForm.referenceColumn || undefined,
                money: {
                  kind: "signed_amount",
                  amountColumn: mappingForm.amountColumn,
                  positiveMeans: mappingForm.positiveMeans,
                },
              };

      const formData = new FormData();
      formData.set("bankAccountId", String(selectedAccountId));
      formData.set("mapping", JSON.stringify(mapping));
      formData.set("file", file as File);

      const response = await fetch("/api/bank-statements", { method: "POST", body: formData });

      let data: ApiResponse<{
        alreadyImported?: boolean;
        existingStatementId?: number;
        existingStatementStatus?: string;
        statementId?: number;
        status?: string;
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

      if (data.data?.alreadyImported) {
        setAlreadyImportedNotice({
          existingStatementId: data.data.existingStatementId as number,
          existingStatementStatus: data.data.existingStatementStatus as string,
        });
        return;
      }

      if (data.data?.status === "FAILED") {
        setUploadError(data.data.fatalError?.message || "ไม่สามารถประมวลผลไฟล์นี้ได้");
        return;
      }

      const statementId = data.data?.statementId;
      if (statementId) {
        router.push(`/bank/statements/${statementId}`);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "ไม่สามารถอัปโหลดไฟล์ได้");
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">📄 นำเข้า Bank Statement</h1>
            <p className="mt-1 text-sm text-slate-500">
              อัปโหลดไฟล์ CSV จากธนาคาร ตรวจสอบตัวอย่างก่อนยืนยันนำเข้าจริง
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/bank"
              className="w-fit rounded-xl border bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              ← กลับหน้าบัญชีธนาคาร
            </Link>
            <LogoutButton />
          </div>
        </div>

        {/* ===== Statement Import section ===== */}
        <section className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">➕ นำเข้า Statement ใหม่</h2>

          {accountsLoading ? (
            <div className="mt-4 p-6 text-center text-sm text-slate-500">กำลังโหลดรายการบัญชี...</div>
          ) : accountsError ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {accountsError}
            </div>
          ) : accounts.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-3 p-6 text-center text-sm text-slate-500">
              <p>ยังไม่มีบัญชีธนาคารที่พร้อมใช้งาน</p>
              <Link
                href="/bank"
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
              >
                ➕ สร้างบัญชีธนาคารก่อน
              </Link>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">บัญชีธนาคาร *</label>
                <select
                  value={selectedAccountId}
                  onChange={(e) =>
                    setSelectedAccountId(e.target.value ? Number(e.target.value) : "")
                  }
                  className="w-full max-w-lg rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                >
                  <option value="">-- เลือกบัญชีธนาคาร --</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.bankName} - {a.accountName} ({a.accountNumberMasked}) [
                      {classificationLabels[a.classification]}]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">ไฟล์ CSV *</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
                  className="w-full max-w-lg rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                />
                {file && <p className="mt-1 text-xs text-slate-500">เลือกไฟล์: {file.name}</p>}
              </div>

              {file && csvHeaders.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold text-slate-800">ตั้งค่าคอลัมน์ (Mapping)</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    เลือกว่าคอลัมน์ใดในไฟล์ตรงกับข้อมูลแต่ละประเภท ระบบจะไม่เดา mapping ให้อัตโนมัติ
                  </p>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        คอลัมน์วันที่ *
                      </label>
                      <select
                        value={mappingForm.dateColumn}
                        onChange={(e) => updateMappingForm("dateColumn", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      >
                        <option value="">-- เลือกคอลัมน์ --</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        รูปแบบวันที่ *
                      </label>
                      <select
                        value={mappingForm.dateFormat}
                        onChange={(e) => updateMappingForm("dateFormat", e.target.value as DateFormat)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      >
                        <option value="">-- เลือกรูปแบบ --</option>
                        {DATE_FORMATS.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                      {mappingForm.dateFormat && (
                        <p className="mt-1 text-xs text-slate-400">
                          {dateFormatExample[mappingForm.dateFormat]} — รูปแบบวันที่ต้องตรงกับไฟล์ CSV
                          ทั้งไฟล์
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        คอลัมน์รายละเอียด (ถ้ามี)
                      </label>
                      <select
                        value={mappingForm.descriptionColumn}
                        onChange={(e) => updateMappingForm("descriptionColumn", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      >
                        <option value="">ไม่ระบุ</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        คอลัมน์ยอดคงเหลือ (ถ้ามี)
                      </label>
                      <select
                        value={mappingForm.balanceColumn}
                        onChange={(e) => updateMappingForm("balanceColumn", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      >
                        <option value="">ไม่ระบุ</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        คอลัมน์รหัสธุรกรรมธนาคาร (ถ้ามี)
                      </label>
                      <select
                        value={mappingForm.bankTransactionIdColumn}
                        onChange={(e) => updateMappingForm("bankTransactionIdColumn", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      >
                        <option value="">ไม่ระบุ</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        คอลัมน์เลขอ้างอิง (ถ้ามี)
                      </label>
                      <select
                        value={mappingForm.referenceColumn}
                        onChange={(e) => updateMappingForm("referenceColumn", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      >
                        <option value="">ไม่ระบุ</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-5 border-t pt-4">
                    <label className="mb-2 block text-xs font-medium text-slate-500">
                      รูปแบบจำนวนเงินในไฟล์ *
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="moneyKind"
                          checked={mappingForm.moneyKind === "separate_columns"}
                          onChange={() => updateMappingForm("moneyKind", "separate_columns")}
                        />
                        แยกคอลัมน์เดบิต/เครดิต
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="moneyKind"
                          checked={mappingForm.moneyKind === "amount_with_direction"}
                          onChange={() => updateMappingForm("moneyKind", "amount_with_direction")}
                        />
                        จำนวนเงินเดียว + คอลัมน์ทิศทาง
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="moneyKind"
                          checked={mappingForm.moneyKind === "signed_amount"}
                          onChange={() => updateMappingForm("moneyKind", "signed_amount")}
                        />
                        จำนวนเงินเดียว มีเครื่องหมาย +/-
                      </label>
                    </div>

                    {mappingForm.moneyKind === "separate_columns" && (
                      <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-500">
                            คอลัมน์เดบิต (ถอน/หัก) *
                          </label>
                          <select
                            value={mappingForm.debitColumn}
                            onChange={(e) => updateMappingForm("debitColumn", e.target.value)}
                            className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                          >
                            <option value="">-- เลือกคอลัมน์ --</option>
                            {csvHeaders.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-500">
                            คอลัมน์เครดิต (ฝาก/เข้า) *
                          </label>
                          <select
                            value={mappingForm.creditColumn}
                            onChange={(e) => updateMappingForm("creditColumn", e.target.value)}
                            className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                          >
                            <option value="">-- เลือกคอลัมน์ --</option>
                            {csvHeaders.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {mappingForm.moneyKind === "amount_with_direction" && (
                      <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-500">
                            คอลัมน์จำนวนเงิน *
                          </label>
                          <select
                            value={mappingForm.amountColumn}
                            onChange={(e) => updateMappingForm("amountColumn", e.target.value)}
                            className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                          >
                            <option value="">-- เลือกคอลัมน์ --</option>
                            {csvHeaders.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-500">
                            คอลัมน์ทิศทาง *
                          </label>
                          <select
                            value={mappingForm.directionColumn}
                            onChange={(e) => updateMappingForm("directionColumn", e.target.value)}
                            className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                          >
                            <option value="">-- เลือกคอลัมน์ --</option>
                            {csvHeaders.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-500">
                            ค่าที่หมายถึง &quot;เครดิต&quot; (คั่นด้วยจุลภาค) *
                          </label>
                          <input
                            type="text"
                            value={mappingForm.creditValues}
                            onChange={(e) => updateMappingForm("creditValues", e.target.value)}
                            placeholder="เช่น Credit, CR, ฝาก"
                            className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-500">
                            ค่าที่หมายถึง &quot;เดบิต&quot; (คั่นด้วยจุลภาค) *
                          </label>
                          <input
                            type="text"
                            value={mappingForm.debitValues}
                            onChange={(e) => updateMappingForm("debitValues", e.target.value)}
                            placeholder="เช่น Debit, DR, ถอน"
                            className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                          />
                        </div>
                      </div>
                    )}

                    {mappingForm.moneyKind === "signed_amount" && (
                      <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-500">
                            คอลัมน์จำนวนเงิน *
                          </label>
                          <select
                            value={mappingForm.amountColumn}
                            onChange={(e) => updateMappingForm("amountColumn", e.target.value)}
                            className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                          >
                            <option value="">-- เลือกคอลัมน์ --</option>
                            {csvHeaders.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-500">
                            ค่าบวก (+) หมายถึง
                          </label>
                          <select
                            value={mappingForm.positiveMeans}
                            onChange={(e) =>
                              updateMappingForm("positiveMeans", e.target.value as "credit" | "debit")
                            }
                            className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                          >
                            <option value="credit">เครดิต (เงินเข้า)</option>
                            <option value="debit">เดบิต (เงินออก)</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {alreadyImportedNotice && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  ไฟล์นี้เคยถูกอัปโหลดแล้ว เป็น Statement #{alreadyImportedNotice.existingStatementId} (
                  สถานะ: {statusLabel(alreadyImportedNotice.existingStatementStatus)}){" "}
                  <Link
                    href={`/bank/statements/${alreadyImportedNotice.existingStatementId}`}
                    className="font-medium underline hover:no-underline"
                  >
                    เปิดดู Statement นี้
                  </Link>
                </div>
              )}

              {uploadError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {uploadError}
                </div>
              )}

              <div>
                <button
                  type="button"
                  onClick={submitUpload}
                  disabled={uploading || !file}
                  className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {uploading ? "กำลังอัปโหลดและตรวจสอบ..." : "อัปโหลดและดูตัวอย่าง"}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ===== Past Statements section ===== */}
        <section className="rounded-2xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b p-5">
            <h2 className="text-lg font-semibold text-slate-900">รายการ Statement ที่ผ่านมา</h2>
            <button
              type="button"
              onClick={() => loadStatements()}
              className="rounded-xl border px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              รีเฟรช
            </button>
          </div>

          {statementsError && (
            <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {statementsError}
            </div>
          )}

          {statementsLoading ? (
            <div className="p-10 text-center text-sm text-slate-500">กำลังโหลดรายการ Statement...</div>
          ) : statements.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">ยังไม่มี Statement ที่นำเข้า</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-4">บัญชี</th>
                    <th className="p-4">ไฟล์</th>
                    <th className="p-4">ช่วงวันที่</th>
                    <th className="p-4">จำนวนรายการ</th>
                    <th className="p-4">สถานะ</th>
                    <th className="p-4">อัปเดตล่าสุด</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {statements.map((s) => (
                    <tr key={s.id} className="border-t hover:bg-slate-50">
                      <td className="p-4">
                        <div className="font-medium text-slate-900">{s.bankName ?? "-"}</div>
                        <div className="text-xs text-slate-500">
                          {s.accountName ?? "-"} ({s.accountNumberMasked ?? "-"})
                        </div>
                      </td>
                      <td className="p-4 max-w-[200px] truncate text-slate-600" title={s.sourceFileName}>
                        {s.sourceFileName}
                      </td>
                      <td className="p-4 whitespace-nowrap text-slate-600">
                        {s.statementPeriodFrom && s.statementPeriodTo
                          ? `${s.statementPeriodFrom} - ${s.statementPeriodTo}`
                          : "-"}
                      </td>
                      <td className="p-4 text-slate-600">{s.rowCountTotal ?? "-"}</td>
                      <td className="p-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadge(s.status)}`}
                        >
                          {statusLabel(s.status)}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap text-slate-500">{s.updatedAt}</td>
                      <td className="p-4">
                        <Link
                          href={`/bank/statements/${s.id}`}
                          className="rounded-xl border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          เปิดดู
                        </Link>
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
