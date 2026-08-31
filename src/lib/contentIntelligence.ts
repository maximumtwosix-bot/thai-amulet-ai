import OpenAI from "openai";
import type { ContentPlanAngle, ContentPlanType } from "@/lib/contentPlans";
import { CONTENT_PLAN_ANGLES, isValidContentPlanAngle, isValidContentPlanType } from "@/lib/contentPlans";
import type { SocialPlatform } from "@/lib/socialContent";

// Content Intelligence — STEP 19
//
// ใช้ OPENAI_API_KEY เดียวกับ /api/content/generate (STEP 9) และ AI Image Generation (STEP 13)
// ไม่เพิ่ม AI provider ใหม่ตามคำสั่ง — โมเดลเดียวกัน (gpt-5-mini ผ่าน Responses API)
//
// กฎป้องกันการแต่งข้อมูล (สำคัญที่สุด) — สืบทอดมาจาก prompt ของ /api/content/generate ที่มี
// guardrail ชุดนี้อยู่แล้วและพิสูจน์แล้วว่าใช้งานได้จริงตลอดโปรเจกต์ (ไม่แต่งปี/รุ่น/พระอาจารย์/
// พุทธคุณ/อิทธิฤทธิ์ ฯลฯ) — ไฟล์นี้ใช้ guardrail ชุดเดียวกันทุกคำ ขยายเพิ่มเรื่อง "ห้ามกล่าวอ้างเกิน
// จริง" (รับประกันโชคลาภ/รวยแน่นอน/รักษาโรค ฯลฯ) ตามที่ STEP 19 กำหนดเพิ่มเติม

export function isContentIntelligenceConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export type ContentIntelligenceProduct = {
  id: number;
  name: string;
  model: string | null;
  master: string | null;
  year: string | null;
  description: string | null;
  price: number;
  stock: number;
  category: string | null;
  hasRealPhotos: boolean;
};

export type ContentPlanDraft = {
  contentType: ContentPlanType;
  contentAngle: ContentPlanAngle;
  objective: string;
  targetAudience: string;
  hook: string;
  caption: string;
  cta: string;
  hashtags: string[];
  imagePrompt: string;
  videoPrompt: string;
};

// STEP 21: token usage จริงจาก OpenAI Responses API — ใช้คำนวณ estimated cost เท่านั้น (ดู
// src/lib/costConfig.ts / src/lib/costLedger.ts) ไม่มีทาง fabricate ตัวเลขนี้ได้ ถ้า API ไม่ส่ง
// usage กลับมา (เช่น error ก่อนถึงขั้นตอนนั้น) ค่าเป็น null ตรงๆ
export type AiTextUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
};

export const CONTENT_INTELLIGENCE_MODEL = "gpt-5-mini";
const MODEL_NAME = CONTENT_INTELLIGENCE_MODEL;

const ANGLE_LABELS_TH: Record<ContentPlanAngle, string> = {
  product_highlight: "Product Highlight — เน้นจุดเด่นของสินค้าตามข้อมูลจริง",
  story: "Story / ความเป็นมา — เล่าที่มาเท่าที่ข้อมูลจริงมี (ถ้าไม่มีข้อมูลที่มา ให้เน้นเล่าเกี่ยวกับร้านแทน)",
  educational: "Educational — ให้ความรู้ทั่วไปเกี่ยวกับหมวดหมู่สินค้า ไม่ใช่การแต่งข้อมูลเฉพาะของชิ้นนี้",
  collector: "Collector — มุมมองสำหรับนักสะสม",
  belief_spiritual: "Belief / Spiritual — พูดถึงความเชื่อแบบเคารพและระมัดระวัง ไม่การันตีผลลัพธ์เหนือธรรมชาติ",
  promotion: "Promotion — โปรโมชัน/ราคา/สต็อกตามข้อมูลจริง",
  problem_solution: "Problem → Solution — เชื่อมปัญหาที่ลูกค้ากลุ่มเป้าหมายอาจมีเข้ากับสินค้า โดยไม่กล่าวอ้างเกินจริง",
  faq: "FAQ — คำถามที่พบบ่อยพร้อมคำตอบจากข้อมูลจริงเท่านั้น",
  short_reel_hook: "Short Reel Hook — hook สั้นกระชับสำหรับคลิปสั้น",
};

function buildProductDataBlock(product: ContentIntelligenceProduct): string {
  return [
    "ข้อมูลสินค้าจริงจากระบบ (Product Center) — ใช้ได้เฉพาะข้อมูลนี้เท่านั้น:",
    "ชื่อสินค้า: " + product.name,
    "รุ่น: " + (product.model || "ไม่ระบุ"),
    "พระอาจารย์/สำนัก: " + (product.master || "ไม่ระบุ"),
    "ปี: " + (product.year || "ไม่ระบุ"),
    "รายละเอียด: " + (product.description || "ไม่ระบุ"),
    "หมวดหมู่: " + (product.category || "ไม่ระบุ"),
    "ราคา: " + product.price + " บาท",
    "สต็อก: " + product.stock + " ชิ้น",
    "มีรูปสินค้าจริงในระบบ: " + (product.hasRealPhotos ? "มี" : "ยังไม่มี"),
  ].join("\n");
}

function buildPrompt(params: {
  product: ContentIntelligenceProduct;
  count: number;
  contentType: ContentPlanType | "auto";
  angles: ContentPlanAngle[] | "auto";
}): string {
  const angleInstruction =
    params.angles === "auto"
      ? "เลือกมุม Content ที่เหมาะสมเองจากรายการด้านล่าง กระจายให้หลากหลายไม่ซ้ำกันถ้าเป็นไปได้"
      : "ใช้เฉพาะมุม Content ต่อไปนี้เท่านั้น เรียงตามลำดับที่ให้: " +
        params.angles.map((a) => ANGLE_LABELS_TH[a]).join(" | ");

  const typeInstruction =
    params.contentType === "auto"
      ? 'เลือก content_type ที่เหมาะสมเองจาก "facebook", "reels", "tiktok", "script"'
      : `content_type ต้องเป็น "${params.contentType}" ทุกรายการ`;

  return [
    "คุณคือ AI Content Intelligence ประจำร้าน THAI AMULET TH ผู้เชี่ยวชาญวางแผนคอนเทนต์พระเครื่อง/วัตถุมงคล",
    "",
    "BRAND VOICE (ต้องรักษาทุกชิ้น):",
    "- น่าเชื่อถือ สุภาพ ไม่โอ้อวด เคารพความเชื่อของลูกค้า อ่านง่าย",
    "- เหมาะกับ Facebook และ TikTok ภาษาไทยเป็นธรรมชาติ ไม่เป็นทางการเกินไป ไม่เหมือน AI เขียน",
    "",
    "กฎเหล็กเกี่ยวกับข้อมูล (ห้ามฝ่าฝืนเด็ดขาด):",
    "- ใช้เฉพาะข้อมูลสินค้าจริงที่ให้มาด้านล่างเท่านั้น",
    "- ห้ามแต่งปีสร้าง พระอาจารย์ รุ่น พิธีปลุกเสก ประวัติ หรือแหล่งที่มาที่ไม่มีในข้อมูล",
    "- ห้ามระบุว่าแท้ ของแท้ รับรองแท้ หายาก มีจำนวนจำกัด หรือเป็นที่นิยม หากข้อมูลไม่ได้ระบุ",
    "- ห้ามแต่งสรรพคุณ พุทธคุณ อิทธิฤทธิ์ หรือผลลัพธ์เหนือธรรมชาติเป็นข้อเท็จจริง",
    "- ห้ามตีความชื่อรุ่นว่าหมายถึงคุณสมบัติหรือสรรพคุณของสินค้า",
    "- ถ้าข้อมูลด้านใดไม่พอสำหรับเนื้อหาที่กำลังจะเขียน ให้ระบุอย่างตรงไปตรงมาว่า 'ไม่ระบุ' หรือเลี่ยงพูดถึงเรื่องนั้น ห้ามเดาหรือแต่งขึ้นมาเองเด็ดขาด",
    "",
    "ห้ามใช้คำกล่าวอ้างเกินจริงต่อไปนี้ในทุกกรณี (ห้ามใช้แม้ในมุม Belief/Spiritual):",
    "- รับประกันโชคลาภ, รวยแน่นอน, รักษาโรค, ป้องกันอันตรายได้แน่นอน, การันตีผลลัพธ์เหนือธรรมชาติ",
    "- และคำกล่าวอ้างลักษณะเดียวกันที่สื่อว่าสินค้ารับประกันผลลัพธ์ทางร่างกาย การเงิน หรือเหนือธรรมชาติ",
    "",
    buildProductDataBlock(params.product),
    "",
    "งาน: สร้าง Content Plan จำนวน " + params.count + " ชุด สำหรับสินค้านี้",
    typeInstruction,
    angleInstruction,
    "",
    "มุม Content ที่มีให้เลือก (content_angle ต้องเป็นค่าภาษาอังกฤษตรงตามนี้เท่านั้น):",
    Object.entries(ANGLE_LABELS_TH)
      .map(([key, label]) => `- ${key}: ${label}`)
      .join("\n"),
    "",
    "แต่ละชุดต้องมีฟิลด์ครบตามนี้:",
    "- content_type: facebook | reels | tiktok | script",
    "- content_angle: ค่าภาษาอังกฤษจากรายการด้านบนเท่านั้น",
    "- objective: วัตถุประสงค์ของโพสต์นี้ (ภาษาไทยสั้นๆ)",
    "- target_audience: กลุ่มเป้าหมาย (ภาษาไทยสั้นๆ)",
    "- hook: ประโยคเปิดที่ดึงความสนใจ",
    "- caption: เนื้อหาโพสต์แบบเต็ม พร้อมใช้งานจริง",
    "- cta: call-to-action ปิดท้าย",
    "- hashtags: array ของ hashtag ภาษาไทย/อังกฤษ 3-6 อัน (ต้องมี #THAIAMULETTH เสมอ)",
    "- image_prompt: prompt ภาษาอังกฤษสำหรับ AI สร้างภาพประกอบ (สไตล์ทั่วไป ไม่อ้างว่าเป็นภาพของจริง ไม่ระบุรายละเอียดที่ไม่มีในข้อมูล เช่น รุ่น/ปี/วัด)",
    "- video_prompt: prompt ภาษาอังกฤษสำหรับ AI สร้างคลิปวิดีโอสั้นประกอบ (สไตล์ทั่วไปเช่นกัน)",
    "",
    "ตอบเป็น JSON array เท่านั้น ไม่มีข้อความอื่นนอกเหนือจาก JSON รูปแบบ:",
    '[{ "content_type": "...", "content_angle": "...", "objective": "...", "target_audience": "...", "hook": "...", "caption": "...", "cta": "...", "hashtags": ["..."], "image_prompt": "...", "video_prompt": "..." }]',
  ].join("\n");
}

function isValidDraft(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export type ContentPlanGenerationResult = {
  drafts: ContentPlanDraft[];
  usage: AiTextUsage;
  model: string;
};

export async function generateContentPlans(params: {
  product: ContentIntelligenceProduct;
  count: number;
  contentType: ContentPlanType | "auto";
  angles: ContentPlanAngle[] | "auto";
}): Promise<ContentPlanGenerationResult> {
  if (!isContentIntelligenceConfigured()) {
    throw new Error("ไม่พบ OPENAI_API_KEY ใน environment variables");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = buildPrompt(params);

  const response = await openai.responses.create({
    model: MODEL_NAME,
    input: prompt,
  });

  const usage: AiTextUsage = {
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };

  const text = response.output_text;

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("AI ส่งข้อมูลกลับมาไม่ใช่ JSON ที่ถูกต้อง");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("AI ไม่ได้ส่ง Content Plan กลับมาเป็น array ที่ถูกต้อง");
  }

  const drafts: ContentPlanDraft[] = parsed.map((item, index) => {
    if (!isValidDraft(item)) {
      throw new Error(`Content Plan รายการที่ ${index + 1} มีรูปแบบไม่ถูกต้อง`);
    }

    const contentType = String(item.content_type || "");
    const contentAngle = String(item.content_angle || "");
    const caption = String(item.caption || "").trim();

    if (!caption) {
      throw new Error(`Content Plan รายการที่ ${index + 1} ไม่มี caption`);
    }

    const hashtags = Array.isArray(item.hashtags)
      ? item.hashtags.filter((tag): tag is string => typeof tag === "string")
      : [];

    return {
      contentType: contentType as ContentPlanType,
      contentAngle: contentAngle as ContentPlanAngle,
      objective: String(item.objective || "").trim(),
      targetAudience: String(item.target_audience || "").trim(),
      hook: String(item.hook || "").trim(),
      caption,
      cta: String(item.cta || "").trim(),
      hashtags,
      imagePrompt: String(item.image_prompt || "").trim(),
      videoPrompt: String(item.video_prompt || "").trim(),
    };
  });

  return { drafts, usage, model: MODEL_NAME };
}

// ===== AI WEEKLY PLANNER — STEP 20 =====
// เสนอ "โครง" ปฏิทิน (วันที่/เวลา/สินค้า/content type/angle/platform/objective) เท่านั้น — ยังไม่
// สร้าง caption/hook/cta เต็มรูปแบบ (นั่นเป็นหน้าที่ของ generateContentPlans() ด้านบน เรียกทีหลัง
// ตอนผู้ใช้กด "สร้าง Content ด้วย AI" ที่ calendar item แต่ละอัน) — ผลลัพธ์จากฟังก์ชันนี้ "ไม่เคย"
// ถูกบันทึกลง DB ตรงๆ โดยอัตโนมัติ ต้องผ่าน POST /api/content/calendar ทีละรายการหลังผู้ใช้ preview
// และยืนยันก่อนเสมอ (ห้าม schedule ทันทีโดยไม่มี confirmation ตามที่ STEP 20 กำหนด)

export type WeeklyPlanProductInput = {
  id: number;
  name: string;
  category: string | null;
};

export type WeeklyPlanSlotDraft = {
  scheduledAt: string; // ISO string
  productId: number;
  platform: SocialPlatform;
  contentType: ContentPlanType;
  contentAngle: ContentPlanAngle;
  objective: string;
};

function buildWeeklyPlannerPrompt(params: {
  products: WeeklyPlanProductInput[];
  days: number;
  postsPerDay: number;
  platforms: SocialPlatform[];
  startDateIso: string;
  preferredTimes: string[];
}): string {
  const productList = params.products
    .map((p) => `- id=${p.id}: ${p.name} (หมวดหมู่: ${p.category || "ไม่ระบุ"})`)
    .join("\n");

  const totalSlots = params.days * params.postsPerDay;

  return [
    "คุณคือ AI Content Calendar Planner ประจำร้าน THAI AMULET TH",
    "",
    "งาน: วางแผนตารางโพสต์ล่วงหน้า " + params.days + " วัน วันละ " + params.postsPerDay +
      " โพสต์ รวมทั้งหมด " + totalSlots + " รายการ",
    "",
    "กฎเหล็ก:",
    "- ใช้เฉพาะสินค้าจาก id ที่ให้มาด้านล่างเท่านั้น ห้ามคิดสินค้าใหม่หรือแก้ id",
    "- ห้ามแต่งรายละเอียดสินค้าใดๆ objective ต้องเป็นแค่วัตถุประสงค์เชิงการตลาดทั่วไป ไม่ใช่ข้อมูลจำเพาะ",
    "- กระจาย content_angle ให้หลากหลาย ห้ามให้สินค้าเดียวกันได้ angle ซ้ำติดกันโดยไม่จำเป็น",
    "- กระจายสินค้าและ platform ให้สมดุลเท่าที่ทำได้",
    "- ห้ามใช้คำกล่าวอ้างเกินจริง (รับประกันโชคลาภ, รวยแน่นอน, รักษาโรค, ป้องกันอันตรายได้แน่นอน, การันตีผลลัพธ์เหนือธรรมชาติ) แม้ใน objective",
    "- ใช้ภาษาที่เคารพความเชื่อ เช่น 'ตามความเชื่อ', 'สำหรับผู้ศรัทธา', 'ในมุมมองของนักสะสม'",
    "",
    "แพลตฟอร์มที่ใช้ได้: " + params.platforms.join(", "),
    "content_type ที่ใช้ได้: facebook, reels, tiktok (ห้ามใช้ script ใน weekly planner)",
    "content_angle ที่ใช้ได้: " + CONTENT_PLAN_ANGLES.join(", "),
    "",
    "วันเริ่มต้น (ISO date): " + params.startDateIso,
    "เวลาที่ต้องการโพสต์ (เลือกใช้ตามความเหมาะสม): " + params.preferredTimes.join(", "),
    "",
    "รายชื่อสินค้า:",
    productList,
    "",
    "ตอบเป็น JSON array จำนวน " + totalSlots + " รายการเท่านั้น ไม่มีข้อความอื่น รูปแบบ:",
    '[{ "scheduled_at": "YYYY-MM-DDTHH:mm:00.000Z", "product_id": 0, "platform": "...", "content_type": "...", "content_angle": "...", "objective": "..." }]',
    "หมายเหตุ: scheduled_at ต้องเป็นวันเวลาในอนาคตนับจากวันเริ่มต้นเท่านั้น เรียงจากวันแรกไปวันสุดท้าย",
  ].join("\n");
}

export type WeeklyContentPlanResult = {
  slots: WeeklyPlanSlotDraft[];
  usage: AiTextUsage;
  model: string;
};

export async function generateWeeklyContentPlan(params: {
  products: WeeklyPlanProductInput[];
  days: number;
  postsPerDay: number;
  platforms: SocialPlatform[];
  startDateIso: string;
  preferredTimes: string[];
}): Promise<WeeklyContentPlanResult> {
  if (!isContentIntelligenceConfigured()) {
    throw new Error("ไม่พบ OPENAI_API_KEY ใน environment variables");
  }

  if (params.products.length === 0) {
    throw new Error("ไม่มีสินค้าให้วางแผน");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = buildWeeklyPlannerPrompt(params);

  const response = await openai.responses.create({
    model: MODEL_NAME,
    input: prompt,
  });

  const usage: AiTextUsage = {
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };

  const text = response.output_text;

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("AI ส่งข้อมูลกลับมาไม่ใช่ JSON ที่ถูกต้อง");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("AI ไม่ได้ส่งแผนกลับมาเป็น array ที่ถูกต้อง");
  }

  const validProductIds = new Set(params.products.map((p) => p.id));
  const validPlatforms = new Set(params.platforms);

  const slots: WeeklyPlanSlotDraft[] = [];

  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;

    const record = item as Record<string, unknown>;

    const productId = Number(record.product_id);
    const platform = String(record.platform || "");
    const contentType = String(record.content_type || "");
    const contentAngle = String(record.content_angle || "");
    const scheduledAtRaw = String(record.scheduled_at || "");

    // STEP 20.5: server ต้อง validate ทุกรายการที่ AI เสนอมาอีกครั้งเสมอ — ห้ามเชื่อ AI ตรงๆ
    // รายการที่ไม่ผ่านจะถูกข้ามเงียบๆ (ไม่ throw ทั้งชุด) เพื่อให้ผู้ใช้ยังเห็น preview รายการที่ดีได้
    if (!validProductIds.has(productId)) continue;
    if (!validPlatforms.has(platform as SocialPlatform)) continue;
    if (!isValidContentPlanType(contentType) || contentType === "script") continue;
    if (!isValidContentPlanAngle(contentAngle)) continue;

    const scheduledDate = new Date(scheduledAtRaw);

    if (Number.isNaN(scheduledDate.getTime())) continue;
    if (scheduledDate.getTime() <= Date.now()) continue; // ห้าม schedule เวลาในอดีต

    slots.push({
      scheduledAt: scheduledDate.toISOString(),
      productId,
      platform: platform as SocialPlatform,
      contentType,
      contentAngle,
      objective: String(record.objective || "").trim(),
    });
  }

  if (slots.length === 0) {
    throw new Error("AI ไม่สามารถเสนอแผนที่ผ่านการตรวจสอบได้แม้แต่รายการเดียว");
  }

  return { slots, usage, model: MODEL_NAME };
}
