"use client";

import { useEffect, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import BackLink from "@/components/BackLink";

// STEP 23 — Low-stock panel. Local type + level helper (not imported from any lib) — this page has
// no server-only imports today and stays that way, consistent with the client-bundle-safety
// convention established in STEP 20/22 for pages that would otherwise risk pulling in db.ts.
type Product = {
  id: number;
  name: string;
  stock: number;
  low_stock_threshold: number;
  status: string;
};

type StockLevel = "out" | "low" | "ok";

function getStockLevel(product: Pick<Product, "stock" | "low_stock_threshold">): StockLevel {
  const stock = Number(product.stock || 0);
  const threshold = Number(product.low_stock_threshold || 0);

  if (stock <= 0) return "out";
  if (stock <= threshold) return "low";
  return "ok";
}

type Movement = {
  id: number;
  product_id: number;
  product_name: string;
  movement_type: string;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  reference_type: string | null;
  reference_id: number | null;
  note: string | null;
  created_at: string;
};

export default function InventoryPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [productId, setProductId] = useState("");

  // STEP 23 — Low-stock panel state, independent of the movement history above
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [showAllProducts, setShowAllProducts] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      setProductsLoading(true);

      try {
        const response = await fetch("/api/products", { cache: "no-store" });
        const data = await response.json();

        if (!cancelled && Array.isArray(data)) {
          setProducts(data);
        }
      } catch (err) {
        console.error("Load products error:", err);
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

  async function loadMovements(selectedProductId = "") {
    setLoading(true);
    setError("");

    try {
      const query = selectedProductId
        ? `?productId=${encodeURIComponent(selectedProductId)}&limit=100`
        : "?limit=100";

      const response = await fetch(`/api/inventory/movements${query}`, {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถโหลดประวัติสต็อกได้");
      }

      setMovements(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      console.error("Inventory history error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "ไม่สามารถโหลดประวัติสต็อกได้"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMovements();
  }, []);

  function formatDate(value: string) {
    if (!value) return "-";

    const date = new Date(value.replace(" ", "T") + "Z");

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString("th-TH", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

  const totalMovements = movements.length;

  const totalIncrease = movements
    .filter((item) => item.quantity_change > 0)
    .reduce((sum, item) => sum + item.quantity_change, 0);

  const totalDecrease = movements
    .filter((item) => item.quantity_change < 0)
    .reduce((sum, item) => sum + Math.abs(item.quantity_change), 0);

  return (
    <main className="min-h-screen bg-black bg-[linear-gradient(to_right,#f59e0b08_1px,transparent_1px),linear-gradient(to_bottom,#f59e0b08_1px,transparent_1px)] bg-[size:24px_24px] p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              ประวัติสต็อก
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              ตรวจสอบการเพิ่มและลดจำนวนสินค้าทั้งหมด
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <BackLink href="/products" label="กลับไปจัดการสินค้า" />
            <LogoutButton />
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border bg-neutral-900 p-5 shadow-sm">
            <p className="text-sm text-neutral-500">รายการเคลื่อนไหว</p>
            <p className="mt-2 text-3xl font-bold text-white">
              {totalMovements.toLocaleString()}
            </p>
          </div>

          <div className="rounded-2xl border bg-neutral-900 p-5 shadow-sm">
            <p className="text-sm text-neutral-500">เพิ่มสต็อก</p>
            <p className="mt-2 text-3xl font-bold text-emerald-400">
              +{totalIncrease.toLocaleString()}
            </p>
          </div>

          <div className="rounded-2xl border bg-neutral-900 p-5 shadow-sm">
            <p className="text-sm text-neutral-500">ลดสต็อก</p>
            <p className="mt-2 text-3xl font-bold text-red-400">
              -{totalDecrease.toLocaleString()}
            </p>
          </div>
        </div>

        {/* STEP 23 — Low-stock panel, independent of the movement history below */}
        <section className="mb-6 rounded-2xl border bg-neutral-900 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
            <div>
              <h2 className="text-lg font-semibold text-white">⚠️ สินค้าใกล้หมด / หมดสต็อก</h2>
              <p className="mt-1 text-sm text-neutral-500">
                สินค้าที่จำนวนคงเหลือน้อยกว่าหรือเท่ากับเกณฑ์ที่ตั้งไว้
              </p>
            </div>

            <button
              onClick={() => setShowAllProducts((current) => !current)}
              className="rounded-xl border px-3 py-1.5 text-sm font-medium text-neutral-300 hover:bg-neutral-800"
            >
              {showAllProducts ? "แสดงเฉพาะสินค้าใกล้หมด/หมด" : "แสดงสินค้าทั้งหมด"}
            </button>
          </div>

          {productsLoading ? (
            <div className="p-10 text-center text-sm text-neutral-500">กำลังโหลดข้อมูลสินค้า...</div>
          ) : (
            (() => {
              const rows = showAllProducts
                ? products
                : products.filter((p) => getStockLevel(p) !== "ok");

              if (rows.length === 0) {
                return (
                  <div className="p-10 text-center text-sm text-neutral-500">
                    {showAllProducts ? "ยังไม่มีสินค้าในระบบ" : "ไม่มีสินค้าใกล้หมดหรือหมดสต็อกในขณะนี้ 🎉"}
                  </div>
                );
              }

              return (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left text-sm">
                    <thead className="bg-black text-neutral-400">
                      <tr>
                        <th className="p-4">สินค้า</th>
                        <th className="p-4">คงเหลือ</th>
                        <th className="p-4">เกณฑ์แจ้งเตือน</th>
                        <th className="p-4">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((product) => {
                        const level = getStockLevel(product);

                        return (
                          <tr key={product.id} className="border-t hover:bg-black">
                            <td className="p-4 font-medium text-white">{product.name}</td>
                            <td className="p-4 tabular-nums text-neutral-300">{product.stock}</td>
                            <td className="p-4 tabular-nums text-neutral-500">
                              {product.low_stock_threshold}
                            </td>
                            <td className="p-4">
                              {level === "ok" ? (
                                <span className="rounded-full bg-emerald-950/40 px-3 py-1 text-xs font-medium text-emerald-400">
                                  ปกติ
                                </span>
                              ) : level === "low" ? (
                                <span className="rounded-full bg-amber-950/40 px-3 py-1 text-xs font-medium text-amber-400">
                                  ⚠️ ใกล้หมด
                                </span>
                              ) : (
                                <span className="rounded-full bg-red-950/40 px-3 py-1 text-xs font-medium text-red-400">
                                  หมด
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()
          )}
        </section>

        <section className="rounded-2xl border bg-neutral-900 shadow-sm">
          <div className="flex flex-col gap-4 border-b p-5 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Inventory Movement
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                รายการล่าสุดเรียงจากใหม่ไปเก่า
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                type="number"
                min="1"
                placeholder="Product ID"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-32 rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-300"
              />

              <button
                onClick={() => loadMovements(productId.trim())}
                disabled={loading}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                ค้นหา
              </button>

              <button
                onClick={() => {
                  setProductId("");
                  loadMovements("");
                }}
                disabled={loading}
                className="rounded-xl border px-4 py-2.5 text-sm font-medium text-neutral-300 hover:bg-black disabled:opacity-50"
              >
                ทั้งหมด
              </button>
            </div>
          </div>

          {error && (
            <div className="m-5 rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-400">
              {error}
            </div>
          )}

          {loading ? (
            <div className="p-10 text-center text-sm text-neutral-500">
              กำลังโหลดประวัติสต็อก...
            </div>
          ) : movements.length === 0 ? (
            <div className="p-10 text-center text-sm text-neutral-500">
              ยังไม่มีประวัติการเคลื่อนไหวสต็อก
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-black text-neutral-400">
                  <tr>
                    <th className="p-4">วันที่</th>
                    <th className="p-4">สินค้า</th>
                    <th className="p-4">การเปลี่ยนแปลง</th>
                    <th className="p-4">ก่อนปรับ</th>
                    <th className="p-4">หลังปรับ</th>
                    <th className="p-4">ประเภท</th>
                    <th className="p-4">เหตุผล</th>
                  </tr>
                </thead>

                <tbody>
                  {movements.map((item) => (
                    <tr
                      key={item.id}
                      className="border-t hover:bg-black"
                    >
                      <td className="p-4 whitespace-nowrap text-neutral-500">
                        {formatDate(item.created_at)}
                      </td>

                      <td className="p-4">
                        <div className="font-semibold text-white">
                          {item.product_name}
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">
                          Product ID: {item.product_id}
                        </div>
                      </td>

                      <td className="p-4">
                        {item.quantity_change > 0 ? (
                          <span className="rounded-full bg-emerald-950/40 px-3 py-1 font-semibold text-emerald-400">
                            +{item.quantity_change.toLocaleString()}
                          </span>
                        ) : (
                          <span className="rounded-full bg-red-950/40 px-3 py-1 font-semibold text-red-400">
                            {item.quantity_change.toLocaleString()}
                          </span>
                        )}
                      </td>

                      <td className="p-4 font-medium text-neutral-300">
                        {item.quantity_before.toLocaleString()}
                      </td>

                      <td className="p-4 font-semibold text-white">
                        {item.quantity_after.toLocaleString()}
                      </td>

                      <td className="p-4">
                        <span className="rounded-full bg-amber-950/40 px-3 py-1 text-xs font-medium text-amber-400">
                          {item.movement_type}
                        </span>
                      </td>

                      <td className="max-w-xs p-4 text-neutral-400">
                        {item.note || "-"}
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
