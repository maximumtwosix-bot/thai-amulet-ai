"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// STEP 27 — สร้างออเดอร์ใหม่จากหน้าเว็บ ใช้ POST /api/orders / createOrder() เดิมทั้งหมด
// STEP 36 — เพิ่มการเลือก/สร้างลูกค้าแล้ว ส่ง customerId เข้า POST /api/orders (ก่อนหน้านี้ไม่รองรับ
// เพราะ POST /api/orders ยังไม่อ่าน customerId จาก request body — ตอนนี้อ่านแล้ว ดู
// src/app/api/orders/route.ts และ src/lib/customers.ts)

type ProductOption = {
  id: number;
  name: string;
  price: number;
  stock: number;
};

type CustomerOption = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  district: string | null;
  province: string | null;
  postalCode: string | null;
};

const emptyNewCustomerForm = {
  name: "",
  phone: "",
  address: "",
  district: "",
  province: "",
  postalCode: "",
};

type LineItem = {
  key: string;
  productId: number | "";
  quantity: string;
  price: string;
};

function emptyLineItem(): LineItem {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    productId: "",
    quantity: "1",
    price: "",
  };
}

function formatCurrency(value: number): string {
  return `฿${value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// แปล error จาก backend (ภาษาอังกฤษ) เป็นข้อความไทยที่เข้าใจง่าย — backend เดิมส่งข้อความ
// ภาษาอังกฤษมาตรงๆ (ดู src/app/api/orders/route.ts) ไม่ใช่บั๊ก แค่ต้องแปลชั้น UI นี้เพื่อผู้ใช้จริง
function translateOrderError(message: string): string {
  const knownMessages: Record<string, string> = {
    "Order must contain at least one item": "กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ",
    "Invalid product ID": "กรุณาเลือกสินค้าให้ถูกต้อง",
    "Quantity must be a positive integer": "จำนวนต้องเป็นเลขจำนวนเต็มมากกว่า 0",
    "Invalid item price": "ราคาขายไม่ถูกต้อง",
    "Invalid shipping fee": "ค่าจัดส่งไม่ถูกต้อง",
    "Invalid discount": "ส่วนลดไม่ถูกต้อง",
    "Product not found": "ไม่พบสินค้านี้ในระบบ (อาจถูกลบไปแล้ว)",
    "Customer not found": "ไม่พบลูกค้านี้ในระบบ กรุณาเลือกลูกค้าใหม่อีกครั้ง",
    "Invalid customer ID": "ข้อมูลลูกค้าไม่ถูกต้อง กรุณาเลือกลูกค้าใหม่อีกครั้ง",
    "Insufficient stock": "สต็อกสินค้าไม่เพียงพอ กรุณาตรวจสอบจำนวนคงเหลืออีกครั้ง",
    "Order number already exists": "เลขที่ออเดอร์นี้ถูกใช้ไปแล้ว กรุณาลองใหม่อีกครั้ง",
    "Internal server error": "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง",
  };

  return knownMessages[message] || message || "ไม่สามารถสร้างออเดอร์ได้";
}

export default function NewOrderPage() {
  const router = useRouter();

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");

  const [items, setItems] = useState<LineItem[]>([emptyLineItem()]);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // STEP 36 — customer selection state, entirely separate from the product/order state above.
  // Optional throughout: an order with no customer selected must keep working exactly as before
  // (existing test requirement).
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);

  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState(emptyNewCustomerForm);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [customerFormError, setCustomerFormError] = useState("");

  useEffect(() => {
    if (!customerDropdownOpen) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setCustomerSearchLoading(true);

      try {
        const query = customerSearch.trim()
          ? `?search=${encodeURIComponent(customerSearch.trim())}`
          : "";
        const response = await fetch(`/api/customers${query}`, { cache: "no-store" });
        const data = await response.json();

        if (!cancelled && response.ok && data?.success) {
          setCustomerResults(Array.isArray(data.data) ? data.data : []);
        }
      } catch {
        // ค้นหาลูกค้าล้มเหลวไม่ใช่ error ที่ block การสร้างออเดอร์ — เงียบไว้ แค่ไม่แสดงผลลัพธ์
      } finally {
        if (!cancelled) setCustomerSearchLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerSearch, customerDropdownOpen]);

  function selectCustomer(c: CustomerOption) {
    setSelectedCustomer(c);
    setCustomerDropdownOpen(false);
    setCustomerSearch("");
    setShowNewCustomerForm(false);
  }

  function clearSelectedCustomer() {
    setSelectedCustomer(null);
  }

  function updateNewCustomerForm<K extends keyof typeof emptyNewCustomerForm>(
    key: K,
    value: (typeof emptyNewCustomerForm)[K]
  ) {
    setNewCustomerForm((current) => ({ ...current, [key]: value }));
  }

  async function submitNewCustomer() {
    setCustomerFormError("");

    if (!newCustomerForm.name.trim()) {
      setCustomerFormError("กรุณาระบุชื่อลูกค้า");
      return;
    }

    setCreatingCustomer(true);

    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCustomerForm.name.trim(),
          phone: newCustomerForm.phone.trim() || null,
          address: newCustomerForm.address.trim() || null,
          district: newCustomerForm.district.trim() || null,
          province: newCustomerForm.province.trim() || null,
          postalCode: newCustomerForm.postalCode.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถเพิ่มลูกค้าได้");
      }

      selectCustomer(data.data);
      setNewCustomerForm(emptyNewCustomerForm);
      setShowNewCustomerForm(false);
    } catch (err) {
      setCustomerFormError(err instanceof Error ? err.message : "ไม่สามารถเพิ่มลูกค้าได้");
    } finally {
      setCreatingCustomer(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      setProductsLoading(true);
      setProductsError("");

      try {
        const response = await fetch("/api/products", { cache: "no-store" });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "ไม่สามารถโหลดรายการสินค้าได้");
        }

        if (!cancelled) {
          setProducts(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (!cancelled) {
          setProductsError(
            err instanceof Error ? err.message : "ไม่สามารถโหลดรายการสินค้าได้"
          );
        }
      } finally {
        if (!cancelled) {
          setProductsLoading(false);
        }
      }
    }

    loadProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  function findProduct(productId: number | ""): ProductOption | undefined {
    if (productId === "") return undefined;
    return products.find((p) => p.id === productId);
  }

  function updateItem(key: string, patch: Partial<LineItem>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  }

  function handleProductChange(key: string, value: string) {
    const productId = value === "" ? "" : Number(value);
    const product = findProduct(productId);

    // เลือกสินค้าใหม่ → เติมราคาขายเริ่มต้นจากราคาสินค้าให้อัตโนมัติ (ผู้ใช้แก้ไขต่อได้เสมอ)
    updateItem(key, {
      productId,
      price: product ? String(product.price) : "",
    });
  }

  function addItem() {
    setItems((current) => [...current, emptyLineItem()]);
  }

  function removeItem(key: string) {
    setItems((current) => current.filter((item) => item.key !== key));
  }

  function lineSubtotal(item: LineItem): number {
    const quantity = Number(item.quantity);
    const price = Number(item.price);

    if (!Number.isFinite(quantity) || !Number.isFinite(price)) return 0;

    return quantity * price;
  }

  const orderSubtotal = items.reduce((sum, item) => sum + lineSubtotal(item), 0);
  const orderTotal = orderSubtotal; // ไม่มี input ค่าจัดส่ง/ส่วนลดในฟอร์มนี้ตามขอบเขตที่กำหนด

  function validateBeforeSubmit(): string {
    const realItems = items.filter((item) => item.productId !== "");

    if (realItems.length === 0) {
      return "กรุณาเลือกสินค้าอย่างน้อย 1 รายการ";
    }

    for (const item of realItems) {
      const product = findProduct(item.productId);

      if (!product) {
        return "พบสินค้าที่ไม่ถูกต้องในรายการ กรุณาเลือกสินค้าใหม่อีกครั้ง";
      }

      const quantity = Number(item.quantity);

      if (!Number.isInteger(quantity) || quantity <= 0) {
        return `กรุณาระบุจำนวนของ "${product.name}" เป็นจำนวนเต็มมากกว่า 0`;
      }

      if (quantity > product.stock) {
        return `จำนวนของ "${product.name}" เกินสต็อกคงเหลือ (คงเหลือ ${product.stock} ชิ้น)`;
      }

      const price = Number(item.price);

      if (!Number.isFinite(price) || price < 0) {
        return `กรุณาระบุราคาขายของ "${product.name}" ให้ถูกต้อง`;
      }
    }

    return "";
  }

  async function submitOrder() {
    if (submitting) {
      // กันการกดซ้ำระหว่างที่ยังบันทึกอยู่
      return;
    }

    const validationError = validateBeforeSubmit();

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError("");
    setSubmitting(true);

    try {
      const realItems = items.filter((item) => item.productId !== "");

      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomer ? selectedCustomer.id : null,
          items: realItems.map((item) => ({
            productId: item.productId,
            quantity: Number(item.quantity),
            price: Number(item.price),
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถสร้างออเดอร์ได้");
      }

      router.push(`/orders/${data.data.orderId}`);
    } catch (err) {
      setFormError(
        translateOrderError(err instanceof Error ? err.message : "")
      );
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <Link
            href="/orders"
            className="w-fit rounded-xl border bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            ← กลับไปรายการออเดอร์
          </Link>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">➕ สร้างออเดอร์ใหม่</h1>
          <p className="mt-1 text-sm text-slate-500">
            เลือกสินค้า ระบุจำนวนและราคาขาย ระบบจะตัดสต็อกให้อัตโนมัติเมื่อบันทึก
          </p>
        </div>

        {productsError && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {productsError}
          </div>
        )}

        {/* STEP 36 — customer selection, entirely optional. Existing orders with no customer must
            keep working exactly as before, so this section never blocks order submission. */}
        <section className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">👤 ลูกค้า (ถ้ามี)</h2>

          {selectedCustomer ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div>
                <p className="text-sm font-semibold text-emerald-800">{selectedCustomer.name}</p>
                {selectedCustomer.phone && (
                  <p className="text-xs text-emerald-700">{selectedCustomer.phone}</p>
                )}
                {(selectedCustomer.address ||
                  selectedCustomer.district ||
                  selectedCustomer.province) && (
                  <p className="text-xs text-emerald-700">
                    {[
                      selectedCustomer.address,
                      selectedCustomer.district,
                      selectedCustomer.province,
                      selectedCustomer.postalCode,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={clearSelectedCustomer}
                className="rounded-xl border bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                เปลี่ยน
              </button>
            </div>
          ) : (
            <div className="mt-3">
              <div className="relative">
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  onFocus={() => setCustomerDropdownOpen(true)}
                  placeholder="ค้นหาชื่อหรือเบอร์โทรลูกค้าที่มีอยู่แล้ว..."
                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                />

                {customerDropdownOpen && (
                  <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border bg-white shadow-lg">
                    {customerSearchLoading ? (
                      <p className="p-3 text-sm text-slate-500">กำลังค้นหา...</p>
                    ) : customerResults.length === 0 ? (
                      <p className="p-3 text-sm text-slate-500">
                        {customerSearch.trim() ? "ไม่พบลูกค้าที่ค้นหา" : "ยังไม่มีลูกค้าในระบบ"}
                      </p>
                    ) : (
                      customerResults.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectCustomer(c)}
                          className="block w-full border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                        >
                          <span className="font-medium text-slate-900">{c.name}</span>
                          {c.phone && <span className="ml-2 text-slate-500">{c.phone}</span>}
                        </button>
                      ))
                    )}
                    <button
                      type="button"
                      onClick={() => setCustomerDropdownOpen(false)}
                      className="block w-full border-t px-3 py-2 text-left text-xs text-slate-400 hover:bg-slate-50"
                    >
                      ปิด
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowNewCustomerForm((current) => !current);
                  setCustomerDropdownOpen(false);
                }}
                className="mt-2 rounded-xl border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                {showNewCustomerForm ? "ยกเลิกการเพิ่มลูกค้าใหม่" : "+ เพิ่มลูกค้าใหม่"}
              </button>

              {showNewCustomerForm && (
                <div className="mt-3 rounded-xl border bg-slate-50 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        ชื่อลูกค้า *
                      </label>
                      <input
                        type="text"
                        value={newCustomerForm.name}
                        onChange={(e) => updateNewCustomerForm("name", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        เบอร์โทร (ถ้ามี)
                      </label>
                      <input
                        type="text"
                        value={newCustomerForm.phone}
                        onChange={(e) => updateNewCustomerForm("phone", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        ที่อยู่ (ถ้ามี)
                      </label>
                      <input
                        type="text"
                        value={newCustomerForm.address}
                        onChange={(e) => updateNewCustomerForm("address", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        ตำบล/แขวง (ถ้ามี)
                      </label>
                      <input
                        type="text"
                        value={newCustomerForm.district}
                        onChange={(e) => updateNewCustomerForm("district", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        จังหวัด (ถ้ามี)
                      </label>
                      <input
                        type="text"
                        value={newCustomerForm.province}
                        onChange={(e) => updateNewCustomerForm("province", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        รหัสไปรษณีย์ (ถ้ามี)
                      </label>
                      <input
                        type="text"
                        value={newCustomerForm.postalCode}
                        onChange={(e) => updateNewCustomerForm("postalCode", e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>
                  </div>

                  {customerFormError && (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      {customerFormError}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={submitNewCustomer}
                    disabled={creatingCustomer}
                    className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    {creatingCustomer ? "กำลังบันทึก..." : "บันทึกลูกค้า"}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-white shadow-sm">
          <div className="border-b p-5">
            <h2 className="text-lg font-semibold text-slate-900">รายการสินค้า</h2>
          </div>

          {productsLoading ? (
            <div className="p-10 text-center text-sm text-slate-500">
              กำลังโหลดรายการสินค้า...
            </div>
          ) : (
            <div className="divide-y">
              {items.map((item, index) => {
                const product = findProduct(item.productId);
                const subtotal = lineSubtotal(item);

                return (
                  <div key={item.key} className="grid gap-3 p-5 sm:grid-cols-12 sm:items-end">
                    <div className="sm:col-span-5">
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        สินค้า {index + 1}
                      </label>
                      <select
                        value={item.productId}
                        onChange={(e) => handleProductChange(item.key, e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      >
                        <option value="">-- เลือกสินค้า --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (คงเหลือ {p.stock})
                          </option>
                        ))}
                      </select>
                      {product && (
                        <p className="mt-1 text-xs text-slate-500">
                          สต็อกปัจจุบัน:{" "}
                          <span
                            className={
                              product.stock <= 0 ? "font-semibold text-red-600" : "font-medium text-slate-700"
                            }
                          >
                            {product.stock} ชิ้น
                          </span>
                        </p>
                      )}
                    </div>

                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-500">จำนวน</label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        ราคาขาย/ชิ้น
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.price}
                        onChange={(e) => updateItem(item.key, { price: e.target.value })}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-500">รวม</label>
                      <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
                        {formatCurrency(subtotal)}
                      </p>
                    </div>

                    <div className="sm:col-span-1">
                      <button
                        type="button"
                        onClick={() => removeItem(item.key)}
                        disabled={items.length === 1}
                        title={items.length === 1 ? "ต้องมีอย่างน้อย 1 รายการ" : "ลบรายการนี้"}
                        className="w-full rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        ลบ
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="border-t p-5">
            <button
              type="button"
              onClick={addItem}
              className="rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              + เพิ่มสินค้าอีกรายการ
            </button>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">สรุปออเดอร์</h2>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>ยอดรวมสินค้า</span>
              <span>{formatCurrency(orderSubtotal)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-bold text-slate-900">
              <span>ยอดรวมสุทธิ</span>
              <span>{formatCurrency(orderTotal)}</span>
            </div>
          </div>

          {formError && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <button
            type="button"
            onClick={submitOrder}
            disabled={submitting || productsLoading}
            className="mt-5 w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 sm:w-auto"
          >
            {submitting ? "กำลังบันทึก..." : "✅ ยืนยันสร้างออเดอร์"}
          </button>
        </section>
      </div>
    </main>
  );
}
