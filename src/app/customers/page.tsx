"use client";

import { useEffect, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import BackLink from "@/components/BackLink";
import { UsersIcon } from "@/components/icons";

// STEP 36 — Client Component, so this duplicates the plain shape of CustomerRow locally rather
// than importing src/lib/customers.ts (which imports ./db → better-sqlite3 — same client/server
// boundary constraint already documented in src/app/finance/page.tsx's header comment).
type CustomerRow = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  district: string | null;
  province: string | null;
  postalCode: string | null;
  createdAt: string;
};

const emptyForm = {
  name: "",
  phone: "",
  address: "",
  district: "",
  province: "",
  postalCode: "",
};

const TAG_OPTIONS = ["VIP", "ลูกค้าทั่วไป", "พ่อค้าส่ง"] as const;

// CRM-extra fields below (lineId / tag / notes) are UI-only — the `customers` table has no
// columns for them yet, and the /api/customers route does not accept or persist them. They are
// deliberately kept OUT of submitForm()'s payload so nothing here silently pretends to save data
// it can't actually store. Wiring these up for real (schema migration + API + this form) is a
// separate, larger task than restyling the page.
const emptyCrmExtra = {
  lineId: "",
  tag: "ลูกค้าทั่วไป" as (typeof TAG_OPTIONS)[number],
  notes: "",
};

const inputClass =
  "w-full rounded-xl border border-neutral-800 bg-black px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500";

function formatDate(value: string): string {
  const date = new Date(value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("th-TH", { dateStyle: "medium" });
}

// Deterministic, illustrative-only figures — there is no purchase-history or tag column on the
// customers table yet, so this is a visual mockup of what the CRM view will look like once real
// data exists, not an actual computed total for any customer.
function mockPurchaseTotal(id: number): number {
  return ((id * 733) % 18000) + 500;
}

function mockTag(id: number): (typeof TAG_OPTIONS)[number] {
  return TAG_OPTIONS[id % TAG_OPTIONS.length];
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");

  const [form, setForm] = useState(emptyForm);
  const [crmExtra, setCrmExtra] = useState(emptyCrmExtra);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  async function loadCustomers(searchTerm: string) {
    setLoading(true);
    setError("");

    try {
      const query = searchTerm.trim()
        ? `?search=${encodeURIComponent(searchTerm.trim())}`
        : "";
      const response = await fetch(`/api/customers${query}`, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถโหลดรายชื่อลูกค้าได้");
      }

      setCustomers(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ไม่สามารถโหลดรายชื่อลูกค้าได้");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // STEP 36 — simple debounce so search-as-you-type doesn't fire a request per keystroke
    const timer = setTimeout(() => {
      loadCustomers(search);
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function updateForm<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateCrmExtra<K extends keyof typeof emptyCrmExtra>(
    key: K,
    value: (typeof emptyCrmExtra)[K]
  ) {
    setCrmExtra((current) => ({ ...current, [key]: value }));
  }

  function startEdit(c: CustomerRow) {
    setEditingId(c.id);
    setFormError("");
    setForm({
      name: c.name,
      phone: c.phone || "",
      address: c.address || "",
      district: c.district || "",
      province: c.province || "",
      postalCode: c.postalCode || "",
    });
    setCrmExtra(emptyCrmExtra);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setCrmExtra(emptyCrmExtra);
    setFormError("");
  }

  async function submitForm() {
    setFormError("");

    if (!form.name.trim()) {
      setFormError("กรุณาระบุชื่อลูกค้า");
      return;
    }

    setSaving(true);

    try {
      // NOTE: crmExtra (LINE ID / tag / notes) is intentionally NOT included here — see the
      // emptyCrmExtra comment above. Only the fields the API actually supports are sent.
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        district: form.district.trim() || null,
        province: form.province.trim() || null,
        postalCode: form.postalCode.trim() || null,
      };

      const response = await fetch(
        editingId ? `/api/customers/${editingId}` : "/api/customers",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถบันทึกข้อมูลลูกค้าได้");
      }

      cancelEdit();
      await loadCustomers(search);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "ไม่สามารถบันทึกข้อมูลลูกค้าได้");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-black bg-[linear-gradient(to_right,#f59e0b08_1px,transparent_1px),linear-gradient(to_bottom,#f59e0b08_1px,transparent_1px)] bg-[size:24px_24px] p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-2.5 text-amber-500 shadow-[0_0_15px_rgba(245, 158, 11,0.1)]">
              <UsersIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">ลูกค้า</h1>
              <p className="mt-1 text-sm text-neutral-500">
                รายชื่อลูกค้าสำหรับผูกกับออเดอร์และจัดส่ง
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <BackLink href="/" label="กลับหน้าแรก" />
            <LogoutButton />
          </div>
        </div>

        <section className="mb-6 rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg shadow-[0_0_15px_rgba(245,158,11,0.05)] p-6">
          <h2 className="text-lg font-semibold text-white">
            {editingId ? `✏️ แก้ไขลูกค้า #${editingId}` : "➕ เพิ่มลูกค้าใหม่"}
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                ชื่อลูกค้า *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateForm("name", e.target.value)}
                className={inputClass}
                placeholder="เช่น คุณสมชาย ใจดี"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                เบอร์โทร (ถ้ามี)
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => updateForm("phone", e.target.value)}
                className={inputClass}
                placeholder="เช่น 081-234-5678"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                รหัสไปรษณีย์ (ถ้ามี)
              </label>
              <input
                type="text"
                value={form.postalCode}
                onChange={(e) => updateForm("postalCode", e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                ที่อยู่ (ถ้ามี)
              </label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => updateForm("address", e.target.value)}
                className={inputClass}
                placeholder="บ้านเลขที่ ถนน ซอย ฯลฯ"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                ตำบล/แขวง (ถ้ามี)
              </label>
              <input
                type="text"
                value={form.district}
                onChange={(e) => updateForm("district", e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                จังหวัด (ถ้ามี)
              </label>
              <input
                type="text"
                value={form.province}
                onChange={(e) => updateForm("province", e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-dashed border-neutral-800 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-amber-400">✨ ข้อมูลเพิ่มเติม (CRM)</h3>
              <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
                ยังไม่บันทึกลงระบบ — UI ตัวอย่างเท่านั้น
              </span>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">
                  LINE ID / Facebook
                </label>
                <input
                  type="text"
                  value={crmExtra.lineId}
                  onChange={(e) => updateCrmExtra("lineId", e.target.value)}
                  className={inputClass}
                  placeholder="เช่น @thaiamulet หรือลิงก์เฟซบุ๊ก"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">
                  ป้ายกำกับ (Tags)
                </label>
                <div className="flex flex-wrap gap-2">
                  {TAG_OPTIONS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => updateCrmExtra("tag", tag)}
                      className={`rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                        crmExtra.tag === tag
                          ? "border-amber-500 bg-amber-500/20 text-amber-400"
                          : "border-neutral-800 text-neutral-400 hover:bg-neutral-800"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-neutral-500">
                  หมายเหตุ (ความชอบส่วนตัว/ข้อมูลเพิ่มเติม)
                </label>
                <textarea
                  rows={3}
                  value={crmExtra.notes}
                  onChange={(e) => updateCrmExtra("notes", e.target.value)}
                  className={inputClass}
                  placeholder="เช่น ชอบพระเนื้อดิน ไซซ์เล็ก ชำระผ่านโอนเท่านั้น"
                />
              </div>
            </div>
          </div>

          {formError && (
            <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/40 p-3 text-sm text-red-400">
              {formError}
            </div>
          )}

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={submitForm}
              disabled={saving}
              className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : editingId ? "บันทึกการแก้ไข" : "บันทึกลูกค้า"}
            </button>

            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className="rounded-xl border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-300 hover:bg-black disabled:opacity-50"
              >
                ยกเลิก
              </button>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg shadow-[0_0_15px_rgba(245,158,11,0.05)]">
          <div className="flex flex-col gap-4 border-b border-neutral-800 p-5 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-semibold text-white">รายชื่อลูกค้าทั้งหมด</h2>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 ค้นหาชื่อหรือเบอร์โทร..."
              className={`max-w-xs ${inputClass}`}
            />
          </div>

          {error && (
            <div className="m-5 rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-400">
              {error}
            </div>
          )}

          {loading ? (
            <div className="p-10 text-center text-sm text-neutral-500">กำลังโหลดรายชื่อลูกค้า...</div>
          ) : customers.length === 0 ? (
            <div className="p-10 text-center text-sm text-neutral-500">
              {search.trim() ? "ไม่พบลูกค้าที่ค้นหา" : "ยังไม่มีลูกค้าในระบบ"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-black text-neutral-400">
                  <tr>
                    <th className="p-4">ชื่อ</th>
                    <th className="p-4">เบอร์โทร</th>
                    <th className="p-4">ที่อยู่</th>
                    <th className="p-4">ยอดซื้อสะสม</th>
                    <th className="p-4">ป้ายกำกับ</th>
                    <th className="p-4">เพิ่มเมื่อ</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>

                <tbody>
                  {customers.map((c) => {
                    const tag = mockTag(c.id);

                    return (
                      <tr key={c.id} className="border-t border-neutral-800 hover:bg-black">
                        <td className="p-4 font-medium text-white">{c.name}</td>
                        <td className="p-4 text-neutral-400">{c.phone || "-"}</td>
                        <td className="p-4 max-w-xs text-neutral-400">
                          {[c.address, c.district, c.province, c.postalCode]
                            .filter(Boolean)
                            .join(" ") || "-"}
                        </td>
                        <td className="p-4 font-semibold text-emerald-400">
                          ฿{mockPurchaseTotal(c.id).toLocaleString()}
                        </td>
                        <td className="p-4">
                          <span
                            className={`rounded-md px-2 py-1 text-xs font-medium ${
                              tag === "VIP"
                                ? "bg-amber-500/20 text-amber-500"
                                : "bg-neutral-800 text-neutral-300"
                            }`}
                          >
                            {tag}
                          </span>
                        </td>
                        <td className="p-4 whitespace-nowrap text-neutral-500">
                          {formatDate(c.createdAt)}
                        </td>
                        <td className="p-4">
                          <button
                            onClick={() => startEdit(c)}
                            className="rounded-xl border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
                          >
                            แก้ไข
                          </button>
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
