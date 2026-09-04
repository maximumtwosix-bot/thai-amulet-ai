"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

// STEP D.7 — Client Component; types copied field-for-field from the ACTUAL current API responses
// (src/app/api/reconciliation/[id]/route.ts, src/app/api/reconciliation/[id]/audit/route.ts), same
// convention as src/app/bank/statements/[id]/page.tsx. Thin surface only — every button here calls
// exactly one src/app/api/reconciliation/** endpoint and re-renders from its response; no state
// transition is ever decided client-side.

type ReconciliationStatus =
  | "SUGGESTED"
  | "MATCHED"
  | "CONFIRMED"
  | "EXCLUDED"
  | "UNMATCHED"
  | "NEEDS_REVIEW";

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
function statusLabel(status: string): string {
  return statusLabels[status as ReconciliationStatus] ?? status;
}
function statusBadge(status: string): string {
  return statusBadgeClass[status as ReconciliationStatus] ?? "bg-slate-100 text-slate-600";
}

const strategyLabels: Record<string, string> = {
  BANK_TRANSACTION_ID: "รหัสอ้างอิงจากธนาคาร",
  EXACT_DATE_AMOUNT_ACCOUNT: "วันที่/จำนวนเงิน/บัญชีตรงกัน",
  CONSTRAINED_FINGERPRINT: "ใกล้เคียงกันแบบมีเงื่อนไข",
  MANUAL: "เลือกด้วยตนเอง",
};
function strategyLabel(strategy: string): string {
  return strategyLabels[strategy] ?? strategy;
}

const auditActionLabels: Record<string, string> = {
  MATCHED: "จับคู่",
  CONFIRMED: "ยืนยัน",
  UNMATCHED: "ยกเลิกการจับคู่",
  EXCLUDED: "ยกเว้น",
  NEEDS_REVIEW_FLAGGED: "ทำเครื่องหมายให้ตรวจสอบ",
  RESOLVED: "แก้ไขแล้ว",
};
function auditActionLabel(action: string): string {
  return auditActionLabels[action] ?? action;
}

// Matches GET /api/reconciliation/[id]'s response shape exactly, including the lazy staleness
// fields (src/app/api/reconciliation/[id]/route.ts calling evaluateReconciliationMatchStaleness()).
type ReconciliationMatchDetail = {
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
  possiblyStale: boolean;
  staleReason: string | null;
};

// Matches GET /api/reconciliation/[id]/audit's response shape exactly.
type AuditEntry = {
  id: number;
  matchId: number;
  bankStatementTransactionId: number;
  transactionId: number;
  action: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  performedBy: string;
  performedAt: string;
};

// Matches GET /api/transactions's TransactionRow shape (used only to look up the one financial
// transaction this match references, via the same "fetch a bounded list, find by id" approach as
// the list page — no GET /api/transactions/[id] exists to fetch a single row directly).
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
};

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

type ReasonAction = "unmatch" | "exclude" | null;

export default function ReconciliationDetailPage() {
  const params = useParams();
  const matchId = Number(params?.id);

  const [match, setMatch] = useState<ReconciliationMatchDetail | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [financialTxn, setFinancialTxn] = useState<FinancialTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [actionLoading, setActionLoading] = useState<"match" | "confirm" | "unmatch" | "exclude" | null>(
    null
  );
  const [actionError, setActionError] = useState("");
  const [reasonPromptFor, setReasonPromptFor] = useState<ReasonAction>(null);
  const [reasonText, setReasonText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [matchResponse, auditResponse] = await Promise.all([
        fetch(`/api/reconciliation/${matchId}`, { cache: "no-store" }),
        fetch(`/api/reconciliation/${matchId}/audit`, { cache: "no-store" }),
      ]);

      let matchData: ApiResponse<ReconciliationMatchDetail> | null = null;
      try {
        matchData = await matchResponse.json();
      } catch {
        // handled below
      }

      if (!matchResponse.ok || !matchData?.success) {
        throw new Error(friendlyErrorMessage(matchResponse.status, matchData));
      }

      let auditData: ApiResponse<AuditEntry[]> | null = null;
      try {
        auditData = await auditResponse.json();
      } catch {
        // handled below
      }

      const nextMatch = matchData.data ?? null;
      setMatch(nextMatch);
      setAudit(auditResponse.ok && auditData?.success && Array.isArray(auditData.data) ? auditData.data : []);

      // Best-effort enrichment of the financial-transaction side only (no single-row GET endpoint
      // exists for either side — see the bank side's deliberate ID-only display below). A failure
      // here never blocks the page: the match's own transactionId is always shown regardless.
      if (nextMatch) {
        try {
          const finResponse = await fetch("/api/transactions?limit=500", { cache: "no-store" });
          const finData: ApiResponse<FinancialTransaction[]> = await finResponse.json();
          if (finResponse.ok && finData?.success && Array.isArray(finData.data)) {
            setFinancialTxn(finData.data.find((t) => t.id === nextMatch.transactionId) ?? null);
          }
        } catch {
          setFinancialTxn(null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ไม่สามารถโหลดข้อมูล Reconciliation ได้");
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    if (Number.isInteger(matchId) && matchId > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load();
    } else {
      setLoading(false);
      setError("Reconciliation ID ไม่ถูกต้อง");
    }
  }, [matchId, load]);

  async function callAction(
    action: "match" | "confirm" | "unmatch" | "exclude",
    body?: Record<string, unknown>
  ) {
    setActionError("");
    setActionLoading(action);

    try {
      const response = await fetch(`/api/reconciliation/${matchId}/${action}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });

      let data: ApiResponse<ReconciliationMatchDetail> | null = null;
      try {
        data = await response.json();
      } catch {
        // handled below
      }

      if (!response.ok || !data?.success) {
        throw new Error(friendlyErrorMessage(response.status, data));
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "ไม่สามารถทำรายการนี้ได้");
    } finally {
      setActionLoading(null);
      setReasonPromptFor(null);
      setReasonText("");
      // Always resync with server truth after any action, success or failure — never trust local
      // state (same convention as bank/statements/[id]/page.tsx's submitConfirm()).
      await load();
    }
  }

  function handleMatch() {
    if (!window.confirm("ยืนยันจับคู่รายการนี้หรือไม่? (ยังไม่ใช่การยืนยันบัญชีขั้นสุดท้าย)")) return;
    callAction("match");
  }

  function handleConfirm() {
    if (
      !window.confirm(
        "ยืนยันการกระทบยอด (Reconcile) รายการนี้หรือไม่?\nการกระทำนี้จะถือว่ารายการนี้ถูกต้องทางบัญชี และสามารถยกเลิกได้ภายหลังผ่าน \"ยกเลิกการจับคู่\" เท่านั้น"
      )
    )
      return;
    callAction("confirm");
  }

  function openReasonPrompt(action: "unmatch" | "exclude") {
    setReasonPromptFor(action);
    setReasonText("");
    setActionError("");
  }

  function submitReasonAction() {
    if (!reasonText.trim()) {
      setActionError("กรุณาระบุเหตุผล");
      return;
    }
    if (!reasonPromptFor) return;

    const confirmMessage =
      reasonPromptFor === "unmatch"
        ? "ยืนยันยกเลิกการจับคู่ (Unmatch) รายการนี้หรือไม่?"
        : "ยืนยันยกเว้น (Exclude) รายการนี้หรือไม่?";
    if (!window.confirm(confirmMessage)) return;

    callAction(reasonPromptFor, { reason: reasonText.trim() });
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🔗 รายละเอียดการจับคู่ (Reconciliation)</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/bank/reconciliation"
              className="w-fit rounded-xl border bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              ← กลับรายการ Reconciliation
            </Link>
            <LogoutButton />
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
            <button
              type="button"
              onClick={() => load()}
              className="ml-3 font-medium underline hover:no-underline"
            >
              ลองใหม่
            </button>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
            กำลังโหลดข้อมูล...
          </div>
        ) : !match ? null : (
          <>
            {/* ===== Metadata card ===== */}
            <section className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">Reconciliation #{match.id}</h2>
                <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusBadge(match.status)}`}>
                  {statusLabel(match.status)}
                </span>
              </div>

              {match.possiblyStale && (
                <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
                  ⚠️ รายการนี้อาจไม่เป็นปัจจุบัน (possibly stale) —{" "}
                  {match.staleReason === "TRANSACTION_MODIFIED_AFTER_CONFIRMATION"
                    ? "รายการทางการเงินที่เชื่อมโยงถูกแก้ไขหลังจากยืนยันการจับคู่แล้ว"
                    : match.staleReason === "TRANSACTION_NOT_FOUND"
                      ? "ไม่พบรายการทางการเงินที่เชื่อมโยงอีกต่อไป"
                      : "กรุณาตรวจสอบข้อมูลอีกครั้ง"}
                </div>
              )}

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <p className="text-xs font-medium text-slate-500">รายการธนาคาร</p>
                  <p className="mt-1 text-sm text-slate-700">
                    รหัสรายการธนาคาร #{match.bankStatementTransactionId}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    ระบบยังไม่รองรับการแสดงรายละเอียดเต็มของรายการธนาคารในหน้านี้ — ดูรายละเอียดได้จากหน้า
                    Bank Statement ที่เกี่ยวข้อง
                  </p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-xs font-medium text-slate-500">รายการทางการเงิน</p>
                  {financialTxn ? (
                    <>
                      <p className="mt-1 text-sm text-slate-700">
                        {financialTxn.description || financialTxn.category}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {financialTxn.transactionDate} ·{" "}
                        {financialTxn.transactionType === "income" ? "รายรับ" : "รายจ่าย"} ·{" "}
                        {formatBaht(financialTxn.amount)} บาท
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-slate-700">รหัสรายการทางการเงิน #{match.transactionId}</p>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border p-4">
                  <p className="text-xs text-slate-500">จำนวนที่จัดสรร</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{formatSatang(match.allocatedAmount)}</p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-xs text-slate-500">วิธีจับคู่</p>
                  <p className="mt-1 text-sm font-medium text-slate-700">{strategyLabel(match.matchStrategy)}</p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-xs text-slate-500">สร้างเมื่อ</p>
                  <p className="mt-1 text-sm text-slate-700">{match.createdAt}</p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-xs text-slate-500">อัปเดตล่าสุด</p>
                  <p className="mt-1 text-sm text-slate-700">{match.updatedAt}</p>
                </div>
              </div>

              {match.note && (
                <div className="mt-4 rounded-xl border bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="text-xs font-medium text-slate-500">หมายเหตุ</p>
                  <p className="mt-1">{match.note}</p>
                </div>
              )}
            </section>

            {/* ===== Actions — state-gated per server status, never client-decided ===== */}
            {(match.status === "SUGGESTED" ||
              match.status === "MATCHED" ||
              match.status === "CONFIRMED" ||
              match.status === "NEEDS_REVIEW") && (
              <section className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">การดำเนินการ</h2>

                {actionError && (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {actionError}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-3">
                  {(match.status === "SUGGESTED" || match.status === "NEEDS_REVIEW") && (
                    <button
                      type="button"
                      onClick={handleMatch}
                      disabled={actionLoading !== null}
                      className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                      {actionLoading === "match" ? "กำลังบันทึก..." : "✅ จับคู่ (Match)"}
                    </button>
                  )}

                  {match.status === "MATCHED" && (
                    <button
                      type="button"
                      onClick={handleConfirm}
                      disabled={actionLoading !== null}
                      className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      {actionLoading === "confirm" ? "กำลังยืนยัน..." : "✅ ยืนยัน (Confirm)"}
                    </button>
                  )}

                  {match.status === "CONFIRMED" && (
                    <button
                      type="button"
                      onClick={() => openReasonPrompt("unmatch")}
                      disabled={actionLoading !== null}
                      className="rounded-xl border border-red-200 px-5 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      ↩️ ยกเลิกการจับคู่ (Unmatch)
                    </button>
                  )}

                  {(match.status === "SUGGESTED" ||
                    match.status === "MATCHED" ||
                    match.status === "NEEDS_REVIEW") && (
                    <button
                      type="button"
                      onClick={() => openReasonPrompt("exclude")}
                      disabled={actionLoading !== null}
                      className="rounded-xl border px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      🚫 ยกเว้น (Exclude)
                    </button>
                  )}
                </div>

                {/* NEEDS_REVIEW UI policy note — this is a UI-layer choice, not a DAL/security
                    restriction: the DAL itself allows NEEDS_REVIEW -> CONFIRMED directly, but this
                    UI deliberately never offers that shortcut, forcing a human back through "จับคู่"
                    (match) first for a second look. */}
                {match.status === "NEEDS_REVIEW" && (
                  <p className="mt-3 text-xs text-slate-400">
                    รายการนี้ต้องตรวจสอบเพิ่มเติม — กรุณากด &quot;จับคู่&quot; เพื่อตรวจทานอีกครั้งก่อนยืนยัน
                    (ไม่สามารถยืนยันตรงจากสถานะนี้ได้ในหน้านี้)
                  </p>
                )}

                {/* Reason capture — required for unmatch/exclude, two-step (reveal then confirm) */}
                {reasonPromptFor && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      เหตุผล ({reasonPromptFor === "unmatch" ? "การยกเลิกการจับคู่" : "การยกเว้น"}) *
                    </label>
                    <textarea
                      value={reasonText}
                      onChange={(e) => setReasonText(e.target.value)}
                      rows={2}
                      className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      placeholder="ระบุเหตุผล..."
                    />
                    <div className="mt-3 flex gap-3">
                      <button
                        type="button"
                        onClick={submitReasonAction}
                        disabled={actionLoading !== null}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                      >
                        {actionLoading !== null ? "กำลังบันทึก..." : "ยืนยัน"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReasonPromptFor(null);
                          setReasonText("");
                        }}
                        disabled={actionLoading !== null}
                        className="rounded-xl border px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {(match.status === "EXCLUDED" || match.status === "UNMATCHED") && (
              <p className="mb-6 text-center text-xs text-slate-400">
                รายการนี้อยู่ในสถานะสิ้นสุด (terminal) — ไม่สามารถดำเนินการเพิ่มเติมกับรายการนี้ได้
                หากต้องการจับคู่รายการเดิมใหม่ ให้เสนอการจับคู่ใหม่จากหน้า Reconciliation
              </p>
            )}

            {/* ===== Audit trail ===== */}
            <section className="rounded-2xl border bg-white shadow-sm">
              <div className="border-b p-5">
                <h2 className="text-lg font-semibold text-slate-900">ประวัติการดำเนินการ (Audit Trail)</h2>
              </div>

              {audit.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">ยังไม่มีประวัติการดำเนินการ</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="p-3">การกระทำ</th>
                        <th className="p-3">จาก</th>
                        <th className="p-3">ไปยัง</th>
                        <th className="p-3">เหตุผล</th>
                        <th className="p-3">ผู้ดำเนินการ</th>
                        <th className="p-3">เวลา</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.map((a) => (
                        <tr key={a.id} className="border-t hover:bg-slate-50">
                          <td className="p-3 font-medium text-slate-800">{auditActionLabel(a.action)}</td>
                          <td className="p-3 text-slate-500">{a.fromStatus ? statusLabel(a.fromStatus) : "-"}</td>
                          <td className="p-3 text-slate-700">{statusLabel(a.toStatus)}</td>
                          <td className="p-3 max-w-xs text-slate-500">{a.reason || "-"}</td>
                          <td className="p-3 text-slate-500">{a.performedBy}</td>
                          <td className="p-3 whitespace-nowrap text-slate-500">{a.performedAt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
