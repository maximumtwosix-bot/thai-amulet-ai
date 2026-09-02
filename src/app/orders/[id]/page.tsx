"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ORDER_STATUS_LABELS,
  getAllowedNextStatuses,
  type OrderStatus,
} from "@/lib/orderStatus";
import {
  DELIVERY_STATUSES,
  DELIVERY_STATUS_LABELS,
  type DeliveryStatus,
} from "@/lib/deliveryStatus";

type OrderItem = {
  id: number;
  product_id: number;
  product_name: string | null;
  quantity: number;
  price: number;
  cost: number;
};

// STEP 38 — order-linked transactions, read-only visibility. Local label maps duplicated rather
// than imported from @/lib/transactions (touches server-only db.ts / better-sqlite3) — same
// Client Component constraint already documented in finance/page.tsx and tax/page.tsx, same fix.
const expenseCategoryLabels: Record<string, string> = {
  PRODUCT_PURCHASE: "ซื้อสินค้าเข้าสต็อก",
  SHIPPING: "ค่าขนส่งจริงที่ร้านจ่าย",
  COD_FEE: "ค่าธรรมเนียม COD",
  RETURNED_PARCEL: "พัสดุตีกลับ",
  PACKAGING: "บรรจุภัณฑ์ / กล่อง",
  FACEBOOK_ADS: "ค่าโฆษณา Facebook / Meta",
  FUEL: "ค่าน้ำมัน",
  OTHER: "อื่นๆ",
};

const incomeCategoryLabels: Record<string, string> = {
  PRODUCT_SALE: "ขายสินค้า",
  OTHER_INCOME: "รายรับอื่นๆ",
};

function categoryLabel(type: "income" | "expense", category: string): string {
  if (type === "income") {
    return incomeCategoryLabels[category] || category;
  }
  return expenseCategoryLabels[category] || category;
}

type OrderTransaction = {
  id: number;
  transactionType: "income" | "expense";
  amount: number;
  transactionDate: string;
  category: string;
  description: string | null;
  paymentMethod: string | null;
  notes: string | null;
  linkedOrderStatus: OrderStatus | null;
};

type AttachmentInfo = {
  loaded: boolean;
  hasAttachment: boolean;
  fileUrl: string | null;
};

type OrderDetail = {
  id: number;
  order_number: string;
  customer_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_district: string | null;
  customer_province: string | null;
  customer_postal_code: string | null;
  channel: string | null;
  payment_method: string | null;
  subtotal: number;
  shipping_fee: number;
  discount: number;
  total: number;
  status: OrderStatus;
  // STEP 49 — fulfillment tracking, fully independent of `status` above (approved 2026-09-01).
  // carrier/tracking_number are null for every order created before STEP 49 (not backfilled).
  carrier: string | null;
  tracking_number: string | null;
  delivery_status: DeliveryStatus;
  created_at: string;
  items: OrderItem[];
  // STEP 31 — id of the automatically-created income transaction for this order, or null (every
  // order created before STEP 31, including historical order id 1, is null — not backfilled)
  linkedIncomeTransactionId: number | null;
};

// STEP 49 — delivery proof photo, mirrors AttachmentInfo's shape/fetch pattern above.
type DeliveryProof = {
  id: number;
  fileName: string;
  fileUrl: string;
  createdAt: string;
};

function formatDate(value: string) {
  if (!value) return "-";

  const date = new Date(value.replace(" ", "T") + "Z");

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

function formatCurrency(value: number) {
  return `฿${value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params?.id;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  // STEP 32 — order status workflow. Separate from `error` above (page-load failure) since this is
  // a distinct, later action against an already-loaded order.
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");

  // STEP 38 — order-linked transactions, read-only. Fetched via the existing
  // GET /api/transactions?orderId= filter (src/lib/transactions.ts listTransactions()) — no new API
  // route needed. Attachment presence fetched per-transaction via the existing
  // GET /api/transactions/[id]/attachments endpoint (same one Finance already uses), not
  // duplicated/reimplemented here.
  const [orderTransactions, setOrderTransactions] = useState<OrderTransaction[] | null>(null);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsError, setTransactionsError] = useState("");
  const [attachments, setAttachments] = useState<Record<number, AttachmentInfo>>({});

  // STEP 49 — order fulfillment tracking (carrier / tracking number / delivery status), approved
  // 2026-09-01. Separate state from the existing order-status workflow above — this never touches
  // order.status. Edit fields are local (carrierInput/trackingInput) so typing doesn't immediately
  // write to the server; only saveDelivery() below sends the PATCH.
  const [carrierInput, setCarrierInput] = useState("");
  const [trackingInput, setTrackingInput] = useState("");
  const [deliveryStatusInput, setDeliveryStatusInput] = useState<DeliveryStatus>("pending");
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const [deliveryProofs, setDeliveryProofs] = useState<DeliveryProof[]>([]);
  const [proofsLoading, setProofsLoading] = useState(true);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofError, setProofError] = useState("");
  const [deletingProofId, setDeletingProofId] = useState<number | null>(null);

  // STEP 52 — customer info edit (name/phone/address/district/province/postalCode), approved
  // 2026-09-02, Option A: edits the shared `customers` row via the existing
  // PATCH /api/customers/[id] (STEP 36) — same form/state pattern as src/app/customers/page.tsx's
  // edit form. No per-order snapshot: since orders.customer_id is a plain FK with no snapshot
  // columns, this intentionally updates every order tied to the same customer, not just this one
  // (see STEP 52 audit). The print view needs no changes — it already reads order.customer_* from
  // the same `order` state this refetches into.
  const customerEmptyForm = {
    name: "",
    phone: "",
    address: "",
    district: "",
    province: "",
    postalCode: "",
  };
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customerForm, setCustomerForm] = useState(customerEmptyForm);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerFormError, setCustomerFormError] = useState("");

  function updateCustomerForm<K extends keyof typeof customerEmptyForm>(
    key: K,
    value: (typeof customerEmptyForm)[K]
  ) {
    setCustomerForm((current) => ({ ...current, [key]: value }));
  }

  function startEditCustomer() {
    if (!order) return;

    setCustomerFormError("");
    setCustomerForm({
      name: order.customer_name || "",
      phone: order.customer_phone || "",
      address: order.customer_address || "",
      district: order.customer_district || "",
      province: order.customer_province || "",
      postalCode: order.customer_postal_code || "",
    });
    setEditingCustomer(true);
  }

  function cancelEditCustomer() {
    setEditingCustomer(false);
    setCustomerForm(customerEmptyForm);
    setCustomerFormError("");
  }

  async function saveCustomer() {
    if (savingCustomer || !order?.customer_id) return;

    setCustomerFormError("");

    if (!customerForm.name.trim()) {
      setCustomerFormError("กรุณาระบุชื่อลูกค้า");
      return;
    }

    setSavingCustomer(true);

    try {
      const response = await fetch(`/api/customers/${order.customer_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customerForm.name.trim(),
          phone: customerForm.phone.trim() || null,
          address: customerForm.address.trim() || null,
          district: customerForm.district.trim() || null,
          province: customerForm.province.trim() || null,
          postalCode: customerForm.postalCode.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถบันทึกข้อมูลลูกค้าได้");
      }

      cancelEditCustomer();
      await loadOrder();
    } catch (err) {
      setCustomerFormError(
        err instanceof Error ? err.message : "ไม่สามารถบันทึกข้อมูลลูกค้าได้"
      );
    } finally {
      setSavingCustomer(false);
    }
  }

  // STEP 53 — price-only correction for existing order_items, approved 2026-09-02. Deliberately
  // separate from every other edit flow on this page: never touches quantity/productId (no state
  // here even represents them as editable), and PATCHes the dedicated
  // /api/orders/[id]/items route (src/lib/orders.ts updateOrderItemPrices()), not the customer/
  // delivery/status endpoints. `priceInputs` is keyed by order_item id so multiple rows can be
  // edited in the same save. Server recomputes subtotal/total/linked-income-transaction
  // authoritatively — the local preview below is display-only.
  const [editingPrices, setEditingPrices] = useState(false);
  const [priceInputs, setPriceInputs] = useState<Record<number, string>>({});
  const [savingPrices, setSavingPrices] = useState(false);
  const [priceError, setPriceError] = useState("");

  function startEditPrices() {
    if (!order) return;

    const seeded: Record<number, string> = {};
    order.items.forEach((item) => {
      seeded[item.id] = String(item.price);
    });

    setPriceInputs(seeded);
    setPriceError("");
    setEditingPrices(true);
  }

  function cancelEditPrices() {
    setEditingPrices(false);
    setPriceInputs({});
    setPriceError("");
  }

  function updatePriceInput(itemId: number, value: string) {
    setPriceInputs((current) => ({ ...current, [itemId]: value }));
  }

  async function savePrices() {
    if (savingPrices || !order) return;

    setPriceError("");

    const items = order.items.map((item) => ({
      orderItemId: item.id,
      price: Number(priceInputs[item.id]),
    }));

    for (const item of items) {
      if (!Number.isFinite(item.price) || item.price < 0) {
        setPriceError("ราคาต้องเป็นตัวเลขที่ไม่ติดลบ");
        return;
      }
    }

    setSavingPrices(true);

    try {
      const response = await fetch(`/api/orders/${order.id}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถบันทึกราคาสินค้าได้");
      }

      cancelEditPrices();
      await loadOrder();
    } catch (err) {
      setPriceError(err instanceof Error ? err.message : "ไม่สามารถบันทึกราคาสินค้าได้");
    } finally {
      setSavingPrices(false);
    }
  }

  // STEP 54 — shipping fee / discount correction (Option C), approved 2026-09-02. Independent of
  // the STEP 53 price-edit state above: PATCHes the dedicated /api/orders/[id]/summary route
  // (src/lib/orders.ts updateOrderShippingAndDiscount()), never order_items. subtotal/total are
  // never given input fields — server-derived only, matching the STEP 54 audit's rejection of
  // direct subtotal/total editing.
  const [editingSummary, setEditingSummary] = useState(false);
  const [shippingFeeInput, setShippingFeeInput] = useState("");
  const [discountInput, setDiscountInput] = useState("");
  const [savingSummary, setSavingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  function startEditSummary() {
    if (!order) return;

    setShippingFeeInput(String(order.shipping_fee));
    setDiscountInput(String(order.discount));
    setSummaryError("");
    setEditingSummary(true);
  }

  function cancelEditSummary() {
    setEditingSummary(false);
    setShippingFeeInput("");
    setDiscountInput("");
    setSummaryError("");
  }

  async function saveSummary() {
    if (savingSummary || !order) return;

    setSummaryError("");

    const shippingFee = Number(shippingFeeInput);
    const discount = Number(discountInput);

    if (!Number.isFinite(shippingFee) || shippingFee < 0) {
      setSummaryError("ค่าจัดส่งต้องเป็นตัวเลขที่ไม่ติดลบ");
      return;
    }

    if (!Number.isFinite(discount) || discount < 0) {
      setSummaryError("ส่วนลดต้องเป็นตัวเลขที่ไม่ติดลบ");
      return;
    }

    setSavingSummary(true);

    try {
      const response = await fetch(`/api/orders/${order.id}/summary`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shippingFee, discount }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถบันทึกค่าจัดส่ง/ส่วนลดได้");
      }

      cancelEditSummary();
      await loadOrder();
    } catch (err) {
      setSummaryError(
        err instanceof Error ? err.message : "ไม่สามารถบันทึกค่าจัดส่ง/ส่วนลดได้"
      );
    } finally {
      setSavingSummary(false);
    }
  }

  async function saveDelivery() {
    if (savingDelivery || !order) return;

    setSavingDelivery(true);
    setDeliveryError("");

    try {
      const response = await fetch(`/api/orders/${order.id}/delivery`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carrier: carrierInput,
          trackingNumber: trackingInput,
          deliveryStatus: deliveryStatusInput,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถบันทึกข้อมูลการจัดส่งได้");
      }

      setOrder((current) =>
        current
          ? {
              ...current,
              carrier: data.data.carrier,
              tracking_number: data.data.trackingNumber,
              delivery_status: data.data.deliveryStatus,
            }
          : current
      );
      setCarrierInput(data.data.carrier ?? "");
      setTrackingInput(data.data.trackingNumber ?? "");
      setDeliveryStatusInput(data.data.deliveryStatus);
    } catch (err) {
      setDeliveryError(
        err instanceof Error ? err.message : "ไม่สามารถบันทึกข้อมูลการจัดส่งได้"
      );
    } finally {
      setSavingDelivery(false);
    }
  }

  async function uploadDeliveryProof(file: File) {
    if (uploadingProof || !order) return;

    setUploadingProof(true);
    setProofError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`/api/orders/${order.id}/delivery-proofs`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถอัปโหลดรูปหลักฐานได้");
      }

      setDeliveryProofs((current) => [
        ...current,
        {
          id: data.data.id,
          fileName: data.data.fileName,
          fileUrl: data.data.fileUrl,
          createdAt: data.data.createdAt,
        },
      ]);
    } catch (err) {
      setProofError(err instanceof Error ? err.message : "ไม่สามารถอัปโหลดรูปหลักฐานได้");
    } finally {
      setUploadingProof(false);
    }
  }

  async function deleteDeliveryProof(proofId: number) {
    if (deletingProofId !== null || !order) return;

    setDeletingProofId(proofId);
    setProofError("");

    try {
      const response = await fetch(
        `/api/orders/${order.id}/delivery-proofs/${proofId}`,
        { method: "DELETE" }
      );

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถลบรูปหลักฐานได้");
      }

      setDeliveryProofs((current) => current.filter((p) => p.id !== proofId));
    } catch (err) {
      setProofError(err instanceof Error ? err.message : "ไม่สามารถลบรูปหลักฐานได้");
    } finally {
      setDeletingProofId(null);
    }
  }

  async function changeStatus(nextStatus: OrderStatus) {
    // กันการกดซ้ำระหว่างที่ยังอัปเดตอยู่ (เหมือน pattern submitting/saving ที่ใช้อยู่แล้วในหน้าอื่นๆ)
    if (updatingStatus || !order) return;

    setUpdatingStatus(true);
    setStatusError("");

    try {
      const response = await fetch(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถเปลี่ยนสถานะออเดอร์ได้");
      }

      setOrder((current) => (current ? { ...current, status: nextStatus } : current));
    } catch (err) {
      setStatusError(
        err instanceof Error ? err.message : "ไม่สามารถเปลี่ยนสถานะออเดอร์ได้"
      );
    } finally {
      setUpdatingStatus(false);
    }
  }

  // STEP 52 — pulled out of the effect below (was an inline nested function) so saveCustomer()
  // above can also call it to refetch after a customer edit, same as the effect's initial load.
  const loadOrder = useCallback(async () => {
    if (!orderId) return;

    setLoading(true);
    setError("");
    setNotFound(false);

    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        cache: "no-store",
      });

      const data = await response.json();

      if (response.status === 404) {
        setNotFound(true);
        return;
      }

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถโหลดข้อมูลออเดอร์ได้");
      }

      setOrder(data.data);
      // STEP 49 — seed the edit form from the freshly-loaded order once, on initial load.
      setCarrierInput(data.data.carrier ?? "");
      setTrackingInput(data.data.tracking_number ?? "");
      setDeliveryStatusInput(data.data.delivery_status ?? "pending");
    } catch (err) {
      console.error("Load order detail error:", err);
      setError(
        err instanceof Error ? err.message : "ไม่สามารถโหลดข้อมูลออเดอร์ได้"
      );
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  // STEP 38 — order-linked transactions + their attachment presence. Separate effect/loading state
  // from the order load above so a failure here never blocks the order itself from rendering.
  useEffect(() => {
    if (!orderId) return;

    let cancelled = false;

    async function loadOrderTransactions() {
      setTransactionsLoading(true);
      setTransactionsError("");

      try {
        const response = await fetch(`/api/transactions?orderId=${orderId}`, {
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok || !data?.success) {
          throw new Error(data?.error || "ไม่สามารถโหลดธุรกรรมที่เกี่ยวข้องได้");
        }

        if (cancelled) return;

        const rows: OrderTransaction[] = data.data;
        setOrderTransactions(rows);

        // Fetch attachment presence for each transaction in parallel, reusing the existing
        // Finance attachments endpoint as-is (list only — no upload/delete on this read-only page).
        const results = await Promise.all(
          rows.map(async (t) => {
            try {
              const attachmentResponse = await fetch(`/api/transactions/${t.id}/attachments`, {
                cache: "no-store",
              });
              const attachmentData = await attachmentResponse.json();

              if (!attachmentResponse.ok || !attachmentData?.success) {
                return [t.id, { loaded: true, hasAttachment: false, fileUrl: null }] as const;
              }

              const items: Array<{ fileUrl: string }> = attachmentData.data;

              return [
                t.id,
                {
                  loaded: true,
                  hasAttachment: items.length > 0,
                  fileUrl: items.length > 0 ? items[0].fileUrl : null,
                },
              ] as const;
            } catch {
              return [t.id, { loaded: true, hasAttachment: false, fileUrl: null }] as const;
            }
          })
        );

        if (cancelled) return;

        setAttachments(Object.fromEntries(results));
      } catch (err) {
        if (cancelled) return;
        setTransactionsError(
          err instanceof Error ? err.message : "ไม่สามารถโหลดธุรกรรมที่เกี่ยวข้องได้"
        );
        setOrderTransactions(null);
      } finally {
        if (!cancelled) {
          setTransactionsLoading(false);
        }
      }
    }

    loadOrderTransactions();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // STEP 49 — delivery proof photos, read on load. Separate effect so a failure here never blocks
  // the order or its transactions from rendering.
  useEffect(() => {
    if (!orderId) return;

    let cancelled = false;

    async function loadDeliveryProofs() {
      setProofsLoading(true);

      try {
        const response = await fetch(`/api/orders/${orderId}/delivery-proofs`, {
          cache: "no-store",
        });

        const data = await response.json();

        if (cancelled) return;

        if (!response.ok || !data?.success) {
          throw new Error(data?.error || "ไม่สามารถโหลดรูปหลักฐานการจัดส่งได้");
        }

        setDeliveryProofs(data.data);
      } catch (err) {
        if (cancelled) return;
        setProofError(
          err instanceof Error ? err.message : "ไม่สามารถโหลดรูปหลักฐานการจัดส่งได้"
        );
      } finally {
        if (!cancelled) {
          setProofsLoading(false);
        }
      }
    }

    loadDeliveryProofs();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // STEP 38 — shipping/COD breakdown, derived read-only from orderTransactions. N/A (never 0, never
  // guessed) whenever no linked transaction of that category exists — order.shipping_fee (the
  // customer-facing fee, a plain orders column) is the only one of the four always known.
  function sumByCategory(category: string): number | null {
    if (!orderTransactions) return null;
    const matches = orderTransactions.filter(
      (t) => t.transactionType === "expense" && t.category === category
    );
    if (matches.length === 0) return null;
    return matches.reduce((sum, t) => sum + t.amount, 0);
  }

  const actualShippingExpense = sumByCategory("SHIPPING");
  const returnShippingExpense = sumByCategory("RETURNED_PARCEL");
  const codFee = sumByCategory("COD_FEE");

  const totalIncome = (orderTransactions ?? [])
    .filter((t) => t.transactionType === "income")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = (orderTransactions ?? [])
    .filter((t) => t.transactionType === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link
            href="/orders"
            className="w-fit rounded-xl border bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            ← กลับไปรายการออเดอร์
          </Link>

          {/* STEP 48 — print-friendly receipt/packing-slip view. Uses only order data already
              loaded by this page (no new fetch, no new endpoint). window.print() is the browser's
              own print dialog, which already supports "Save as PDF" as a destination on every major
              browser — nothing extra is needed to satisfy that requirement. */}
          {order && (
            <button
              type="button"
              onClick={() => window.print()}
              className="w-fit rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              🖨️ พิมพ์ใบเสร็จ / ใบปะหน้าพัสดุ
            </button>
          )}
        </div>

        {loading ? (
          <div className="rounded-2xl border bg-white p-10 text-center text-sm text-slate-500 shadow-sm print:hidden">
            กำลังโหลดข้อมูลออเดอร์...
          </div>
        ) : notFound ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-10 text-center text-sm text-red-700 shadow-sm print:hidden">
            ไม่พบออเดอร์ที่ต้องการ
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-10 text-center text-sm text-red-700 shadow-sm print:hidden">
            {error}
          </div>
        ) : order ? (
          <>
            {/* STEP 48 — print:hidden wraps the entire existing on-screen Order Detail UI (status
                card, items table, shipping summary, linked-transactions section) so none of it
                appears in the printed output — a dedicated, separate printable block (below) is
                rendered instead. Nothing inside this div changed: same JSX, same handlers, same
                data, only the wrapping element and this one className are new. */}
            <div className="print:hidden">
            <div className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">
                    {order.order_number}
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    {formatDate(order.created_at)}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-fit rounded-full bg-amber-50 px-4 py-1.5 text-sm font-medium text-amber-700">
                      {ORDER_STATUS_LABELS[order.status] || order.status}
                    </span>

                    {order.linkedIncomeTransactionId ? (
                      <span className="w-fit rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-700">
                        ✅ บันทึกรายรับแล้ว (#{order.linkedIncomeTransactionId})
                      </span>
                    ) : (
                      <span className="w-fit rounded-full bg-slate-100 px-4 py-1.5 text-sm font-medium text-slate-500">
                        ยังไม่มีรายรับที่บันทึกไว้
                      </span>
                    )}
                  </div>

                  {/* STEP 32 — only shows buttons for statuses actually reachable from the current
                      one (src/lib/orderStatus.ts's transition table); nothing renders once the
                      order reaches a terminal status (completed/cancelled) */}
                  {getAllowedNextStatuses(order.status).length > 0 && (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="text-xs text-slate-400">เปลี่ยนสถานะ:</span>
                      {getAllowedNextStatuses(order.status).map((next) => (
                        <button
                          key={next}
                          type="button"
                          onClick={() => changeStatus(next)}
                          disabled={updatingStatus}
                          className="rounded-xl border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          {updatingStatus ? "กำลังบันทึก..." : ORDER_STATUS_LABELS[next]}
                        </button>
                      ))}
                    </div>
                  )}

                  {statusError && (
                    <p className="text-xs text-red-600">{statusError}</p>
                  )}
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      ลูกค้า
                    </p>
                    {/* STEP 52 — only editable when the order actually has a linked customer_id
                        to PATCH; orders with no customer have nothing to edit here. */}
                    {order.customer_id && !editingCustomer && (
                      <button
                        type="button"
                        onClick={startEditCustomer}
                        className="text-xs font-medium text-amber-700 hover:underline"
                      >
                        ✏️ แก้ไขข้อมูลลูกค้า
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-700">
                    {order.customer_name || "ไม่มีข้อมูลลูกค้า"}
                  </p>
                  {order.customer_phone && (
                    <p className="text-sm text-slate-500">{order.customer_phone}</p>
                  )}
                  {(order.customer_address ||
                    order.customer_district ||
                    order.customer_province) && (
                    <p className="text-sm text-slate-500">
                      {[
                        order.customer_address,
                        order.customer_district,
                        order.customer_province,
                        order.customer_postal_code,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    ช่องทาง / การชำระเงิน
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    {order.channel || "-"}
                  </p>
                  <p className="text-sm text-slate-500">
                    {order.payment_method || "-"}
                  </p>
                </div>
              </div>

              {/* STEP 52 — customer edit form, same field set/pattern as src/app/customers/page.tsx.
                  PATCHes the existing /api/customers/[id] directly; on success, refetches this order
                  via loadOrder() so both the on-screen info above and the print view (which reads
                  the same order.customer_* fields) pick up the change automatically. */}
              {editingCustomer && (
                <div className="mt-6 rounded-xl border bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold text-slate-900">
                    ✏️ แก้ไขข้อมูลลูกค้า
                  </h3>

                  <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        ชื่อลูกค้า *
                      </label>
                      <input
                        type="text"
                        value={customerForm.name}
                        onChange={(e) => updateCustomerForm("name", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        เบอร์โทร (ถ้ามี)
                      </label>
                      <input
                        type="text"
                        value={customerForm.phone}
                        onChange={(e) => updateCustomerForm("phone", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        รหัสไปรษณีย์ (ถ้ามี)
                      </label>
                      <input
                        type="text"
                        value={customerForm.postalCode}
                        onChange={(e) => updateCustomerForm("postalCode", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>

                    <div className="sm:col-span-2 lg:col-span-3">
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        ที่อยู่ (ถ้ามี)
                      </label>
                      <input
                        type="text"
                        value={customerForm.address}
                        onChange={(e) => updateCustomerForm("address", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        ตำบล/แขวง (ถ้ามี)
                      </label>
                      <input
                        type="text"
                        value={customerForm.district}
                        onChange={(e) => updateCustomerForm("district", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        จังหวัด (ถ้ามี)
                      </label>
                      <input
                        type="text"
                        value={customerForm.province}
                        onChange={(e) => updateCustomerForm("province", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>
                  </div>

                  {customerFormError && (
                    <p className="mt-3 text-xs text-red-600">{customerFormError}</p>
                  )}

                  <div className="mt-4 flex gap-3">
                    <button
                      type="button"
                      onClick={saveCustomer}
                      disabled={savingCustomer}
                      className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                      {savingCustomer ? "กำลังบันทึก..." : "บันทึกข้อมูลลูกค้า"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditCustomer}
                      disabled={savingCustomer}
                      className="rounded-xl border px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}
            </div>

            <section className="rounded-2xl border bg-white shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b p-5">
                <h2 className="text-lg font-semibold text-slate-900">
                  รายการสินค้า
                </h2>

                {/* STEP 53 — price-only edit. Hidden entirely once the order has reached a
                    terminal status (completed/cancelled); the server enforces this same rule
                    independently in updateOrderItemPrices(), so this is a UX convenience, not the
                    only guard. */}
                {!editingPrices &&
                  (getAllowedNextStatuses(order.status).length > 0 ? (
                    <button
                      type="button"
                      onClick={startEditPrices}
                      className="text-xs font-medium text-amber-700 hover:underline"
                    >
                      ✏️ แก้ไขราคา
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">
                      ออเดอร์นี้อยู่ในสถานะสิ้นสุดแล้ว ไม่สามารถแก้ไขราคาได้
                    </span>
                  ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="p-4">สินค้า</th>
                      <th className="p-4">จำนวน</th>
                      <th className="p-4">ราคา/ชิ้น</th>
                      <th className="p-4">รวม</th>
                    </tr>
                  </thead>

                  <tbody>
                    {order.items.map((item) => {
                      const editedPrice = Number(priceInputs[item.id]);
                      const rowPrice =
                        editingPrices && Number.isFinite(editedPrice) ? editedPrice : item.price;

                      return (
                        <tr key={item.id} className="border-t hover:bg-slate-50">
                          <td className="p-4">
                            <div className="font-semibold text-slate-900">
                              {item.product_name || `สินค้ารหัส ${item.product_id}`}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              Product ID: {item.product_id}
                            </div>
                          </td>
                          <td className="p-4 text-slate-700">{item.quantity}</td>
                          <td className="p-4 text-slate-700">
                            {editingPrices ? (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={priceInputs[item.id] ?? ""}
                                onChange={(e) => updatePriceInput(item.id, e.target.value)}
                                className="w-28 rounded-lg border px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                              />
                            ) : (
                              formatCurrency(item.price)
                            )}
                          </td>
                          <td className="p-4 font-semibold text-slate-900">
                            {formatCurrency(rowPrice * item.quantity)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {editingPrices && (
                <div className="border-t p-5">
                  {priceError && (
                    <p className="mb-3 text-xs text-red-600">{priceError}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={savePrices}
                      disabled={savingPrices}
                      className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                      {savingPrices ? "กำลังบันทึก..." : "บันทึกราคา"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditPrices}
                      disabled={savingPrices}
                      className="rounded-xl border px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2 border-t p-5 text-sm">
                {/* STEP 53/54 — preview only, computed from local (unsaved) input while editing;
                    the server recomputes subtotal/total authoritatively on save and loadOrder()
                    replaces these with the real values afterward. subtotal/total themselves are
                    never given input fields anywhere on this page — always server-derived. */}
                {(() => {
                  const previewSubtotal = editingPrices
                    ? order.items.reduce((sum, item) => {
                        const edited = Number(priceInputs[item.id]);
                        const price = Number.isFinite(edited) ? edited : item.price;
                        return sum + price * item.quantity;
                      }, 0)
                    : order.subtotal;

                  const editedShippingFee = Number(shippingFeeInput);
                  const effectiveShippingFee =
                    editingSummary && Number.isFinite(editedShippingFee)
                      ? editedShippingFee
                      : order.shipping_fee;

                  const editedDiscount = Number(discountInput);
                  const effectiveDiscount =
                    editingSummary && Number.isFinite(editedDiscount)
                      ? editedDiscount
                      : order.discount;

                  const previewing = editingPrices || editingSummary;
                  const previewTotal = previewing
                    ? previewSubtotal + effectiveShippingFee - effectiveDiscount
                    : order.total;

                  return (
                    <>
                      <div className="flex justify-between text-slate-600">
                        <span>ยอดรวมสินค้า{editingPrices ? " (ตัวอย่าง)" : ""}</span>
                        <span>{formatCurrency(previewSubtotal)}</span>
                      </div>

                      <div className="flex items-center justify-between text-slate-600">
                        <span>ค่าจัดส่ง</span>
                        {editingSummary ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={shippingFeeInput}
                            onChange={(e) => setShippingFeeInput(e.target.value)}
                            className="w-28 rounded-lg border px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                          />
                        ) : (
                          <span>{formatCurrency(order.shipping_fee)}</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-slate-600">
                        <span>ส่วนลด</span>
                        {editingSummary ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={discountInput}
                            onChange={(e) => setDiscountInput(e.target.value)}
                            className="w-28 rounded-lg border px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                          />
                        ) : (
                          <span>-{formatCurrency(order.discount)}</span>
                        )}
                      </div>

                      <div className="flex justify-between border-t pt-2 text-base font-bold text-slate-900">
                        <span>ยอดรวมสุทธิ{previewing ? " (ตัวอย่าง)" : ""}</span>
                        <span>{formatCurrency(previewTotal)}</span>
                      </div>

                      {/* STEP 54 — shipping fee / discount edit. Hidden entirely once the order has
                          reached a terminal status; the server enforces this same rule
                          independently in updateOrderShippingAndDiscount(). */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                        {!editingSummary &&
                          (getAllowedNextStatuses(order.status).length > 0 ? (
                            <button
                              type="button"
                              onClick={startEditSummary}
                              className="text-xs font-medium text-amber-700 hover:underline"
                            >
                              ✏️ แก้ไขค่าจัดส่ง/ส่วนลด
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">
                              ออเดอร์นี้อยู่ในสถานะสิ้นสุดแล้ว ไม่สามารถแก้ไขค่าจัดส่ง/ส่วนลดได้
                            </span>
                          ))}
                      </div>

                      {editingSummary && (
                        <div className="pt-2">
                          {summaryError && (
                            <p className="mb-2 text-xs text-red-600">{summaryError}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              onClick={saveSummary}
                              disabled={savingSummary}
                              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                            >
                              {savingSummary ? "กำลังบันทึก..." : "บันทึก"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditSummary}
                              disabled={savingSummary}
                              className="rounded-xl border px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </section>

            <section className="mt-6 rounded-2xl border bg-white shadow-sm">
              <div className="border-b p-5">
                <h2 className="text-lg font-semibold text-slate-900">
                  🚚 สรุปค่าจัดส่ง
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  แยกระหว่างเงินที่เรียกเก็บจากลูกค้ากับต้นทุนจริงที่ร้านจ่าย — ตัวเลขมาจากข้อมูลจริงใน
                  ระบบเท่านั้น แสดง N/A เมื่อไม่มีข้อมูล
                </p>
              </div>

              <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">ค่าส่งที่เรียกเก็บจากลูกค้า</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {formatCurrency(order.shipping_fee)}
                  </p>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">ค่าขนส่งจริงที่ร้านจ่าย</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {transactionsLoading
                      ? "..."
                      : actualShippingExpense === null
                        ? "N/A"
                        : formatCurrency(actualShippingExpense)}
                  </p>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">ค่าเสียหายจากพัสดุตีกลับ</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {transactionsLoading
                      ? "..."
                      : returnShippingExpense === null
                        ? "N/A"
                        : formatCurrency(returnShippingExpense)}
                  </p>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">ค่าธรรมเนียม COD</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {transactionsLoading ? "..." : codFee === null ? "N/A" : formatCurrency(codFee)}
                  </p>
                </div>
              </div>
            </section>

            {/* STEP 49 — order fulfillment tracking (carrier / tracking number / delivery status /
                delivery proof photos), approved 2026-09-01. Fully independent of the order-status
                card above — no automatic sync, no effect on transactions/inventory in either
                direction. */}
            <section className="mt-6 rounded-2xl border bg-white shadow-sm">
              <div className="border-b p-5">
                <h2 className="text-lg font-semibold text-slate-900">
                  🚚 การจัดส่งพัสดุ
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  ข้อมูลขนส่ง/เลขพัสดุ/สถานะการจัดส่ง แยกต่างหากจากสถานะออเดอร์ด้านบน แก้ไขได้อิสระ
                  โดยไม่กระทบรายรับ/สต็อก/สถานะออเดอร์
                </p>
              </div>

              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <label className="text-sm text-slate-700">
                  ขนส่ง (บริษัทขนส่ง)
                  <input
                    type="text"
                    value={carrierInput}
                    onChange={(e) => setCarrierInput(e.target.value)}
                    placeholder="เช่น Kerry, Flash, ไปรษณีย์ไทย, J&T"
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                  />
                </label>

                <label className="text-sm text-slate-700">
                  เลขพัสดุ (Tracking Number)
                  <input
                    type="text"
                    value={trackingInput}
                    onChange={(e) => setTrackingInput(e.target.value)}
                    placeholder="เลขพัสดุ"
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                  />
                </label>

                <label className="text-sm text-slate-700 sm:col-span-2">
                  สถานะการจัดส่ง
                  <select
                    value={deliveryStatusInput}
                    onChange={(e) =>
                      setDeliveryStatusInput(e.target.value as DeliveryStatus)
                    }
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                  >
                    {DELIVERY_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {DELIVERY_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t p-5">
                <button
                  type="button"
                  onClick={saveDelivery}
                  disabled={savingDelivery}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {savingDelivery ? "กำลังบันทึก..." : "บันทึกข้อมูลการจัดส่ง"}
                </button>

                <span className="w-fit rounded-full bg-amber-50 px-4 py-1.5 text-sm font-medium text-amber-700">
                  {DELIVERY_STATUS_LABELS[order.delivery_status] || order.delivery_status}
                </span>

                {deliveryError && (
                  <p className="w-full text-xs text-red-600">{deliveryError}</p>
                )}
              </div>

              <div className="border-t p-5">
                <h3 className="text-sm font-semibold text-slate-900">รูปหลักฐานการจัดส่ง</h3>

                <div className="mt-3">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    disabled={uploadingProof}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        uploadDeliveryProof(file);
                      }
                      e.target.value = "";
                    }}
                    className="text-sm text-slate-600"
                  />
                  {uploadingProof && (
                    <p className="mt-1 text-xs text-slate-500">กำลังอัปโหลด...</p>
                  )}
                </div>

                {proofError && (
                  <p className="mt-2 text-xs text-red-600">{proofError}</p>
                )}

                {proofsLoading ? (
                  <p className="mt-3 text-sm text-slate-500">กำลังโหลดรูปหลักฐาน...</p>
                ) : deliveryProofs.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">ยังไม่มีรูปหลักฐานการจัดส่ง</p>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {deliveryProofs.map((proof) => (
                      <div key={proof.id} className="overflow-hidden rounded-xl border">
                        <a href={proof.fileUrl} target="_blank" rel="noopener noreferrer">
                          <img
                            src={proof.fileUrl}
                            alt="รูปหลักฐานการจัดส่ง"
                            className="h-28 w-full object-cover"
                          />
                        </a>
                        <button
                          type="button"
                          onClick={() => deleteDeliveryProof(proof.id)}
                          disabled={deletingProofId === proof.id}
                          className="w-full border-t bg-white px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingProofId === proof.id ? "กำลังลบ..." : "ลบรูปนี้"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="mt-6 rounded-2xl border bg-white shadow-sm">
              <div className="border-b p-5">
                <h2 className="text-lg font-semibold text-slate-900">
                  💳 ธุรกรรมที่เกี่ยวข้องกับออเดอร์
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  รายการนี้เป็นข้อมูลอ่านอย่างเดียว — ไม่สามารถแก้ไข/ลบธุรกรรมจากหน้านี้ได้
                </p>
              </div>

              {transactionsError && (
                <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {transactionsError}
                </div>
              )}

              {transactionsLoading ? (
                <p className="p-5 text-sm text-slate-500">กำลังโหลดข้อมูล...</p>
              ) : !orderTransactions || orderTransactions.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">
                  ยังไม่มีธุรกรรมที่ผูกกับออเดอร์นี้
                </p>
              ) : (
                <>
                  <div className="divide-y">
                    {orderTransactions.map((t) => {
                      const attachment = attachments[t.id];

                      return (
                        <div key={t.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <span
                              className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${
                                t.transactionType === "income"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-red-50 text-red-700"
                              }`}
                            >
                              {t.transactionType === "income" ? "รายได้" : "ค่าใช้จ่าย"}
                            </span>
                            <p className="mt-2 text-sm font-semibold text-slate-900">
                              {categoryLabel(t.transactionType, t.category)}
                            </p>
                            {t.description && (
                              <p className="mt-1 text-xs text-slate-500">{t.description}</p>
                            )}
                            <p className="mt-1 text-xs text-slate-400">{t.transactionDate}</p>
                            {t.linkedOrderStatus && (
                              <p className="mt-1 text-xs text-slate-500">
                                สถานะออเดอร์: {ORDER_STATUS_LABELS[t.linkedOrderStatus] || t.linkedOrderStatus}
                              </p>
                            )}
                            <p className="mt-1 text-xs text-slate-500">
                              {attachment?.loaded
                                ? attachment.hasAttachment
                                  ? (
                                    <>
                                      📎 มีหลักฐานแนบ —{" "}
                                      <a
                                        href={attachment.fileUrl ?? "#"}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-amber-700 underline hover:text-amber-900"
                                      >
                                        ดูหลักฐาน
                                      </a>
                                    </>
                                  )
                                  : "ไม่มีหลักฐานแนบ"
                                : "กำลังตรวจสอบหลักฐาน..."}
                            </p>
                          </div>

                          <p
                            className={`text-lg font-bold ${
                              t.transactionType === "income" ? "text-emerald-600" : "text-red-600"
                            }`}
                          >
                            {t.transactionType === "income" ? "+" : "-"}
                            {formatCurrency(t.amount)}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-2 border-t bg-slate-50 p-5 text-sm">
                    <div className="flex justify-between text-slate-600">
                      <span>รายได้รวม</span>
                      <span className="font-semibold text-emerald-600">
                        {formatCurrency(totalIncome)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>ค่าใช้จ่ายรวม</span>
                      <span className="font-semibold text-red-600">
                        {formatCurrency(totalExpense)}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </section>
            </div>

            {/* STEP 48 — print-only receipt / packing-slip. hidden on screen, shown only when
                printing (Tailwind's print: variant). Built entirely from the same `order` object
                already loaded above — no new fetch, no new endpoint, no carrier/tracking fields
                (none exist in the data, so none are shown or invented). Plain black-on-white, no
                background colors, so it stays readable on a black & white printer; compact enough
                to be practical as a packing slip while still fitting A4. */}
            <div className="hidden print:block">
              <div className="mb-4">
                <h1 className="text-xl font-bold text-black">ใบเสร็จ / ใบปะหน้าพัสดุ</h1>
                <p className="text-sm text-black">เลขที่ออเดอร์: {order.order_number}</p>
                <p className="text-sm text-black">วันที่สั่งซื้อ: {formatDate(order.created_at)}</p>
              </div>

              <div className="mb-4 border border-black p-3">
                <p className="text-xs font-semibold uppercase text-black">จัดส่งถึง</p>
                <p className="mt-1 text-sm font-semibold text-black">
                  {order.customer_name || "ไม่มีข้อมูลลูกค้า"}
                </p>
                {order.customer_phone && (
                  <p className="text-sm text-black">โทร: {order.customer_phone}</p>
                )}
                {(order.customer_address ||
                  order.customer_district ||
                  order.customer_province) && (
                  <p className="text-sm text-black">
                    {[
                      order.customer_address,
                      order.customer_district,
                      order.customer_province,
                      order.customer_postal_code,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  </p>
                )}
              </div>

              <table className="mb-4 w-full border border-black text-left text-sm text-black">
                <thead>
                  <tr className="border-b border-black">
                    <th className="border-r border-black p-2">สินค้า</th>
                    <th className="border-r border-black p-2 text-right">จำนวน</th>
                    <th className="border-r border-black p-2 text-right">ราคา/ชิ้น</th>
                    <th className="p-2 text-right">รวม</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id} className="border-b border-black">
                      <td className="border-r border-black p-2">
                        {item.product_name || `สินค้ารหัส ${item.product_id}`}
                      </td>
                      <td className="border-r border-black p-2 text-right">{item.quantity}</td>
                      <td className="border-r border-black p-2 text-right">
                        {formatCurrency(item.price)}
                      </td>
                      <td className="p-2 text-right">
                        {formatCurrency(item.price * item.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mb-4 space-y-1 text-sm text-black">
                <div className="flex justify-between">
                  <span>ยอดรวมสินค้า</span>
                  <span>{formatCurrency(order.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>ค่าจัดส่ง</span>
                  <span>{formatCurrency(order.shipping_fee)}</span>
                </div>
                <div className="flex justify-between">
                  <span>ส่วนลด</span>
                  <span>-{formatCurrency(order.discount)}</span>
                </div>
                <div className="flex justify-between border-t border-black pt-1 text-base font-bold">
                  <span>ยอดรวมสุทธิ</span>
                  <span>{formatCurrency(order.total)}</span>
                </div>
              </div>

              <div className="mb-4 text-sm text-black">
                <p>ช่องทางการขาย: {order.channel || "-"}</p>
                <p>วิธีชำระเงิน: {order.payment_method || "-"}</p>
                {/* STEP 51 — carrier/tracking/delivery status, print-only. Reuses order state and
                    DELIVERY_STATUS_LABELS already loaded/imported for the STEP 49 section above;
                    no new fetch, no new state. */}
                <p>ขนส่ง: {order.carrier || "-"}</p>
                <p>เลขพัสดุ: {order.tracking_number || "-"}</p>
                <p>สถานะการจัดส่ง: {DELIVERY_STATUS_LABELS[order.delivery_status]}</p>
              </div>

              {order.payment_method === "cod" && (
                <div className="border-2 border-black p-3">
                  <p className="text-sm font-semibold">ยอดเก็บเงินปลายทาง (COD)</p>
                  <p className="text-2xl font-bold">{formatCurrency(order.total)}</p>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
