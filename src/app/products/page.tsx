"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import BackLink from "@/components/BackLink";
import { PenLineIcon, UploadCloudIcon, XIcon } from "@/components/icons";

type Product = {
  id: number;
  name: string;
  model: string | null;
  master: string | null;
  year: string | null;
  description: string | null;
  price: number;
  cost: number;
  stock: number;
  low_stock_threshold: number;
  category: string | null;
  status: string;
};

// STEP 23 — out: stock=0 (เดิม "หมด"), low: 0 < stock <= threshold, ok: stock > threshold
type StockLevel = "out" | "low" | "ok";

function getStockLevel(product: Pick<Product, "stock" | "low_stock_threshold">): StockLevel {
  const stock = Number(product.stock || 0);
  const threshold = Number(product.low_stock_threshold || 0);

  if (stock <= 0) return "out";
  if (stock <= threshold) return "low";
  return "ok";
}

// Deterministic, illustrative-only mock "จำนวนชิ้นที่ขายได้" — there is no sold-count or order-history
// column/query behind this. It exists purely so the best-seller sort/badges below have something to
// render; it is NOT wired to real orders and must never be presented as an actual sales figure.
function mockSoldCount(id: number): number {
  return (id * 37) % 250;
}
// รูปภาพสินค้า — ใช้ API/ตาราง product_media ที่มีอยู่แล้ว (STEP 13/14) ไม่สร้าง route/ตารางใหม่
// รูปแบบ type ตรงกับ src/app/video-studio/page.tsx (ProductMediaItem) เพื่อความสอดคล้อง
type ProductMediaItem = {
  id: number;
  fileName: string;
  url: string;
  type: "image" | "video";
  source: string;
  isPrimary: boolean;
  createdAt: string;
};
type FormState = {
  name: string;
  model: string;
  master: string;
  year: string;
  description: string;
  price: string;
  cost: string;
  stock: string;
  lowStockThreshold: string;
};
const emptyForm: FormState = {
  name: "",
  model: "",
  master: "",
  year: "",
  description: "",
  price: "",
  cost: "",
  stock: "",
  lowStockThreshold: "0",
};
export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);

  // Dropzone สำหรับ "เพิ่มสินค้าใหม่" — เก็บไฟล์ไว้เฉยๆ จนกว่าจะสร้างสินค้าสำเร็จ (มี productId จริง)
  // แล้วค่อยอัปโหลดต่อผ่าน uploadProductImage() ที่มีอยู่แล้ว (ยิง /api/products/[id]/media จริง)
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [newImagePreviewUrl, setNewImagePreviewUrl] = useState<string | null>(null);

  function setNewImage(file: File | undefined | null) {
    if (newImagePreviewUrl) {
      URL.revokeObjectURL(newImagePreviewUrl);
    }
    if (!file) {
      setNewImageFile(null);
      setNewImagePreviewUrl(null);
      return;
    }
    setNewImageFile(file);
    setNewImagePreviewUrl(URL.createObjectURL(file));
  }

  function closeAddModal() {
    setShowForm(false);
    setForm(emptyForm);
    setNewImage(null);
    setError("");
  }

  // ===== แก้ไขสินค้า (STEP 30) — แยก state จากฟอร์ม "เพิ่มสินค้า" โดยเจตนา ไม่ใช้ร่วมกัน =====
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // STEP 36.9D — Stock Adjustment UI
  const [stockAdjustingId, setStockAdjustingId] = useState<number | null>(null);
  const [stockAdjustValue, setStockAdjustValue] = useState("");
  const [stockAdjustNote, setStockAdjustNote] = useState("");
  const [stockAdjustSaving, setStockAdjustSaving] = useState(false);
  const [stockAdjustError, setStockAdjustError] = useState("");

  // STEP 23 — Low-Stock filter
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  function startEdit(product: Product) {
    setStockAdjustingId(null);
    setEditingId(product.id);
    setEditForm({
      name: product.name,
      model: product.model || "",
      master: product.master || "",
      year: product.year || "",
      description: product.description || "",
      price: String(product.price),
      cost: String(product.cost),
      stock: String(product.stock),
      lowStockThreshold: String(product.low_stock_threshold ?? 0),
    });
    setEditError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyForm);
    setEditError("");
  }

  function updateEditForm(field: keyof FormState, value: string) {
    setEditForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  // เก็บ Product ID ของแถวที่กำลังแก้ไขไว้ใน editingId อย่างชัดเจน — PATCH ระบุ id นี้เท่านั้น
  // ไม่มีทางใช้ชื่อสินค้าเป็นตัวระบุ เพราะไม่เคยส่ง name ไปเป็นตัวระบุแถวเลยตลอดทั้งฟังก์ชันนี้
  async function saveEdit(productId: number) {
    if (!editForm.name.trim()) {
      alert("กรุณากรอกชื่อสินค้า");
      return;
    }
    if (!editForm.price) {
      alert("กรุณากรอกราคาขาย");
      return;
    }
    try {
      setEditSaving(true);
      setEditError("");
      const response = await fetch(`/api/products?id=${productId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editForm.name,
          model: editForm.model,
          master: editForm.master,
          year: editForm.year,
          description: editForm.description,
          price: Number(editForm.price),
          cost: Number(editForm.cost || 0),
          stock: Number(editForm.stock || 0),
          lowStockThreshold: Number(editForm.lowStockThreshold || 0),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "ไม่สามารถแก้ไขสินค้าได้");
      }
      setProducts((current) =>
        current.map((product) =>
          product.id === productId ? data.product : product
        )
      );
      setEditingId(null);
      setEditForm(emptyForm);
    } catch (err) {
      console.error(err);
      setEditError(
        err instanceof Error ? err.message : "ไม่สามารถแก้ไขสินค้าได้"
      );
    } finally {
      setEditSaving(false);
    }
  }

  // ===== รูปภาพสินค้า — ใช้ /api/products/[id]/media (list/upload) ที่มีอยู่แล้วเท่านั้น =====
  // STEP 36.9D — Stock Adjustment
  function startStockAdjustment(product: Product) {
    setEditingId(null);
    setStockAdjustingId(product.id);
    setStockAdjustValue("");
    setStockAdjustNote("");
    setStockAdjustError("");
  }

  function cancelStockAdjustment() {
    if (stockAdjustSaving) return;

    setStockAdjustingId(null);
    setStockAdjustValue("");
    setStockAdjustNote("");
    setStockAdjustError("");
  }

  async function saveStockAdjustment(productId: number) {
    setStockAdjustError("");

    const quantityChange = Number(stockAdjustValue);

    if (!Number.isInteger(quantityChange) || quantityChange === 0) {
      setStockAdjustError("กรุณาระบุจำนวนเป็นจำนวนเต็ม และห้ามเป็น 0");
      return;
    }

    setStockAdjustSaving(true);

    try {
      const response = await fetch(
        `/api/products/${productId}/stock-adjustment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            quantityChange,
            note: stockAdjustNote.trim() || null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setStockAdjustError(
          data?.error === "Insufficient stock"
            ? "สต็อกไม่เพียงพอ ไม่สามารถลดจำนวนติดลบได้"
            : data?.error || "ไม่สามารถปรับสต็อกได้"
        );
        return;
      }

      const productsResponse = await fetch("/api/products", {
        cache: "no-store",
      });

      if (!productsResponse.ok) {
        throw new Error("REFRESH_PRODUCTS_FAILED");
      }

      const productsData = await productsResponse.json();

      const refreshedProducts = Array.isArray(productsData)
        ? productsData
        : productsData?.products;

      if (!Array.isArray(refreshedProducts)) {
        throw new Error("INVALID_PRODUCTS_RESPONSE");
      }

      setProducts(refreshedProducts);
      cancelStockAdjustment();
    } catch (error) {
      console.error("Stock adjustment error:", error);
      setStockAdjustError(
        "เกิดข้อผิดพลาดในการบันทึกหรือโหลดข้อมูลสินค้าใหม่"
      );
    } finally {
      setStockAdjustSaving(false);
    }
  }

  const [mediaByProduct, setMediaByProduct] = useState<Record<number, ProductMediaItem[]>>({});
  const [uploadingId, setUploadingId] = useState<Record<number, boolean>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<number, string>>({});
  // STEP 31 — ตั้งรูปหลัก/ลบรูป: เก็บ mediaId ที่กำลังดำเนินการอยู่ (มีได้ทีละ 1 การกระทำในแอปนี้)
  // และ error ต่อ "สินค้า" (ไม่ใช่ต่อรูป) เพราะข้อความ error แสดงใต้แถบรูปของสินค้านั้นๆ
  const [mediaActionId, setMediaActionId] = useState<number | null>(null);
  const [mediaActionErrors, setMediaActionErrors] = useState<Record<number, string>>({});
  const loadedMediaIdsRef = useRef<Set<number>>(new Set());

  // อ่าน .json() แบบปลอดภัย — ถ้า response ไม่ใช่ JSON จริง (เช่น dev server/Turbopack ล่มแล้วตอบกลับ
  // เป็นหน้า error HTML ของ Next.js แทน: "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON")
  // ให้คืน null แทนที่จะโยน exception ออกไปให้ UI พัง
  async function safeJson(response: Response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  async function loadProductMedia(productId: number) {
    try {
      const response = await fetch(`/api/products/${productId}/media`, {
        cache: "no-store",
      });
      const data = await safeJson(response);
      if (response.ok && data && Array.isArray(data.items)) {
        setMediaByProduct((current) => ({ ...current, [productId]: data.items }));
      } else if (response.status === 404) {
        // สินค้า id นี้ถูกลบไปแล้วจริงที่ฐานข้อมูล (เช่นถูกลบจากแท็บ/เครื่องอื่น) แต่ยังค้างอยู่ใน
        // state เดิมของหน้านี้ (โหลดไว้ก่อนถูกลบ) — เอาออกจากรายการที่แสดงผลทันที กันไม่ให้หน้ายัง
        // แสดงแถวผี หรือยิง request ซ้ำไปที่ id ที่ไม่มีอยู่จริงอีก
        setProducts((current) => current.filter((p) => p.id !== productId));
      }
      // กรณีอื่น (เช่น response ไม่ใช่ JSON เลย จาก dev server ที่ล่มชั่วคราว) — ปล่อยผ่านแบบ silent
      // ไม่ตั้ง error message ใดๆ ใต้ชื่อสินค้า แค่แสดง "ไม่มีรูป" เหมือนกรณียังไม่มีรูปเลย
    } catch (err) {
      console.error(err);
    } finally {
      loadedMediaIdsRef.current.add(productId);
    }
  }

  // โหลดรูปภาพของสินค้าแต่ละรายการที่ยังไม่เคยโหลด (รวมถึงสินค้าที่เพิ่งเพิ่มใหม่) —
  // ไม่โหลดซ้ำของรายการที่มีอยู่แล้วใน loadedMediaIdsRef
  useEffect(() => {
    const missing = products
      .map((product) => product.id)
      .filter((id) => !loadedMediaIdsRef.current.has(id));

    missing.forEach((id) => {
      loadedMediaIdsRef.current.add(id);
      loadProductMedia(id);
    });
  }, [products]);

  function getPrimaryMedia(productId: number): ProductMediaItem | null {
    const items = mediaByProduct[productId];
    if (!items || items.length === 0) {
      return null;
    }
    return items.find((item) => item.isPrimary) || items[0];
  }

  async function uploadProductImage(productId: number, file: File | undefined) {
    if (!file) {
      return;
    }

    setUploadingId((current) => ({ ...current, [productId]: true }));
    setUploadErrors((current) => ({ ...current, [productId]: "" }));

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch(`/api/products/${productId}/media`, {
        method: "POST",
        body: formData,
      });

      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data?.error || "ไม่สามารถอัปโหลดรูปภาพได้");
      }

      await loadProductMedia(productId);
    } catch (err) {
      setUploadErrors((current) => ({
        ...current,
        [productId]: err instanceof Error ? err.message : "ไม่สามารถอัปโหลดรูปภาพได้",
      }));
    } finally {
      setUploadingId((current) => ({ ...current, [productId]: false }));
    }
  }

  // ตั้งรูปนี้เป็นรูปหลักของ "สินค้ารายการนี้เท่านั้น" — productId มาจาก column สินค้าที่กดอยู่เสมอ
  // (ไม่มีทางข้ามไปตั้งรูปหลักให้สินค้าอื่น เพราะ URL ผูก productId+mediaId คู่กันที่ฝั่ง API อยู่แล้ว)
  async function setPrimaryImage(productId: number, mediaId: number) {
    setMediaActionId(mediaId);
    setMediaActionErrors((current) => ({ ...current, [productId]: "" }));

    try {
      const response = await fetch(
        `/api/products/${productId}/media/${mediaId}`,
        { method: "PATCH" }
      );

      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data?.error || "ไม่สามารถตั้งรูปหลักได้");
      }

      await loadProductMedia(productId);
    } catch (err) {
      setMediaActionErrors((current) => ({
        ...current,
        [productId]: err instanceof Error ? err.message : "ไม่สามารถตั้งรูปหลักได้",
      }));
    } finally {
      setMediaActionId(null);
    }
  }

  async function deleteMediaItem(productId: number, mediaId: number) {
    const confirmed = confirm("ต้องการลบรูปนี้หรือไม่?");
    if (!confirmed) {
      return;
    }

    setMediaActionId(mediaId);
    setMediaActionErrors((current) => ({ ...current, [productId]: "" }));

    try {
      const response = await fetch(
        `/api/products/${productId}/media/${mediaId}`,
        { method: "DELETE" }
      );

      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data?.error || "ไม่สามารถลบรูปภาพได้");
      }

      await loadProductMedia(productId);
    } catch (err) {
      setMediaActionErrors((current) => ({
        ...current,
        [productId]: err instanceof Error ? err.message : "ไม่สามารถลบรูปภาพได้",
      }));
    } finally {
      setMediaActionId(null);
    }
  }

  // ===== Product Image Viewer (STEP 33) — modal/lightbox ดูรูปขนาดใหญ่ ต่อยอดจาก STEP 31 =====
  // อ้างอิงด้วย product.id เสมอ (viewerProductId) — viewerIndex เป็นแค่ "ตำแหน่งปัจจุบันในแถบรูปของ
  // สินค้ารายการนี้เท่านั้น" ไม่เคยถูกใช้เป็นตัวระบุสินค้า/รูปสำหรับ mutation ใดๆ — ทุก action
  // (ตั้งรูปหลัก/ลบ) ยังคงเรียก setPrimaryImage/deleteMediaItem ด้วย productId+media.id จริงเสมอ
  // เหมือนเดิมทุกประการ ไม่มี logic ใหม่ซ้ำซ้อน
  const [viewerProductId, setViewerProductId] = useState<number | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);

  function openViewer(productId: number, mediaId: number) {
    const items = mediaByProduct[productId] || [];
    const index = items.findIndex((item) => item.id === mediaId);
    setViewerProductId(productId);
    setViewerIndex(index >= 0 ? index : 0);
  }

  function closeViewer() {
    setViewerProductId(null);
  }

  const viewerItems = viewerProductId !== null ? mediaByProduct[viewerProductId] || [] : [];
  const viewerProduct =
    viewerProductId !== null ? products.find((p) => p.id === viewerProductId) || null : null;
  const viewerItem = viewerItems[viewerIndex] || null;

  // ปิด modal อัตโนมัติถ้ารูปที่ดูอยู่หายไปหมด (เช่นลบรูปสุดท้าย) กันไม่ให้หน้า crash จากการ render
  // รูปที่ไม่มีอยู่จริง — และ clamp index ให้อยู่ในขอบเขตเสมอถ้าจำนวนรูปลดลงจากการลบ
  useEffect(() => {
    if (viewerProductId === null) {
      return;
    }
    if (viewerItems.length === 0) {
      setViewerProductId(null);
      return;
    }
    if (viewerIndex > viewerItems.length - 1) {
      setViewerIndex(viewerItems.length - 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerProductId, viewerItems.length]);

  // ปิดด้วยปุ่ม Escape — ผูก listener เฉพาะตอน modal เปิดอยู่เท่านั้น และคืนค่า (cleanup) เสมอ
  useEffect(() => {
    if (viewerProductId === null) {
      return;
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeViewer();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewerProductId]);

  function showPreviousImage() {
    if (viewerItems.length === 0) {
      return;
    }
    setViewerIndex((current) => (current - 1 + viewerItems.length) % viewerItems.length);
  }

  function showNextImage() {
    if (viewerItems.length === 0) {
      return;
    }
    setViewerIndex((current) => (current + 1) % viewerItems.length);
  }

  async function loadProducts() {
    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/products", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("ไม่สามารถโหลดข้อมูลสินค้าได้");
      }
      const data = await response.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError("ไม่สามารถโหลดข้อมูลสินค้าได้");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    loadProducts();
  }, []);
  function updateForm(field: keyof FormState, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }
  async function addProduct() {
    if (!form.name.trim()) {
      alert("กรุณากรอกชื่อสินค้า");
      return;
    }
    if (!form.price) {
      alert("กรุณากรอกราคาขาย");
      return;
    }
    try {
      setSaving(true);
      setError("");
      const response = await fetch("/api/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name,
          model: form.model,
          master: form.master,
          year: form.year,
          description: form.description,
          price: Number(form.price),
          cost: Number(form.cost || 0),
          stock: Number(form.stock || 0),
          lowStockThreshold: Number(form.lowStockThreshold || 0),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "ไม่สามารถเพิ่มสินค้าได้");
      }
      setProducts((current) => [data, ...current]);

      // สินค้าถูกสร้างสำเร็จแล้ว (มี data.id จริง) — ถ้าผู้ใช้เลือกรูปไว้ใน dropzone ก่อนกดบันทึก
      // ให้อัปโหลดต่อทันทีผ่าน endpoint /api/products/[id]/media เดิม (ไม่มี route ใหม่)
      if (newImageFile) {
        await uploadProductImage(data.id, newImageFile);
      }

      closeAddModal();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "ไม่สามารถเพิ่มสินค้าได้"
      );
    } finally {
      setSaving(false);
    }
  }
  async function deleteProduct(id: number) {
    const confirmed = confirm("ต้องการลบสินค้านี้หรือไม่?");
    if (!confirmed) {
      return;
    }
    try {
      setError("");
      const response = await fetch(`/api/products?id=${id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "ไม่สามารถลบสินค้าได้");
      }
      setProducts((current) =>
        current.filter((product) => product.id !== id)
      );
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "ไม่สามารถลบสินค้าได้"
      );
    }
  }
  const totalStock = products.reduce(
    (sum, product) => sum + product.stock,
    0
  );
  const stockValue = products.reduce(
    (sum, product) => sum + product.price * product.stock,
    0
  );
  const availableProducts = products.filter(
    (product) => product.stock > 0
  ).length;
  // STEP 23 — "ใกล้หมด" นับเฉพาะ 0 < stock <= threshold (ไม่รวม stock=0 ซึ่งนับเป็น "หมด" แยกต่างหาก
  // อยู่แล้วในสถิติ availableProducts/totalStock ด้านบน) ให้การ์ดสถิติ 3 ใบไม่ทับซ้อนกัน
  const lowStockProducts = products.filter(
    (product) => getStockLevel(product) === "low"
  );
  // Best-seller ranking uses mockSoldCount (see its own comment) — descending, purely for display.
  const visibleProducts = (
    showLowStockOnly
      ? products.filter((product) => getStockLevel(product) !== "ok")
      : products
  )
    .slice()
    .sort((a, b) => mockSoldCount(b.id) - mockSoldCount(a.id));
  return (
    <main className="min-h-screen bg-black bg-[linear-gradient(to_right,#f59e0b08_1px,transparent_1px),linear-gradient(to_bottom,#f59e0b08_1px,transparent_1px)] bg-[size:24px_24px] p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">📦 จัดการสินค้า</h1>
            <p className="mt-1 text-sm text-neutral-400">
              เพิ่มและจัดการข้อมูลวัตถุมงคลของร้าน
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <BackLink href="/" label="กลับหน้าแรก" />
            <button
              onClick={() => {
                setEditingId(null);
                setShowForm(true);
              }}
              className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-amber-400"
            >
              + เพิ่มสินค้าใหม่
            </button>
            <LogoutButton />
          </div>
        </div>
        {error && (
          <div className="mb-6 rounded-xl border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-400">
            {error}
          </div>
        )}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg shadow-[0_0_15px_rgba(245,158,11,0.05)] p-5">
            <p className="text-sm text-neutral-400">
              สินค้าทั้งหมด
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-white">
              {products.length}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg shadow-[0_0_15px_rgba(245,158,11,0.05)] p-5">
            <p className="text-sm text-neutral-400">
              สินค้าพร้อมขาย
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-emerald-400">
              {availableProducts}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg shadow-[0_0_15px_rgba(245,158,11,0.05)] p-5">
            <p className="text-sm text-neutral-400">
              จำนวนคงเหลือ
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-white">
              {totalStock.toLocaleString()}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg shadow-[0_0_15px_rgba(245,158,11,0.05)] p-5">
            <p className="text-sm text-neutral-400">
              มูลค่าสินค้าตามราคาขาย
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-white">
              ฿{stockValue.toLocaleString()}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-900/20 to-neutral-900 p-5 shadow-sm">
            <p className="text-sm text-amber-400">
              สินค้าใกล้หมด
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-amber-400">
              {lowStockProducts.length}
            </p>
          </div>
        </section>
        <section className="mt-6 overflow-hidden rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg shadow-[0_0_15px_rgba(245,158,11,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 p-5">
            <h2 className="text-lg font-semibold text-white">
              รายการสินค้า
            </h2>
            <button
              onClick={() => setShowLowStockOnly((current) => !current)}
              className={`rounded-xl border px-3 py-1.5 text-sm font-medium ${
                showLowStockOnly
                  ? "border-amber-500 bg-amber-950/30 text-amber-400"
                  : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
              }`}
            >
              {showLowStockOnly
                ? "✓ แสดงเฉพาะสินค้าใกล้หมด/หมด"
                : "แสดงเฉพาะสินค้าใกล้หมด/หมด"}
            </button>
          </div>
          {loading ? (
            <div className="p-10 text-center text-sm text-neutral-500">
              กำลังโหลดข้อมูลสินค้า...
            </div>
          ) : products.length === 0 ? (
            <div className="p-10 text-center text-sm text-neutral-500">
              <p className="text-lg">
                ยังไม่มีสินค้า
              </p>
              <p className="mt-2 text-sm">
                กดปุ่ม &quot;+ เพิ่มสินค้า&quot; เพื่อเริ่มเพิ่มสินค้า
              </p>
            </div>
          ) : visibleProducts.length === 0 ? (
            <div className="p-10 text-center text-sm text-neutral-500">
              <p className="text-lg">
                ไม่มีสินค้าที่ใกล้หมดหรือหมด
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="bg-black/40 text-neutral-500">
                  <tr>
                    <th className="p-4">สินค้า</th>
                    <th className="p-4">รุ่น</th>
                    <th className="p-4">หลวงพ่อ/วัด</th>
                    <th className="p-4 text-right">ราคา</th>
                    <th className="p-4 text-right">ต้นทุน</th>
                    <th className="p-4 text-right">คงเหลือ</th>
                    <th className="p-4">สถานะ</th>
                    <th className="p-4">จัดการ</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleProducts.map((product, index) => (
                    <Fragment key={product.id}>
                    <tr
                      className="border-t border-neutral-800 hover:bg-neutral-800/60"
                    >
                      <td className="p-4 font-medium">
                        <div className="flex items-start gap-3">
                          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg shadow-[0_0_15px_rgba(245,158,11,0.05)]">
                            {getPrimaryMedia(product.id) ? (
                              <button
                                type="button"
                                onClick={() =>
                                  openViewer(product.id, getPrimaryMedia(product.id)!.id)
                                }
                                title="ดูรูปขนาดใหญ่"
                                className="h-full w-full cursor-pointer"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={getPrimaryMedia(product.id)!.url}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              </button>
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] text-neutral-600">
                                ไม่มีรูป
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="text-white">
                              {product.name}
                            </p>
                            {index < 3 && (
                              <span className="inline-block bg-gradient-to-r from-amber-500 to-amber-400 text-black px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide shadow-[0_0_8px_rgba(245,158,11,0.6)] mt-1">
                                🔥 ขายดีอันดับ {index + 1}
                              </span>
                            )}
                            <label className="mt-1 block cursor-pointer text-xs font-normal text-amber-400 hover:underline">
                              {uploadingId[product.id]
                                ? "กำลังอัปโหลด..."
                                : "+ เพิ่มรูปภาพ"}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={Boolean(uploadingId[product.id])}
                                onChange={(e) => {
                                  const input = e.target;
                                  const file = input.files?.[0];
                                  uploadProductImage(product.id, file).finally(() => {
                                    input.value = "";
                                  });
                                }}
                              />
                            </label>
                            {uploadErrors[product.id] && (
                              <p className="mt-1 text-xs font-normal text-red-400">
                                {uploadErrors[product.id]}
                              </p>
                            )}
                            {(mediaByProduct[product.id]?.length ?? 0) > 0 && (
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {mediaByProduct[product.id]!.slice(0, 4).map((item) => (
                                  <div key={item.id} className="group relative">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        item.source === "product" &&
                                        setPrimaryImage(product.id, item.id)
                                      }
                                      disabled={
                                        mediaActionId === item.id ||
                                        item.source !== "product"
                                      }
                                      title={
                                        item.isPrimary
                                          ? "รูปหลัก"
                                          : item.source === "product"
                                          ? "ตั้งเป็นรูปหลัก"
                                          : "รูปที่สร้างด้วย AI (ตั้งเป็นรูปหลักไม่ได้)"
                                      }
                                      className={`h-6 w-6 overflow-hidden rounded border object-cover disabled:cursor-not-allowed ${
                                        item.isPrimary
                                          ? "border-amber-500 ring-1 ring-amber-500"
                                          : "border-neutral-700"
                                      } ${
                                        item.source === "product"
                                          ? "cursor-pointer"
                                          : "cursor-not-allowed opacity-70"
                                      }`}
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={item.url}
                                        alt=""
                                        className="h-full w-full object-cover"
                                      />
                                    </button>
                                    {item.isPrimary && (
                                      <span className="pointer-events-none absolute -left-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[7px] leading-none text-black shadow-sm">
                                        ★
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => deleteMediaItem(product.id, item.id)}
                                      disabled={mediaActionId === item.id}
                                      title="ลบรูปนี้"
                                      className="absolute -right-1 -top-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-red-700 text-[9px] leading-none text-white group-hover:flex disabled:opacity-50"
                                    >
                                      ×
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openViewer(product.id, item.id)}
                                      title="ดูรูปขนาดใหญ่"
                                      className="absolute -bottom-1 -left-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-black text-[8px] leading-none text-white group-hover:flex"
                                    >
                                      🔍
                                    </button>
                                  </div>
                                ))}
                                {mediaByProduct[product.id]!.length > 4 && (
                                  <span className="text-[10px] font-normal text-neutral-500">
                                    +{mediaByProduct[product.id]!.length - 4}
                                  </span>
                                )}
                              </div>
                            )}
                            {mediaActionErrors[product.id] && (
                              <p className="mt-1 text-xs font-normal text-red-400">
                                {mediaActionErrors[product.id]}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="p-4 text-neutral-300">
                        {product.model || "-"}
                      </td>

                      <td className="p-4 text-neutral-300">
                        {product.master || "-"}
                      </td>

                      <td className="p-4 text-right tabular-nums text-neutral-300">
                        ฿{Number(product.price || 0).toLocaleString()}
                      </td>

                      <td className="p-4 text-right tabular-nums text-neutral-500">
                        ฿{Number(product.cost || 0).toLocaleString()}
                      </td>

                      <td className="p-4 text-right font-semibold tabular-nums text-white">
                        {Number(product.stock || 0).toLocaleString()}
                        {product.low_stock_threshold > 0 && (
                          <span className="ml-1 text-xs font-normal text-neutral-500">
                            / เกณฑ์ {product.low_stock_threshold}
                          </span>
                        )}
                      </td>

                      <td className="p-4">
                        {(() => {
                          const level = getStockLevel(product);

                          if (level === "ok") {
                            return (
                              <span className="rounded-full bg-emerald-950/40 px-3 py-1 text-xs font-medium text-emerald-400">
                                พร้อมขาย
                              </span>
                            );
                          }

                          if (level === "low") {
                            return (
                              <span className="rounded-full bg-amber-950/40 px-3 py-1 text-xs font-medium text-amber-400">
                                ⚠️ ใกล้หมด
                              </span>
                            );
                          }

                          return (
                            <span className="rounded-full bg-red-950/40 px-3 py-1 text-xs font-medium text-red-400">
                              หมด
                            </span>
                          );
                        })()}
                      </td>

                      <td className="p-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEdit(product)}
                            title="แก้ไขสินค้า / เปลี่ยนรูปภาพ"
                            className="flex items-center gap-1.5 rounded-xl border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-400"
                          >
                            <PenLineIcon className="h-3.5 w-3.5" />
                            แก้ไข
                          </button>
                          <button
                            onClick={() => startStockAdjustment(product)}
                            className="rounded-xl border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
                          >
                            ปรับสต็อก
                          </button>
                          <button
                            onClick={() => deleteProduct(product.id)}
                            className="rounded-xl border border-red-900/50 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-950/30"
                          >
                            ลบ
                          </button>
                        </div>
                      </td>
                    </tr>
                    {stockAdjustingId === product.id && (
                      <tr className="border-t border-neutral-800 bg-amber-950/10">
                        <td colSpan={8} className="p-4">
                          <div className="rounded-xl border border-neutral-800 bg-black p-4">
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-white">
                                  ปรับสต็อก: {product.name}
                                </p>
                                <p className="mt-1 text-sm text-neutral-400">
                                  Stock ปัจจุบัน:{" "}
                                  <span className="font-semibold tabular-nums text-white">
                                    {Number(product.stock || 0).toLocaleString()}
                                  </span>{" "}
                                  ชิ้น
                                </p>
                              </div>

                              <span className="rounded-full bg-amber-950/40 px-3 py-1 text-xs font-medium text-amber-400">
                                บันทึกเป็น Inventory Movement
                              </span>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                              <div>
                                <label className="mb-1 block text-xs font-medium text-neutral-400">
                                  จำนวนที่ปรับ
                                </label>
                                <input
                                  className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm tabular-nums text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                                  type="number"
                                  step="1"
                                  placeholder="เช่น 5 หรือ -2"
                                  value={stockAdjustValue}
                                  onChange={(e) =>
                                    setStockAdjustValue(e.target.value)
                                  }
                                  disabled={stockAdjustSaving}
                                />
                                <p className="mt-1 text-xs text-neutral-500">
                                  ใช้ค่าบวกเพื่อเพิ่ม และค่าลบเพื่อลด
                                </p>
                              </div>

                              <div>
                                <label className="mb-1 block text-xs font-medium text-neutral-400">
                                  หมายเหตุ / เหตุผล
                                </label>
                                <input
                                  className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                                  placeholder="เช่น รับสินค้าเข้า / ตรวจนับสต็อก"
                                  value={stockAdjustNote}
                                  onChange={(e) =>
                                    setStockAdjustNote(e.target.value)
                                  }
                                  disabled={stockAdjustSaving}
                                />
                              </div>
                            </div>

                            {stockAdjustError && (
                              <p className="mt-3 text-sm font-medium text-red-400">
                                {stockAdjustError}
                              </p>
                            )}

                            <div className="mt-4 flex gap-3">
                              <button
                                onClick={() => saveStockAdjustment(product.id)}
                                disabled={stockAdjustSaving}
                                className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
                              >
                                {stockAdjustSaving
                                  ? "กำลังบันทึก..."
                                  : "บันทึกการปรับสต็อก"}
                              </button>

                              <button
                                onClick={cancelStockAdjustment}
                                disabled={stockAdjustSaving}
                                className="rounded-xl border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                              >
                                ยกเลิก
                              </button>
                            </div>
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

      {/* ===== Add Product Modal — Glassmorphism, มี Dropzone รูปภาพ =====
          สร้างสินค้าก่อน (มี id จริง) แล้วค่อยอัปโหลดรูปที่เลือกไว้ต่อทันทีผ่าน uploadProductImage()
          เดิม (ยิง /api/products/[id]/media จริง) — ไม่มี route/ตารางใหม่ */}
      {showForm && (
        <div
          role="presentation"
          onClick={closeAddModal}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="เพิ่มสินค้าใหม่"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-amber-500/20 bg-neutral-950/95 backdrop-blur-lg shadow-[0_0_40px_rgba(245,158,11,0.15)] p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">เพิ่มสินค้าใหม่</h2>
              <button
                type="button"
                onClick={closeAddModal}
                aria-label="ปิด"
                className="rounded-xl p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-white"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                setNewImage(e.dataTransfer.files?.[0]);
              }}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-amber-500/40 bg-black/30 p-6 text-center transition-colors hover:border-amber-500 hover:bg-amber-500/5"
            >
              {newImagePreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={newImagePreviewUrl}
                  alt="ตัวอย่างรูปสินค้า"
                  className="h-32 w-32 rounded-xl object-cover"
                />
              ) : (
                <>
                  <UploadCloudIcon className="h-8 w-8 text-amber-500" />
                  <p className="text-sm font-medium text-neutral-300">
                    ลากรูปมาวาง หรือคลิกเพื่อเลือกไฟล์
                  </p>
                  <p className="text-xs text-neutral-500">รองรับไฟล์รูปภาพ (JPG, PNG)</p>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setNewImage(e.target.files?.[0])}
              />
              {newImagePreviewUrl && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setNewImage(null);
                  }}
                  className="text-xs font-medium text-red-400 hover:underline"
                >
                  เอารูปนี้ออก
                </button>
              )}
            </label>

            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <input
                className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                placeholder="ชื่อสินค้า"
                value={form.name}
                onChange={(e) => updateForm("name", e.target.value)}
              />
              <input
                className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                placeholder="รุ่น"
                value={form.model}
                onChange={(e) => updateForm("model", e.target.value)}
              />
              <input
                className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                placeholder="พระอาจารย์ / ผู้สร้าง"
                value={form.master}
                onChange={(e) => updateForm("master", e.target.value)}
              />
              <input
                className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                placeholder="ปีที่สร้าง"
                value={form.year}
                onChange={(e) => updateForm("year", e.target.value)}
              />
              <input
                className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                placeholder="รายละเอียดสินค้า"
                value={form.description}
                onChange={(e) => updateForm("description", e.target.value)}
              />
              <input
                className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm tabular-nums text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                type="number"
                placeholder="ราคาขาย"
                value={form.price}
                onChange={(e) => updateForm("price", e.target.value)}
              />
              <input
                className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm tabular-nums text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                type="number"
                placeholder="ต้นทุน"
                value={form.cost}
                onChange={(e) => updateForm("cost", e.target.value)}
              />
              <input
                className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm tabular-nums text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                type="number"
                placeholder="จำนวนสินค้า"
                value={form.stock}
                onChange={(e) => updateForm("stock", e.target.value)}
              />
              <input
                className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm tabular-nums text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                type="number"
                min="0"
                placeholder="เกณฑ์แจ้งเตือนสต็อกต่ำ (ค่าเริ่มต้น 0)"
                value={form.lowStockThreshold}
                onChange={(e) => updateForm("lowStockThreshold", e.target.value)}
              />
            </div>

            {error && (
              <p className="mt-3 text-sm text-red-400">{error}</p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                onClick={addProduct}
                disabled={saving}
                className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
              >
                {saving ? "กำลังบันทึก..." : "บันทึกสินค้า"}
              </button>
              <button
                onClick={closeAddModal}
                disabled={saving}
                className="rounded-xl border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Edit Product Modal — แก้ไขข้อมูล + จัดการรูปภาพในที่เดียว =====
          ใช้ editForm/saveEdit เดิมสำหรับข้อมูลสินค้า และ uploadProductImage/setPrimaryImage/
          deleteMediaItem เดิมสำหรับรูปภาพ (STEP 31/33) — ไม่มี logic ใหม่ซ้ำซ้อน */}
      {editingId !== null && (() => {
        const editingProduct = products.find((p) => p.id === editingId);
        if (!editingProduct) return null;
        const items = mediaByProduct[editingId] || [];

        return (
          <div
            role="presentation"
            onClick={cancelEdit}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`แก้ไขสินค้า: ${editingProduct.name}`}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-amber-500/20 bg-neutral-950/95 backdrop-blur-lg shadow-[0_0_40px_rgba(245,158,11,0.15)] p-6"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">
                  แก้ไขสินค้า: {editingProduct.name}
                </h2>
                <button
                  type="button"
                  onClick={cancelEdit}
                  aria-label="ปิด"
                  className="rounded-xl p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-white"
                >
                  <XIcon className="h-5 w-5" />
                </button>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-neutral-400">รูปภาพสินค้า</p>
                <div className="flex flex-wrap items-center gap-2">
                  {items.map((item) => (
                    <div key={item.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => item.source === "product" && setPrimaryImage(editingId, item.id)}
                        disabled={mediaActionId === item.id || item.source !== "product"}
                        title={
                          item.isPrimary
                            ? "รูปหลัก"
                            : item.source === "product"
                            ? "ตั้งเป็นรูปหลัก"
                            : "รูปที่สร้างด้วย AI (ตั้งเป็นรูปหลักไม่ได้)"
                        }
                        className={`h-16 w-16 overflow-hidden rounded-xl border object-cover disabled:cursor-not-allowed ${
                          item.isPrimary ? "border-amber-500 ring-2 ring-amber-500" : "border-neutral-700"
                        } ${item.source === "product" ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.url} alt="" className="h-full w-full object-cover" />
                      </button>
                      {item.isPrimary && (
                        <span className="pointer-events-none absolute -left-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] leading-none text-black shadow-sm">
                          ★
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteMediaItem(editingId, item.id)}
                        disabled={mediaActionId === item.id}
                        title="ลบรูปนี้"
                        className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-700 text-[10px] leading-none text-white group-hover:flex disabled:opacity-50"
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-amber-500/40 text-amber-500 hover:border-amber-500 hover:bg-amber-500/5">
                    <UploadCloudIcon className="h-5 w-5" />
                    <span className="text-[9px] font-medium">
                      {uploadingId[editingId] ? "กำลังอัป..." : "เพิ่มรูป"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={Boolean(uploadingId[editingId])}
                      onChange={(e) => {
                        const input = e.target;
                        const file = input.files?.[0];
                        uploadProductImage(editingId, file).finally(() => {
                          input.value = "";
                        });
                      }}
                    />
                  </label>
                </div>
                {uploadErrors[editingId] && (
                  <p className="mt-1 text-xs text-red-400">{uploadErrors[editingId]}</p>
                )}
                {mediaActionErrors[editingId] && (
                  <p className="mt-1 text-xs text-red-400">{mediaActionErrors[editingId]}</p>
                )}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <input
                  className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                  placeholder="ชื่อสินค้า"
                  value={editForm.name}
                  onChange={(e) => updateEditForm("name", e.target.value)}
                />
                <input
                  className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                  placeholder="รุ่น"
                  value={editForm.model}
                  onChange={(e) => updateEditForm("model", e.target.value)}
                />
                <input
                  className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                  placeholder="พระอาจารย์ / ผู้สร้าง"
                  value={editForm.master}
                  onChange={(e) => updateEditForm("master", e.target.value)}
                />
                <input
                  className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                  placeholder="ปีที่สร้าง"
                  value={editForm.year}
                  onChange={(e) => updateEditForm("year", e.target.value)}
                />
                <input
                  className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                  placeholder="รายละเอียดสินค้า"
                  value={editForm.description}
                  onChange={(e) => updateEditForm("description", e.target.value)}
                />
                <input
                  className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm tabular-nums text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                  type="number"
                  placeholder="ราคาขาย"
                  value={editForm.price}
                  onChange={(e) => updateEditForm("price", e.target.value)}
                />
                <input
                  className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm tabular-nums text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                  type="number"
                  placeholder="ต้นทุน"
                  value={editForm.cost}
                  onChange={(e) => updateEditForm("cost", e.target.value)}
                />
                <input
                  className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm tabular-nums text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                  type="number"
                  placeholder="จำนวนสินค้า"
                  value={editForm.stock}
                  onChange={(e) => updateEditForm("stock", e.target.value)}
                />
                <input
                  className="w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm tabular-nums text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                  type="number"
                  min="0"
                  placeholder="เกณฑ์แจ้งเตือนสต็อกต่ำ"
                  value={editForm.lowStockThreshold}
                  onChange={(e) => updateEditForm("lowStockThreshold", e.target.value)}
                />
              </div>

              {editError && <p className="mt-3 text-sm text-red-400">{editError}</p>}

              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => saveEdit(editingProduct.id)}
                  disabled={editSaving}
                  className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
                >
                  {editSaving ? "กำลังบันทึก..." : "บันทึก"}
                </button>
                <button
                  onClick={cancelEdit}
                  disabled={editSaving}
                  className="rounded-xl border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== Product Image Viewer (STEP 33) — modal ดูรูปขนาดใหญ่ ===== */}
      {viewerProduct && viewerItem && (
        <div
          role="presentation"
          onClick={closeViewer}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/85 p-4"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`รูปสินค้า: ${viewerProduct.name}`}
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white"
          >
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <p className="font-semibold text-slate-900">
                  {viewerProduct.name}
                </p>
                {viewerItems.length > 1 && (
                  <p className="text-sm tabular-nums text-slate-500">
                    {viewerIndex + 1} / {viewerItems.length}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={closeViewer}
                aria-label="ปิด"
                className="rounded-xl px-3 py-1.5 text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="relative flex flex-1 items-center justify-center bg-slate-900 p-2">
              {viewerItems.length > 1 && (
                <button
                  type="button"
                  onClick={showPreviousImage}
                  aria-label="รูปก่อนหน้า"
                  className="absolute left-2 rounded-full bg-white/85 px-3 py-2 text-lg text-slate-900 hover:bg-white"
                >
                  ‹
                </button>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={viewerItem.url}
                alt={viewerProduct.name}
                className="max-h-[65vh] w-full object-contain"
              />
              {viewerItems.length > 1 && (
                <button
                  type="button"
                  onClick={showNextImage}
                  aria-label="รูปถัดไป"
                  className="absolute right-2 rounded-full bg-white/85 px-3 py-2 text-lg text-slate-900 hover:bg-white"
                >
                  ›
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
              <p className="text-sm text-slate-500">
                {viewerItem.isPrimary
                  ? "★ รูปหลัก"
                  : viewerItem.source === "ai"
                  ? "รูปที่สร้างด้วย AI"
                  : "รูปสินค้า"}
              </p>
              <div className="flex gap-2">
                {!viewerItem.isPrimary && viewerItem.source === "product" && (
                  <button
                    type="button"
                    onClick={() => setPrimaryImage(viewerProduct.id, viewerItem.id)}
                    disabled={mediaActionId === viewerItem.id}
                    className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    ตั้งเป็นรูปหลัก
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => deleteMediaItem(viewerProduct.id, viewerItem.id)}
                  disabled={mediaActionId === viewerItem.id}
                  className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  ลบรูปนี้
                </button>
              </div>
            </div>
            {mediaActionErrors[viewerProduct.id] && (
              <p className="border-t p-3 text-sm text-red-700">
                {mediaActionErrors[viewerProduct.id]}
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
