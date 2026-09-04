"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

// STEP D.7 — Client Component; duplicates plain response-shape types locally rather than importing
// src/lib/* (which imports ./db → better-sqlite3), matching the exact convention already established
// in src/app/bank/page.tsx / src/app/bank/statements/page.tsx / src/app/finance/page.tsx. Types below
// are copied field-for-field from the ACTUAL current API responses (STEP D.6, STEP D.7-blocker-fix)
// — not guessed.
//
// This page is a THIN read/action surface only — every state transition, every validation
// (allocation sign/overflow, strategy enum, duplicate-pair, status-transition legality) happens
// exclusively in src/lib/reconciliation.ts via the STEP D.6 API routes. Nothing here decides whether
// a mutation is allowed; every button click just calls the corresponding endpoint and re-renders
// whatever the server returns.

type ReconciliationStatus =
  | "SUGGESTED"
  | "MATCHED"
  | "CONFIRMED"
  | "EXCLUDED"
  | "UNMATCHED"
  | "NEEDS_REVIEW";

// Matches src/lib/reconciliation.ts's RECONCILIATION_MATCH_STRATEGIES exactly — NORMALIZED_CANDIDATE
// is deliberately never offered here (STEP D.2/D.4's own explicit exclusion).
type MatchStrategy =
  | "BANK_TRANSACTION_ID"
  | "EXACT_DATE_AMOUNT_ACCOUNT"
  | "CONSTRAINED_FINGERPRINT"
  | "MANUAL";
const MATCH_STRATEGIES: MatchStrategy[] = [
  "BANK_TRANSACTION_ID",
  "EXACT_DATE_AMOUNT_ACCOUNT",
  "CONSTRAINED_FINGERPRINT",
  "MANUAL",
];

const strategyLabels: Record<MatchStrategy, string> = {
  BANK_TRANSACTION_ID: "รหัสอ้างอิงจากธนาคาร",
  EXACT_DATE_AMOUNT_ACCOUNT: "วันที่/จำนวนเงิน/บัญชีตรงกัน",
  CONSTRAINED_FINGERPRINT: "ใกล้เคียงกันแบบมีเงื่อนไข",
  MANUAL: "เลือกด้วยตนเอง",
};

const statusLabels: Record<ReconciliationStatus, string> = {
  SUGGESTED: "เสนอจับคู่",
  MATCHED: "จับคู่แล้ว (รอยืนยัน)",
  CONFIRMED: "ยืนยันแล้ว",
  EXCLUDED: "ยกเว้น",
  UNMATCHED: "ยกเลิกการจับคู่แล้ว",
  NEEDS_REVIEW: "ต้องตรวจสอบเพิ่มเติม",
};

const statusBadgeClass: Record<ReconciliationStatus, string> = {
  SUGGESTED: "bg-slate-100 text-slate-600",
  MATCHED: "bg-amber-50 text-amber-700",
  CONFIRMED: "bg-emerald-50 text-emerald-700",
  EXCLUDED: "bg-purple-50 text-purple-700",
  UNMATCHED: "bg-slate-200 text-slate-700",
  NEEDS_REVIEW: "bg-orange-50 text-orange-700",
};

// Must not crash on an unexpected value — same convention as bank/statements/page.tsx's
// statusLabel()/statusBadge().
function statusLabel(status: string): string {
  return statusLabels[status as ReconciliationStatus] ?? status;
}
function statusBadge(status: string): string {
  return statusBadgeClass[status as ReconciliationStatus] ?? "bg-slate-100 text-slate-600";
}
function strategyLabel(strategy: string): string {
  return strategyLabels[strategy as MatchStrategy] ?? strategy;
}

// Matches GET /api/reconciliation's MatchDTO exactly (src/app/api/reconciliation/route.ts).
type ReconciliationMatch = {
  id: number;
  bankStatementTransactionId: number;
  transactionId: number;
  allocatedAmount: number;
  matchStrategy: string;
  status: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  confirmedBy: string | null;
  unmatchedAt: string | null;
  unmatchedBy: string | null;
};

// Matches GET /api/bank-statements' response shape — never sourceFileUrl/sourceFileHash/columnMapping.
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
};

// Matches GET /api/bank-statements/[id]'s IMPORTED-branch row shape, including the field STEP D.7's
// blocker fix added (src/app/api/bank-statements/[id]/route.ts).
type ImportedBankRow = {
  bankStatementTransactionId: number;
  rowNumber: number | null;
  date: string;
  description: string | null;
  debit: number | null;
  credit: number | null;
  amount: number;
  balance: number | null;
  bankTransactionId: string | null;
};

// Matches GET /api/transactions's TransactionRow shape (src/lib/transactions.ts) exactly — this
// route returns the raw row directly (no masking DTO needed; transactions carry no sensitive
// account-number-shaped field).
type FinancialTransaction = {
  id: number;
  transactionType: "income" | "expense";
  amount: number;
  transactionDate: string;
  category: string;
  description: string | null;
};

type ApiResponse<T = unknown> = {
  success?: boolean;
  data?: T;
  error?: string;
  count?: number;
};

// Same friendly-error-message convention as every other page in this codebase — 401/500 mapped to
// fixed safe Thai text regardless of what the server actually sent; 400/404/409 show the server's
// own pre-written safe message (src/app/api/reconciliation/**'s errorToResponse() never interpolates
// a raw DB error or field value into these).
function friendlyErrorMessage(status: number, data: ApiResponse<unknown> | null): string {
  if (status === 401) return "เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่";
  if (status === 500) return "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง";
  if (typeof data?.error === "string" && data.error.trim()) return data.error;
  return "เกิดข้อผิดพลาดบางอย่าง กรุณาลองใหม่อีกครั้ง";
}

function formatSatang(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const baht = Math.floor(abs / 100);
  const satang = String(abs % 100).padStart(2, "0");
  return `${sign}${baht.toLocaleString("th-TH")}.${satang}`;
}

function formatBaht(value: number): string {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ReconciliationPage() {
  // ===== Existing matches list =====
  const [matches, setMatches] = useState<ReconciliationMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [matchesError, setMatchesError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | ReconciliationStatus>("");

  // ===== Financial transactions (fetched once, used both as the picker list and as an id->row
  // lookup map to enrich the matches list/detail — mirrors bank-statements/route.ts's own
  // accountCache Map-based enrichment pattern for a structurally identical problem) =====
  const [financialTransactions, setFinancialTransactions] = useState<FinancialTransaction[]>([]);
  const [financialLoading, setFinancialLoading] = useState(true);
  const [financialError, setFinancialError] = useState("");

  const financialById = useMemo(() => {
    const map = new Map<number, FinancialTransaction>();
    financialTransactions.forEach((t) => map.set(t.id, t));
    return map;
  }, [financialTransactions]);

  // ===== Bank account / statement / row picker (create-suggestion form) =====
  const [importedStatements, setImportedStatements] = useState<BankStatementListItem[]>([]);
  const [statementsLoading, setStatementsLoading] = useState(true);
  const [statementsError, setStatementsError] = useState("");
  const [selectedStatementId, setSelectedStatementId] = useState<number | "">("");

  const [statementRows, setStatementRows] = useState<ImportedBankRow[]>([]);
  const [statementRowsLoading, setStatementRowsLoading] = useState(false);
  const [statementRowsError, setStatementRowsError] = useState("");
  const [selectedBankTxnId, setSelectedBankTxnId] = useState<number | "">("");

  const [selectedFinancialTxnId, setSelectedFinancialTxnId] = useState<number | "">("");
  const [financialTypeFilter, setFinancialTypeFilter] = useState<"" | "income" | "expense">("");

  const [allocatedAmountBaht, setAllocatedAmountBaht] = useState("");
  const [matchStrategy, setMatchStrategy] = useState<MatchStrategy>("MANUAL");
  const [note, setNote] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState("");
  const [suggestSuccess, setSuggestSuccess] = useState("");

  async function loadMatches() {
    setMatchesLoading(true);
    setMatchesError("");

    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);

      const response = await fetch(`/api/reconciliation?${params.toString()}`, { cache: "no-store" });
      let data: ApiResponse<ReconciliationMatch[]> | null = null;
      try {
        data = await response.json();
      } catch {
        // handled below
      }

      if (!response.ok || !data?.success) {
        throw new Error(friendlyErrorMessage(response.status, data));
      }

      setMatches(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      setMatchesError(err instanceof Error ? err.message : "ไม่สามารถโหลดรายการ Reconciliation ได้");
    } finally {
      setMatchesLoading(false);
    }
  }

  async function loadFinancialTransactions() {
    setFinancialLoading(true);
    setFinancialError("");

    try {
      // Fetches up to GET /api/transactions' own supported max (limit=500) — no client-controlled
      // pagination invented, no server-side filter param used beyond what that endpoint already
      // supports (src/app/api/transactions/route.ts).
      const response = await fetch("/api/transactions?limit=500", { cache: "no-store" });
      let data: ApiResponse<FinancialTransaction[]> | null = null;
      try {
        data = await response.json();
      } catch {
        // handled below
      }

      if (!response.ok || !data?.success) {
        throw new Error(friendlyErrorMessage(response.status, data));
      }

      setFinancialTransactions(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      setFinancialError(err instanceof Error ? err.message : "ไม่สามารถโหลดรายการธุรกรรมทางการเงินได้");
    } finally {
      setFinancialLoading(false);
    }
  }

  async function loadImportedStatements() {
    setStatementsLoading(true);
    setStatementsError("");

    try {
      const response = await fetch("/api/bank-statements?status=IMPORTED", { cache: "no-store" });
      let data: ApiResponse<BankStatementListItem[]> | null = null;
      try {
        data = await response.json();
      } catch {
        // handled below
      }

      if (!response.ok || !data?.success) {
        throw new Error(friendlyErrorMessage(response.status, data));
      }

      setImportedStatements(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      setStatementsError(err instanceof Error ? err.message : "ไม่สามารถโหลดรายการ Bank Statement ได้");
    } finally {
      setStatementsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMatches();
    loadFinancialTransactions();
    loadImportedStatements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  // Loads the picked IMPORTED statement's real bank_statement_transactions rows — this is the ONLY
  // place a bankStatementTransactionId is ever obtained; never guessed/constructed client-side.
  async function onSelectStatement(value: string) {
    const id = value ? Number(value) : "";
    setSelectedStatementId(id);
    setSelectedBankTxnId("");
    setStatementRows([]);
    setStatementRowsError("");

    if (!id) return;

    setStatementRowsLoading(true);
    try {
      const response = await fetch(`/api/bank-statements/${id}?page=1&pageSize=500`, {
        cache: "no-store",
      });
      let data: ApiResponse<{ rows: ImportedBankRow[] }> | null = null;
      try {
        data = await response.json();
      } catch {
        // handled below
      }

      if (!response.ok || !data?.success) {
        throw new Error(friendlyErrorMessage(response.status, data));
      }

      setStatementRows(Array.isArray(data.data?.rows) ? (data.data!.rows as ImportedBankRow[]) : []);
    } catch (err) {
      setStatementRowsError(
        err instanceof Error ? err.message : "ไม่สามารถโหลดรายการธุรกรรมของ Statement นี้ได้"
      );
    } finally {
      setStatementRowsLoading(false);
    }
  }

  function selectBankRow(row: ImportedBankRow) {
    setSelectedBankTxnId(row.bankStatementTransactionId);
    // Convenience prefill: full magnitude of the picked row, in baht — the user can still edit this
    // down for a partial allocation. Sign is never asked from the user; it is always derived
    // server-side-compatible from the bank row's own credit/debit at submit time below.
    const magnitudeSatang = Math.abs(row.amount);
    setAllocatedAmountBaht((magnitudeSatang / 100).toFixed(2));
  }

  const filteredFinancialTransactions = useMemo(() => {
    if (!financialTypeFilter) return financialTransactions;
    return financialTransactions.filter((t) => t.transactionType === financialTypeFilter);
  }, [financialTransactions, financialTypeFilter]);

  const selectedBankRow = useMemo(
    () => statementRows.find((r) => r.bankStatementTransactionId === selectedBankTxnId) ?? null,
    [statementRows, selectedBankTxnId]
  );

  function validateSuggestion(): string | null {
    if (!selectedBankTxnId) return "กรุณาเลือกรายการธนาคาร";
    if (!selectedFinancialTxnId) return "กรุณาเลือกรายการธุรกรรมทางการเงิน";
    const bahtValue = Number(allocatedAmountBaht);
    if (!allocatedAmountBaht.trim() || !Number.isFinite(bahtValue) || bahtValue <= 0) {
      return "กรุณาระบุจำนวนเงินที่จัดสรร (บาท) เป็นค่าบวก";
    }
    if (!MATCH_STRATEGIES.includes(matchStrategy)) return "กรุณาเลือกวิธีจับคู่ (Match Strategy)";
    return null;
  }

  async function submitSuggestion() {
    const validationError = validateSuggestion();
    if (validationError) {
      setSuggestError(validationError);
      return;
    }

    setSuggestError("");
    setSuggestSuccess("");
    setSuggesting(true);

    try {
      // Sign of allocatedAmount must match the bank row's own sign (docs/RECONCILIATION_DATA_MODEL.md
      // §3, enforced authoritatively server-side by createReconciliationSuggestion()) — derived here
      // from the already-selected row's real amount, never asked of the user directly, and never
      // trusted as final: the server re-validates this exact rule regardless of what is sent.
      const bankSign = selectedBankRow && selectedBankRow.amount < 0 ? -1 : 1;
      const allocatedAmount = bankSign * Math.round(Number(allocatedAmountBaht) * 100);

      const response = await fetch("/api/reconciliation/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankStatementTransactionId: selectedBankTxnId,
          transactionId: selectedFinancialTxnId,
          allocatedAmount,
          matchStrategy,
          note: note.trim() || undefined,
        }),
      });

      let data: ApiResponse<ReconciliationMatch> | null = null;
      try {
        data = await response.json();
      } catch {
        // handled below
      }

      if (!response.ok || !data?.success) {
        throw new Error(friendlyErrorMessage(response.status, data));
      }

      setSuggestSuccess(`สร้างการเสนอจับคู่สำเร็จ (#${data.data?.id})`);
      setSelectedBankTxnId("");
      setSelectedFinancialTxnId("");
      setAllocatedAmountBaht("");
      setNote("");
      await loadMatches();
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : "ไม่สามารถสร้างการเสนอจับคู่ได้");
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🔗 Reconciliation</h1>
            <p className="mt-1 text-sm text-slate-500">
              จับคู่รายการจาก Bank Statement กับรายการทางการเงิน (Finance) เพื่อกระทบยอด
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

        {/* ===== MVP limitation disclosure — must not imply automatic matching ===== */}
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
          <p className="font-medium">ℹ️ ระบบนี้เป็นการจับคู่แบบ manual (MVP)</p>
          <p className="mt-1">
            ผู้ใช้ต้องเลือกรายการธนาคารและรายการทางการเงินด้วยตนเองทุกครั้ง ระบบยังไม่มีกลไกจับคู่อัตโนมัติ
            (automatic matching) — &quot;วิธีจับคู่&quot; ที่เลือกด้านล่างเป็นเพียงการบันทึกว่าผู้ใช้อ้างอิงจากอะไร
            ไม่ใช่การยืนยันความถูกต้องโดยระบบ
          </p>
        </div>

        {/* ===== Create suggestion ===== */}
        <section className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">➕ เสนอการจับคู่ใหม่</h2>

          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            {/* Bank transaction picker */}
            {/* min-w-0 overrides the CSS grid item default of min-width:auto — without it, the
                picker table's intrinsic content width forces this grid track wider than the
                viewport below the lg breakpoint, causing page-level horizontal scroll. */}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-800">1. เลือกรายการธนาคาร</h3>

              <div className="mt-2">
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Bank Statement (นำเข้าแล้วเท่านั้น) *
                </label>
                {statementsLoading ? (
                  <p className="text-xs text-slate-500">กำลังโหลด...</p>
                ) : statementsError ? (
                  <p className="text-xs text-red-600">{statementsError}</p>
                ) : importedStatements.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    ยังไม่มี Bank Statement ที่นำเข้าแล้ว —{" "}
                    <Link href="/bank/statements" className="underline hover:no-underline">
                      ไปนำเข้า Statement
                    </Link>
                  </p>
                ) : (
                  <select
                    value={selectedStatementId}
                    onChange={(e) => onSelectStatement(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                  >
                    <option value="">-- เลือก Statement --</option>
                    {importedStatements.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.bankName} - {s.accountName} ({s.accountNumberMasked}) —{" "}
                        {s.statementPeriodFrom ?? "-"} ถึง {s.statementPeriodTo ?? "-"}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {selectedStatementId && (
                <div className="mt-3 max-h-72 overflow-auto rounded-xl border">
                  {statementRowsLoading ? (
                    <p className="p-4 text-center text-xs text-slate-500">กำลังโหลดรายการ...</p>
                  ) : statementRowsError ? (
                    <p className="p-4 text-center text-xs text-red-600">{statementRowsError}</p>
                  ) : statementRows.length === 0 ? (
                    <p className="p-4 text-center text-xs text-slate-500">ไม่มีรายการในไฟล์นี้</p>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-50 text-slate-600">
                        <tr>
                          <th className="p-2"></th>
                          <th className="p-2">วันที่</th>
                          <th className="p-2">รายละเอียด</th>
                          <th className="p-2">จำนวนเงิน</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statementRows.map((row) => (
                          <tr
                            key={row.bankStatementTransactionId}
                            className={`cursor-pointer border-t hover:bg-slate-50 ${
                              selectedBankTxnId === row.bankStatementTransactionId ? "bg-amber-50" : ""
                            }`}
                            onClick={() => selectBankRow(row)}
                          >
                            <td className="p-2">
                              <input
                                type="radio"
                                name="bankRow"
                                checked={selectedBankTxnId === row.bankStatementTransactionId}
                                onChange={() => selectBankRow(row)}
                              />
                            </td>
                            <td className="p-2 whitespace-nowrap">{row.date}</td>
                            <td className="p-2 max-w-[160px] truncate" title={row.description ?? ""}>
                              {row.description || "-"}
                            </td>
                            <td className="p-2 whitespace-nowrap font-medium">
                              {formatSatang(row.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

            {/* Financial transaction picker */}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-800">2. เลือกรายการทางการเงิน</h3>

              <div className="mt-2 flex items-center gap-2">
                <select
                  value={financialTypeFilter}
                  onChange={(e) =>
                    setFinancialTypeFilter(e.target.value as "" | "income" | "expense")
                  }
                  className="rounded-xl border px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-amber-300"
                >
                  <option value="">ทุกประเภท</option>
                  <option value="income">รายรับ</option>
                  <option value="expense">รายจ่าย</option>
                </select>
              </div>

              <div className="mt-2 max-h-72 overflow-auto rounded-xl border">
                {financialLoading ? (
                  <p className="p-4 text-center text-xs text-slate-500">กำลังโหลดรายการ...</p>
                ) : financialError ? (
                  <p className="p-4 text-center text-xs text-red-600">{financialError}</p>
                ) : filteredFinancialTransactions.length === 0 ? (
                  <p className="p-4 text-center text-xs text-slate-500">ไม่มีรายการ</p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-slate-600">
                      <tr>
                        <th className="p-2"></th>
                        <th className="p-2">วันที่</th>
                        <th className="p-2">รายละเอียด</th>
                        <th className="p-2">จำนวนเงิน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFinancialTransactions.map((t) => (
                        <tr
                          key={t.id}
                          className={`cursor-pointer border-t hover:bg-slate-50 ${
                            selectedFinancialTxnId === t.id ? "bg-amber-50" : ""
                          }`}
                          onClick={() => setSelectedFinancialTxnId(t.id)}
                        >
                          <td className="p-2">
                            <input
                              type="radio"
                              name="finTxn"
                              checked={selectedFinancialTxnId === t.id}
                              onChange={() => setSelectedFinancialTxnId(t.id)}
                            />
                          </td>
                          <td className="p-2 whitespace-nowrap">{t.transactionDate}</td>
                          <td className="p-2 max-w-[160px] truncate" title={t.description ?? ""}>
                            {t.description || t.category}
                          </td>
                          <td
                            className={`p-2 whitespace-nowrap font-medium ${
                              t.transactionType === "income" ? "text-emerald-700" : "text-red-700"
                            }`}
                          >
                            {t.transactionType === "income" ? "+" : "-"}
                            {formatBaht(t.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                จำนวนเงินที่จัดสรร (บาท) *
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={allocatedAmountBaht}
                onChange={(e) => setAllocatedAmountBaht(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                placeholder="0.00"
              />
              <p className="mt-1 text-xs text-slate-400">
                ไม่จำเป็นต้องเท่ากับยอดเต็มของรายการ — รองรับการจัดสรรบางส่วน (partial allocation)
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">วิธีจับคู่ (Match Strategy) *</label>
              <select
                value={matchStrategy}
                onChange={(e) => setMatchStrategy(e.target.value as MatchStrategy)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
              >
                {MATCH_STRATEGIES.map((s) => (
                  <option key={s} value={s}>
                    {strategyLabel(s)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">หมายเหตุ (ถ้ามี)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>
          </div>

          {suggestError && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {suggestError}
            </div>
          )}
          {suggestSuccess && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {suggestSuccess}
            </div>
          )}

          <div className="mt-5">
            <button
              type="button"
              onClick={submitSuggestion}
              disabled={suggesting}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {suggesting ? "กำลังบันทึก..." : "เสนอการจับคู่"}
            </button>
          </div>
        </section>

        {/* ===== Existing matches list ===== */}
        <section className="rounded-2xl border bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b p-5 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-semibold text-slate-900">รายการ Reconciliation ทั้งหมด</h2>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "" | ReconciliationStatus)}
              className="rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
            >
              <option value="">ทุกสถานะ</option>
              {(Object.keys(statusLabels) as ReconciliationStatus[]).map((s) => (
                <option key={s} value={s}>
                  {statusLabels[s]}
                </option>
              ))}
            </select>
          </div>

          {matchesError && (
            <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {matchesError}
              <button
                type="button"
                onClick={() => loadMatches()}
                className="ml-3 font-medium underline hover:no-underline"
              >
                ลองใหม่
              </button>
            </div>
          )}

          {matchesLoading ? (
            <div className="p-10 text-center text-sm text-slate-500">กำลังโหลดรายการ Reconciliation...</div>
          ) : matches.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              {statusFilter ? "ไม่พบรายการในสถานะนี้" : "ยังไม่มีรายการ Reconciliation"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-4">#</th>
                    <th className="p-4">รายการธนาคาร (ID)</th>
                    <th className="p-4">รายการทางการเงิน</th>
                    <th className="p-4">จำนวนที่จัดสรร</th>
                    <th className="p-4">วิธีจับคู่</th>
                    <th className="p-4">สถานะ</th>
                    <th className="p-4">อัปเดตล่าสุด</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m) => {
                    const fin = financialById.get(m.transactionId);
                    return (
                      <tr key={m.id} className="border-t hover:bg-slate-50">
                        <td className="p-4 text-slate-500">{m.id}</td>
                        <td className="p-4 text-slate-600">#{m.bankStatementTransactionId}</td>
                        <td className="p-4 text-slate-600">
                          {fin ? (
                            <>
                              <div>{fin.description || fin.category}</div>
                              <div className="text-xs text-slate-400">
                                {fin.transactionDate} · {fin.transactionType === "income" ? "รายรับ" : "รายจ่าย"}
                              </div>
                            </>
                          ) : (
                            `#${m.transactionId}`
                          )}
                        </td>
                        <td className="p-4 font-medium text-slate-900">{formatSatang(m.allocatedAmount)}</td>
                        <td className="p-4 text-slate-600">{strategyLabel(m.matchStrategy)}</td>
                        <td className="p-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadge(m.status)}`}
                          >
                            {statusLabel(m.status)}
                          </span>
                        </td>
                        <td className="p-4 whitespace-nowrap text-slate-500">{m.updatedAt}</td>
                        <td className="p-4">
                          <Link
                            href={`/bank/reconciliation/${m.id}`}
                            className="rounded-xl border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            เปิดดู
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
