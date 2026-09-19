"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import BackLink from "@/components/BackLink";

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
  UPLOADED: "bg-neutral-800 text-neutral-400",
  VALIDATING: "bg-neutral-800 text-neutral-400",
  PREVIEW_READY: "bg-amber-950/40 text-amber-400",
  IMPORTING: "bg-neutral-800 text-neutral-400",
  IMPORTED: "bg-emerald-950/40 text-emerald-400",
  FAILED: "bg-red-950/40 text-red-400",
  CANCELLED: "bg-neutral-800 text-neutral-400",
};

// STEP C.5 §19 — must not crash on an unexpected status value.
function statusLabel(status: string): string {
  return statusLabels[status] ?? status;
}
function statusBadge(status: string): string {
  return statusBadgeClass[status] ?? "bg-neutral-800 text-neutral-400";
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
export function friendlyErrorMessage(status: number, data: ApiResponse<unknown> | null): string {
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
export function sniffHeaderRow(text: string): string[] {
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

// STEP E.7 — PDF branch, additive alongside the CSV form above.

type FileKind = "csv" | "pdf" | "unsupported" | null;

export function detectFileKind(file: File | null): FileKind {
  if (!file) return null;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".csv")) return "csv";
  // Client-side hint only (per this STEP's explicit "extension/MIME เป็นเพียง UX hint" instruction)
  // — the server's own magic-byte/extension checks (src/app/api/bank-statements/route.ts) remain
  // the real authority regardless of what this function decides to show.
  return "unsupported";
}

// CRITICAL (this STEP's explicit instruction): the UI must never let the user author or edit a
// regex/layout — doing so would let a client change how PDF text gets interpreted as financial
// data. This object is a FIXED constant, never rendered in any editable form control anywhere in
// this file. It exists only to compute a non-authoritative PREVIEW at upload time (STEP E.5) — it
// mirrors (does not need to byte-for-byte equal) the ONE entry in the server's trusted registry
// (src/lib/bankStatementPdfLayouts.ts's GENERIC_DATE_DESC_DEBIT_CREDIT_BALANCE_V1) so the preview a
// user sees closely matches what Confirm will actually import, but Confirm (STEP E.6) never reads
// this value at all — it always re-derives independently from that same server-side trusted
// registry, keyed by TRUSTED_PDF_LAYOUT_ID (src/app/bank/statements/[id]/page.tsx). Duplicated here
// as a plain constant rather than imported from src/lib/bankStatementPdfLayouts.ts because that
// module transitively imports src/lib/bankStatementCsv.ts, which imports node:crypto — importing
// any src/lib/* module into a Client Component is exactly what this file's own top comment already
// says never to do (matches the same reasoning as sniffHeaderRow() above being a client-only,
// best-effort helper rather than the real parser).
export const FIXED_PDF_PREVIEW_LAYOUT = {
  repeatedHeaderPatterns: [] as string[],
  repeatedFooterPatterns: ["^หน้า\\s+\\d+(\\s*/\\s*\\d+)?$", "^[Pp]age\\s+\\d+(\\s*of\\s*\\d+)?$"],
  transactionStartPattern: "^\\d{2}/\\d{2}/\\d{4}",
  rowPattern:
    "^(?<date>\\d{2}/\\d{2}/\\d{4})\\s+(?<description>.+?)\\s+(?<debit>[\\d,]+\\.\\d{2}|-)\\s+(?<credit>[\\d,]+\\.\\d{2}|-)\\s+(?<balance>[\\d,]+\\.\\d{2})$",
  dateFormat: "DD/MM/YYYY",
  money: { kind: "separate_columns" as const, debitColumn: "debit", creditColumn: "credit" },
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
  // STEP E.7 — PDF upload password. Component-memory only: never written to localStorage/
  // sessionStorage/a cookie/a URL, never logged, never sent anywhere except as this one FormData
  // field on submit. Cleared on file change (a password typed for a previously-selected file must
  // never linger once a different file is chosen) and after upload completes, success or failure —
  // there is no "resume this upload later" flow that would need it to persist any longer than that.
  const [pdfPassword, setPdfPassword] = useState("");
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
    // STEP E.7 — a password typed for a previously-selected file must never linger once the file
    // changes (this STEP's explicit "clear เมื่อ...เปลี่ยนไฟล์" requirement).
    setPdfPassword("");

    if (!selected) return;

    // STEP E.7 — CSV-only header sniff, unchanged; skipped entirely for a PDF (or unrecognized)
    // file, since sniffHeaderRow() reading raw PDF bytes as text would only ever produce garbage
    // that is never displayed to anyone for that case anyway.
    if (detectFileKind(selected) !== "csv") return;

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

  // STEP E.7 — PDF's client-side pre-submit check. No mapping to validate at all (the layout is a
  // fixed constant, never user-input — see FIXED_PDF_PREVIEW_LAYOUT's own comment) and password is
  // optional (an unencrypted PDF needs none) — only the two universal prerequisites remain.
  function validatePdfSubmission(): string | null {
    if (!selectedAccountId) return "กรุณาเลือกบัญชีธนาคาร";
    if (!file) return "กรุณาเลือกไฟล์ PDF";
    return null;
  }

  async function submitUpload() {
    // STEP E.7 — format branch decision, from the selected file's own extension (client-side hint
    // only — src/app/api/bank-statements/route.ts's own magic-byte/extension checks remain the real
    // authority regardless of what this evaluates to). Everything under the `else` branch below,
    // for a CSV file, is BYTE-FOR-BYTE UNCHANGED from before this STEP.
    const fileKind = detectFileKind(file);

    const validationError = fileKind === "pdf" ? validatePdfSubmission() : validateMapping();
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    setUploadError("");
    setAlreadyImportedNotice(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.set("bankAccountId", String(selectedAccountId));

      if (fileKind === "pdf") {
        // STEP E.7 — PDF branch. FIXED_PDF_PREVIEW_LAYOUT is a fixed constant the user never edits
        // (see its own comment above) — this is the only place it is read. Password is read
        // directly from component state at the moment of submission and included in this one
        // FormData field; it is cleared from state in this function's `finally` block below
        // regardless of outcome — never logged, never stored, never sent anywhere else.
        formData.set("pdfLayout", JSON.stringify(FIXED_PDF_PREVIEW_LAYOUT));
        if (pdfPassword) formData.set("password", pdfPassword);
        formData.set("file", file as File);
      } else {
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

        formData.set("mapping", JSON.stringify(mapping));
        formData.set("file", file as File);
      }

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
      // STEP E.7 — cleared after every upload attempt, success or failure alike: this step's job is
      // done either way (a successful upload navigates away entirely; a failed one requires
      // re-selecting/re-submitting, which naturally means typing the password again rather than
      // silently reusing whatever is left in memory).
      setPdfPassword("");
    }
  }

  const fileKind = detectFileKind(file);

  return (
    <main className="min-h-screen bg-black bg-[linear-gradient(to_right,#f59e0b08_1px,transparent_1px),linear-gradient(to_bottom,#f59e0b08_1px,transparent_1px)] bg-[size:24px_24px] p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">📄 นำเข้า Bank Statement</h1>
            <p className="mt-1 text-sm text-neutral-500">
              อัปโหลดไฟล์ CSV หรือ PDF จากธนาคาร ตรวจสอบตัวอย่างก่อนยืนยันนำเข้าจริง
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <BackLink href="/bank" label="กลับหน้าบัญชีธนาคาร" />
            <LogoutButton />
          </div>
        </div>

        {/* ===== Statement Import section ===== */}
        <section className="mb-6 rounded-2xl border bg-neutral-900 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-white">➕ นำเข้า Statement ใหม่</h2>

          {accountsLoading ? (
            <div className="mt-4 p-6 text-center text-sm text-neutral-500">กำลังโหลดรายการบัญชี...</div>
          ) : accountsError ? (
            <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-400">
              {accountsError}
            </div>
          ) : accounts.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-3 p-6 text-center text-sm text-neutral-500">
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
                <label className="mb-1 block text-xs font-medium text-neutral-500">บัญชีธนาคาร *</label>
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
                <label className="mb-1 block text-xs font-medium text-neutral-500">ไฟล์ Statement *</label>
                <input
                  type="file"
                  accept=".csv,.pdf"
                  onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
                  className="w-full max-w-lg rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                />
                {/* STEP E.7 — supported file types shown explicitly; extension check here is a
                    display hint only, matching this STEP's explicit instruction — the server's own
                    magic-byte/extension validation remains the real authority regardless. */}
                <p className="mt-1 text-xs text-neutral-500">รองรับไฟล์ประเภท: CSV (.csv) และ PDF (.pdf)</p>
                {file && <p className="mt-1 text-xs text-neutral-500">เลือกไฟล์: {file.name}</p>}
                {fileKind === "unsupported" && (
                  <p className="mt-1 text-xs text-red-400">
                    ไม่รองรับไฟล์ประเภทนี้ กรุณาเลือกไฟล์ .csv หรือ .pdf
                  </p>
                )}
              </div>

              {/* ===== STEP E.7 — PDF section: no mapping UI at all (the layout is a fixed,
                  non-editable constant — see FIXED_PDF_PREVIEW_LAYOUT's own comment). Only an
                  optional password field for an encrypted PDF. ===== */}
              {file && fileKind === "pdf" && (
                <div className="rounded-xl border border-neutral-800 bg-black p-4">
                  <h3 className="text-sm font-semibold text-neutral-100">ไฟล์ PDF</h3>
                  <p className="mt-1 text-xs text-neutral-500">
                    ระบบจะอ่านและตรวจสอบไฟล์ PDF โดยอัตโนมัติ — ไม่ต้องตั้งค่าคอลัมน์เอง
                  </p>
                  <div className="mt-3 max-w-sm">
                    <label htmlFor="pdf-password" className="mb-1 block text-xs font-medium text-neutral-500">
                      รหัสผ่านไฟล์ PDF (กรอกเฉพาะกรณีไฟล์มีการป้องกันด้วยรหัสผ่าน)
                    </label>
                    <input
                      id="pdf-password"
                      type="password"
                      autoComplete="off"
                      value={pdfPassword}
                      onChange={(e) => setPdfPassword(e.target.value)}
                      placeholder="เว้นว่างไว้ถ้าไฟล์ไม่มีรหัสผ่าน"
                      className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      รหัสผ่านนี้ใช้เฉพาะการอัปโหลดครั้งนี้เท่านั้น ระบบจะไม่บันทึกรหัสผ่านไว้ที่ใดทั้งสิ้น
                    </p>
                  </div>
                </div>
              )}

              {file && fileKind === "csv" && csvHeaders.length > 0 && (
                <div className="rounded-xl border border-neutral-800 bg-black p-4">
                  <h3 className="text-sm font-semibold text-neutral-100">ตั้งค่าคอลัมน์ (Mapping)</h3>
                  <p className="mt-1 text-xs text-neutral-500">
                    เลือกว่าคอลัมน์ใดในไฟล์ตรงกับข้อมูลแต่ละประเภท ระบบจะไม่เดา mapping ให้อัตโนมัติ
                  </p>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-neutral-500">
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
                      <label className="mb-1 block text-xs font-medium text-neutral-500">
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
                        <p className="mt-1 text-xs text-neutral-500">
                          {dateFormatExample[mappingForm.dateFormat]} — รูปแบบวันที่ต้องตรงกับไฟล์ CSV
                          ทั้งไฟล์
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-neutral-500">
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
                      <label className="mb-1 block text-xs font-medium text-neutral-500">
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
                      <label className="mb-1 block text-xs font-medium text-neutral-500">
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
                      <label className="mb-1 block text-xs font-medium text-neutral-500">
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
                    <label className="mb-2 block text-xs font-medium text-neutral-500">
                      รูปแบบจำนวนเงินในไฟล์ *
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
                      <label className="flex items-center gap-2 text-sm text-neutral-300">
                        <input
                          type="radio"
                          name="moneyKind"
                          checked={mappingForm.moneyKind === "separate_columns"}
                          onChange={() => updateMappingForm("moneyKind", "separate_columns")}
                        />
                        แยกคอลัมน์เดบิต/เครดิต
                      </label>
                      <label className="flex items-center gap-2 text-sm text-neutral-300">
                        <input
                          type="radio"
                          name="moneyKind"
                          checked={mappingForm.moneyKind === "amount_with_direction"}
                          onChange={() => updateMappingForm("moneyKind", "amount_with_direction")}
                        />
                        จำนวนเงินเดียว + คอลัมน์ทิศทาง
                      </label>
                      <label className="flex items-center gap-2 text-sm text-neutral-300">
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
                          <label className="mb-1 block text-xs font-medium text-neutral-500">
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
                          <label className="mb-1 block text-xs font-medium text-neutral-500">
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
                          <label className="mb-1 block text-xs font-medium text-neutral-500">
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
                          <label className="mb-1 block text-xs font-medium text-neutral-500">
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
                          <label className="mb-1 block text-xs font-medium text-neutral-500">
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
                          <label className="mb-1 block text-xs font-medium text-neutral-500">
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
                          <label className="mb-1 block text-xs font-medium text-neutral-500">
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
                          <label className="mb-1 block text-xs font-medium text-neutral-500">
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
                <div className="rounded-xl border border-amber-900/50 bg-amber-950/40 p-4 text-sm text-amber-400">
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
                <div className="rounded-xl border border-red-900/50 bg-red-950/40 p-3 text-sm text-red-400">
                  {uploadError}
                </div>
              )}

              <div>
                <button
                  type="button"
                  onClick={submitUpload}
                  disabled={uploading || !file || fileKind === "unsupported"}
                  className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {uploading ? "กำลังอัปโหลดและตรวจสอบ..." : "อัปโหลดและดูตัวอย่าง"}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ===== Past Statements section ===== */}
        <section className="rounded-2xl border bg-neutral-900 shadow-sm">
          <div className="flex items-center justify-between border-b p-5">
            <h2 className="text-lg font-semibold text-white">รายการ Statement ที่ผ่านมา</h2>
            <button
              type="button"
              onClick={() => loadStatements()}
              className="rounded-xl border px-3 py-1.5 text-xs font-medium text-neutral-400 hover:bg-black"
            >
              รีเฟรช
            </button>
          </div>

          {statementsError && (
            <div className="m-5 rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-400">
              {statementsError}
            </div>
          )}

          {statementsLoading ? (
            <div className="p-10 text-center text-sm text-neutral-500">กำลังโหลดรายการ Statement...</div>
          ) : statements.length === 0 ? (
            <div className="p-10 text-center text-sm text-neutral-500">ยังไม่มี Statement ที่นำเข้า</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-black text-neutral-400">
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
                    <tr key={s.id} className="border-t hover:bg-black">
                      <td className="p-4">
                        <div className="font-medium text-white">{s.bankName ?? "-"}</div>
                        <div className="text-xs text-neutral-500">
                          {s.accountName ?? "-"} ({s.accountNumberMasked ?? "-"})
                        </div>
                      </td>
                      <td className="p-4 max-w-[200px] truncate text-neutral-400" title={s.sourceFileName}>
                        {s.sourceFileName}
                      </td>
                      <td className="p-4 whitespace-nowrap text-neutral-400">
                        {s.statementPeriodFrom && s.statementPeriodTo
                          ? `${s.statementPeriodFrom} - ${s.statementPeriodTo}`
                          : "-"}
                      </td>
                      <td className="p-4 text-neutral-400">{s.rowCountTotal ?? "-"}</td>
                      <td className="p-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadge(s.status)}`}
                        >
                          {statusLabel(s.status)}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap text-neutral-500">{s.updatedAt}</td>
                      <td className="p-4">
                        <Link
                          href={`/bank/statements/${s.id}`}
                          className="rounded-xl border px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
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
