"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/orderStatus";

// Local copies of the STEP 19 constant lists — deliberately NOT imported from @/lib/transactions,
// because that file also exports STEP 20's DB-touching CRUD functions (`import db from "./db"`),
// and this is a Client Component: importing it would pull better-sqlite3/fs/path into the browser
// bundle and break the page (confirmed by testing — "Module not found: Can't resolve 'fs'"). This
// mirrors the existing convention already used by src/app/video-studio/page.tsx, which likewise
// redefines CostBreakdownEntry/ImageQualityBreakdown/etc. locally instead of importing them from
// the server-only src/lib/costLedger.ts.
type TransactionType = "income" | "expense";

type ExpenseCategory =
  | "PRODUCT_PURCHASE"
  | "SHIPPING"
  | "COD_FEE"
  | "RETURNED_PARCEL"
  | "PACKAGING"
  | "FACEBOOK_ADS"
  | "FUEL"
  | "OTHER";

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "PRODUCT_PURCHASE",
  "SHIPPING",
  "COD_FEE",
  "RETURNED_PARCEL",
  "PACKAGING",
  "FACEBOOK_ADS",
  "FUEL",
  "OTHER",
];

type IncomeCategory = "PRODUCT_SALE" | "OTHER_INCOME";

const INCOME_CATEGORIES: IncomeCategory[] = ["PRODUCT_SALE", "OTHER_INCOME"];

type SalesChannel =
  | "facebook"
  | "tiktok_shop"
  | "shopee"
  | "lazada"
  | "line"
  | "walk_in"
  | "other";

const SALES_CHANNELS: SalesChannel[] = [
  "facebook",
  "tiktok_shop",
  "shopee",
  "lazada",
  "line",
  "walk_in",
  "other",
];

type TransactionRow = {
  id: number;
  transactionType: TransactionType;
  amount: number;
  transactionDate: string;
  category: string;
  description: string | null;
  salesChannel: SalesChannel | null;
  productId: number | null;
  orderId: number | null;
  paymentMethod: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // STEP 34 — display-only, from GET /api/transactions' order-status join; null unless orderId is
  // set and that order still exists.
  linkedOrderStatus: OrderStatus | null;
  linkedOrderNumber: string | null;
  // STEP 63 — display-only, from the same existing order LEFT JOIN as linkedOrderStatus above
  // (GET /api/transactions). Drives only the warning badge below — never read anywhere else on
  // this page, never affects any total.
  linkedDeliveryStatus: string | null;
};

type ProductOption = { id: number; name: string };
type OrderOption = { id: number; order_number: string };

type AttachmentItem = {
  id: number;
  transactionId: number;
  fileName: string;
  fileUrl: string;
  createdAt: string;
};

// STEP 29 — AI slip/receipt extraction. Mirrors the shape returned by
// POST /api/transactions/ai-extract (src/app/api/transactions/ai-extract/route.ts). Local copy for
// the same reason as every other type above: this is a Client Component.
const DOCUMENT_TYPES = [
  "customer_payment_slip",
  "product_purchase_slip",
  "shipping_payment_receipt",
  "cod_shipping_expense_receipt",
  "advertising_expense_receipt",
  "packaging_material_receipt",
  "other_business_expense_receipt",
] as const;

const documentTypeLabels: Record<(typeof DOCUMENT_TYPES)[number], string> = {
  customer_payment_slip: "สลิปโอนเงินจากลูกค้า",
  product_purchase_slip: "สลิปจ่ายค่าซื้อสินค้า",
  shipping_payment_receipt: "ใบเสร็จค่าจัดส่ง",
  cod_shipping_expense_receipt: "ใบเสร็จค่าใช้จ่าย COD/ขนส่ง",
  advertising_expense_receipt: "ใบเสร็จค่าโฆษณา",
  packaging_material_receipt: "ใบเสร็จบรรจุภัณฑ์/วัสดุ",
  other_business_expense_receipt: "ใบเสร็จค่าใช้จ่ายอื่นๆ",
};

type ExtractionResult = {
  documentType: (typeof DOCUMENT_TYPES)[number] | null;
  transactionType: TransactionType | null;
  transactionDate: string | null;
  amount: number | null;
  payerName: string | null;
  recipientName: string | null;
  bankOrProvider: string | null;
  referenceNumber: string | null;
  description: string | null;
  suggestedCategory: string | null;
  suggestedSalesChannel: string | null;
  confidence: number | null;
  fieldsNeedingReview: string[];
  needsReview: boolean;
};

const aiFieldLabels: Record<string, string> = {
  documentType: "ประเภทเอกสาร",
  transactionType: "ประเภทรายการ",
  transactionDate: "วันที่",
  amount: "จำนวนเงิน",
  suggestedCategory: "หมวดหมู่",
  suggestedSalesChannel: "ช่องทางการขาย",
};

const emptyAiReviewForm = {
  transactionType: "expense" as TransactionType,
  amount: "",
  transactionDate: todayDateString(),
  category: EXPENSE_CATEGORIES[0] as string,
  description: "",
  salesChannel: "" as string,
  productId: "" as string,
  orderId: "" as string,
  paymentMethod: "",
  payerName: "",
  recipientName: "",
  referenceNumber: "",
};

const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  PRODUCT_PURCHASE: "ซื้อสินค้าเข้าสต็อก",
  SHIPPING: "ค่าจัดส่ง",
  COD_FEE: "ค่าธรรมเนียม COD",
  RETURNED_PARCEL: "พัสดุตีกลับ",
  PACKAGING: "บรรจุภัณฑ์ / กล่อง",
  FACEBOOK_ADS: "ค่าโฆษณา Facebook / Meta",
  FUEL: "ค่าน้ำมัน",
  OTHER: "อื่นๆ",
};

const incomeCategoryLabels: Record<IncomeCategory, string> = {
  PRODUCT_SALE: "ขายสินค้า",
  OTHER_INCOME: "รายรับอื่นๆ",
};

const salesChannelLabels: Record<SalesChannel, string> = {
  facebook: "Facebook",
  tiktok_shop: "TikTok Shop",
  shopee: "Shopee",
  lazada: "Lazada",
  line: "LINE",
  walk_in: "หน้าร้าน",
  other: "อื่นๆ",
};

function categoryLabel(type: TransactionType, category: string): string {
  if (type === "income") {
    return incomeCategoryLabels[category as IncomeCategory] || category;
  }
  return expenseCategoryLabels[category as ExpenseCategory] || category;
}

function formatCurrency(value: number): string {
  return `฿${value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("th-TH", { dateStyle: "medium" });
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm = {
  transactionType: "expense" as TransactionType,
  amount: "",
  transactionDate: todayDateString(),
  category: EXPENSE_CATEGORIES[0] as string,
  description: "",
  salesChannel: "" as string,
  productId: "" as string,
  orderId: "" as string,
  paymentMethod: "",
  notes: "",
};

export default function FinancePage() {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);

  const [filterType, setFilterType] = useState<"all" | TransactionType>("all");

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [deletingId, setDeletingId] = useState<number | null>(null);

  // STEP 21 — evidence attachments (receipt / transfer slip), upload/display only, no OCR.
  // Loaded on demand per row when its "📎 ไฟล์แนบ" panel is expanded, not eagerly for every row.
  const [expandedAttachmentsId, setExpandedAttachmentsId] = useState<number | null>(null);
  const [attachmentsByTransaction, setAttachmentsByTransaction] = useState<
    Record<number, AttachmentItem[]>
  >({});
  const [attachmentsLoading, setAttachmentsLoading] = useState<number | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState<number | null>(null);
  const [attachmentDeletingId, setAttachmentDeletingId] = useState<number | null>(null);
  const [attachmentError, setAttachmentError] = useState<Record<number, string>>({});

  async function loadAttachments(transactionId: number) {
    setAttachmentsLoading(transactionId);

    try {
      const response = await fetch(`/api/transactions/${transactionId}/attachments`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถโหลดไฟล์แนบได้");
      }

      setAttachmentsByTransaction((current) => ({ ...current, [transactionId]: data.data }));
    } catch (err) {
      setAttachmentError((current) => ({
        ...current,
        [transactionId]: err instanceof Error ? err.message : "ไม่สามารถโหลดไฟล์แนบได้",
      }));
    } finally {
      setAttachmentsLoading(null);
    }
  }

  function toggleAttachments(transactionId: number) {
    if (expandedAttachmentsId === transactionId) {
      setExpandedAttachmentsId(null);
      return;
    }

    setExpandedAttachmentsId(transactionId);
    setAttachmentError((current) => ({ ...current, [transactionId]: "" }));

    if (!attachmentsByTransaction[transactionId]) {
      loadAttachments(transactionId);
    }
  }

  async function uploadAttachment(transactionId: number, file: File) {
    setAttachmentUploading(transactionId);
    setAttachmentError((current) => ({ ...current, [transactionId]: "" }));

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`/api/transactions/${transactionId}/attachments`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถอัปโหลดไฟล์ได้");
      }

      await loadAttachments(transactionId);
    } catch (err) {
      setAttachmentError((current) => ({
        ...current,
        [transactionId]: err instanceof Error ? err.message : "ไม่สามารถอัปโหลดไฟล์ได้",
      }));
    } finally {
      setAttachmentUploading(null);
    }
  }

  async function deleteAttachment(transactionId: number, attachmentId: number) {
    setAttachmentDeletingId(attachmentId);

    try {
      const response = await fetch(
        `/api/transactions/${transactionId}/attachments/${attachmentId}`,
        { method: "DELETE" }
      );

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถลบไฟล์แนบได้");
      }

      await loadAttachments(transactionId);
    } catch (err) {
      setAttachmentError((current) => ({
        ...current,
        [transactionId]: err instanceof Error ? err.message : "ไม่สามารถลบไฟล์แนบได้",
      }));
    } finally {
      setAttachmentDeletingId(null);
    }
  }

  // STEP 29 — AI slip/receipt extraction. Separate state tree from the manual add/edit `form`
  // above — this is a *suggestion* workflow (upload → AI reads → user reviews/edits → explicit
  // confirm), not a direct edit of `form`, so the two must never share state or a stray AI response
  // could silently overwrite a form the user is already editing.
  const [aiFile, setAiFile] = useState<File | null>(null);
  const [aiUploading, setAiUploading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiPreview, setAiPreview] = useState<{ fileName: string; fileUrl: string } | null>(null);
  const [aiExtraction, setAiExtraction] = useState<ExtractionResult | null>(null);
  const [aiReviewMode, setAiReviewMode] = useState<"readonly" | "editing">("readonly");
  const [aiReviewForm, setAiReviewForm] = useState(emptyAiReviewForm);
  const [aiConfirming, setAiConfirming] = useState(false);
  const [aiConfirmError, setAiConfirmError] = useState("");
  const [aiConfirmedId, setAiConfirmedId] = useState<number | null>(null);

  function resetAiSession() {
    setAiFile(null);
    setAiUploading(false);
    setAiError("");
    setAiPreview(null);
    setAiExtraction(null);
    setAiReviewMode("readonly");
    setAiReviewForm(emptyAiReviewForm);
    setAiConfirming(false);
    setAiConfirmError("");
    setAiConfirmedId(null);
  }

  function updateAiReviewForm<K extends keyof typeof emptyAiReviewForm>(
    key: K,
    value: (typeof emptyAiReviewForm)[K]
  ) {
    setAiReviewForm((current) => ({ ...current, [key]: value }));
  }

  async function handleAiFileSelected(file: File) {
    resetAiSession();
    setAiFile(file);
    setAiUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/transactions/ai-extract", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถอ่านสลิปด้วย AI ได้");
      }

      const attachment = data.data?.attachment ?? null;
      const extraction: ExtractionResult | null = data.data?.extraction ?? null;

      setAiPreview(attachment);

      if (data.data?.aiError) {
        setAiError(String(data.data.aiError));
      }

      if (extraction) {
        setAiExtraction(extraction);

        const nextType: TransactionType = extraction.transactionType ?? "expense";
        const nextCategoryOptions = nextType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

        setAiReviewForm({
          transactionType: nextType,
          amount: extraction.amount !== null ? String(extraction.amount) : "",
          transactionDate: extraction.transactionDate || todayDateString(),
          category:
            extraction.suggestedCategory && (nextCategoryOptions as string[]).includes(extraction.suggestedCategory)
              ? extraction.suggestedCategory
              : (nextCategoryOptions[0] as string),
          description: extraction.description || "",
          salesChannel: extraction.suggestedSalesChannel || "",
          productId: "",
          orderId: "",
          paymentMethod: extraction.bankOrProvider || "",
          payerName: extraction.payerName || "",
          recipientName: extraction.recipientName || "",
          referenceNumber: extraction.referenceNumber || "",
        });
      } else {
        // AI อ่านไม่สำเร็จ (aiError ถูกตั้งไว้แล้วด้านบน) แต่หลักฐานยังอยู่ — เปิดฟอร์มเปล่าให้กรอกเองได้
        setAiReviewMode("editing");
        setAiReviewForm(emptyAiReviewForm);
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "ไม่สามารถอ่านสลิปด้วย AI ได้");
    } finally {
      setAiUploading(false);
    }
  }

  async function confirmAiTransaction() {
    // กันการกดซ้ำ/ดับเบิลคลิก — ถ้ากำลังบันทึกอยู่ หรือบันทึกไปแล้วครั้งหนึ่ง ไม่ทำซ้ำ
    if (aiConfirming || aiConfirmedId !== null) return;

    setAiConfirmError("");

    const amountValue = Number(aiReviewForm.amount);

    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setAiConfirmError("กรุณาระบุจำนวนเงินให้ถูกต้อง (มากกว่า 0)");
      setAiReviewMode("editing");
      return;
    }

    if (!aiReviewForm.transactionDate) {
      setAiConfirmError("กรุณาระบุวันที่");
      setAiReviewMode("editing");
      return;
    }

    setAiConfirming(true);

    try {
      const notesParts: string[] = [];
      if (aiReviewForm.payerName.trim()) notesParts.push(`ผู้โอน: ${aiReviewForm.payerName.trim()}`);
      if (aiReviewForm.recipientName.trim()) notesParts.push(`ผู้รับ: ${aiReviewForm.recipientName.trim()}`);
      if (aiReviewForm.referenceNumber.trim())
        notesParts.push(`เลขอ้างอิง: ${aiReviewForm.referenceNumber.trim()}`);

      const payload = {
        transactionType: aiReviewForm.transactionType,
        amount: amountValue,
        transactionDate: aiReviewForm.transactionDate,
        category: aiReviewForm.category,
        description: aiReviewForm.description.trim() || null,
        salesChannel: aiReviewForm.salesChannel || null,
        productId: aiReviewForm.productId || null,
        orderId: aiReviewForm.orderId || null,
        paymentMethod: aiReviewForm.paymentMethod.trim() || null,
        notes: notesParts.length > 0 ? notesParts.join(" | ") : null,
      };

      // ใช้ endpoint เดิม POST /api/transactions (STEP 20) ตรงๆ — ไม่มี logic การสร้าง transaction
      // ซ้ำซ้อนในหน้านี้ ยัง validate ทุกอย่างที่ server-side เหมือนเดิมทุกประการ
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถบันทึกรายการได้");
      }

      const newId = data.data.id as number;
      setAiConfirmedId(newId);

      // แนบไฟล์หลักฐานต้นฉบับผ่าน endpoint แนบไฟล์เดิม (STEP 21) — ไม่สร้างระบบแนบไฟล์ใหม่ซ้ำซ้อน
      if (aiFile) {
        try {
          const attachFormData = new FormData();
          attachFormData.append("file", aiFile);

          const attachResponse = await fetch(`/api/transactions/${newId}/attachments`, {
            method: "POST",
            body: attachFormData,
          });

          const attachData = await attachResponse.json();

          if (!attachResponse.ok || !attachData?.success) {
            setAiConfirmError(
              "บันทึกรายการสำเร็จ แต่แนบไฟล์หลักฐานไม่สำเร็จ — สามารถอัปโหลดไฟล์แนบเพิ่มได้จากรายการในตารางด้านล่าง"
            );
          }
        } catch {
          setAiConfirmError(
            "บันทึกรายการสำเร็จ แต่แนบไฟล์หลักฐานไม่สำเร็จ — สามารถอัปโหลดไฟล์แนบเพิ่มได้จากรายการในตารางด้านล่าง"
          );
        }
      }

      await loadTransactions();
      resetAiSession();
    } catch (err) {
      setAiConfirmError(err instanceof Error ? err.message : "ไม่สามารถบันทึกรายการได้");
      setAiConfirming(false);
    }
  }

  async function loadTransactions() {
    setLoading(true);
    setError("");

    try {
      const query = filterType === "all" ? "" : `?transactionType=${filterType}`;
      const response = await fetch(`/api/transactions${query}`, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถโหลดรายการรายรับ-รายจ่ายได้");
      }

      setTransactions(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      console.error("Load transactions error:", err);
      setError(err instanceof Error ? err.message : "ไม่สามารถโหลดรายการได้");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType]);

  useEffect(() => {
    fetch("/api/products", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => setProducts([]));

    fetch("/api/orders?limit=200", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { data: [] }))
      .then((data) => setOrders(Array.isArray(data.data) ? data.data : []))
      .catch(() => setOrders([]));
  }, []);

  const categoryOptions = form.transactionType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  function updateForm<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function switchTransactionType(type: TransactionType) {
    const nextCategories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    setForm((current) => ({
      ...current,
      transactionType: type,
      category: nextCategories[0] as string,
    }));
  }

  function startEdit(row: TransactionRow) {
    setEditingId(row.id);
    setFormError("");
    setForm({
      transactionType: row.transactionType,
      amount: String(row.amount),
      transactionDate: row.transactionDate.slice(0, 10),
      category: row.category,
      description: row.description || "",
      salesChannel: row.salesChannel || "",
      productId: row.productId ? String(row.productId) : "",
      orderId: row.orderId ? String(row.orderId) : "",
      paymentMethod: row.paymentMethod || "",
      notes: row.notes || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
  }

  async function submitForm() {
    setFormError("");

    const amountValue = Number(form.amount);

    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setFormError("กรุณาระบุจำนวนเงินให้ถูกต้อง (มากกว่า 0)");
      return;
    }

    if (!form.transactionDate) {
      setFormError("กรุณาระบุวันที่");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        transactionType: form.transactionType,
        amount: amountValue,
        transactionDate: form.transactionDate,
        category: form.category,
        description: form.description.trim() || null,
        salesChannel: form.salesChannel || null,
        productId: form.productId || null,
        orderId: form.orderId || null,
        paymentMethod: form.paymentMethod.trim() || null,
        notes: form.notes.trim() || null,
      };

      const response = await fetch(
        editingId ? `/api/transactions/${editingId}` : "/api/transactions",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถบันทึกรายการได้");
      }

      cancelEdit();
      await loadTransactions();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "ไม่สามารถบันทึกรายการได้");
    } finally {
      setSaving(false);
    }
  }

  // STEP 34 — deleting a transaction linked to an order requires explicit confirmation naming that
  // order. This is UX protection only — the real gate is server-side in deleteTransaction()
  // (src/lib/transactions.ts), which rejects the request outright without ?confirm=order-linked
  // regardless of what the UI does or doesn't ask.
  async function removeTransaction(t: TransactionRow) {
    if (t.orderId) {
      const orderLabel = t.linkedOrderNumber ? `${t.linkedOrderNumber} (#${t.orderId})` : `#${t.orderId}`;
      const confirmed = window.confirm(
        `รายการนี้ผูกกับออเดอร์ ${orderLabel} — ลบแล้วออเดอร์จะไม่มีรายรับที่บันทึกไว้อีกต่อไป (ตัวออเดอร์เองจะไม่ถูกแก้ไข) ยืนยันการลบหรือไม่?`
      );

      if (!confirmed) return;
    }

    setDeletingId(t.id);

    try {
      const url = t.orderId
        ? `/api/transactions/${t.id}?confirm=order-linked`
        : `/api/transactions/${t.id}`;
      const response = await fetch(url, { method: "DELETE" });
      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถลบรายการได้");
      }

      if (editingId === t.id) {
        cancelEdit();
      }

      await loadTransactions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ไม่สามารถลบรายการได้");
    } finally {
      setDeletingId(null);
    }
  }

  const totals = useMemo(() => {
    const income = transactions
      .filter((t) => t.transactionType === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const expense = transactions
      .filter((t) => t.transactionType === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
    return { income, expense, net: income - expense };
  }, [transactions]);

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">💰 การเงิน</h1>
            <p className="mt-1 text-sm text-slate-500">
              บันทึกรายรับ-รายจ่ายของธุรกิจ (บันทึกด้วยตนเอง)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="w-fit rounded-xl border bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              ← กลับหน้าแรก
            </Link>
            <LogoutButton />
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">รายรับรวม</p>
            <p className="mt-2 text-3xl font-bold text-emerald-600">
              {formatCurrency(totals.income)}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">รายจ่ายรวม</p>
            <p className="mt-2 text-3xl font-bold text-red-600">
              {formatCurrency(totals.expense)}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">สุทธิ</p>
            <p
              className={`mt-2 text-3xl font-bold ${totals.net >= 0 ? "text-emerald-600" : "text-red-600"}`}
            >
              {formatCurrency(totals.net)}
            </p>
          </div>
        </div>

        <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/40 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">📷 อ่านสลิป/บิลด้วย AI</h2>
              <p className="mt-1 text-xs text-slate-500">
                อัปโหลดรูปสลิปโอนเงินหรือใบเสร็จ ให้ AI ช่วยกรอกข้อมูลเบื้องต้น (ต้องตรวจสอบและกดยืนยันเองก่อนบันทึกทุกครั้ง)
              </p>
            </div>

            <label
              className={`cursor-pointer rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                aiUploading
                  ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                  : "border-amber-400 bg-amber-500 text-white hover:bg-amber-600"
              }`}
            >
              {aiUploading ? "กำลังอ่านข้อมูลจากสลิป..." : "📷 อ่านสลิป/บิลด้วย AI"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                disabled={aiUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleAiFileSelected(file);
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {aiUploading && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-white p-4 text-sm text-amber-700">
              ⏳ กำลังอ่านข้อมูลจากสลิป...
            </div>
          )}

          {!aiUploading && aiError && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {aiError}
            </div>
          )}

          {!aiUploading && aiPreview && (
            <div className="mt-4 grid gap-4 md:grid-cols-[160px_1fr]">
              <div>
                <a href={aiPreview.fileUrl} target="_blank" rel="noreferrer">
                  <img
                    src={aiPreview.fileUrl}
                    alt="สลิปที่อัปโหลด"
                    className="w-40 rounded-xl border object-cover"
                  />
                </a>
              </div>

              <div>
                <div className="rounded-xl border border-amber-300 bg-amber-100/60 p-3 text-xs font-medium text-amber-800">
                  ⚠️ ข้อมูลจาก AI กรุณาตรวจสอบก่อนบันทึก
                  {aiExtraction?.needsReview && " — กรุณาตรวจสอบข้อมูลก่อนบันทึก (มีบางฟิลด์ที่ AI ไม่มั่นใจ)"}
                  {aiExtraction?.confidence !== null && aiExtraction?.confidence !== undefined && (
                    <span className="ml-1 text-amber-600">
                      (ความมั่นใจ AI ~{Math.round(aiExtraction.confidence * 100)}%)
                    </span>
                  )}
                </div>

                {aiExtraction && aiExtraction.fieldsNeedingReview.length > 0 && (
                  <p className="mt-2 text-xs text-red-600">
                    ฟิลด์ที่ควรตรวจสอบ:{" "}
                    {aiExtraction.fieldsNeedingReview
                      .map((f) => aiFieldLabels[f] || f)
                      .join(", ")}
                  </p>
                )}

                {aiReviewMode === "readonly" ? (
                  <div className="mt-3 grid gap-x-4 gap-y-1 text-sm text-slate-700 sm:grid-cols-2">
                    <p>
                      ประเภทเอกสาร:{" "}
                      {aiExtraction?.documentType ? documentTypeLabels[aiExtraction.documentType] : "- ไม่ทราบ -"}
                    </p>
                    <p>ประเภท: {aiReviewForm.transactionType === "income" ? "รายรับ" : "รายจ่าย"}</p>
                    <p>วันที่: {aiReviewForm.transactionDate || "- ไม่ทราบ -"}</p>
                    <p>จำนวนเงิน: {aiReviewForm.amount ? formatCurrency(Number(aiReviewForm.amount)) : "- ไม่ทราบ -"}</p>
                    <p>ผู้โอน: {aiReviewForm.payerName || "-"}</p>
                    <p>ผู้รับ: {aiReviewForm.recipientName || "-"}</p>
                    <p>ธนาคาร/ช่องทางชำระเงิน: {aiReviewForm.paymentMethod || "-"}</p>
                    <p>เลขอ้างอิง: {aiReviewForm.referenceNumber || "-"}</p>
                    <p>หมวดหมู่: {categoryLabel(aiReviewForm.transactionType, aiReviewForm.category)}</p>
                    <p>
                      ช่องทางการขาย:{" "}
                      {aiReviewForm.salesChannel
                        ? salesChannelLabels[aiReviewForm.salesChannel as SalesChannel]
                        : "-"}
                    </p>
                    <p className="sm:col-span-2">รายละเอียด: {aiReviewForm.description || "-"}</p>
                  </div>
                ) : (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">ประเภท</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            updateAiReviewForm("transactionType", "income");
                            updateAiReviewForm("category", INCOME_CATEGORIES[0] as string);
                          }}
                          className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${
                            aiReviewForm.transactionType === "income"
                              ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          รายรับ
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            updateAiReviewForm("transactionType", "expense");
                            updateAiReviewForm("category", EXPENSE_CATEGORIES[0] as string);
                          }}
                          className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${
                            aiReviewForm.transactionType === "expense"
                              ? "border-red-600 bg-red-50 text-red-700"
                              : "border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          รายจ่าย
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">วันที่</label>
                      <input
                        type="date"
                        value={aiReviewForm.transactionDate}
                        onChange={(e) => updateAiReviewForm("transactionDate", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">จำนวนเงิน</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={aiReviewForm.amount}
                        onChange={(e) => updateAiReviewForm("amount", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">หมวดหมู่</label>
                      <select
                        value={aiReviewForm.category}
                        onChange={(e) => updateAiReviewForm("category", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      >
                        {(aiReviewForm.transactionType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(
                          (cat) => (
                            <option key={cat} value={cat}>
                              {categoryLabel(aiReviewForm.transactionType, cat)}
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">ผู้โอน</label>
                      <input
                        type="text"
                        value={aiReviewForm.payerName}
                        onChange={(e) => updateAiReviewForm("payerName", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">ผู้รับ</label>
                      <input
                        type="text"
                        value={aiReviewForm.recipientName}
                        onChange={(e) => updateAiReviewForm("recipientName", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        ธนาคาร/ช่องทางชำระเงิน
                      </label>
                      <input
                        type="text"
                        value={aiReviewForm.paymentMethod}
                        onChange={(e) => updateAiReviewForm("paymentMethod", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">เลขอ้างอิง</label>
                      <input
                        type="text"
                        value={aiReviewForm.referenceNumber}
                        onChange={(e) => updateAiReviewForm("referenceNumber", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        ช่องทางการขาย (ถ้ามี)
                      </label>
                      <select
                        value={aiReviewForm.salesChannel}
                        onChange={(e) => updateAiReviewForm("salesChannel", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      >
                        <option value="">ไม่ระบุ</option>
                        {SALES_CHANNELS.map((channel) => (
                          <option key={channel} value={channel}>
                            {salesChannelLabels[channel]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-500">รายละเอียด</label>
                      <input
                        type="text"
                        value={aiReviewForm.description}
                        onChange={(e) => updateAiReviewForm("description", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>
                  </div>
                )}

                {aiConfirmError && (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {aiConfirmError}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-3">
                  {aiReviewMode === "readonly" ? (
                    <button
                      type="button"
                      onClick={() => setAiReviewMode("editing")}
                      disabled={aiConfirming}
                      className="rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      แก้ไข
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAiReviewMode("readonly")}
                      disabled={aiConfirming}
                      className="rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      เสร็จแก้ไข
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={resetAiSession}
                    disabled={aiConfirming}
                    className="rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>

                  <button
                    type="button"
                    onClick={confirmAiTransaction}
                    disabled={aiConfirming || aiConfirmedId !== null}
                    className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    {aiConfirming ? "กำลังบันทึก..." : "ยืนยันและบันทึก"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            {editingId ? `✏️ แก้ไขรายการ #${editingId}` : "➕ เพิ่มรายรับ / รายจ่าย"}
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">ประเภท</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => switchTransactionType("income")}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${
                    form.transactionType === "income"
                      ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  รายรับ
                </button>
                <button
                  type="button"
                  onClick={() => switchTransactionType("expense")}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${
                    form.transactionType === "expense"
                      ? "border-red-600 bg-red-50 text-red-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  รายจ่าย
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">จำนวนเงิน (บาท)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => updateForm("amount", e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">วันที่</label>
              <input
                type="date"
                value={form.transactionDate}
                onChange={(e) => updateForm("transactionDate", e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">หมวดหมู่</label>
              <select
                value={form.category}
                onChange={(e) => updateForm("category", e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
              >
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {categoryLabel(form.transactionType, cat)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                ช่องทางการขาย (ถ้ามี)
              </label>
              <select
                value={form.salesChannel}
                onChange={(e) => updateForm("salesChannel", e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
              >
                <option value="">ไม่ระบุ</option>
                {SALES_CHANNELS.map((channel) => (
                  <option key={channel} value={channel}>
                    {salesChannelLabels[channel]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                วิธีชำระเงิน (ถ้ามี)
              </label>
              <input
                type="text"
                value={form.paymentMethod}
                onChange={(e) => updateForm("paymentMethod", e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                placeholder="เช่น โอนเงิน, เงินสด"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                สินค้าที่เกี่ยวข้อง (ถ้ามี)
              </label>
              <select
                value={form.productId}
                onChange={(e) => updateForm("productId", e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
              >
                <option value="">ไม่ระบุ</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                ออเดอร์ที่เกี่ยวข้อง (ถ้ามี)
              </label>
              <select
                value={form.orderId}
                onChange={(e) => updateForm("orderId", e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
              >
                <option value="">ไม่ระบุ</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.order_number}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                รายละเอียด (ถ้ามี)
              </label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => updateForm("description", e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                placeholder="เช่น ซื้อกล่องพัสดุ 100 ใบ"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                หมายเหตุ (ถ้ามี)
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => updateForm("notes", e.target.value)}
                className="min-h-[80px] w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>
          </div>

          {formError && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={submitForm}
              disabled={saving}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : editingId ? "บันทึกการแก้ไข" : "บันทึกรายการ"}
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
          <div className="flex flex-col gap-4 border-b p-5 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-semibold text-slate-900">รายการทั้งหมด</h2>

            <div className="flex gap-2">
              {(["all", "income", "expense"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium ${
                    filterType === type
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {type === "all" ? "ทั้งหมด" : type === "income" ? "รายรับ" : "รายจ่าย"}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">กำลังโหลดรายการ...</div>
          ) : transactions.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">ยังไม่มีรายการ</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-4">วันที่</th>
                    <th className="p-4">ประเภท</th>
                    <th className="p-4">หมวดหมู่</th>
                    <th className="p-4">รายละเอียด</th>
                    <th className="p-4">ช่องทาง</th>
                    <th className="p-4">จำนวนเงิน</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>

                <tbody>
                  {transactions.map((t) => (
                    <Fragment key={t.id}>
                    <tr className="border-t hover:bg-slate-50">
                      <td className="p-4 whitespace-nowrap text-slate-500">
                        {formatDate(t.transactionDate)}
                      </td>

                      <td className="p-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            t.transactionType === "income"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          {t.transactionType === "income" ? "รายรับ" : "รายจ่าย"}
                        </span>
                      </td>

                      <td className="p-4 text-slate-700">
                        {categoryLabel(t.transactionType, t.category)}
                      </td>

                      <td className="p-4 max-w-xs text-slate-600">
                        {t.description || "-"}
                        {/* STEP 31 — orderId is set either by the automatic order→income link
                            (src/lib/orders.ts) or by manually picking an order in the form above;
                            either way it's a meaningful "this entry is tied to an order" signal, so
                            it's shown generically rather than trying to detect "auto-generated"
                            specifically (which would need parsing notes text — brittle, and not
                            more informative to the user than just showing the order link itself).
                            STEP 34 — now also shows the linked order's current status, in red when
                            cancelled, so a cancelled order's still-counted income (per the STEP 32
                            rule that cancellation never touches Finance/Tax totals) is obvious at a
                            glance without needing to click through to the order. */}
                        {t.orderId && (
                          <span
                            className={`ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                              t.linkedOrderStatus === "cancelled"
                                ? "bg-red-100 text-red-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            🔗 ออเดอร์ #{t.orderId}
                            {t.linkedOrderStatus
                              ? ` (${ORDER_STATUS_LABELS[t.linkedOrderStatus]})`
                              : ""}
                          </span>
                        )}
                        {/* STEP 63 — returned-but-not-cancelled warning, same condition/wording as
                            Order Detail's STEP 61 warning. Purely visual: no amount/transaction/
                            status is changed by this block. Only ever shown when a real linked
                            order exists (t.orderId set, i.e. linkedOrderStatus is non-null) — a
                            transaction with no linked order never shows this, per instructions. */}
                        {t.orderId &&
                          t.linkedDeliveryStatus === "returned" &&
                          t.linkedOrderStatus !== "cancelled" && (
                            <span className="ml-2 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                              ⚠️ พัสดุตีกลับ — ยังไม่ยกเลิก
                            </span>
                          )}
                      </td>

                      <td className="p-4 text-slate-600">
                        {t.salesChannel ? salesChannelLabels[t.salesChannel] : "-"}
                      </td>

                      <td
                        className={`p-4 font-semibold ${
                          t.transactionType === "income" ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {t.transactionType === "income" ? "+" : "-"}
                        {formatCurrency(t.amount)}
                      </td>

                      <td className="p-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEdit(t)}
                            className="rounded-xl border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            แก้ไข
                          </button>
                          <button
                            onClick={() => toggleAttachments(t.id)}
                            className={`rounded-xl border px-3 py-1.5 text-xs font-medium hover:bg-slate-100 ${
                              expandedAttachmentsId === t.id
                                ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                                : "text-slate-700"
                            }`}
                          >
                            📎{" "}
                            {(attachmentsByTransaction[t.id]?.length ?? 0) > 0
                              ? `ไฟล์แนบ (${attachmentsByTransaction[t.id]!.length})`
                              : "ไฟล์แนบ"}
                          </button>
                          <button
                            onClick={() => removeTransaction(t)}
                            disabled={deletingId === t.id}
                            className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            {deletingId === t.id ? "กำลังลบ..." : "ลบ"}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {expandedAttachmentsId === t.id && (
                      <tr className="border-t bg-slate-50">
                        <td colSpan={7} className="p-4">
                          <div className="rounded-xl border bg-white p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-700">
                                📎 ไฟล์แนบ (ใบเสร็จ / สลิปโอนเงิน)
                              </p>

                              <label className="cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
                                {attachmentUploading === t.id ? "กำลังอัปโหลด..." : "+ อัปโหลดไฟล์"}
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/gif,image/webp"
                                  className="hidden"
                                  disabled={attachmentUploading === t.id}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      uploadAttachment(t.id, file);
                                    }
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            </div>

                            {attachmentError[t.id] && (
                              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                {attachmentError[t.id]}
                              </div>
                            )}

                            {attachmentsLoading === t.id ? (
                              <p className="mt-3 text-sm text-slate-500">กำลังโหลดไฟล์แนบ...</p>
                            ) : (attachmentsByTransaction[t.id]?.length ?? 0) === 0 ? (
                              <p className="mt-3 text-sm text-slate-500">ยังไม่มีไฟล์แนบ</p>
                            ) : (
                              <div className="mt-3 flex flex-wrap gap-3">
                                {attachmentsByTransaction[t.id]!.map((att) => (
                                  <div
                                    key={att.id}
                                    className="w-32 rounded-xl border p-2 text-center"
                                  >
                                    <a href={att.fileUrl} target="_blank" rel="noreferrer">
                                      <img
                                        src={att.fileUrl}
                                        alt={att.fileName}
                                        className="h-20 w-full rounded-lg object-cover"
                                      />
                                    </a>
                                    <button
                                      onClick={() => deleteAttachment(t.id, att.id)}
                                      disabled={attachmentDeletingId === att.id}
                                      className="mt-2 w-full rounded-lg border border-red-200 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                                    >
                                      {attachmentDeletingId === att.id ? "กำลังลบ..." : "ลบ"}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
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
