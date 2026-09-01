"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

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

function formatDate(value: string): string {
  const date = new Date(value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("th-TH", { dateStyle: "medium" });
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");

  const [form, setForm] = useState(emptyForm);
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

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
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
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">👤 ลูกค้า</h1>
            <p className="mt-1 text-sm text-slate-500">
              รายชื่อลูกค้าสำหรับผูกกับออเดอร์และจัดส่ง
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

        <section className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            {editingId ? `✏️ แก้ไขลูกค้า #${editingId}` : "➕ เพิ่มลูกค้าใหม่"}
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                ชื่อลูกค้า *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateForm("name", e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                placeholder="เช่น คุณสมชาย ใจดี"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                เบอร์โทร (ถ้ามี)
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => updateForm("phone", e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                placeholder="เช่น 081-234-5678"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                รหัสไปรษณีย์ (ถ้ามี)
              </label>
              <input
                type="text"
                value={form.postalCode}
                onChange={(e) => updateForm("postalCode", e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                ที่อยู่ (ถ้ามี)
              </label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => updateForm("address", e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                placeholder="บ้านเลขที่ ถนน ซอย ฯลฯ"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                ตำบล/แขวง (ถ้ามี)
              </label>
              <input
                type="text"
                value={form.district}
                onChange={(e) => updateForm("district", e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                จังหวัด (ถ้ามี)
              </label>
              <input
                type="text"
                value={form.province}
                onChange={(e) => updateForm("province", e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
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
              {saving ? "กำลังบันทึก..." : editingId ? "บันทึกการแก้ไข" : "บันทึกลูกค้า"}
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
            <h2 className="text-lg font-semibold text-slate-900">รายชื่อลูกค้าทั้งหมด</h2>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อหรือเบอร์โทร..."
              className="w-full max-w-xs rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>

          {error && (
            <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">กำลังโหลดรายชื่อลูกค้า...</div>
          ) : customers.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              {search.trim() ? "ไม่พบลูกค้าที่ค้นหา" : "ยังไม่มีลูกค้าในระบบ"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-4">ชื่อ</th>
                    <th className="p-4">เบอร์โทร</th>
                    <th className="p-4">ที่อยู่</th>
                    <th className="p-4">เพิ่มเมื่อ</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>

                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} className="border-t hover:bg-slate-50">
                      <td className="p-4 font-medium text-slate-900">{c.name}</td>
                      <td className="p-4 text-slate-600">{c.phone || "-"}</td>
                      <td className="p-4 max-w-xs text-slate-600">
                        {[c.address, c.district, c.province, c.postalCode]
                          .filter(Boolean)
                          .join(" ") || "-"}
                      </td>
                      <td className="p-4 whitespace-nowrap text-slate-500">
                        {formatDate(c.createdAt)}
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => startEdit(c)}
                          className="rounded-xl border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          แก้ไข
                        </button>
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
