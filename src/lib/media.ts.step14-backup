import { listProductMedia } from "@/lib/productMedia";

export type MediaItem = {
  type: "image" | "video";
  url: string;
  fileName: string;
  source: "product" | "upload" | "ai" | "generated";
};

export type PrepareMediaResult = {
  items: MediaItem[];
  count: number;
  status: "ready" | "no_media";
};

type ProductForMedia = {
  id: number;
};

/**
 * เตรียมข้อมูลสื่อ (รูปภาพ/วิดีโอ) ของสินค้าสำหรับขั้นตอนถัดไปของ pipeline (create-timeline)
 *
 * STEP 6: ใช้รูปภาพสินค้าจริงที่ผู้ใช้อัปโหลดผ่าน POST /api/products/[id]/media เป็นแหล่งข้อมูลหลัก
 * (ตาราง product_media, ดู src/lib/productMedia.ts) เรียงลำดับ primary image ก่อน แล้วตามด้วยเวลา
 * ที่อัปโหลด (listProductMedia() จัดเรียงให้แล้ว) — ถ้าสินค้ายังไม่มีรูปเลย คืนค่า no_media ตรงไปตรงมา
 * ไม่สร้างข้อมูลปลอมขึ้นมา (สอดคล้องกับพฤติกรรมเดิมของ STEP 4/5)
 *
 * รูปแบบ MediaItem ยังคงเดิมทุกประการ (type/url/fileName/source) — src/lib/timeline.ts และ
 * /api/video/auto ไม่ต้องแก้ไขอะไรเลยเพราะ signature ไม่เปลี่ยน มีแค่แหล่งข้อมูลจริงมาแทนที่ stub เดิม
 * ยังเผื่อไว้สำหรับแหล่งข้อมูลในอนาคต เช่น รูปที่สร้างด้วย AI (source: "ai"/"generated") หรือวิดีโอสินค้า
 * (type: "video") โดยไม่ต้องแก้ pipeline นี้อีก
 */
export async function prepareProductMedia(
  product: ProductForMedia
): Promise<PrepareMediaResult> {
  const productMedia = listProductMedia(product.id);

  const items: MediaItem[] = productMedia.map((media) => ({
    type: media.type,
    url: media.url,
    fileName: media.fileName,
    source: media.source,
  }));

  return {
    items,
    count: items.length,
    status: items.length > 0 ? "ready" : "no_media",
  };
}
