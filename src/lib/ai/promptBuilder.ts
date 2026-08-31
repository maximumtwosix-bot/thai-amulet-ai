// ใช้ร่วมกันโดยทั้ง AI Image Generation (STEP 13) และ AI Video Generation (STEP 14)
//
// ตั้งใจใช้แค่ category (หมวดหมู่สินค้า) เป็นแนวทาง ไม่ใช้ชื่อรุ่น/สำนัก/ปีของสินค้าจริงมาอ้างอิงใน
// prompt — เพราะ AI ไม่มีทางรู้ว่าของจริงชิ้นนั้นหน้าตาเป็นอย่างไร การให้ AI "วาด/สร้างคลิปตาม" ชื่อรุ่น
// หรือวัดที่ระบุจะกลายเป็นสื่อที่ดูเหมือนอ้างความถูกต้องแม่นยำทั้งที่ไม่ใช่ของจริง ซึ่งไม่เหมาะกับ
// สินค้าประเภทวัตถุมงคลที่ลูกค้าให้ความสำคัญกับความแท้

export type PromptProduct = {
  name: string;
  category: string | null;
};

export function buildAmuletImagePrompt(product: PromptProduct): string {
  const category = product.category?.trim() || "วัตถุมงคลไทย";

  return (
    `Professional product photography of a Thai amulet (${category}), studio lighting, ` +
    `dark elegant background, centered composition, no text, no watermark, no people, ` +
    `high detail, realistic style — generic promotional visual, not a depiction of any ` +
    `specific real item`
  );
}

export function buildAmuletVideoPrompt(product: PromptProduct): string {
  const category = product.category?.trim() || "วัตถุมงคลไทย";

  return (
    `Cinematic slow-motion product showcase of a Thai amulet (${category}), studio lighting, ` +
    `dark elegant background, slow rotation, no text, no watermark, no people, high detail, ` +
    `realistic style — generic promotional visual, not a depiction of any specific real item`
  );
}
