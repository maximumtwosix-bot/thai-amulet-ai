# THAI AMULET AI — PROJECT STATUS
# Last updated: 2026-08-29
# Project path: C:\Users\maxim\thai-amulet-ai

---

## 1. PROJECT OVERVIEW

Project: THAI AMULET AI

เป้าหมาย:
สร้างระบบ AI ภายในสำหรับ THAI AMULET TH
ตั้งแต่จัดการสินค้า → สร้าง Content → สร้าง Voice → สร้าง Video → Export MP4
และต่อยอดไปสู่ระบบ Automation สำหรับการโพสต์

Current workflow:

Product
  ↓
Content Studio
  ↓
Content Library
  ↓
Voice Studio
  ↓
Video Studio
  ↓
Video Render API
  ↓
MP4 พร้อมเสียง
  ↓
เตรียมระบบโพสต์อัตโนมัติ

---

## 2. CURRENT TECH STACK

- Windows
- PowerShell
- Node.js v24.19.0
- npm 11.17.0
- pnpm
- Next.js 16.3.2
- TypeScript
- SQLite
- better-sqlite3
- Tailwind CSS

Database:

C:\Users\maxim\thai-amulet-ai\data\thai-amulet.db

---

## 3. DATABASE STATUS

SQLite database exists and is working.

Database file:

data/thai-amulet.db

Confirmed tables:

- content
- customers
- order_items
- orders
- products
- sqlite_sequence

Confirmed content table columns:

- id
- title
- content_type
- platform
- caption
- status
- created_at

---

## 4. APP PAGES

Confirmed app directories:

src/app/

- api
- content
- content-studio
- orders
- products
- video-studio
- voice-studio

---

## 5. CONTENT STUDIO

File:

src/app/content-studio/page.tsx

Current status:

WORKING

Features:

- Select product
- Select content type
- Select language tone
- Generate content
- Display generated result
- Copy content
- Send Script to Voice Studio
- Save generated content to database

Content types currently include:

- facebook
- reels
- tiktok
- script

---

## 6. CONTENT SAVE API

File:

src/app/api/content/save/route.ts

Status:

WORKING

Endpoint:

POST /api/content/save

Purpose:

บันทึก Content Studio result ลง SQLite table `content`

Validated:

- title
- contentType
- platform
- caption
- status = draft

---

## 7. CONTENT LIST API

File:

src/app/api/content/list/route.ts

Status:

WORKING

Endpoint:

GET /api/content/list

Purpose:

โหลดรายการ Content จาก SQLite

Confirmed API response:

success: true

สามารถอ่านข้อมูล Content ที่บันทึกไว้ได้

---

## 8. CONTENT LIBRARY

File:

src/app/content/page.tsx

Status:

WORKING

Features:

- Load saved content
- Search content
- Filter by platform/content type
- Display content cards
- Open content
- Copy content
- Link back to Content Studio

Important:

ก่อนหน้านี้ directory `src/app/content` ไม่มี page.tsx
แต่ตอนนี้มีแล้วและตรวจสอบโค้ดเรียบร้อย

---

## 9. TEST DATA

Database currently contains at least:

Content ID 1:

TITLE:
TEST - Content Studio

Content ID 2:

TITLE:
เบี้ยแก้ - facebook

ทั้งสองรายการสามารถอ่านจาก `/api/content/list` ได้

---

## 10. VOICE STUDIO

Directory:

src/app/voice-studio

File:

src/app/voice-studio/page.tsx

Current status:

PARTIALLY CONNECTED / NEXT DEVELOPMENT TARGET

Current functionality:

- รับ Script จาก URL
- อ่าน query parameter `script`
- ใส่ Script ลง textarea
- มีระบบเรียก API สำหรับสร้างเสียง
- มีการส่ง script ไปยัง API

Important existing integration:

Content Studio มี function:

sendToVoiceStudio()

และส่ง Script ไป:

/voice-studio?script=...

ดังนั้น:

Content Studio
→ Voice Studio

เชื่อมต่อแล้ว

---

## 11. VIDEO STUDIO

Directory:

src/app/video-studio

Current status:

EXISTS

ต้องตรวจสอบรายละเอียด implementation ก่อนพัฒนาเพิ่ม

เป้าหมาย:

รับ

- Script
- Audio
- Product images
- Scene information

แล้วสร้าง Timeline สำหรับ Video Render

---

## 12. VIDEO RENDER API

File:

src/app/api/video/render/route.ts

Status:

EXISTS

Current response structure includes:

success: true

videoUrl:
 /generated/video/[filename]

fileName

scenes

duration

message:
สร้างวิดีโอ MP4 พร้อมเสียงพากย์สำเร็จ

Error handling และ workDir cleanup มีอยู่แล้ว

---

## 13. IMPORTANT TEST

TypeScript test:

pnpm.cmd exec tsc --noEmit

ล่าสุด:

PASSED

ไม่มี TypeScript Error

---

## 14. IMPORTANT POWERSELL ISSUE

เดิม:

pnpm exec tsc --noEmit

อาจถูก PowerShell Execution Policy block

Error:

pnpm.ps1 cannot be loaded because running scripts is disabled

วิธีที่ผ่าน:

pnpm.cmd exec tsc --noEmit

ดังนั้นเวลาทดสอบ TypeScript ให้ใช้:

pnpm.cmd exec tsc --noEmit

---

## 15. DATABASE INSPECTION

better-sqlite3 ใช้งานได้

ตัวอย่างวิธีตรวจ database ที่ผ่านแล้ว:

สร้างไฟล์ .cjs ชั่วคราวแล้วรันด้วย:

node .\check-db.cjs

หากสร้างไฟล์ตรวจ database ใหม่ ให้ลบไฟล์ชั่วคราวภายหลังเมื่อไม่จำเป็น

---

## 16. ENCODING NOTE

เคยพบ output จาก PowerShell/API ที่แสดงภาษาไทยเป็นลักษณะ:

à¹...
â€¦

แต่เมื่ออ่านข้อมูลโดยตรงจาก database ด้วยวิธีที่ถูกต้อง ภาษาไทยในข้อมูลยังถูกต้อง

ต้องระวังเรื่อง UTF-8 / PowerShell output encoding
ก่อนแก้ database หรือข้อมูลจริง

---

## 17. CURRENT DEVELOPMENT CHECKPOINT

DONE:

[✓] Project structure
[✓] SQLite database
[✓] Product data
[✓] Content table
[✓] Content Studio
[✓] Generate Content
[✓] Save Content API
[✓] Content List API
[✓] Content Library
[✓] Content Studio → Voice Studio Script transfer
[✓] Video Render API exists
[✓] TypeScript check passes

CURRENT:

[→] Voice Studio → Audio output verification
[→] Voice Studio → Video Studio integration

NEXT:

[ ] Verify Voice API output
[ ] Verify generated audio file location
[ ] Add audio player to Voice Studio
[ ] Add "ส่งไป Video Studio" button
[ ] Pass audio URL + script to Video Studio
[ ] Make Video Studio receive incoming data
[ ] Product image → Video Scene
[ ] Scene timeline
[ ] Subtitle
[ ] Background music
[ ] Video effects
[ ] Connect Video Studio to Render API
[ ] Render real MP4
[ ] Verify generated MP4
[ ] Final Automation Pipeline
[ ] Publishing automation

---

## 18. NEXT STEP — DO NOT SKIP

Before modifying Voice Studio:

Inspect:

src/app/voice-studio/page.tsx

and:

src/app/api/voice/

Need to determine:

1. How voice generation works
2. What API returns
3. Where generated audio is stored
4. Whether audio URL is directly accessible
5. Whether Video Studio can consume that audio URL

After verification:

Implement:

Voice Studio
→ Generate Audio
→ Preview Audio
→ Send to Video Studio

Do NOT redesign the whole project.
Do NOT replace working code unnecessarily.
Make incremental changes and run TypeScript check after each major change.

---

## 19. DEVELOPMENT RULE

Every major change should follow:

1. Inspect existing code
2. Backup file
3. Make smallest required change
4. Run:

pnpm.cmd exec tsc --noEmit

5. Test API/UI
6. Confirm success
7. Update this PROJECT_STATUS.md

---

## 21. STEP 21 — AI COST TRACKING (LEDGER + DASHBOARD)

Status:

DONE — ตรวจสอบและทดสอบแล้ว (2026-08-29)

เป้าหมาย:

บันทึกทุกครั้งที่มีการเรียก AI generation จริง (text/image/video/voice) เพื่อดูภาพรวมต้นทุน
เป็น accounting/observability layer เท่านั้น — ไม่มีกลไก quota/limit ใดๆ

Schema:

- ตาราง `ai_cost_ledger` (src/lib/db.ts) — two-phase pattern เดียวกับ social_worker_runs (STEP 18)
  บันทึก status='processing' ก่อนยิง provider แล้ว finalize เป็น succeeded/failed ทีหลัง

Service layer:

- src/lib/costLedger.ts — recordAiGeneration / finalizeAiGenerationCost /
  finalizeAiGenerationCostByAiVideoJobId / linkLedgerToContentPlan / getCostSummary /
  getProductAiCost / getContentPlanAiCost / getClipAiCost / listClipAiCostsForProduct

Pricing config:

- src/lib/costConfig.ts — ห้าม hardcode ราคา ต้องตั้งผ่าน environment variable เท่านั้น
  (ไม่ตั้งค่า = cost: null, reason: "pricing_not_configured") ดู .env.example ส่วน STEP 21
- OpenAI Image (gpt-image-1) แก้เป็น 3 ตัวแปรแยกตาม quality tier แล้ว (ดู STEP 22 ด้านล่าง):
  OPENAI_IMAGE_PRICE_PER_IMAGE_LOW / _MEDIUM / _HIGH — quality อ่านจาก response.quality จริงของ
  OpenAI ต่อ generation เท่านั้น (src/lib/ai/imageGeneration.ts) ไม่มี default tier ถ้าไม่รู้ quality
  จริง (เช่น API ไม่ส่งกลับมา) estimated_cost จะเป็น null พร้อม reason "image_quality_unknown"

จุดที่เรียก ledger ครบแล้ว (record ก่อนยิง provider + finalize หลังรู้ผล):

- src/app/api/voice/route.ts
- src/app/api/video/auto/route.ts
- src/app/api/products/[id]/ai-video/generate/route.ts (create job)
- src/app/api/products/[id]/ai-video/jobs/[jobId]/route.ts (finalize ตอน poll)
- src/app/api/products/[id]/media/generate/route.ts
- src/app/api/content/generate/route.ts
- src/app/api/content/plan/route.ts
- src/app/api/content/calendar/plan/route.ts

API endpoints (ทดสอบยิงจริงผ่าน dev server แล้ว — ตอบถูกต้อง):

- GET /api/costs/summary
- GET /api/costs
- GET /api/costs/products/[id]
- GET /api/costs/content-plans/[id]

UI:

- src/app/costs/page.tsx — AI Cost Dashboard หน้าใหม่ (โหลดได้ HTTP 200)
- src/app/video-studio/page.tsx — panel "💰 Product AI Cost" ต่อสินค้า
- src/app/page.tsx — ลิงก์ไปหน้า /costs

Verified:

- pnpm.cmd exec tsc --noEmit → PASSED ไม่มี error
- ไม่มี TODO/FIXME ค้างในโค้ดที่เกี่ยวข้อง
- ทดสอบยิง API จริงผ่าน dev server (curl) — /api/costs/summary, /api/costs/products/[id], /costs
  ทำงานถูกต้องทั้งหมด (ยังไม่มี actual_cost เพราะไม่มี provider ใดคืนค่า billing จริงให้ — ตามที่ตั้งใจ)

หมายเหตุ:

ยังไม่ได้ตั้งค่า pricing environment variables จริง (OPENAI_TEXT_PRICE_INPUT_PER_1K ฯลฯ) — ถ้าต้องการ
เห็นตัวเลข estimated cost จริงในหน้า dashboard ต้องตั้งค่าตาม .env.example ส่วน STEP 21 ก่อน
ไม่ใช่บั๊ก เป็น "unconfigured by design" ตามที่ costConfig.ts ระบุไว้

---

## 22. STEP 22 — COST DASHBOARD: IMAGE QUALITY BREAKDOWN

Status:

DONE — ตรวจสอบและทดสอบแล้ว (2026-08-29)

เป้าหมาย:

แสดงต้นทุน AI Image แยกตาม quality tier จริง (low/medium/high/unknown) ใน AI Cost Dashboard และใน
Product AI Cost — ต่อยอด STEP 21 (ledger บันทึก metadata.quality จริงจาก response ของ OpenAI ไว้แล้ว)
โดยไม่สร้าง table ใหม่ ไม่เปลี่ยน schema และไม่แก้ endpoint เดิม (reuse ทั้งหมด)

Data layer (src/lib/costLedger.ts — ไม่มีการลบโค้ดเดิมแม้แต่บรรทัดเดียว เพิ่มเท่านั้น):

- ImageQualityTier / ImageQualityCostBreakdown (type ใหม่) — quality อ่านจาก
  ai_cost_ledger.metadata.quality เท่านั้น แถวที่ไม่มี quality ที่ใช้ได้ (low/medium/high) ถูกจัดเป็น
  "unknown" เสมอ ไม่มี default/fallback tier ที่เดาขึ้นมา
- extractImageQualityTier() / accumulateImageQuality() — helper ใช้ร่วมกันทุกจุด
- CategoryCostBreakdown เพิ่ม field `imageQualityBreakdown` (ใช้กับผลลัพธ์ของ getProductAiCost /
  getContentPlanAiCost / getClipAiCost โดยอัตโนมัติ เพราะทั้ง 3 ฟังก์ชันใช้ summarizeByCategory()
  ร่วมกันอยู่แล้ว — ไม่ต้องแก้ทั้ง 3 ฟังก์ชันแยกกัน)
- CostSummary เพิ่ม field `imageQualityBreakdown` (all-time เหมือน providerBreakdown/
  operationBreakdown) — คำนวณผ่าน getImageQualityBreakdownAllTime() ตัวใหม่

API: ไม่มี endpoint ใหม่ — reuse ทั้งหมดตามที่ตั้งใจ

- GET /api/costs/summary → response.summary.imageQualityBreakdown (ใหม่)
- GET /api/costs/products/[id] → response.cost.imageQualityBreakdown (ใหม่)
- GET /api/costs/content-plans/[id] → response.cost.imageQualityBreakdown (ใหม่ — ได้มาฟรีจาก
  การแก้ CategoryCostBreakdown ร่วม ไม่ได้ตั้งใจแก้ route นี้โดยตรง)
- GET /api/costs → ไม่แก้ (metadata.quality โชว์อยู่แล้วต่อแถวตั้งแต่ STEP 21)

UI:

- src/app/costs/page.tsx — เพิ่ม section "🖼️ Image Cost by Quality" (การ์ด low/medium/high/unknown
  พร้อม generations, estimated, actual, ค่าเฉลี่ยต่อ generation ต่อ tier + สรุปรวม Total Image
  Generations / Total Estimated / Total Actual)
- src/app/video-studio/page.tsx — panel "💰 Product AI Cost" เดิม เพิ่ม grid ย่อย "🖼️ Image แยกตาม
  Quality" ต่อสินค้า (แสดงเฉพาะเมื่อสินค้านั้นมี image generation อย่างน้อย 1 ครั้ง)

Cost calculation:

- ไม่แก้ costConfig.ts ใน STEP นี้ (คำนวณราคาต่อ tier ทำไปแล้วใน STEP 21 — STEP 22 เป็นชั้น
  reporting/dashboard เท่านั้น) ราคาที่ยืนยันแล้ว: low $0.011 / medium $0.042 / high $0.167 ต่อภาพ
  (source: developers.openai.com/api/docs/models/gpt-image-1, ตรวจสอบ 2026-08-29)
- quality=null (unknown) → estimated_cost เป็น null เสมอ พร้อม reason "image_quality_unknown" —
  ยืนยันด้วย unit test ตรงจาก calculateEstimatedCost() แล้วว่าไม่มีการเดาราคาเกิดขึ้น
- actual_cost ไม่ถูกแตะเลยในทุก path — ยังเป็น NULL เสมอจนกว่าจะมี billing API จริงจาก provider

Tested (จริง ผ่าน dev server + สคริปต์ทดสอบชั่วคราวที่ insert/verify/ลบ synthetic ledger rows ออก
ทันทีหลังตรวจสอบเสร็จ ไม่ทิ้งข้อมูลปลอมไว้ในระบบจริง):

- low/medium/high คำนวณตรงตามราคาที่ยืนยัน (0.011/0.042/0.167) และ unknown ไม่ถูกคิดราคา
- หลาย generation ในสินค้าเดียวกัน (medium+medium+high) รวมยอดถูกต้อง (0.084 / 0.167 ตามลำดับ)
- getProductAiCost(3) และ getCostSummary() ให้ imageQualityBreakdown ตรงกับข้อมูลจริงใน ledger
- SQL injection / invalid productId / invalid provider,operation / invalid date / oversized
  pageSize ทดสอบผ่าน endpoint เดิมทั้งหมด (/api/costs, /api/costs/products/[id],
  /api/costs/content-plans/[id]) → ตอบ 400/404 ตามที่ควร ไม่มี 500 ที่ไหนเลย
- Regression: /, /products, /content, /content-calendar, /content-studio, /video-studio,
  /voice-studio, /costs, /api/health, /api/products, /api/content/list, /api/costs*,
  /api/social/status, /api/social/worker/status, /api/social/queue → HTTP 200 ทั้งหมด
- pnpm.cmd exec tsc --noEmit → PASSED, pnpm.cmd run build → compiled สำเร็จ

Limitations:

- getClipAiCost()'s imageQualityBreakdown ยืนยันด้วยการอ่าน source code ว่าใช้ summarizeByCategory()
  ร่วมกับ getProductAiCost() (จึงต้องถูกต้องเชิงโครงสร้างเหมือนกัน) แต่ไม่ได้ทดสอบ live แบบครบวงจร
  ที่มี ai_video_job จริงผูกกับ content_plan ที่มี image regeneration หลายครั้ง — ความเสี่ยง
  regression ต่ำมากเพราะไม่ได้แก้ logic การนับของ getClipAiCost() เลย
- ยังไม่ได้ตั้งค่า OPENAI_IMAGE_PRICE_PER_IMAGE_LOW/MEDIUM/HIGH ใน .env จริง — dashboard จึงยังโชว์
  estimated cost เป็น "-" สำหรับภาพทุกใบจนกว่าจะตั้งค่า (ตามที่ตั้งใจ ไม่ใช่บั๊ก)
- ยังไม่ได้ตั้ง REPLICATE_VIDEO_PRICE_PER_GENERATION/PER_SECOND ตามที่สั่งห้ามไว้ (ยังไม่มีราคาที่
  ตรวจสอบยืนยันได้จาก Replicate)

อัปเดต (2026-08-29 หลัง STEP 22): ตั้งค่า OPENAI_IMAGE_PRICE_PER_IMAGE_LOW/MEDIUM/HIGH ใน .env จริง
แล้ว (0.011/0.042/0.167) — dashboard เริ่มแสดง estimated cost จริงของภาพแล้ว ยืนยันด้วยการ generate
ภาพจริง (quality="high" → estimated_cost=0.167 ตรงตาม tier)

---

## 23. STEP 23 — TEXT & VOICE PRICING CONFIGURATION

Status:

DONE — ตรวจสอบและทดสอบแล้ว (2026-08-29)

เป้าหมาย:

ตั้งค่า pricing environment variables จริงสำหรับ OpenAI Text (gpt-5-mini) และ OpenAI Voice/TTS
(tts-1-hd) ต่อจาก Image pricing ที่ตั้งไปแล้วใน STEP 21/22 — ก่อนตั้งค่า ตรวจสอบก่อนว่าทุกจุดที่เรียก
calculateEstimatedCost() สำหรับ text/voice ใช้ usage จริง (token count จาก response.usage ของ OpenAI
Responses API / character count จริงของสคริปต์) ไม่ใช่ค่าที่เดา — ยืนยันแล้วว่าใช้ของจริงทั้งหมด
(src/app/api/content/generate/route.ts, content/plan/route.ts, content/calendar/plan/route.ts,
voice/route.ts) จึงไม่ต้องแก้โค้ดใดๆ ใน STEP นี้ เป็นการตั้งค่า .env ล้วนๆ

ราคาที่ยืนยันแล้ว:

- OpenAI Text (gpt-5-mini): Input $0.25 / Output $2.00 ต่อ 1M tokens
  source: https://developers.openai.com/api/docs/models/gpt-5-mini (ตรวจสอบ 2026-08-29)
  แปลงเป็นหน่วยต่อ 1K ที่ costConfig.ts ใช้: OPENAI_TEXT_PRICE_INPUT_PER_1K=0.00025,
  OPENAI_TEXT_PRICE_OUTPUT_PER_1K=0.002
- OpenAI TTS (tts-1-hd): $30 ต่อ 1M characters = $0.03 ต่อ 1K characters
  source: https://developers.openai.com/api/docs/models/tts-1-hd (ตรวจสอบ 2026-08-29)
  OPENAI_TTS_PRICE_PER_1K_CHARS=0.03

Tested (จริงผ่าน dev server):

- POST /api/voice (25 ตัวอักษร) → estimated_cost = 0.00075 = (25/1000)*0.03 ตรงตามสูตร
- POST /api/content/generate (สินค้าจริง id=3) → input_units=1124, output_units=1576,
  estimated_cost = 0.003433 = (1124/1000)*0.00025 + (1576/1000)*0.002 ตรงตามสูตรเป๊ะ
- actual_cost ยังเป็น NULL ทั้งสองกรณี — ไม่มีการสร้าง fake actual cost
- pnpm.cmd exec tsc --noEmit → PASSED (ไม่มีการแก้โค้ด จึงไม่กระทบ)
- Regression: /, /costs, /voice-studio, /api/costs/summary, /api/health → HTTP 200 ทั้งหมด

หมายเหตุ:

ยังไม่ได้ตั้ง REPLICATE_VIDEO_PRICE_PER_GENERATION/PER_SECOND (ยังไม่มีราคาที่ตรวจสอบยืนยันได้จาก
Replicate ตามที่ระบุไว้ใน STEP 21/22) — pricing environment variables ที่ยังไม่ได้ตั้งค่าจริงตอนนี้
เหลือเฉพาะ Replicate Video เท่านั้น

---

## 25. STEP 25 — FINAL VERIFY: REPLICATE VIDEO PRICING

Status:

DONE — ตรวจสอบและทดสอบแล้ว (2026-08-29)

เป้าหมาย:

ยืนยันราคาจริงของ Replicate (minimax/video-01) จาก official source เท่านั้น (ห้าม reseller ห้ามเดา)
แล้วตั้งค่า environment variable ที่เหลืออยู่ตัวสุดท้ายจาก STEP 21/22/23 — ไม่แก้ render.ts และไม่แก้
src/app/api/social/ หรือ src/lib/social/ ตามที่กำหนด

Source ที่ตรวจสอบ:

https://replicate.com/minimax/video-01#pricing (ตรวจสอบ 2026-08-29)

วิธีตรวจสอบ: ดึง raw HTML ของหน้าโมเดลจริง (ไม่ใช่ reseller) แล้วอ่าน `billingConfig` JSON ที่ฝังอยู่ใน
หน้าเว็บโดยตรง (Next.js server-rendered data) — ไม่ใช่การอ่านจาก UI ที่ render ด้วย JS ซึ่ง WebFetch
ปกติมองไม่เห็น

ผลตรวจสอบ — ไม่มีความกำกวมเรื่อง unit:

- `billingConfig.current_tiers` มี 2 tier แยกตาม model variant: `t2v` (text-to-video) และ `s2v`
  (subject/image-to-video) — นี่คือที่มาของ "pricing card 2 ช่อง" ที่ต้องตรวจสอบ ไม่ใช่ราคาที่ต่างกัน
- ทั้ง 2 variant ราคาเท่ากัน: `{ metric: "video_output_count", metric_display: "output video",
  price: "$0.50", title: "per output video", type: "per-unit" }` — ยืนยันชัดเจนว่าเป็นราคา **ต่อ 1
  generation (ต่อวิดีโอที่สร้างสำเร็จ 1 ครั้ง)** ไม่ใช่ต่อวินาที
- ตรวจ cross-check: description ระบุ "or 20 videos for $10" = 20 × $0.50 = $10 ตรงกัน
- พบตัวเลขที่อาจทำให้สับสนแยกอยู่คนละ field: `"price": "$0.0001 per second"` กับ `"p50price":
  "$0.016"` — ตรวจแล้วว่าเป็น generic hardware-based estimate ของ Replicate (`"hardware": "CPU"`) ที่
  โชว์เป็นค่า fallback ทั่วไปของแพลตฟอร์ม **ไม่ใช่ราคาจริงที่เรียกเก็บ** เพราะโมเดลนี้มี per-unit
  billingConfig override บังคับใช้แทนอยู่แล้ว

การตั้งค่า (.env):

```
REPLICATE_VIDEO_PRICE_PER_GENERATION=0.50
```

ไม่ตั้ง `REPLICATE_VIDEO_PRICE_PER_SECOND` ตามที่สั่ง เพราะโมเดลนี้ไม่ได้คิดราคาต่อวินาทีจริง — ผล
คือ `calculateEstimatedCost()` (src/lib/costConfig.ts) จะ fallback ไปใช้ flat `perGeneration` เสมอ
ไม่ว่าจะรู้ duration จริงหรือไม่ (ดูผลทดสอบด้านล่าง)

Tested (จริงผ่าน dev server, ไม่แก้โค้ดใดๆ ในทุกไฟล์ที่ระบุห้ามแก้):

- `pnpm.cmd exec tsc --noEmit` → PASSED ไม่มี error (ไม่ได้แก้โค้ด มีแค่ .env)
- ทดสอบ `calculateEstimatedCost({ provider: "replicate", operation: "video", durationSeconds })`
  ตรงๆ ผ่าน tsx script ชั่วคราว (ลบทิ้งหลังทดสอบเสร็จ): durationSeconds = null / 6 / 12 → ได้ผลลัพธ์
  `{ cost: 0.5, currency: "USD" }` เท่ากันทุกกรณี ยืนยันว่าเป็น flat price ไม่ผูกกับ duration ตรงตาม
  billing model จริงของ Replicate
- Synthetic ledger test (insert → finalize → ตรวจผ่าน getCostSummary()/DB ตรงๆ → ลบทิ้งทันที ไม่เหลือ
  ข้อมูลปลอมในระบบ): แถว replicate/video_generate ได้ `estimated_cost = 0.5`, `actual_cost = NULL`
- `GET /api/costs/summary` → HTTP 200, `success: true`, providerBreakdown ทำงานถูกต้อง
- `GET /api/costs?pageSize=100` → ตรวจทุกแถวจริงในระบบ (5 แถว) ยืนยัน `actualCost` เป็น null ครบทุกแถว
  (ไม่มีการใส่ estimated_cost ลงใน actual_cost column ที่ไหนเลย)
- Regression: `/`, `/products`, `/content`, `/content-calendar`, `/content-studio`, `/video-studio`,
  `/voice-studio`, `/costs`, `/api/health`, `/api/products`, `/api/content/list`, `/api/costs`,
  `/api/costs/summary`, `/api/social/status`, `/api/social/worker/status`, `/api/social/queue` →
  HTTP 200 ทั้งหมด

ผลลัพธ์:

ตอนนี้ pricing environment variables ทั้งหมดจาก STEP 21/22/23/25 (OpenAI Text/Image/Voice, Replicate
Video) ตั้งค่าครบทุกตัวที่ตรวจสอบยืนยันได้จาก official source แล้ว ไม่มีตัวไหนเหลือเป็น
"pricing_not_configured" อีก (ยกเว้นกรณี image quality unknown ซึ่งเป็น edge case ที่ตั้งใจให้เป็น
null เสมอ)

---

## 26. STEP 26 — END-TO-END PIPELINE VERIFICATION

Status:

DONE — ข้อ 1–10 (Product → Content → Voice → Video → Render → Social → Cost Tracking →
API Regression → Database → Security) ตรวจสอบและทดสอบครบทั้งหมดแล้ว (2026-08-29) — ข้อ 10 พบ
finding ระดับ HIGH 1 จุด (unrestricted file upload ใน media upload endpoint) **แก้และทดสอบผ่านครบ
แล้วตามที่อนุมัติ** (มี residual limitation 1 จุดที่รายงานไว้ชัดเจน ไม่ใช่ blocking — ดูรายละเอียดใน
"ผลการ Audit ข้อ 10") — **STEP 26 (END-TO-END PIPELINE VERIFICATION) ถือว่า VERIFIED/READY แล้ว**

**STEP 26 FINAL WRAP-UP — backup cleanup completed (2026-08-29)**: ลบไฟล์ backup ที่สร้างระหว่าง
STEP 26 ทั้งหมด 8 ไฟล์ (`*.step26-backup-*` 5 ไฟล์จาก STEP 26.8, `*.step26-9-fix-backup-*` 2 ไฟล์
จาก STEP 26.9, `*.step26-10-security-backup-*` 1 ไฟล์จาก STEP 26.10) หลังยืนยันแล้วว่าไม่จำเป็นต้อง
ใช้อีก (STEP 26 verified/ready สมบูรณ์แล้ว) — ตรวจซ้ำหลังลบ: 0 ไฟล์ backup เหลือ, source code
ทั้ง 6 ไฟล์ที่เกี่ยวข้องยังอยู่ครบและไม่ถูกแก้ไข, `pnpm.cmd exec tsc --noEmit` PASSED, pricing ใน
`.env` ไม่เปลี่ยนแปลง, `render.ts`/`src/app/api/social/**`/`src/lib/social/**` ไม่ถูกแตะเลย — ไม่มี
การแก้ไข behavior หรือ source code logic ใดๆ ในรอบ wrap-up นี้ เป็นการลบไฟล์ backup เท่านั้น

เป้าหมาย:

ยืนยันว่า pipeline จริงทั้งสาย Product → Content → Voice → Video → Render → Social Queue →
Worker/Scheduler เชื่อมต่อกันและทำงานได้จริงบน dev server จริง ไม่ใช่แค่ TypeScript/build ผ่าน

สิ่งที่ต้องตรวจ:

1. Product — [✓] DONE (2026-08-29)
   - สร้าง/อ่าน product จาก database จริง
   - ยืนยันข้อมูล product ถูกส่งต่อไปยัง content pipeline ได้

2. Content — [✓] DONE (2026-08-29)
   - ตรวจ content generation/list/plan ที่เกี่ยวข้อง
   - ยืนยันข้อมูลจาก Product ถูกใช้ต่อได้จริง

ผลการ Audit ข้อ 1–2:

พบว่ามี content flow คู่ขนาน 2 เส้นทางที่ไม่เชื่อมกัน:

- **Content Plan flow** (`/api/content/plan` → ตาราง `content_plans`, ใช้โดย video-studio และ
  content-calendar) — fetch product จริงจาก DB ด้วย `productId`, insert ลง `content_plans` ที่มี
  `product_id NOT NULL` + FK จริง, เชื่อม cost ledger ครบตาม STEP 21 อยู่แล้ว ไม่มี gap
- **Content Studio flow** (`/api/content/generate` + `/api/content/save` → ตาราง `content`, ใช้โดย
  หน้า content-studio และ content library) — พบ gap: `saveContent()` มี `selectedProduct.id` อยู่ใน
  มือแต่ไม่ได้ส่งไปกับ request, `/api/content/save` ไม่รับ `productId`, และตาราง `content` ไม่มี
  คอลัมน์ `product_id` เลย ทำให้ content ที่บันทึกจริงเป็น orphan row สืบย้อนกลับไป product ต้นทาง
  ไม่ได้

ไฟล์ที่แก้ (4 ไฟล์ ตามที่ audit เสนอ ไม่มีเกินสโคป):

- `src/lib/db.ts` — เพิ่ม migration `ALTER TABLE content ADD COLUMN product_id INTEGER REFERENCES
  products(id)` (nullable, check-then-add pattern เดียวกับคอลัมน์อื่นในไฟล์นี้ เช่น model/master/year)
- `src/app/api/content/save/route.ts` — รับ `productId` (optional เพื่อ backward-compat), validate
  เป็น integer บวก, ตรวจว่า product มีอยู่จริงก่อน insert (404 ถ้าไม่พบ), insert/select คอลัมน์
  `product_id` กลับไปด้วย
- `src/app/api/content/list/route.ts` — เพิ่ม `product_id` ใน SELECT
- `src/app/content-studio/page.tsx` — `saveContent()` ส่ง `productId: selectedProduct.id` เพิ่ม

Tested (จริงผ่าน dev server, สร้าง product/content ทดสอบแล้วลบทิ้งหลังตรวจเสร็จ):

- `pnpm.cmd exec tsc --noEmit` → PASSED ไม่มี error
- POST `/api/content/save` พร้อม `productId` ถูกต้อง → บันทึกจริง ได้ `product_id: 13` กลับมา
- POST `/api/content/save` พร้อม `productId` ที่ไม่มีจริง (999999) → HTTP 404
  `ไม่พบสินค้ารหัส 999999` (ไม่สร้างแถวปลอม)
- POST `/api/content/save` โดยไม่ส่ง `productId` (backward-compat กับ caller เดิม) → ยังบันทึกได้
  ปกติ ได้ `product_id: null`
- GET `/api/content/list` → เห็น `product_id` ถูกต้องครบทั้ง 2 กรณีข้างต้น
- Regression 17 endpoints (`/`, `/products`, `/content`, `/content-studio`, `/content-calendar`,
  `/video-studio`, `/voice-studio`, `/costs`, `/api/health`, `/api/products`, `/api/content/list`,
  `/api/content/plan`, `/api/costs`, `/api/costs/summary`, `/api/social/status`,
  `/api/social/worker/status`, `/api/social/queue`) → HTTP 200 ทั้งหมด
- Cleanup: ลบ test product (id 13, ชื่อ `STEP26-AUDIT-TEST-PRODUCT`) และ test content 2 แถว
  (`STEP26-AUDIT-*`) ออกจากฐานข้อมูลจริงหมดแล้ว ตรวจซ้ำเหลือ 0 — ไม่มีข้อมูลทดสอบตกค้าง

Hard constraints ที่ยืนยันว่าไม่ถูกแตะระหว่างข้อ 1–2: `render.ts`, `src/app/api/social/**`,
`src/lib/social/**`, pricing/.env จาก STEP 21–25, ไม่มี fake `actual_cost`, ไม่มี secret/token
ถูกแสดงหรือ log ออกมาที่ไหนเลย

3. Voice — [✓] DONE (2026-08-29) — verification only ไม่มีการแก้โค้ด
   - ตรวจ Voice API / Voice Studio
   - ยืนยัน output และการบันทึกข้อมูลที่เกี่ยวข้อง

ผลการ Audit ข้อ 3:

พบว่ามี Voice generation 2 เส้นทางเช่นกัน แต่ต่างจากข้อ 1–2 คือ **ทั้งสองเส้นทางทำงานถูกต้องตาม
design อยู่แล้ว ไม่มี gap ต้องแก้โค้ด**:

- **Automated pipeline** (`/api/video/auto`, ใช้โดยปุ่ม auto-generate ใน video-studio) — โหลด
  product จริงจาก DB ด้วย `productId`, เรียก `generateVoice()` (จาก `src/lib/voice.ts`) ตรงๆ แล้ว
  บันทึก ledger เองด้วย `product_id` จริงเสมอ (ดู `src/app/api/video/auto/route.ts` บรรทัด
  274–298) — เชื่อมกับ cost ledger ถูกต้องสมบูรณ์
- **Manual Voice Studio** (`/api/voice` + หน้า `/voice-studio`) — โค้ดมี comment ระบุไว้ชัดเจนแล้วว่า
  เป็น "**Voice Studio (Manual Workflow) เดิม**" (`src/app/api/voice/route.ts` บรรทัด 32–34) ที่จงใจ
  ให้ `productId`/`contentPlanId` เป็น `NULL` เสมอ เพราะหน้านี้รับแค่ script ผ่าน URL param
  (ไม่มี product context ส่งมาด้วย) — เอกสารในโค้ดเขียนไว้ตรงๆ ว่า "**ไม่ใช่ bug**"

เนื่องจาก `/voice-studio` ถูกเรียกว่า "Manual Workflow" ตรงๆ ในโค้ดจริง ซึ่งตรงกับคำที่อยู่ใน HARD
CONSTRAINT ของ STEP 26 ("ห้ามเปลี่ยน Manual Workflow/Social Pipeline") — จึง**ไม่แก้ไฟล์
`voice-studio/page.tsx` หรือ `api/voice/route.ts` เลยในรอบนี้** ถือว่า item 3 ผ่านโดยไม่ต้อง
implementation ใดๆ เป็นแค่การ verify ว่าทั้งสองเส้นทางทำงานได้จริงตามที่ออกแบบไว้

Tested (จริงผ่าน dev server, เรียก OpenAI TTS จริงของจริง มีค่าใช้จ่ายจริงเล็กน้อย
รวม < $0.001 USD, ลบ ledger row ทดสอบและไฟล์เสียงทดสอบทิ้งหลังตรวจเสร็จ):

- สร้าง product ทดสอบ (id 14, ไม่มีรูปสินค้า) → `POST /api/video/auto` พร้อม `productId: 14` และ
  `script` สั้นๆ (ข้าม content-generate เพื่อไม่เสียค่า text-generation ซ้ำ) → เสียงพากย์ถูกสร้างจริง
  (`voice.audioUrl` มีไฟล์จริงบนดิสก์), pipeline หยุดที่ `no_media` ถูกต้อง (ไม่มีรูปสินค้าจริง จึงไม่
  เรียก Render API เลย — ไม่แตะ render.ts)
- ตรวจ `ai_cost_ledger` ตรงๆ → แถว `voice_generate` ของ product 14 มี `product_id: 14` (ตรงจริง),
  `status: succeeded`, `actual_cost: null` (ไม่มี fake billing)
- `POST /api/voice` (manual) พร้อม script สั้นๆ → ได้ `audio/mpeg` จริงกลับมาพร้อม header
  `X-Audio-Url` ตรงกับที่หน้า `/voice-studio` ต้องการ, ไฟล์ mp3 ถูกเขียนจริงที่
  `public/generated/voice/`
- ตรวจ `ai_cost_ledger` ของการเรียกนี้ → `product_id: null`, `content_plan_id: null` ตรงตาม
  design ที่ comment ไว้ในโค้ด ไม่ใช่ bug
- Regression 17 endpoints เดิม → HTTP 200 ทั้งหมด
- Cleanup: ลบ product ทดสอบ (id 14), ลบ `ai_cost_ledger` แถวทดสอบทั้ง 2 แถว (id 17, 18), และลบไฟล์
  mp3 ทดสอบทั้ง 2 ไฟล์ที่สร้างขึ้นระหว่างการตรวจออกจากดิสก์จริงแล้ว — ไม่ปล่อยให้ปนกับ cost
  dashboard จริง

Hard constraints ที่ยืนยันว่าไม่ถูกแตะระหว่างข้อ 3: `render.ts` (ไม่ถูกเรียกเลยเพราะ pipeline หยุดที่
`no_media` ก่อน), `src/app/api/social/**`, `src/lib/social/**`, Manual Workflow (`voice-studio` —
ตรวจสอบเฉยๆ ไม่แก้โค้ด), pricing/.env จาก STEP 21–25, ไม่มี fake `actual_cost`, ไม่มี secret/token
ถูกแสดงหรือ log ออกมาที่ไหนเลย

4. Video — [✓] DONE (2026-08-29) — verification only ไม่มีการแก้โค้ด
   - ตรวจ Video Studio และ video generation flow
   - ตรวจการเชื่อมต่อกับ cost ledger
   - ห้ามสร้าง actual_cost ปลอม

ผลการ Audit ข้อ 4:

Video Studio มี 2 เส้นทางสร้างวิดีโอ ตรวจแล้วทั้งคู่เชื่อมกับ cost ledger ถูกต้องอยู่แล้ว ไม่มี gap
ต้องแก้โค้ด:

- **AI Video Generation** (`POST /api/products/[id]/ai-video/generate` ผ่าน Replicate, async
  job-based) — เช็ค `validateConnection()` ก่อนเสมอ ถ้า `REPLICATE_API_TOKEN` ไม่ได้ตั้งค่าจะคืน 503
  `not_configured` ทันที **ไม่สร้าง job/ledger row ใดๆ เลย** (ไม่ fake success) ถ้า configured แล้ว
  บันทึก ledger ด้วย `product_id` จริงตอนเริ่ม job (estimated cost แบบ flat), แล้ว refine เป็นค่าจริง
  จาก duration (ยืนยันด้วย ffprobe ใน `downloadVideoToDisk`) ตอน job สำเร็จผ่าน
  `GET .../jobs/[jobId]` — `actual_cost` เป็น `NULL` เสมอเพราะ Replicate ไม่มี endpoint คืนค่าใช้จ่าย
  จริงต่อ prediction ให้
- **Auto Pipeline แบบ local render** (`POST /api/video/auto` — Product → Content → Voice → Media →
  Timeline → Render) — เชื่อม voice ledger ด้วย `product_id` จริงเสมอ (ตรวจแล้วในข้อ 3), media/timeline
  ใช้รูปสินค้าจริงจากดิสก์ ไม่ fabricate ไฟล์ใดๆ, เรียก Render API จริงผ่าน HTTP (ไม่แก้
  `src/app/api/video/render/route.ts` เลย — เรียกเหมือนที่แอปเรียกเองปกติ)

Tested (จริงผ่าน dev server):

- ตรวจ `/api/health` → `aiVideo: "not_configured"` ตรงกับ `.env` จริง (ไม่มี `REPLICATE_API_TOKEN`)
- `POST /api/products/{id}/ai-video/generate` (ไม่มี token) → HTTP 503 `not_configured` ตรวจ DB
  ยืนยันว่า **ไม่มีแถวถูกสร้างเลย** ทั้งใน `ai_video_jobs` และ `ai_cost_ledger` (ไม่มีค่าใช้จ่ายเกิดขึ้น
  จริง เพราะไม่มี token ให้เรียก Replicate จริงตั้งแต่ต้น)
- `GET /api/products/{id}/ai-video/jobs` (ว่าง) → `{success:true, jobs:[]}` ถูกต้อง
- `GET /api/products/{id}/ai-video/jobs/999999` (ไม่มีจริง) → HTTP 404 ถูกต้อง
- สร้าง product ทดสอบ + อัปโหลดรูปทดสอบจริง 1 รูป (ไฟล์ JPEG จริง ไม่ใช่ mock) → เรียก
  `POST /api/video/auto` พร้อม `productId` และ `script` สั้นๆ (ข้าม content-generate cost) →
  pipeline วิ่งจบ `video_ready` จริง: เสียงพากย์จริง → media ready → timeline ready → **เรียก Render
  API จริงและได้ไฟล์ MP4 จริงบนดิสก์ (47.7KB)** ยืนยันด้วย `ls` ตรงๆ
- ตรวจ `ai_cost_ledger` ของ voice step ในรอบนี้ → `product_id` ตรงกับ product ทดสอบจริง,
  `actual_cost: null`
- หมายเหตุข้อจำกัดของการทดสอบ: **ไม่ได้ทดสอบ happy-path ของ Replicate AI Video Generation แบบ
  end-to-end จริง** (create job → poll → download) เพราะ `REPLICATE_API_TOKEN` ไม่ได้ตั้งค่าไว้ใน
  environment นี้ และการทดสอบจริงจะมีค่าใช้จ่ายจริงที่ไม่เล็กน้อย (~$0.50 ต่อครั้งตามราคาที่ verify
  ไว้ใน STEP 25) — ตรวจสอบเฉพาะ code path (validateConnection/createJob/getJobStatus ใน
  `src/lib/ai/video/replicateProvider.ts`) และ path `not_configured` ที่ทดสอบได้จริงโดยไม่มี
  ค่าใช้จ่ายแทน ไม่ได้เดาว่า happy-path ทำงานถูกต้อง — อ่านโค้ดแล้วยืนยันว่า pattern (two-phase
  ledger, ffprobe ยืนยัน duration จริง, actual_cost เป็น NULL เสมอ) เหมือนกับที่ STEP 25 ตรวจสอบ
  pricing ไว้แล้วทุกประการ
- Regression 17 endpoints เดิม → HTTP 200 ทั้งหมด
- Cleanup: ลบ product ทดสอบ, `product_media` แถวทดสอบ, `ai_cost_ledger` แถวทดสอบ, ไฟล์ JPEG/MP3/MP4
  ทดสอบทั้งหมดที่สร้างขึ้นออกจากดิสก์จริงและฐานข้อมูลจริงหมดแล้ว ตรวจซ้ำเหลือ 0 ทุกจุด

Hard constraints ที่ยืนยันว่าไม่ถูกแตะระหว่างข้อ 4: `render.ts` (เรียกผ่าน HTTP เท่านั้น ไม่แก้โค้ด),
`src/app/api/social/**`, `src/lib/social/**`, pricing/.env จาก STEP 21–25, ไม่มี fake
`actual_cost` (ยืนยันเป็น `NULL` ทุกแถวที่ตรวจ), ไม่มี secret/token ถูกแสดงหรือ log ออกมาที่ไหนเลย

5. Render — [✓] DONE (2026-08-29) — verification only ไม่มีการแก้โค้ด (ไม่แตะ
   src/app/api/video/render/route.ts เลยตาม HARD CONSTRAINT)
   - ตรวจ render flow ที่มีอยู่
   - ห้ามแก้ไข src/app/api/video/render/route.ts

ผลการ Audit ข้อ 5:

อ่านโค้ด `src/app/api/video/render/route.ts` ทั้งไฟล์ (อ่านเพื่อ audit เท่านั้น ไม่แก้ไขแม้แต่บรรทัด
เดียว) พบว่าเป็น pure stateless FFmpeg render function: ไม่เขียน DB เลย ไม่มี AI cost ledger
เกี่ยวข้องเลย (rendering เป็น local compute ไม่ใช่ AI generation ที่มีค่าใช้จ่ายจริง ตรงตาม design
จึงไม่มี `actual_cost` ให้ปลอมได้อยู่แล้วในไฟล์นี้) ไม่มี gap ต้องแก้:

- validate field ครบ (`timeline`/`script`/`audioUrl`/`media`) ก่อนแตะ filesystem ทุกครั้ง
- `getPublicFilePath()` กัน path traversal จริง — เช็คทั้ง prefix `/generated/` และปฏิเสธ `..` ก่อนส่ง
  path เข้า ffmpeg เสมอ
- ทุก error path (รวม path ลึกๆ เช่น scene ไม่ตรงกับไฟล์สื่อ) จบด้วย `rm(workDir, {recursive:true,
  force:true})` เสมอทั้งฝั่งสำเร็จและฝั่ง catch — ไม่ปล่อย temp directory ค้าง

Tested (จริงผ่าน dev server, เป็น local ffmpeg ล้วนๆ ไม่มีค่าใช้จ่ายจริงเลยแม้แต่บาทเดียวเพราะไม่มี
AI API ใดถูกเรียกในไฟล์นี้):

- Field validation 5 เคส (ไม่มี timeline / ไม่มี script / ไม่มี audioUrl / timeline เป็น JSON ผิด /
  timeline array ว่าง) → HTTP 400 ตรงข้อความที่คาดไว้ทุกเคส
- "ไม่มีไฟล์สื่อแนบมาเลย" → HTTP 400 ถูกต้อง
- Path traversal 2 เคส (`audioUrl` ไม่ขึ้นต้นด้วย `/generated/`, `audioUrl` มี `..`) → HTTP 500
  `ไม่อนุญาตให้เข้าถึงไฟล์เสียงนี้` ทั้งคู่ ไม่มีการอ่านไฟล์นอก `public/generated/` เกิดขึ้นจริง
- Scene index ที่ไม่ตรงกับไฟล์สื่อที่แนบมา → HTTP 500 `Scene 5 ไม่พบไฟล์สื่อที่ตรงกัน` ถูกต้อง
- ตรวจ `.tmp/video-render/` หลังทุก error case ข้างต้น → ว่างเปล่า 0 โฟลเดอร์ค้าง (cleanup ทำงานถูก
  ต้องทุกเส้นทาง)
- Regression 17 endpoints เดิม → HTTP 200 ทั้งหมด
- ยืนยันด้วยว่า happy-path ของไฟล์นี้ (ได้ MP4 จริงจาก timeline+media+audio จริง) ถูก verify ไปแล้ว
  ในข้อ 4 (ได้ไฟล์ MP4 จริง 47.7KB บนดิสก์) — ไม่ทำซ้ำในรอบนี้เพื่อไม่ให้เปลืองเวลา
- ไม่มีข้อมูลทดสอบตกค้าง (ไม่มี request ไหนถึงขั้นสร้างไฟล์ MP4/DB row ใหม่เลยในรอบนี้ ทุกเคสถูกปฏิเสธ
  ก่อนถึงขั้น ffmpeg ยกเว้นที่ verify ไปแล้วในข้อ 4)

Hard constraints ที่ยืนยันว่าไม่ถูกแตะระหว่างข้อ 5: `render.ts` (**อ่านเพื่อ audit เท่านั้น ไม่มีการ
แก้ไขแม้แต่บรรทัดเดียว — ยืนยันด้วยว่าไม่ได้เรียก Edit/Write บนไฟล์นี้เลยตลอด STEP 26**),
`src/app/api/social/**`, `src/lib/social/**`, pricing/.env จาก STEP 21–25, ไม่มี fake `actual_cost`
(ไฟล์นี้ไม่แตะ cost ledger เลยอยู่แล้ว), ไม่มี secret/token ถูกแสดงหรือ log ออกมาที่ไหนเลย

6. Social — [✓] DONE (2026-08-29) — verification only ไม่มีการแก้โค้ด
   - ตรวจ social prepare/status/queue/worker/scheduler ที่มีอยู่
   - ห้ามแก้ไขไฟล์ใต้ src/app/api/social/
   - ห้ามแก้ไขไฟล์ใต้ src/lib/social/
   - ห้ามเปลี่ยน Manual Workflow/Social Pipeline

ผลการ Audit ข้อ 6:

อ่านโค้ดครบทั้ง 14 ไฟล์ (route ทั้งหมดใต้ `src/app/api/social/` + `src/lib/social/*.ts` +
`src/lib/socialQueue.ts`/`socialPosts.ts`/`socialContent.ts`/`socialWorker.ts`/`socialWorkerRuns.ts`
— อ่านเพื่อ audit เท่านั้น ไม่มีการเรียก Edit/Write บนไฟล์เหล่านี้แม้แต่ไฟล์เดียวตลอดข้อ 6) พบว่า
Social Pipeline ทั้งระบบ (prepare → queue → worker/scheduler → post) ทำงานถูกต้องตาม design เดิม
ไม่มี gap ต้องแก้โค้ด:

- ทุก provider (facebook/instagram/tiktok) เช็ค credential ก่อนเสมอ ถ้าไม่ครบคืน `not_configured`
  ทันทีโดยไม่ยิง network request และไม่แตะ DB เลย (`/api/social/post`, `processScheduledPosts()`)
- Queue lifecycle มี atomic claim (`claimSocialPostForProcessing`) กัน worker ชนกัน, stale-processing
  recovery (timeout 15 นาที default), retry แบบ backoff (`MAX_RETRY_COUNT=3`) แยกจาก
  not_configured/error ที่ fail ถาวรทันทีไม่ retry (เพราะ retry โดยไม่มี credential ไม่มีทางสำเร็จ)
- ไม่มีทาง fake `externalPostId`/`published` — ทุก path ต้องได้ id จริงจาก provider API เท่านั้น
- Secret ถูก mask ก่อน log เสมอ (`maskSecret()`), ทุก GET endpoint (`status`/`worker/status`) คืนแค่
  status/accountName/message ไม่เคยส่ง token กลับมา, `/api/social/worker/run` ถูกป้องกันด้วย
  `WORKER_TRIGGER_SECRET` (ปฏิเสธเสมอถ้ายังไม่ตั้งค่า — ปลอดภัยไว้ก่อน)
- Social pipeline **ไม่แตะ `ai_cost_ledger` เลย** (การโพสต์โซเชียลไม่ใช่ AI generation ที่มีค่าใช้จ่าย
  ในสถาปัตยกรรมนี้) จึงไม่มีทางเกิด fake `actual_cost` จากเส้นทางนี้ได้อยู่แล้วโดย design
- Content/Video → Social เชื่อมต่อจริงผ่าน UI (`video-studio/page.tsx`, `content-calendar/page.tsx`
  เรียก `/api/social/prepare`, `/api/social/queue`, `/api/social/post`, `/api/social/status`,
  `/api/social/analytics`, `/api/social/worker/status`, `/api/social/worker/run` ครบทุกจุด)

Tested (จริงผ่าน dev server, ไม่มี credential โซเชียลใดตั้งค่าไว้เลยจึงไม่มีทางโพสต์จริงออกไปได้ —
ยืนยันจากโค้ดก่อนแล้วจึงทดสอบ):

- `GET /api/social/status` → `not_configured` ครบทั้ง 3 แพลตฟอร์ม ไม่มี secret ใน response
- `GET /api/social/worker/status` → คืนสถานะ/ประวัติจริงจาก DB ไม่มี secret ใน response
- Validation errors: `prepare` (missing productId / invalid platform / invalid videoUrl / วิดีโอไม่มี
  จริงบนดิสก์), `queue` POST (productId ไม่มีจริง / scheduledAt อดีต / status filter ผิด), `post`
  (invalid platform) → HTTP 400/404 ตรงข้อความทุกเคส
- Happy path เต็มรูปแบบ: สร้าง product ทดสอบ + ไฟล์วิดีโอ dummy (ระบุชัดว่าเป็นไฟล์ทดสอบ ไม่ใช่ render
  จริง เพื่อเลี่ยงต้นทุนซ้ำที่ verify ไปแล้วในข้อ 4) → `prepare` (ใช้ caption override ตาม STEP 19
  เพื่อไม่ต้องเรียก `/api/content/generate` ซ้ำโดยไม่จำเป็น — ศูนย์ค่าใช้จ่าย) → `queue` POST สำเร็จ
  (`status: scheduled`) → `GET queue?productId=` เห็นแถวจริง → `cancel` สำเร็จ (`status: cancelled`)
  → `cancel` ซ้ำ → HTTP 409 ถูกต้อง → `cancel` id ที่ไม่มีจริง → HTTP 404 ถูกต้อง
- `POST /api/social/post` (not_configured) → HTTP 503, ยืนยันด้วย DB ตรงๆ ว่า **ไม่มีการ insert แถว
  ใดเลย** ก่อนเช็ค connection (ไม่ทิ้งร่องรอยความพยายามโพสต์ที่ไม่เกิดขึ้นจริง)
- Worker/scheduler live test (**อนุมัติจากผู้ใช้ให้รัน `pnpm social:worker` โดยตรง** หลัง auto-mode
  classifier บล็อกไว้ก่อน — ยืนยันแล้วว่าปลอดภัย 100% เพราะไม่มี credential ใดๆ): insert test row
  "due scheduled" (facebook) + "stale processing" (tiktok, ค้างเกิน 15 นาที) ตรงๆ ผ่าน DB → รัน
  `pnpm social:worker` จริง → ผลลัพธ์ `processed=1 published=0 failed=1 retried=0 recovered=1` ตรงตาม
  design ทุกประการ: post ค้าง stale ถูก recover เป็น `failed` ถาวร (ข้อความ "ค้างเกิน 15 นาที..."),
  post ที่ due ถูก claim แล้ว fail ทันทีเพราะ facebook `not_configured` (`error_message: "facebook
  provider ยังไม่ได้เชื่อมต่อ"`, `retry_count: 0`, `external_post_id: null` — ไม่มีการ retry เพราะเป็น
  not_configured ไม่ใช่ transient error) — `social_worker_runs` บันทึกผลถูกต้องครบ ไม่มี log ใด
  แสดง secret/token เลยตลอดการรัน
- ตรวจ `ai_cost_ledger` สำหรับ product ทดสอบ → 0 แถว ยืนยันว่า social flow ไม่แตะ cost ledger เลยจริง
- `pnpm.cmd exec tsc --noEmit` → PASSED ไม่มี error
- Regression 17 endpoints เดิม → HTTP 200 ทั้งหมด
- ตรวจ mtime ของทุกไฟล์ใต้ `src/app/api/social/`, `src/lib/social/`, และไฟล์ business-logic ที่
  เกี่ยวข้อง (`socialQueue.ts`/`socialPosts.ts`/`socialContent.ts`/`socialWorker.ts`/
  `socialWorkerRuns.ts`) + `src/app/api/video/render/route.ts` — ยืนยันร่วมกับ tool-call history ของ
  รอบนี้ว่าไม่มีการเรียก Edit/Write บนไฟล์เหล่านี้แม้แต่ไฟล์เดียว (ไม่มี git ในโปรเจกต์นี้จึงตรวจด้วย
  mtime + tool-call log แทน `git diff`)
- ข้อจำกัดที่ต้องแจ้ง: ไม่ได้ทดสอบ retry/backoff branch ("connected แต่ createPost throw ชั่วคราว")
  เพราะไม่มี credential จริงให้ provider ตอบสถานะ "connected" ได้เลยในสภาพแวดล้อมนี้ — ตรวจสอบเฉพาะ
  code review (`markFailed()` ใน `src/lib/socialQueue.ts`) ว่า logic การนับ `retryCount`/backoff/
  `MAX_RETRY_COUNT` ถูกต้อง ไม่ได้รัน live test เส้นทางนี้จริง (ข้อจำกัดแบบเดียวกับ Replicate ในข้อ 4)
- Cleanup: ลบ product ทดสอบ, `social_posts` ทดสอบ 3 แถว, `social_worker_runs` ทดสอบ 1 แถว, ไฟล์วิดีโอ
  dummy ทดสอบ ออกจากฐานข้อมูลจริงและดิสก์จริงหมดแล้ว ตรวจซ้ำเหลือ 0 ทุกจุด

Hard constraints ที่ยืนยันว่าไม่ถูกแตะระหว่างข้อ 6: `src/app/api/social/**`, `src/lib/social/**`,
Manual Workflow/Social Pipeline (ตรวจสอบเฉยๆ ไม่แก้โค้ดแม้แต่บรรทัดเดียว), `render.ts`, pricing/.env
จาก STEP 21–25, ไม่มี fake `actual_cost` (ไม่มี cost ledger เกี่ยวข้องเลยในเส้นทางนี้), ไม่มี
secret/token ถูกแสดงหรือ log ออกมาที่ไหนเลยตลอดการทดสอบ (รวมตอนรัน worker CLI จริง)

7. Cost Tracking — [✓] DONE (2026-08-29) — verification only ไม่มีการแก้โค้ด
   - ตรวจ estimated_cost / actual_cost ตาม flow จริง
   - actual_cost ต้องมาจากข้อมูล billing จริงเท่านั้น
   - ห้ามสร้าง fake billing หรือ fake actual_cost

ผลการ Audit ข้อ 7:

อ่านโค้ดครบ `src/lib/costConfig.ts`, `src/lib/costLedger.ts`, `src/app/api/costs/route.ts`,
`src/app/api/costs/summary/route.ts`, `src/app/api/costs/products/[id]/route.ts`,
`src/lib/ai/imageGeneration.ts` (อ่านเพื่อ audit เท่านั้น ไม่มีการเรียก Edit/Write บนไฟล์เหล่านี้เลย)
พบว่า AI Cost Tracking ทั้งระบบทำงานถูกต้องตาม design เดิม ไม่มี gap ต้องแก้โค้ด:

- ไม่มีการ hardcode ราคาที่ไหนเลย — ทุกที่เรียกผ่าน `getProviderPricing()`/`calculateEstimatedCost()`
  ใน `costConfig.ts` เท่านั้น อ่านราคาจาก environment variable ล้วนๆ ไม่มี default ตัวเลข
- `actual_cost`/`estimated_cost` แยกคอลัมน์กันเด็ดขาดใน `finalizeAiGenerationCost()` — โค้ดมี comment
  "กฎเหล็ก: ห้าม overwrite actual_cost ด้วย estimated_cost" และไม่มี call site ไหนส่ง `actualCost`
  เข้ามาเลยทั้งระบบ (grep ยืนยัน) — `actual_cost` เป็น `NULL` เสมอในทุกแถวเพราะยังไม่มี provider ใด
  คืน billing จริงต่อ request ให้ในสถาปัตยกรรมนี้
- Image quality อ่านจาก `response.quality ?? null` ของ OpenAI ตรงๆ ใน `imageGeneration.ts` ไม่มีการ
  เดา tier ใดๆ — `quality=null` → `estimated_cost=null` พร้อม reason `"image_quality_unknown"` เสมอ
- ทุก query ใน `costLedger.ts`/`costs/route.ts` ใช้ parameterized statement (`?` placeholder) ของ
  better-sqlite3 เท่านั้น ไม่มี string-interpolation ของ user input ลง SQL ที่ไหนเลย

Pricing verification (เทียบกับค่าที่ยืนยันแล้วใน STEP 21–25 และค่าที่ผู้ใช้ระบุในสโคปนี้):

- `OPENAI_IMAGE_PRICE_PER_IMAGE_LOW/MEDIUM/HIGH` = 0.011 / 0.042 / 0.167 ตรงทุกตัวใน `.env` จริง
- `REPLICATE_VIDEO_PRICE_PER_GENERATION` = 0.50 ตรงใน `.env` จริง
- `REPLICATE_VIDEO_PRICE_PER_SECOND` **ไม่ถูกตั้งค่าเลย** ยืนยันด้วย `process.env` ตรงๆ (undefined) —
  ทดสอบแล้วว่าแม้ส่ง `durationSeconds` จริงเข้าไป (เช่น 12 วินาที) ราคาก็ยัง fallback ไปใช้ flat
  `perGeneration=0.50` เสมอ ไม่มีทางคำนวณต่อวินาทีได้จนกว่าจะตั้งค่าตัวแปรนี้เอง

estimated_cost verification (pure-function test ผ่าน `calculateEstimatedCost()` จริง — เขียนสคริปต์
ชั่วคราว `scripts/step26-cost-pricing-check.ts` รันด้วย `npx tsx` แล้ว**ลบทิ้งทันทีหลังตรวจเสร็จ**
ไม่มีการเรียก network ใดๆ ในการทดสอบนี้ ศูนย์ค่าใช้จ่าย):

- text: input/output 1000/1000 tokens → 0.00225 PASS
- image low ×1 → 0.011 PASS, medium ×2 → 0.084 PASS, high ×1 → 0.167 PASS, quality=null → cost=null
  reason=image_quality_unknown PASS
- voice: 3000 ตัวอักษร → 0.09 PASS
- video: มี duration จริง (12s) แต่ `perSecond` ไม่ตั้งค่า → ยัง fallback เป็น flat 0.50 PASS,
  ไม่มี duration เลย → 0.50 PASS เช่นกัน
- ทุกเคส PASS ครบ 8/8 ไม่มี FAIL

actual_cost verification:

- ยืนยันด้วย grep ทั้ง codebase ว่าไม่มี call site ใดส่ง `actualCost` เข้า
  `finalizeAiGenerationCost()`/`finalizeAiGenerationCostByAiVideoJobId()` เลยสักที่ — คอลัมน์นี้เป็น
  `NULL` จริงทุกแถวในฐานข้อมูลปัจจุบัน (ตรวจสอบตรงๆ ผ่าน DB query)
- ไม่ได้สร้าง fake `actual_cost` ระหว่างการทดสอบใดๆ ทั้งสิ้นตลอด STEP 26.7

Product attribution verification (real integration test — เรียก `/api/content/generate` จริง 1 ครั้ง
เพราะเป็น operation เดียวที่ไม่เคยถูก verify แบบมี pricing จริงมาก่อนตลอดโปรเจกต์ — STEP 21 ทดสอบก่อน
ตั้งราคา, STEP 23 ตั้งราคาแต่ไม่ได้ทดสอบยิงจริงซ้ำ — ค่าใช้จ่ายจริงที่เกิดขึ้นรอบนี้ ~$0.0039 เท่านั้น):

- สร้าง product ทดสอบ (id 17) → เรียก `/api/content/generate` จริงพร้อม `product.id: 17` →
  ledger แถวใหม่ (`operation: text_generate`) มี `product_id: 17` ตรงจริง, `input_units: 1122`,
  `output_units: 1807`, `estimated_cost: 0.0038945` — ตรวจด้วยมือ:
  `(1122/1000)×0.00025 + (1807/1000)×0.002 = 0.0038945` **ตรงเป๊ะ**, `actual_cost: null`
- Voice/Video product attribution ถูก verify แล้วในข้อ 3/4 ของ STEP 26 (product_id จริงเมื่อมาจาก
  automated pipeline, NULL เมื่อมาจาก manual workflow ตามที่ตั้งใจ) — ไม่ทำซ้ำในรอบนี้

Ledger lifecycle verification:

- `recordAiGeneration()` สร้างแถว `status='processing'` ก่อนยิง provider เสมอ (ยืนยันจาก code +
  แถวจริงที่เพิ่งสร้าง)
- `finalizeAiGenerationCost()` อัปเดตเป็น `succeeded` พร้อม `completed_at` เสมอเมื่อสำเร็จ (ยืนยันจาก
  แถว id 20 ที่ทดสอบ: `completedAt` ถูกเซ็ตจริง)
- Failure path: ยืนยันจาก code review — ทุก route ที่เรียก ledger มี try/catch ที่ finalize เป็น
  `failed` เสมอถ้า generation ล้มเหลว ไม่ปล่อยค้าง `processing`
- Unknown pricing path: ยืนยันแล้วในการทดสอบ pure-function (`image quality=null` → cost=null +
  reason ถูกต้อง)
- `linkLedgerToContentPlan()`/`finalizeAiGenerationCostByAiVideoJobId()` — อ่าน code แล้วถูกต้องตาม
  design (ไม่ overwrite ข้าม field ที่ไม่ได้ pass เข้ามา) ไม่ได้รัน live test ซ้ำในรอบนี้ (ถูก exercise
  ทางอ้อมแล้วในข้อ 4 ตอนทดสอบ video pipeline จริง)

API/Dashboard verification (จริงผ่าน dev server):

- `GET /api/costs/products/17` → breakdown ถูกจัดหมวดเป็น "content" ถูกต้อง, ตัวเลขรวมตรงกับ ledger
  เป๊ะ (`estimatedTotal: 0.0038945`)
- `GET /api/costs?productId=17` → เห็นแถวดิบตรงกับที่ query DB ตรงๆ ทุก field
- `GET /api/costs/summary` → `operationBreakdown` มี `text_generate` รวมยอดถูกต้อง (รวมกับแถวเก่าที่มี
  อยู่แล้วในระบบ)
- Validation: `productId`/`provider`/`operation`/`startDate` ผิดรูปแบบ, `pageSize` เกิน 100,
  product ไม่มีจริง → HTTP 400/404 ตรงทุกเคส ไม่มี 500 เลย
- SQL injection probe: ส่ง `productId=1 OR 1=1` และ `provider=' OR '1'='1` ตรงๆ → ถูกปฏิเสธด้วย
  whitelist validation ก่อนถึง SQL เลย (HTTP 400) ไม่มีทาง inject ได้จริงเพราะทุก query เป็น
  parameterized statement อยู่แล้ว

Regression:

- `pnpm.cmd exec tsc --noEmit` → PASSED ไม่มี error
- 17 endpoints เดิม (`/`, `/products`, `/content`, `/content-studio`, `/content-calendar`,
  `/video-studio`, `/voice-studio`, `/costs`, `/api/health`, `/api/products`, `/api/content/list`,
  `/api/content/plan`, `/api/costs`, `/api/costs/summary`, `/api/social/status`,
  `/api/social/worker/status`, `/api/social/queue`) → HTTP 200 ทั้งหมด

Database cleanup:

- ลบ product ทดสอบ (id 17, ชื่อ `STEP26-COST-AUDIT-TEST-PRODUCT`) และ `ai_cost_ledger` แถวทดสอบ
  (id 20) ออกจากฐานข้อมูลจริงหมดแล้ว ตรวจซ้ำเหลือ 0 ทั้งคู่
- ลบไฟล์สคริปต์ชั่วคราว `scripts/step26-cost-pricing-check.ts` ทิ้งทันทีหลังใช้งานเสร็จ (ตรวจซ้ำแล้ว
  ไม่มีไฟล์หลงเหลือใน `scripts/`)

Security:

- ค้นหา log ของ dev server ตลอดรอบทดสอบ (`grep -iE "OPENAI_API_KEY|REPLICATE_API_TOKEN|sk-..."`) →
  ไม่พบการรั่วไหลของ secret ที่ไหนเลย
- `.env` ไม่ถูกแก้ไขเลยตลอดข้อ 7 — ตรวจซ้ำค่า pricing ทุกตัวยังตรงเดิม 100%

Hard constraints ที่ยืนยันว่าไม่ถูกแตะระหว่างข้อ 7: `render.ts`, `src/app/api/social/**`,
`src/lib/social/**`, Manual Workflow/Social Pipeline, pricing/.env จาก STEP 21–25 (อ่านอย่างเดียว
ไม่แก้ไข), ไม่มีการตั้งราคาใหม่, ไม่มี fake `actual_cost`/fake billing, ไม่มี secret/token ถูกแสดง
หรือ log ออกมาที่ไหนเลย

VERIFIED: pricing config ทุกตัว, estimated_cost formula ทั้ง 4 operation (pure-function), text_generate
integration แบบเต็ม (real call + ledger + dashboard), product attribution, ledger lifecycle
(record/finalize/failure/unknown-pricing), API validation/SQL-injection-resistance, regression

NOT VERIFIED / ข้อจำกัด: ไม่ได้ทดสอบ image_generate/video_generate integration ซ้ำด้วย real call ใน
รอบนี้ (ใช้ผลการทดสอบจริงที่มีอยู่แล้วจาก STEP 22 สำหรับ image — ยืนยันแล้วว่า `quality="high" →
estimated_cost=0.167` ตรงตาม tier — และจาก STEP 26 ข้อ 3/4 สำหรับ voice/video แทน เพื่อไม่ให้เสีย
ค่าใช้จ่ายซ้ำโดยไม่จำเป็นตามที่สั่ง) — ตรวจเฉพาะ pricing formula แบบ pure-function สำหรับ 2 operation
นี้แทน ซึ่งครอบคลุมส่วนคำนวณราคาได้ครบ เหลือแค่ integration wiring ที่อ้างอิงผลทดสอบเดิม;
`linkLedgerToContentPlan()` ไม่ได้ทดสอบ live โดยตรงในรอบนี้ (อ่าน code เท่านั้น)

ไม่จำเป็นต้องแก้ code ใดๆ ในข้อ 7 — โครงสร้าง cost tracking ที่มีอยู่ถูกต้องสมบูรณ์แล้วตาม STEP 21–25

8. API Regression — [✓] DONE (2026-08-29) — พบ defect 1 จุด แก้แล้ว (5 ไฟล์)
   - ตรวจ HTTP response ของ route สำคัญทั้งหมดที่เกี่ยวข้องกับ pipeline
   - บันทึกผล PASS/FAIL พร้อม endpoint ที่ตรวจ

ผลการ Audit ข้อ 8:

**Finding**: `POST /api/content/generate`, `/api/content/save`, `/api/voice`, `/api/video/auto`,
และ `/api/products` (POST) คืน **HTTP 500** พร้อม leak ข้อความ raw JSON parser error ออกมาตรงๆ
(เช่น `"Unexpected token 'o', \"not-json\" is not valid JSON"`) เมื่อได้รับ malformed JSON body —
ต่างจาก `/api/content/plan`, `/api/social/prepare`, `/api/social/queue`, `/api/social/post` ที่มี
guard "STEP 18.11" อยู่แล้วและคืน HTTP 400 สะอาด

**Root cause**: ทั้ง 5 ไฟล์เรียก `await request.json()` ตรงๆ ภายใน try/catch ก้อนใหญ่ที่ครอบทั้งฟังก์ชัน
โดยไม่มี inner try/catch เฉพาะจุด parse — เมื่อ parse ล้มเหลว exception จะตกไปที่ catch รวมด้านนอกซึ่ง
คืน 500 + `error.message` ดิบๆ เสมอ ไม่แยกแยะ client error กับ server error

**ความรุนแรง**: ต่ำ — ไม่มี secret รั่วไหล ไม่ใช่ security vulnerability แต่เป็น inconsistency จริงกับ
pattern ที่มีอยู่แล้วในโค้ดเบสเดียวกัน และคืน HTTP status code ที่ผิดความหมาย (client error ควรเป็น 400
ไม่ใช่ 500)

**Fix ที่แก้จริง** (5 ไฟล์ — เพิ่ม inner try/catch รอบ `request.json()` เท่านั้น ใช้ pattern เดียวกับ
`/api/content/plan` เป๊ะ ข้อความ error ใช้คำเดิมที่มีอยู่แล้วในระบบ `"รูปแบบคำขอไม่ถูกต้อง (ต้องเป็น
JSON)"` ไม่ได้คิดคำใหม่ ไม่แก้ business logic ใดๆ นอกเหนือจากนี้):

- `src/app/api/content/generate/route.ts`
- `src/app/api/content/save/route.ts`
- `src/app/api/voice/route.ts`
- `src/app/api/video/auto/route.ts`
- `src/app/api/products/route.ts` (เฉพาะ POST handler)

Backup ของทั้ง 5 ไฟล์ถูกสร้างไว้ก่อนแก้ (`*.step26-backup-20260829-212040`)

Before/After behavior:

| Endpoint | ก่อนแก้ | หลังแก้ |
|---|---|---|
| `POST /api/content/generate` (malformed JSON) | 500 + leak parser message | 400 + `"รูปแบบคำขอไม่ถูกต้อง (ต้องเป็น JSON)"` |
| `POST /api/content/save` (malformed JSON) | 500 + leak parser message | 400 เดียวกัน |
| `POST /api/voice` (malformed JSON) | 500 + leak parser message | 400 เดียวกัน |
| `POST /api/video/auto` (malformed JSON) | 500 + leak parser message | 400 เดียวกัน |
| `POST /api/products` (malformed JSON) | 500 + leak parser message | 400 เดียวกัน |
| ทุก endpoint ข้างต้นด้วย valid JSON ที่ validate ไม่ผ่าน (เช่น ไม่มี field ที่จำเป็น) | 400 พร้อมข้อความเดิม | **ไม่เปลี่ยนแปลง** ข้อความ/status เดิมทุกตัวอักษร |

Malformed JSON tests (หลังแก้ — จริงผ่าน dev server, ทดสอบเฉพาะ 5 endpoint ที่ได้รับอนุมัติเท่านั้น
ไม่แตะ `/api/products/[id]/media/generate` ซ้ำตามที่สั่งห้ามไว้):

- ทั้ง 5 endpoint คืน HTTP 400 พร้อมข้อความสะอาดตรงกันทุกตัว ไม่มี 500 เหลืออยู่เลย
- ตรวจ `ai_cost_ledger`/`products`/`content` ที่สร้างใน 5 นาทีล่าสุดหลังยิง malformed JSON ทั้ง 5 คำขอ
  → **0 แถวใหม่ทุกตาราง** ไม่มี AI generation เกิดขึ้นจริงแม้แต่ครั้งเดียว
- ตรวจโฟลเดอร์ `public/generated/{ai-images,voice,video}/` → ไฟล์ล่าสุดในทุกโฟลเดอร์เก่ากว่ารอบทดสอบ
  นี้ทั้งหมด ยืนยันไม่มีไฟล์ใหม่ถูกสร้างจาก malformed JSON test

Valid JSON regression (ยืนยันว่า fix ไม่กระทบ validation เดิม — ทดสอบเฉพาะ path ที่ไม่มีค่าใช้จ่าย):

- ทั้ง 5 endpoint เมื่อได้ valid JSON แต่ขาด field บังคับ → ยังคืนข้อความ error เดิมทุกตัวอักษรเหมือน
  ก่อนแก้ (เช่น `/api/content/generate` → `"ไม่พบข้อมูลสินค้า"`, `/api/voice` →
  `"กรุณาระบุสคริปต์สำหรับสร้างเสียงพากย์"`)
- `/api/products` POST จริง (ไม่มี AI เกี่ยวข้องเลย ปลอดภัย 100%) → สร้าง/ลบ product ทดสอบสำเร็จตามปกติ
  ไม่กระทบ (สร้าง id 19 แล้วลบทันที ตรวจซ้ำเหลือ 0)

Regression suite เต็ม (18 endpoints หลังแก้): `/`, `/products`, `/content`, `/content-studio`,
`/content-calendar`, `/video-studio`, `/voice-studio`, `/costs`, `/api/health`, `/api/products`,
`/api/content/list`, `/api/content/plan`, `/api/costs`, `/api/costs/summary`, `/api/social/status`,
`/api/social/worker/status`, `/api/social/queue`, `/api/social/analytics` → **HTTP 200 ทั้งหมด**

`pnpm.cmd exec tsc --noEmit` → PASSED ไม่มี error (รันทั้งก่อนและหลังแก้)

Database integrity: ไม่มีข้อมูล production/demo เสียหาย — test product เดียวที่สร้างระหว่างทดสอบ
(id 19) ถูกลบทันทีตรวจซ้ำเหลือ 0

Cost integrity: ไม่มี `actual_cost` ปลอมถูกสร้าง, ไม่มีการเรียก paid AI provider ใดๆ ระหว่างการ
ทดสอบ/แก้ไขรอบนี้เลยแม้แต่ครั้งเดียว, ไม่มีการแก้ pricing/.env/costConfig.ts

Security: สแกน dev server log ทั้งก่อนและหลังแก้ (`OPENAI_API_KEY`/`REPLICATE_API_TOKEN`/`sk-...`) →
ไม่พบการรั่วไหลเลย

**Cleanup ของ incident ค่าใช้จ่ายจริงจากรอบตรวจก่อนหน้า (~$0.167)**: ตรวจซ้ำอีกครั้งในรอบนี้ ยืนยันว่า
`ai_cost_ledger` id 21 และ `product_media` id 20 ยังถูกลบอยู่ (0 แถว) และไฟล์ PNG ที่สร้างขึ้นยังคง
ไม่มีอยู่บนดิสก์ — cleanup จากรอบก่อนหน้ายังสมบูรณ์ ไม่มีอะไรหลงเหลือ

Forbidden files verification: `render.ts` mtime = `2026-08-27 22:04:14.416382500` **ตรงกับค่าที่บันทึก
ไว้ตอน audit ข้อ 5 เป๊ะ** (ไม่เปลี่ยนแปลงเลยตลอด session) — `src/app/api/social/**`,
`src/lib/social/**` ไม่มีการเรียก Edit/Write เลยสักไฟล์เดียวตลอดข้อ 8 (ยืนยันจาก tool-call history)

Files changed: 5 ไฟล์ข้างต้นเท่านั้น (+ backup 5 ไฟล์ที่สร้างไว้ก่อนแก้)

Files untouched: `render.ts`, `src/app/api/social/**`, `src/lib/social/**`, `.env`, `costConfig.ts`,
ทุกไฟล์ pricing ที่ verify แล้วใน STEP 21–25

Remaining limitations: `/api/products/[id]/media/generate` ยังคงมีพฤติกรรมเดิม (optional body →
fallback auto-prompt → generate จริงถ้า configured) ซึ่งเป็น design ที่ตั้งใจไว้ ไม่ได้แก้ในรอบนี้
(ไม่อยู่ในสโคปของ malformed-JSON fix ที่อนุมัติ) — เป็นเพียงข้อควรระวังสำหรับการทดสอบในอนาคต ไม่ใช่
gap ที่ต้องแก้

9. Database — [✓] DONE (2026-08-29) — database ยืนยันปลอดภัย ไม่มีการแก้ schema/code
   - ตรวจว่าข้อมูลที่เกิดจาก E2E test ไม่ทำให้ข้อมูล production/demo เสีย
   - หากจำเป็นต้องสร้างข้อมูลทดสอบ ให้ระบุและ cleanup อย่างชัดเจน

ผลการ Audit ข้อ 9:

**Database structure**: ตรวจ schema จริงผ่าน `PRAGMA table_info` ตรงกับที่นิยามไว้ใน `src/lib/db.ts`
ทุกตาราง (13 ตาราง: products, customers, orders, order_items, content, product_media,
social_posts, ai_video_jobs, social_post_analytics, social_worker_runs, content_plans,
content_calendar, ai_cost_ledger) ไม่มี drift ระหว่าง code กับ DB จริง

**การค้นพบสำคัญที่ไม่เคยรู้มาก่อน**: `foreign_keys` pragma ของ better-sqlite3 build นี้เป็น **`1`
(enabled) โดย default** แม้ `src/lib/db.ts` จะไม่เคยเรียก `PRAGMA foreign_keys = ON` เองเลยก็ตาม —
ยืนยันด้วยการทดสอบจริง (ไม่ใช่แค่อ่านค่า pragma เฉยๆ): พยายาม `INSERT INTO content_plans` ด้วย
`product_id = 999999` (ไม่มีจริง) → **ถูกปฏิเสธจริงด้วย "FOREIGN KEY constraint failed"** แปลว่า
referential integrity ถูกบังคับใช้จริงที่ระดับ database engine ตลอดเวลา ไม่ใช่แค่ optimistic/trust
ที่ application layer เท่านั้น

**Referential integrity / Product relationships / Content relationships**: ตรวจ orphan record ทุก
ความสัมพันธ์ที่มีอยู่จริงในระบบ (17 relationship รวม content/content_plans/product_media/
ai_video_jobs/ai_cost_ledger/social_posts/social_post_analytics/content_calendar/order_items/
orders) → **orphan = 0 ทุกจุด** ยืนยันด้วย SQL `NOT IN (SELECT id FROM ...)` ตรงๆ ไม่ใช่การเดา

**AI cost ledger integrity**: `estimated_cost`/`actual_cost` ไม่มีค่าติดลบเลยแม้แต่แถวเดียว
(`negative estimated_cost: 0`, `negative actual_cost: 0`), `actual_cost IS NOT NULL` = 0 แถว
(ยืนยันไม่มี fake billing ที่ไหนเลยในฐานข้อมูลจริง), ไม่มีแถวค้าง `processing` เกิน 1 ชั่วโมง
(0 แถว — ไม่มี request ที่ตายกลางคันค้างอยู่)

**NULL behavior**: ทดสอบจริง (insert แล้วลบทันที) ว่า `product_id = NULL` ยัง insert ได้ปกติทั้งใน
`content` (legacy Content Studio) และ `ai_cost_ledger` (manual Voice Studio) — มาตรฐาน SQL FK ไม่เคย
บล็อกค่า NULL อยู่แล้ว ตรงตาม design ที่ STEP 21/26 ตั้งใจไว้ ไม่มีอะไรพัง

**Migration safety**: ตรวจ `PRAGMA table_info(content)` หลังจากที่ dev server ถูก restart ไปแล้ว
มากกว่า 10 ครั้งตลอด session STEP 26 นี้ (ทุกครั้งที่ restart, migration guard ใน `db.ts` รันซ้ำ) →
คอลัมน์ `product_id` มีอยู่ **ครั้งเดียวไม่ซ้ำซ้อน** พิสูจน์ได้จริงเชิงประจักษ์ว่า check-then-add pattern
ปลอดภัยต่อการรันซ้ำ (idempotent) ไม่ทำลาย schema เดิม

**Deletion behavior** (ทดสอบจริงด้วย temporary test product `STEP26-DATABASE-AUDIT-TEST-PRODUCT`,
สร้างแถวลูกครบทุกตาราง (content, content_plans, product_media, ai_video_jobs, ai_cost_ledger,
social_posts, content_calendar) ด้วยการ insert ตรงๆ ไม่เรียก AI ใดๆ เลย จึงไม่มีค่าใช้จ่ายจริง):
เรียก `DELETE /api/products?id=` จริงผ่าน API ขณะที่มีแถวลูกอ้างอิงอยู่ → **ถูกปฏิเสธจริงด้วย FOREIGN
KEY constraint** (ไม่ใช่ CASCADE ไม่ใช่ SET NULL — behavior จริงคือ RESTRICT-like/NO ACTION ค่า
default ของ SQLite) → ตรวจซ้ำว่า product ยังอยู่จริงหลัง delete ล้มเหลว (ไม่มีการลบบางส่วน/data
corruption) **นี่คือผลลัพธ์ที่ปลอดภัยที่สุดเท่าที่จะเป็นไปได้ในแง่ integrity — เป็นไปไม่ได้เลยที่จะเกิด
orphan record ผ่านการลบ product ปกติ**

**Orphan records**: 0 ทุกจุดตามที่รายงานไว้ข้างต้น (ทั้ง 17 relationship)

**Test data / cleanup**: สร้าง test rows 8 แถวข้าม 7 ตาราง (ระบุชัดด้วยคำ `STEP26-DATABASE-AUDIT` ทุก
แถว) → ลบตามลำดับ FK-safe (ลูกก่อนแม่: content_calendar → social_posts → ai_cost_ledger →
ai_video_jobs → product_media → content_plans → content → products) → **ตรวจซ้ำ 0 แถวเหลือทุกตาราง**
ไม่มีไฟล์จริงถูกสร้างบนดิสก์เลยในรอบนี้ (ใช้ path จำลองใน DB ตรงๆ ไม่ได้ upload ไฟล์จริง จึงไม่มีไฟล์ต้อง
ลบ) — ไม่แตะข้อมูล pre-existing ใดๆ เลย (products id 3 "เบี้ยแก้", id 4 "ตะกรุด", content id 1/2,
content_plans id 1/2/8 ยังอยู่ครบตามเดิมทุกประการ ตรวจสอบแล้วว่าไม่ใช่ STEP26 artifact)

**ตรวจ cleanup ค้างจาก STEP 26 audit ก่อนหน้าทั้งหมด**: grep หา `STEP26-AUDIT`/`STEP26-VOICE`/
`STEP26-VIDEO`/`STEP26-SOCIAL`/`STEP26-COST`/`STEP26-REGRESSION` ทุกตาราง → **0 แถวเหลือทุกคำค้นหา**
ยืนยันว่าทุก sub-audit ก่อนหน้าของ STEP 26 (ข้อ 1–8) cleanup สมบูรณ์จริง ไม่มีอะไรตกค้าง

**API regression** (8 endpoint ตามที่สั่ง): `/api/products`, `/api/content/list`,
`/api/content/plan`, `/api/costs`, `/api/costs/summary`, `/api/social/queue`,
`/api/social/worker/status`, `/api/health` → HTTP 200 ทั้งหมด ไม่มีการเรียก paid AI ใดๆ เลยตลอดข้อ 9

**TypeScript**: `pnpm.cmd exec tsc --noEmit` → PASSED (ไม่มีการแก้ source code ในข้อ 9 อยู่แล้ว)

**Security**: สแกน dev server log หา `OPENAI_API_KEY`/`REPLICATE_API_TOKEN`/`sk-...`/connection
string → ไม่พบเลยแม้แต่รายการเดียว (SQLite ไม่มี connection string ที่มี credential อยู่แล้วโดย
ธรรมชาติ เป็นแค่ file path)

**Database safety**: ไม่มีการ reset/drop/truncate table ใดๆ ทั้งสิ้น ไม่มีการรัน migration แบบทำลายล้าง
ใดๆ — การทดสอบทั้งหมดใช้ INSERT/DELETE ปกติผ่าน parameterized statement เท่านั้น

**สิ่งที่พบเพิ่มเติมนอกเหนือจาก "database ปลอดภัยหรือไม่" (ไม่ใช่ database defect — เป็น API-layer
error-handling gap คนละหมวดกับ STEP 26.8 แต่เกิดจาก root cause เดียวกันคือ FK enforcement ที่เพิ่ง
ค้นพบ — รายงานไว้ตรงนี้ตามที่สั่งว่า "ถ้าพบ defect ให้หยุดและรายงานก่อน ไม่แก้โดยไม่ได้รับอนุมัติ"):**

1. `POST /api/content/generate` เมื่อได้รับ `product.id` ที่ไม่มีอยู่จริงใน DB (เช่น client ส่ง id
   เก่า/ปลอมมา) → `recordAiGeneration()` insert ล้มเหลวด้วย FK constraint ก่อนเรียก OpenAI เลย (ยืนยัน
   ว่าไม่มีการเรียก paid API เกิดขึ้นจริงในกรณีนี้ — ปลอดภัยด้านการเงิน) แต่ exception หลุดไปที่ catch
   รวมด้านนอก คืน **HTTP 500 พร้อม raw message "FOREIGN KEY constraint failed"** แทนที่จะเป็น 400/404
   ที่เหมาะสมกว่า — ทดสอบยืนยันแล้วจริงผ่าน dev server
2. `DELETE /api/products?id=` เมื่อ product มีแถวลูกอ้างอิงอยู่ (ทดสอบยืนยันแล้วจริงข้างต้น) → คืน
   **HTTP 500 "ไม่สามารถลบสินค้าได้"** (generic, ไม่ระบุสาเหตุ) แทนที่จะเป็น 409 Conflict ที่สื่อความ
   หมายชัดเจนกว่าว่า "ลบไม่ได้เพราะมีข้อมูลที่เกี่ยวข้องอยู่"

ทั้งสองจุดนี้ **ไม่ใช่ความเสี่ยงด้าน data integrity** (การลบ/insert ที่ผิดพลาดถูกบล็อกอย่างสมบูรณ์โดย
FK เสมอ ไม่มีทาง corrupt ข้อมูลได้) แต่เป็นเรื่อง HTTP status code/error message ที่ไม่เหมาะสม
คล้ายกับ finding ใน STEP 26.8

**อัปเดต (2026-08-29 หลังได้รับอนุมัติ) — แก้ไขทั้ง 2 จุดแล้ว:**

Backup ก่อนแก้: `src/app/api/content/generate/route.ts.step26-9-fix-backup-20260829-213904`,
`src/app/api/products/route.ts.step26-9-fix-backup-20260829-213904`

**Fix #1 — `src/app/api/content/generate/route.ts`**: เพิ่ม import `db` จาก `@/lib/db` และเพิ่ม
การตรวจสอบว่า product มีอยู่จริงใน DB ทันทีหลังคำนวณ `productIdForLedger` (ก่อนเรียก
`recordAiGeneration()`/OpenAI เสมอ) — ถ้ามี `productId` ส่งมาแต่ไม่มีสินค้านั้นจริง คืน HTTP 404
`ไม่พบสินค้ารหัส {id}` (ข้อความรูปแบบเดิมที่ใช้อยู่แล้วทั่วระบบ) ทันที ไม่แตะ ledger/OpenAI เลย —
ถ้า `productId` ไม่ได้ส่งมา (null) เงื่อนไขนี้ถูกข้ามทั้งหมด พฤติกรรมเดิมไม่เปลี่ยนแปลงแม้แต่บรรทัดเดียว

**Fix #2 — `src/app/api/products/route.ts`**: เพิ่มการจับ `error.code ===
"SQLITE_CONSTRAINT_FOREIGNKEY"` แยกออกมาใน catch block ของ DELETE handler คืน HTTP 409 พร้อม
ข้อความ "ไม่สามารถลบสินค้านี้ได้ เนื่องจากมีข้อมูลที่เกี่ยวข้องอยู่ในระบบ" — ไม่แก้ schema ไม่เพิ่ม
cascade ไม่ลด constraint ใดๆ

Tested (จริงผ่าน dev server หลังแก้):

- `POST /api/content/generate` พร้อม `product.id: 999999` (ไม่มีจริง) → **HTTP 404**
  `ไม่พบสินค้ารหัส 999999` ตรวจ `ai_cost_ledger` ก่อน/หลัง → **5 แถวเท่าเดิมทุกประการ** (ไม่มี
  OpenAI ถูกเรียกเลย ยืนยันด้วย response ที่ตอบกลับทันทีไม่มี delay ของ network call จริง)
- Valid productId path: **ไม่เรียก OpenAI จริงเพื่อเลี่ยงค่าใช้จ่าย** ตามที่สั่ง — ตรวจแทนด้วย query
  `SELECT id FROM products WHERE id = ?` ตรงๆ กับ product จริงที่มีอยู่ (id 3 "เบี้ยแก้") → คืนค่า
  FOUND ยืนยันว่า guard block จะถูกข้าม (skip) แล้ว fall-through ไปเรียก `recordAiGeneration()`
  เหมือนเดิมทุกประการ — เป็นข้อเท็จจริงจากโครงสร้างโค้ด (early-return แบบ additive ไม่แตะ path เดิม)
  ไม่ใช่การเดา
- สร้าง product ทดสอบ (`STEP26-9-FIX-TEST-PRODUCT`, id 21) + content_plan ลูก 1 แถว → เรียก
  `DELETE /api/products?id=21` จริง → **HTTP 409** ข้อความสื่อความหมายชัดเจน → ตรวจซ้ำว่า product
  และ content_plan ยังอยู่ครบ ไม่มี orphan (0)
- ลบ content_plan ลูกออกก่อน แล้วเรียก `DELETE /api/products?id=21` ซ้ำ (ไม่มีแถวลูกแล้ว) →
  **HTTP 200** `{"success":true}` ยืนยันว่า successful-delete path เดิมยังทำงานปกติ ไม่ถูกกระทบ
- Regression 18 endpoints เดิม → HTTP 200 ทั้งหมด
- `pnpm.cmd exec tsc --noEmit` → PASSED ทั้งก่อนและหลังแก้
- Security: สแกน dev server log หา `OPENAI_API_KEY`/`REPLICATE_API_TOKEN`/`sk-...` → ไม่พบเลย
- Cost integrity: `ai_cost_ledger` แถวที่มี `actual_cost IS NOT NULL` = 0 (ไม่มี fake billing),
  จำนวนแถวรวมไม่เปลี่ยนแปลงจากการทดสอบ fix #1 (5 ก่อน = 5 หลัง)
- Cleanup: ลบ product ทดสอบ (id 21) และ content_plan ทดสอบ (id 10) หมดแล้ว ตรวจซ้ำด้วย
  `LIKE 'STEP26%'` ทั่วตาราง `products` → **0 แถวเหลือ** เหลือแค่ข้อมูลจริงเดิม (id 3 "เบี้ยแก้",
  id 4 "ตะกรุด")
- Forbidden files: `render.ts` mtime ยัง `2026-08-27 22:04:14.416382500` เดิมทุกประการ (ไม่ถูกแตะเลย
  ตลอด fix รอบนี้), `src/app/api/social/**`/`src/lib/social/**` ไม่มีการเรียก Edit/Write เลย,
  `.env`/`costConfig.ts`/`costLedger.ts` ไม่ถูกแตะเลย

Remaining limitations: ไม่ได้ทดสอบ happy-path ของ `/api/content/generate` กับ productId จริงแบบ
end-to-end (เรียก OpenAI จริง) ซ้ำหลังแก้ เพื่อเลี่ยงค่าใช้จ่ายตามที่สั่ง — ยืนยันด้วย code-level
reasoning แทนว่า fix เป็น additive early-return ที่ไม่แตะ path เดิมเลยเมื่อ product มีอยู่จริง

10. Security — [✓] VERIFIED (2026-08-29) — พบ finding ระดับ HIGH 1 จุด แก้และทดสอบผ่านครบแล้ว
    ตามที่อนุมัติ (มี residual limitation 1 จุดที่รายงานไว้ ไม่ใช่ blocking)
    - ห้ามแสดง OPENAI_API_KEY
    - ห้ามแสดง REPLICATE_API_TOKEN
    - ห้าม log secret/token ออกมา

ผลการ Audit ข้อ 10:

**ตรวจแล้วไม่พบปัญหา (PASS)**:
- Secrets: grep ทั่ว `src/`, `docs/`, `.env.example`, `PROJECT_STATUS.md` เอง หา hardcoded API key
  pattern (`sk-...`, literal apiKey assignment) → ไม่พบเลย ทุกที่อ่านจาก `process.env` เท่านั้น
- SQL safety: ตรวจทุกไฟล์ที่มี SQL template literal แบบ dynamic (`contentCalendar.ts`,
  `contentPlans.ts`, `costLedger.ts`, `productMedia.ts`, `socialAnalytics.ts`, `socialPosts.ts`,
  `content/calendar/plan/route.ts`) → ทุกจุด interpolate แค่ "โครงสร้าง" query (ชื่อคอลัมน์,
  เครื่องหมาย `?` placeholder) ค่าจริงส่งผ่าน parameterized `.run()/.get()/.all(...values)` เสมอ
  ไม่มี string-concat ค่าจาก user input ลง SQL เลยแม้แต่จุดเดียว — ยืนยันด้วย SQL injection probe จริง
  (`productId=1;DROP TABLE...`, `provider=openai' UNION SELECT...`, path แบบ `' OR '1'='1`) → ถูก
  ปฏิเสธด้วย validation ก่อนถึง SQL ทุกเคส (400 ทั้งหมด) ตรวจ `products` table หลังยิงแล้วว่าไม่กระทบ
- Command injection: `child_process.spawn()` ใช้แค่ `ffmpeg`/`ffprobe` ทุกจุด (`render.ts`,
  `timeline.ts`, `ai/video/storage.ts`) ด้วย argument array เสมอ **ไม่มีการใช้ `shell: true` เลย** —
  ไม่มีทาง command injection ผ่าน argument ได้
- Path traversal (video render/social prepare/media delete): ตรวจซ้ำแล้วยังบล็อกถูกต้อง (`../` +
  ต้องขึ้นต้น `/generated/`) — ทดสอบ path-traversal filename ตอน upload (`../../../../etc/evil.jpg`)
  → ระบบไม่ใช้ filename จาก client เลย สุ่ม `randomUUID()` ใหม่ทั้งหมดเสมอ ปลอดภัย
- SSRF: `downloadVideoToDisk()` (`ai/video/storage.ts`) fetch URL จาก `remoteUrl` แต่ตรวจสอบ call
  chain แล้วว่า URL นี้มาจาก **response ของ Replicate API เองเท่านั้น** (เราเป็นคนเรียก
  `getJobStatus(externalJobId)` ที่ `externalJobId` ก็มาจาก DB ของเราเองที่ set ตอน `createJob()`
  ไม่เคยรับ URL จาก client โดยตรงเลยในทุก call path) — ไม่ exploitable แบบ SSRF จาก client input
- XSS: `grep dangerouslySetInnerHTML` ทั่ว `src/` → ไม่พบเลยสักที่ ไม่มี direct HTML injection vector
  ผ่าน React
- Error handling / STEP 26.8 regression: ทดสอบซ้ำ malformed JSON บน 5 endpoint ที่แก้ใน STEP 26.8 →
  ยังคืน 400 สะอาดเหมือนเดิมทุกประการ, ทดสอบซ้ำ fake `product.id` (STEP 26.9 fix) → ยังคืน 404
  ถูกต้อง — ทั้งสอง fix ยังทำงานสมบูรณ์ ไม่ได้ regress
- Authentication/authorization: ยืนยันจาก code comment ที่มีอยู่แล้วในระบบ (`social/worker/run/
  route.ts`) ว่าโปรเจกต์นี้ **ไม่มีระบบ authentication ใดๆ เลยทั้งระบบโดยตั้งใจ** (ไม่มี middleware,
  session, user table) เป็น internal single-tenant admin tool — endpoint เดียวที่มี gate คือ
  `WORKER_TRIGGER_SECRET` บน `/api/social/worker/run` ยืนยันว่ายังทำงานถูกต้อง (503 เมื่อไม่ตั้งค่า)
  **นี่ไม่ใช่ vulnerability ที่เพิ่งพบ — เป็น characteristic ที่ตั้งใจและมีอยู่แล้วในสถาปัตยกรรม** แต่
  ต้องบันทึกไว้ชัดเจนว่า: **ห้าม deploy โปรเจกต์นี้ให้เข้าถึงได้จาก public internet โดยไม่มีชั้น auth
  เพิ่มเติม** (เช่น reverse proxy + auth, VPN, IP allowlist) เพราะทุก endpoint (รวม DELETE/POST ที่
  แก้ไขข้อมูลจริง) เปิดให้ใครก็ได้ที่เข้าถึง server เรียกได้ทันที

**พบ FINDING จริงระดับ HIGH — ยังไม่แก้ ไม่ได้อนุมัติ**:

**Vulnerability**: Unrestricted file upload — สามารถอัปโหลดไฟล์ที่มีเนื้อหาและนามสกุลอะไรก็ได้ (รวม
`.php`, `.html`, ฯลฯ) แล้วให้ระบบเก็บและเสิร์ฟไฟล์นั้นแบบ public ที่ origin เดียวกับแอปจริง โดยแค่ปลอม
header `Content-Type: image/jpeg` ในคำขอ multipart (client-controlled, ปลอมง่ายมาก)

**Affected file**: `src/app/api/products/[id]/media/route.ts` (POST handler) — จุดที่ตรวจแค่
`file.type.startsWith("image/")` (เชื่อ header จาก client อย่างเดียว ไม่ตรวจ magic bytes จริงของไฟล์)
และ regex นามสกุล `^\.[a-z0-9]{1,5}$` ที่ยอมรับนามสกุลสั้นๆ ตัวอักษร/ตัวเลขอะไรก็ได้ ไม่ได้จำกัดเฉพาะ
นามสกุลรูปภาพจริง (jpg/jpeg/png/gif/webp)

**Severity**: **HIGH** — exploitable จริงวันนี้โดยไม่ต้องมีเงื่อนไข deployment พิเศษใดๆ (พิสูจน์แล้วว่า
ไฟล์ `.html` ที่มี `<script>` ถูกเสิร์ฟจริงด้วย `Content-Type: text/html` ที่ origin เดียวกับแอป — เปิด
ช่องให้ host เนื้อหา/phishing page แบบ same-origin ได้) และจะยกระดับเป็น **Critical (RCE)** ทันทีถ้า
deployment ในอนาคตมี component ที่ execute ไฟล์ตามนามสกุล (เช่น PHP-FPM) ใน webroot เดียวกัน — endpoint
นี้ไม่มี authentication ใดๆ เลย (ตามสถาปัตยกรรมทั้งระบบ) จึงเรียกได้จากใครก็ได้ที่เข้าถึง server

**Reproduction evidence** (ทดสอบจริงแล้ว, cleanup สมบูรณ์แล้วทันที — ลบ product/media/ไฟล์ทดสอบทั้งหมด
ตรวจซ้ำ 0 เหลือ):
1. `POST /api/products/{id}/media` ส่งไฟล์เนื้อหา `<?php echo shell_exec($_GET["c"]); ?>` พร้อม
   `filename=shell.php` และ `type=image/jpeg` → **HTTP 200 สำเร็จ** เก็บเป็น
   `product-{id}-{uuid}.php` เข้าถึงได้จริงที่ `/generated/product-media/...php` เสิร์ฟกลับมาด้วย
   `Content-Type: application/x-httpd-php` พร้อม source code ดิบ
2. เหมือนกันแต่ใช้ `filename=poc.html` เนื้อหา `<script>document.title="pwned-poc"</script>` →
   สำเร็จเช่นกัน เสิร์ฟด้วย `Content-Type: text/html; charset=UTF-8` — script รันได้จริงถ้าเปิดใน
   browser

**Proposed minimal fix** (ยังไม่ได้ทำ รอการอนุมัติ):
- เปลี่ยน extension whitelist จาก regex ทั่วไป `^\.[a-z0-9]{1,5}$` เป็น allowlist เฉพาะนามสกุลรูปภาพ
  จริงเท่านั้น (`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`) นามสกุลอื่นทั้งหมด fallback เป็น `.jpg`
  เหมือน behavior เดิมตอนไม่มีนามสกุล (ไม่ทำลาย backward compatibility ของ flow อัปโหลดรูปจริง)
- (ทางเลือกเสริม ขอบเขตใหญ่กว่า): ตรวจ magic bytes จริงของไฟล์แทนการเชื่อ `file.type` อย่างเดียว —
  เสนอเป็นทางเลือกเสริม ไม่ใช่ minimal fix ที่จำเป็นเพื่อปิดช่องโหว่ที่พิสูจน์แล้ว

**ผลกระทบต่อ functionality เดิมถ้าแก้**: ไม่มี — การอัปโหลดรูปจริงทุกกรณี (jpg/jpeg/png/gif/webp ซึ่ง
เป็นสิ่งเดียวที่ UI จริงเคยส่งมา) ไม่ได้รับผลกระทบเลย มีแค่ไฟล์ที่ไม่ใช่รูปจริงที่ปลอม header มาเท่านั้น
ที่จะถูกบังคับ fallback เป็น `.jpg` แทน — ไม่แตะ schema, ไม่แตะไฟล์อื่นนอกเหนือจากไฟล์นี้ไฟล์เดียว

**อัปเดต (2026-08-29 หลังได้รับอนุมัติ) — แก้ไขแล้วตาม scope ที่อนุมัติ:**

Backup ก่อนแก้: `src/app/api/products/[id]/media/route.ts.step26-10-security-backup-20260829-220248`

**Fix ที่แก้จริง**: แทนที่ regex `^\.[a-z0-9]{1,5}$` ด้วย allowlist ชัดเจน
`{.jpg, .jpeg, .png, .gif, .webp}` — ไม่มีนามสกุลเลย ยัง fallback เป็น `.jpg` เหมือนเดิมทุกประการ
แต่นามสกุลอื่นที่ไม่อยู่ใน allowlist (ตรวจแล้วว่าไม่ใช่แค่ .php/.html/.js/.exe/.svg แต่ครอบคลุมทุก
นามสกุลที่ไม่ได้ระบุ) ตอนนี้ถูกปฏิเสธด้วย **HTTP 400** ทันที ก่อนเขียนไฟล์/insert DB ใดๆ ทั้งสิ้น
(ไม่ fallback เดาเป็น .jpg แบบเงียบๆ เหมือนพฤติกรรมเดิมอีกต่อไป) — ไม่แตะ
`file.type.startsWith("image/")` check เดิมเลย เพิ่ม allowlist เป็นชั้นตรวจที่สองแยกจากกัน

Tested (จริงผ่าน dev server, ใช้ไฟล์ทดสอบ harmless ทั้งหมด ไม่มี payload ที่ execute code จริงเลย):

- `.jpg/.jpeg/.png/.gif/.webp` (5 นามสกุล) → **HTTP 200 ทุกตัว** อัปโหลดสำเร็จเหมือนเดิมทุกประการ
- `.php/.html/.js/.exe/.svg` (5 นามสกุลอันตราย, เนื้อหาเป็น plain text harmless ล้วนๆ ไม่มี code
  ที่ execute ได้จริง, ปลอม Content-Type เป็น `image/jpeg`) → **HTTP 400 ทุกตัว** ข้อความ
  `"รองรับเฉพาะไฟล์นามสกุล .jpg, .jpeg, .png, .gif, .webp เท่านั้น"` ตรวจ disk แล้วว่า **ไม่มีไฟล์
  นามสกุลอันตรายใดๆ ถูกเขียนลงจริงเลย**
- MIME spoofing test (ตามที่สั่งเป๊ะ): ไฟล์ `spoofed-content.jpg` — นามสกุล `.jpg` ถูกต้อง แต่เนื้อหา
  จริงเป็นแค่ plain text ไม่ใช่รูปภาพจริง พร้อมปลอม Content-Type เป็น `image/jpeg` → **ยัง HTTP 200
  (ผ่าน)** เพราะ allowlist ตรวจแค่นามสกุล ไม่ได้ตรวจ magic bytes ของเนื้อหาจริง — **นี่คือ residual
  limitation ที่คาดไว้แล้วตามที่สั่งให้รายงานแทนการขยาย scope เอง** (ดูหัวข้อ "remaining limitations"
  ด้านล่าง) ตรวจเพิ่มเติมว่าไฟล์นี้ถูกเสิร์ฟกลับมาด้วย `Content-Type: image/jpeg` (จาก extension ไม่ใช่
  จาก content sniffing) จึงไม่มีความเสี่ยง code execution/HTML rendering แม้เนื้อหาจะไม่ใช่รูปจริง
- No-extension fallback: `filename=noextensionatall` → **HTTP 200** ยัง fallback เป็น `.jpg`
  เหมือนพฤติกรรมเดิมก่อนแก้ทุกประการ
- Path traversal: `filename=../../../../etc/evil.jpg` (นามสกุลถูกต้อง) → **HTTP 200** ไฟล์ถูกเก็บด้วย
  ชื่อสุ่ม UUID ใหม่ตามปกติ ไม่มีการ traversal เกิดขึ้นจริงเลย (ไม่ได้รับผลกระทบจาก fix นี้)
- Database: 8 การอัปโหลดที่สำเร็จ (5 นามสกุลถูกต้อง + spoofed-content.jpg + no-extension +
  path-traversal) → สร้าง `product_media` แถวจริงครบ 8 แถวตรงเป๊ะ, 5 การอัปโหลดที่ถูกปฏิเสธ
  (php/html/js/exe/svg) → **สร้าง 0 แถวเลย** ยืนยันด้วย query ตรงๆ
- Regression 18 endpoints เดิม → HTTP 200 ทั้งหมด
- `pnpm.cmd exec tsc --noEmit` → PASSED
- Security: สแกน dev server log หา `OPENAI_API_KEY`/`REPLICATE_API_TOKEN`/`sk-...`/
  `authorization:`/`bearer`/`password`/`DATABASE_URL` → ไม่พบเลยแม้แต่รายการเดียว
- Cost integrity: `ai_cost_ledger` แถวที่มี `actual_cost IS NOT NULL` = 0, จำนวนแถวรวมไม่เปลี่ยนแปลง
  (5 ก่อน = 5 หลัง) ยืนยันว่า **ไม่มีการเรียก paid AI ใดๆ เลยตลอดการทดสอบ fix นี้**
- Cleanup: ลบ product ทดสอบ (id 23), `product_media` ทดสอบทั้ง 8 แถว, ไฟล์จริงบนดิสก์ทั้ง 8 ไฟล์,
  และไฟล์ scratchpad ทดสอบทั้งหมด (11 ไฟล์) ออกหมดแล้ว ตรวจซ้ำด้วย `LIKE 'STEP26-10%'` และค้นหา
  ไฟล์ตรงๆ บนดิสก์ → **0 เหลือทุกจุด** เหลือแค่ข้อมูลจริงเดิม (id 3 "เบี้ยแก้", id 4 "ตะกรุด")
- Forbidden files: `render.ts` mtime ยัง `2026-08-27 22:04:14.416382500` เดิมทุกประการ,
  `src/app/api/social/**`/`src/lib/social/**`/`.env`/`costConfig.ts`/`costLedger.ts` ไม่ถูกแตะเลย
  แม้แต่ไฟล์เดียวตลอดการแก้ครั้งนี้ — แก้แค่ไฟล์เดียวตามที่อนุมัติ

**Remaining limitation (รายงานตามที่สั่ง ไม่ได้ขยาย scope เอง)**: extension allowlist เพียงอย่างเดียว
**ไม่ได้ตรวจสอบเนื้อหาไฟล์จริง (magic bytes/content signature)** — ไฟล์ที่มีนามสกุล `.jpg` ถูกต้องแต่
เนื้อหาไม่ใช่รูปภาพจริง (เช่น plain text หรือไฟล์อื่นที่เปลี่ยนนามสกุล) ยังผ่านการตรวจสอบได้อยู่ ความเสี่ยง
เชิงปฏิบัติต่ำกว่าช่องโหว่เดิมมาก เพราะไฟล์เหล่านี้ยังถูกเสิร์ฟด้วย `Content-Type: image/jpeg` (มาจาก
extension ไม่ใช่จากเนื้อหาจริง) จึงไม่มีความเสี่ยง code execution หรือ HTML/script rendering เหมือน
ช่องโหว่เดิม — ถ้าต้องการปิดช่องว่างนี้ด้วยต้องเพิ่ม magic-byte validation ซึ่งเป็นการขยาย scope ที่ต้อง
ขออนุมัติแยกต่างหาก (ยังไม่ได้ทำในรอบนี้ตามที่สั่งห้ามขยาย scope เอง)

ข้อจำกัด:

- ก่อนแก้ไฟล์ใดๆ ให้ตรวจสถานะและระบุไฟล์ที่จะเปลี่ยนก่อน
- ห้ามแตะ render.ts
- ห้ามแตะ Manual Workflow/Social Pipeline
- ห้ามเปลี่ยน pricing ที่ VERIFY แล้วใน STEP 21–25
- ห้ามตั้งราคาใหม่
- ห้ามสร้าง actual_cost ปลอม

หมายเหตุ:

ข้อ 1–2 (Product → Content) implement และ verify เสร็จแล้ว (2026-08-29) รายละเอียดอยู่ในหัวข้อ
"ผลการ Audit ข้อ 1–2" ด้านบน — ข้อ 3 (Voice), ข้อ 4 (Video), ข้อ 5 (Render), ข้อ 6 (Social), และ
ข้อ 7 (Cost Tracking) verify แล้วว่าทำงานถูกต้องตาม design เดิมโดยไม่ต้องแก้โค้ด (รายละเอียดในหัวข้อ
"ผลการ Audit ข้อ 3/4/5/6/7") — ข้อ 4 มีข้อจำกัดว่ายังไม่ได้ทดสอบ happy-path ของ Replicate AI Video
จริง เพราะไม่มี `REPLICATE_API_TOKEN` ในเครื่องนี้และมีค่าใช้จ่ายจริงต่อครั้ง — ข้อ 6 มีข้อจำกัดว่า
ยังไม่ได้ทดสอบ retry/backoff branch ของ social worker เพราะไม่มี credential จริงให้ provider ตอบ
"connected" ได้ — ข้อ 7 มีข้อจำกัดว่าไม่ได้ทดสอบ image_generate/video_generate integration ซ้ำด้วย
real call (ใช้ผลทดสอบจริงเดิมจาก STEP 22 และ STEP 26 ข้อ 3/4 แทนเพื่อไม่เสียค่าใช้จ่ายซ้ำ) — ข้อ 8
(API Regression) พบ defect จริง 1 จุด (malformed JSON คืน 500 leak parser message แทนที่จะเป็น 400
ใน 5 endpoint) และแก้แล้วตามที่อนุมัติ (รายละเอียดในหัวข้อ "ผลการ Audit ข้อ 8") — ข้อ 9 (Database)
ยืนยันแล้วว่า database ปลอดภัยสมบูรณ์ (FK enforcement ทำงานจริง, orphan=0 ทุกจุด, NULL/migration/
deletion behavior ถูกต้องตาม design) พบ finding เพิ่มเติม 2 จุด (เป็น API error-handling gap ไม่ใช่
database defect): `/api/content/generate` คืน 500 พร้อม raw "FOREIGN KEY constraint failed" เมื่อ
product.id ปลอม, และ `DELETE /api/products` คืน 500 generic แทน 409 เมื่อมีแถวลูกอ้างอิงอยู่ — **แก้
แล้วทั้ง 2 จุดตามที่อนุมัติ** (404 และ 409 ตามลำดับ, ทดสอบผ่านครบ, cleanup สมบูรณ์ — รายละเอียดใน
หัวข้อ "ผลการ Audit ข้อ 9") — ข้อ 10 (Security) ตรวจครบทุกหมวด (secrets/SQL/command injection/
path traversal/SSRF/XSS/auth posture/error leakage) ผ่านหมด **ยกเว้น 1 จุด**: พบช่องโหว่ระดับ HIGH
จริงใน `src/app/api/products/[id]/media/route.ts` (unrestricted file upload — อัปโหลดไฟล์ `.php`/
`.html` แล้วปลอม Content-Type เป็น image/jpeg ผ่านได้จริง ถูกเสิร์ฟกลับมาด้วย content-type จริงของ
นามสกุลนั้น) พิสูจน์แล้วด้วย reproduction จริง (cleanup สมบูรณ์แล้ว) **ยังไม่ได้แก้ รอการอนุมัติก่อน**
(รายละเอียดเต็มในหัวข้อ "ผลการ Audit ข้อ 10") — STEP 26 โดยรวมยังไม่ถือว่า VERIFIED/READY จนกว่าจะ
จัดการ finding นี้

---

## STEP 9 — API Regression Re-Verification & Runtime Baseline
Date: 2026-08-30

Scope: Re-verify เฉพาะ fix จาก STEP 26.8 (JSON-parse guard บน 5 endpoint) และสร้าง runtime baseline
ใหม่ — audit-first, read-only เป็นหลัก ห้าม redesign/refactor/เปลี่ยน architecture/เปลี่ยน database
schema/เพิ่ม feature ใหม่ Source of truth: ไฟล์นี้ (PROJECT_STATUS.md)

**Dev server**: ไม่ได้รันอยู่ตอนเริ่มตรวจ (`GET /api/health` timeout) → แจ้งก่อนแล้วสั่งรัน `pnpm dev` →
Next.js 16.3.2 (Turbopack) พร้อมใน 9.5s, `Local: http://localhost:3000` — **PASS**

**`/api/health`**: HTTP 200, `{"app":"ok","database":"ok","socialWorker":"ok","aiImage":"configured","aiVideo":"not_configured"}` — **PASS**

**Static code review** (5 ไฟล์จาก STEP 26.8): ยืนยันว่าทุกไฟล์ยังมี inner try/catch รอบ
`request.json()` ตรง pattern เดียวกับ `/api/content/plan` (คืน `"รูปแบบคำขอไม่ถูกต้อง (ต้องเป็น
JSON)"` ก่อนถึง business logic เสมอ) — ไม่มีการ regress กลับไปเป็น try/catch ก้อนใหญ่แบบเดิม

**API Regression** (malformed JSON body `'not-json'` — ปลอดภัย 100% เพราะ guard คืนก่อนถึง AI/DB
call ใดๆ เสมอ):
1. `POST /api/content/generate` → HTTP 400, ข้อความสะอาด — **PASS**
2. `POST /api/content/save` → HTTP 400, ข้อความสะอาด — **PASS**
3. `POST /api/voice` → HTTP 400, ข้อความสะอาด — **PASS**
4. `POST /api/video/auto` → HTTP 400, ข้อความสะอาด — **PASS**
5. `POST /api/products` (POST) → HTTP 400, ข้อความสะอาด — **PASS**

**Error leak check**: ไม่มี raw JSON parser error message (`"Unexpected token..."`) หรือ stack trace
หลุดออกมาที่ response body ของ endpoint ใดเลย — **PASS**

**Dev server log verification**: ตรวจ log จริงของ `pnpm dev` ระหว่างยิงทั้ง 5 คำขอ → ทุก request จบ
ด้วย `400` ตามที่คาด ไม่มี unhandled exception/stack trace/crash ปรากฏใน log เลย server ยัง responsive
ต่อเนื่องหลังทดสอบครบทุก endpoint

**TypeScript/runtime**: `pnpm.cmd exec tsc --noEmit` → **PASSED** ไม่มี error — **PASS**

**Cost/data integrity**: ไม่มีการเรียก AI provider จริง ไม่มีการสร้าง product/content/ledger ใดๆ
ระหว่างการทดสอบนี้เลย (malformed JSON ถูกปฏิเสธก่อนถึง business logic ทุกครั้ง) ไม่มีข้อมูลทดสอบต้อง
cleanup

**Defects found**: ไม่พบ regression ใดๆ จาก STEP 26.8 — fix เดิมยังทำงานถูกต้องสมบูรณ์
**Defects fixed**: ไม่มี (ไม่จำเป็นต้องแก้ไขโค้ดใดๆ ใน STEP นี้)
**Files changed**: ไม่มี (read-only audit + runtime test เท่านั้น ไม่มีการเรียก Edit/Write บน source
code ใดๆ ตลอด STEP 9)

**STEP 9 STATUS: PASS**

---

## STEP 10 — File Upload Security Hardening
Date: 2026-08-30

Scope: แก้ HIGH-severity finding ที่บันทึกไว้ใน STEP 26 ข้อ 10 (`src/app/api/products/[id]/media/route.ts`
— unrestricted file upload / spoofed MIME-type / ไม่มี magic-byte validation) เท่านั้น ห้าม
redesign/refactor ใหญ่/เปลี่ยน architecture/database schema/API contract/UI/authentication ที่ไม่
เกี่ยวข้อง/storage system

**Finding เดิม**: อัปโหลดไฟล์ที่มีเนื้อหาและนามสกุลอะไรก็ได้ (รวม `.php`, `.html`) แล้วให้ระบบเก็บและ
เสิร์ฟไฟล์นั้นแบบ public ได้จริง โดยแค่ปลอม `Content-Type: image/jpeg` ในคำขอ multipart

**Root cause**: จุดตรวจเดิมเชื่อแค่ `file.type.startsWith("image/")` (client-controlled header) และ
extension allowlist (STEP 26.10) — ไม่มีจุดใดอ่าน "เนื้อไฟล์จริง" (magic bytes) เลย จึงไม่สามารถแยกไฟล์
ที่ปลอม extension/Content-Type ออกจากไฟล์รูปภาพจริงได้

**Security fix**: เพิ่มการตรวจ magic bytes (file signature) ของไฟล์จริงใน
`src/app/api/products/[id]/media/route.ts` รองรับเฉพาะ 4 format เดิมที่ระบบตั้งใจรับ (JPEG/PNG/GIF/
WEBP ตรงกับ `ALLOWED_IMAGE_EXTENSIONS` เดิมทุกประการ ไม่เพิ่ม format ใหม่) — implementation แบบ
self-contained ไม่เพิ่ม dependency ใดๆ (ตรวจแค่ byte-signature คงที่ 3-12 byte แรกของแต่ละ format
เพียงพอและไม่ซับซ้อน ไม่จำเป็นต้องใช้ library เช่น `file-type`):
- JPEG: `FF D8 FF`
- PNG: `89 50 4E 47 0D 0A 1A 0A`
- GIF: `GIF87a` / `GIF89a`
- WEBP: `RIFF....WEBP`

Flow ใหม่ (fail-closed ทุกจุด — ตรวจไม่ได้ = reject เสมอ ไม่ fallback ยอมรับ):
1. `file.type.startsWith("image/")` (เดิม) → 2. `file.size` >0 และ ≤10MB (เดิม, size limit ฝั่ง
server อยู่แล้ว) → 3. extension ต้องอยู่ใน allowlist ถ้ามีการระบุมา (เดิมจาก STEP 26.10) → 4. declared
MIME ต้องเป็น subtype ที่รองรับจริง (`image/jpeg`, `image/jpg`, `image/pjpeg`, `image/png`,
`image/gif`, `image/webp`) → 5. **ใหม่**: อ่าน buffer แล้วตรวจ magic bytes จริง — ตรวจไม่ได้ (signature
ไม่ตรงกับ format ที่รู้จักเลย) → reject 400 → 6. **ใหม่**: magic bytes ต้องตรงกับ MIME ที่ประกาศมา —
ไม่ตรง → reject 400 → 7. **ใหม่**: ถ้ามี extension ระบุมา ต้องตรงกับ magic bytes ด้วย — ไม่ตรง →
reject 400 → 8. ถ้าไม่มี extension เลย ใช้ชนิดไฟล์จริงที่ตรวจจาก magic bytes กำหนดนามสกุลแทน (เดิม
fallback `.jpg` แบบเดาเฉยๆ — ตอนนี้แม่นยำตามเนื้อไฟล์จริงเสมอ)

**Files changed**: `src/app/api/products/[id]/media/route.ts` เท่านั้น (ไม่มีไฟล์อื่นถูกแก้)

**File types validated**: JPEG, PNG, GIF, WEBP (4 format เดิม ไม่เพิ่ม/ลด format ใดๆ)

**Size limit**: คงเดิมจาก STEP 26.10 — `MAX_IMAGE_SIZE_BYTES = 10MB`, ตรวจฝั่ง server ก่อนอ่าน magic
bytes เสมอ (ไม่เชื่อค่าที่ client ส่งมา)

**MIME ↔ Magic byte / Extension ↔ Magic byte consistency**: ตรวจทั้งคู่แยกกันคนละจุด — ไม่ตรงจุดใดจุด
หนึ่ง reject ทันที (ดู flow ด้านบน)

Tested (จริงผ่าน dev server, ใช้ product ทดสอบชั่วคราว id 42 ชื่อ
`STEP10-UPLOAD-SECURITY-TEST-PRODUCT` สร้าง/ลบทันทีหลังทดสอบ ไม่แตะ product จริงเดิม id 3/4/33/41):

POSITIVE TESTS:
- Valid JPEG (`FF D8 FF...`, `.jpg`, `image/jpeg`) → **HTTP 200 — PASS**
- Valid PNG (PNG signature, `.png`, `image/png`) → **HTTP 200 — PASS**
- Valid WEBP (`RIFF....WEBP`, `.webp`, `image/webp`) → **HTTP 200 — PASS**

NEGATIVE / SECURITY TESTS:
- `.jpg` extension + non-image (plaintext) bytes, `Content-Type: image/jpeg` → **HTTP 400**
  `"ไม่สามารถตรวจสอบชนิดไฟล์จากเนื้อไฟล์จริงได้..."` — **PASS**
- `.png` extension + real JPEG bytes, `Content-Type: image/png` → **HTTP 400**
  `"ชนิดไฟล์จริงไม่ตรงกับ Content-Type ที่แจ้งมา"` — **PASS**
- `.webp` extension + real PNG bytes, `Content-Type: image/webp` → **HTTP 400** ข้อความเดียวกัน —
  **PASS**
- Spoofed MIME: ไฟล์ PNG จริงเปลี่ยนชื่อเป็น `.jpg` + `Content-Type: image/jpeg` → **HTTP 400**
  ข้อความเดียวกัน — **PASS**
- Unsupported extension `.php` (เนื้อหา PHP payload) + `Content-Type: image/jpeg` (ปลอม) → **HTTP 400**
  `"รองรับเฉพาะไฟล์นามสกุล .jpg, .jpeg, .png, .gif, .webp เท่านั้น"` — **PASS**
- Oversized file (11MB) → **HTTP 400** `"ไฟล์รูปภาพมีขนาดใหญ่เกินไป (จำกัดไม่เกิน 10MB)"` — **PASS**
- Empty file (0 bytes) → **HTTP 400** `"ไฟล์รูปภาพว่างเปล่า"` — **PASS**

**Disk/DB verification**: หลังการทดสอบทั้งหมด (4 คำขอสำเร็จ + 6 คำขอถูกปฏิเสธ) ตรวจ
`public/generated/product-media/` และ `product_media` table ตรงๆ → มีไฟล์/แถวใหม่เกิดขึ้นตรงกับ 4
คำขอที่สำเร็จเท่านั้น (id 50-53) **0 ไฟล์/แถวจากคำขอที่ถูกปฏิเสธทั้ง 6 คำขอ** ค้นหาไฟล์ที่มีคำว่า
"evil"/"php"/"fake"/"spoofed" ทั่ว `public/generated/` → **ไม่พบเลย**

**TypeScript**: `pnpm.cmd exec tsc --noEmit` → **PASSED** ไม่มี error (รันหลังแก้)

**Regression**: `/api/health` → HTTP 200. 18 endpoints เดิม (`/`, `/products`, `/content`,
`/content-studio`, `/content-calendar`, `/video-studio`, `/voice-studio`, `/costs`, `/api/health`,
`/api/products`, `/api/content/list`, `/api/content/plan`, `/api/costs`, `/api/costs/summary`,
`/api/social/status`, `/api/social/worker/status`, `/api/social/queue`, `/api/social/analytics`) →
**HTTP 200 ทั้งหมด** ตรวจ dev server log ตลอดการทดสอบ → ไม่มี unhandled exception/stack trace/crash
เลย

**Cleanup**: ลบไฟล์ 4 ไฟล์ที่สร้างระหว่างทดสอบบนดิสก์, ลบ `product_media` แถวทดสอบทั้ง 4 (id 50-53)
ผ่าน API, ลบ product ทดสอบ (id 42) — ตรวจซ้ำว่า id 42 ไม่มีอยู่แล้วในระบบ ไม่มีข้อมูล production/demo
ใดถูกกระทบ

**Preserve existing behavior**: valid image upload flow (jpg/jpeg/png/gif/webp), response format
(`{success, media: {productId, fileName, imageUrl, type, source}}`), path-traversal protection
(random UUID filename), และ authorization posture เดิม (ไม่มี auth ในระบบนี้อยู่แล้วโดยตั้งใจ) ไม่ถูก
เปลี่ยนแปลงเลย — ยืนยันด้วย positive test ทั้ง 3 format ที่ยัง PASS ครบ

**Dependency**: ไม่มีการเพิ่ม dependency ใดๆ — ใช้ manual byte-signature check ที่ implement เอง
(เหตุผล: signature ของ 4 format ที่รองรับเป็น fixed-byte pattern สั้นๆ ตรวจสอบตรงไปตรงมา ไม่จำเป็นต้อง
พึ่ง library ภายนอก)

**STEP 10 STATUS: PASS**

---

## STEP 11 — Voice Studio → Video Studio Pipeline Re-Verification
Date: 2026-08-30

Scope: Re-verify Voice → Video pipeline ที่เคย verify แล้วใน STEP 26 ข้อ 3/4/5 (2026-08-29) ว่ายัง
ทำงานถูกต้อง ไม่มี code drift — audit-only ไม่มีการแก้โค้ดใดๆ ในรอบนี้

**Code drift check**: อ่านซ้ำทุกไฟล์ที่เกี่ยวข้อง (`src/lib/voice.ts`, `src/lib/media.ts`,
`src/lib/timeline.ts`, `src/app/api/voice/route.ts`, `src/app/api/video/auto/route.ts`,
`src/app/api/video/render/route.ts`, `src/lib/ai/video/{index,provider}.ts`,
`src/app/api/products/[id]/ai-video/{generate,jobs}/route.ts`) → **ไม่มี drift เลย** logic ตรงกับผล
audit STEP 26.3/4/5 ทุกประการ — `render.ts` mtime ยัง `2026-08-27T22:04:14.4163825+07:00` ตรงกับค่าที่
บันทึกไว้ใน STEP 26.5 เป๊ะ (ยืนยันว่าไม่ถูกแตะเลยตั้งแต่นั้นมา)

**Safe re-verification** (ไม่มีค่าใช้จ่ายจริง ไม่เรียก AI provider ใดๆ):
- `GET /api/health` → `aiVideo: "not_configured"`, `aiImage: "configured"` ตรงกับ `.env` จริง
  (`REPLICATE_API_TOKEN` ยังไม่ได้ตั้งค่า)
- `GET /api/products/3/ai-video/jobs` → `{success:true, jobs:[]}` — **PASS**
- `GET /api/products/3/ai-video/jobs/999999` (ไม่มีจริง) → HTTP 404 — **PASS**
- `POST /api/products/3/ai-video/generate` (ไม่มี token) → HTTP 503 `not_configured` ตรวจ
  `/api/costs/products/3` ยืนยันว่า **ไม่มี video ledger/job row ใหม่เกิดขึ้นเลย** (video
  generationCount ยังเป็น 0 เท่าเดิม) — ไม่มี fake success ไม่มีค่าใช้จ่ายเกิดขึ้นจริง — **PASS**
- `pnpm.cmd exec tsc --noEmit` → **PASSED** ไม่มี error

**Standing known limitation (ไม่ใช่ defect ใหม่ — สถานะเดิมจาก STEP 26.4)**: Replicate AI Video
happy-path (create job → poll → download) ยังไม่เคยถูกทดสอบแบบ end-to-end จริงในสภาพแวดล้อมนี้ เพราะ
ไม่มี `REPLICATE_API_TOKEN` และมีค่าใช้จ่ายจริง ~$0.50 ต่อครั้งตามราคาที่ verify ไว้ใน STEP 25

**การตัดสินใจเรื่อง live re-test**: เสนอต่อผู้ใช้ว่าจะทดสอบ Voice Studio → Video Studio local-render
pipeline (`/api/voice`/`/api/video/auto`/FFmpeg render) แบบ end-to-end จริงอีกครั้งหรือไม่ (เรียก
OpenAI TTS จริง ค่าใช้จ่าย <$0.001 เหมือนที่ทำใน STEP 26.3/4) — **ผู้ใช้เลือกไม่ทดสอบซ้ำ** ใช้ผลตรวจ
แบบ static/code-review + safe-endpoint เท่านี้พอ เนื่องจากไม่มี code drift ใดๆ เกิดขึ้นตั้งแต่ STEP
26.3/4/5 ยืนยันผล (ผลการทดสอบจริงครั้งล่าสุดจาก STEP 26.3/4 ยังถือว่า valid: เสียงพากย์จริงถูกสร้างได้,
MP4 จริง 47.7KB ถูก render ได้, ledger ผูก `product_id` ถูกต้อง, cleanup สมบูรณ์)

**Defects found**: ไม่พบ — pipeline ยังทำงานตาม design เดิมทุกประการ
**Files changed**: ไม่มี (read-only audit เท่านั้น)

**STEP 11 STATUS: PASS** (verified via static code review + safe no-cost endpoint tests; live
end-to-end re-test skipped per user's explicit choice — not a gap, historical STEP 26.3/4 live-test
results still stand since no code changed since then)

---

## STEP 12 — Social Pipeline Re-Verification
Date: 2026-08-30

**Scope**: Re-verify the complete Social Pipeline (content → queue → post → worker → analytics)
end-to-end — audit-first/read-only, no source-code changes (no regression or security defect found).
No external Facebook/Instagram/TikTok API calls performed, no real posts created.

**Files discovered** (repository-verified, not guessed): routes —
`src/app/api/social/{queue,queue/[id]/cancel,post,prepare,status,worker/run,worker/status,
analytics,analytics/[id]}/route.ts`; lib — `src/lib/social{Queue,Posts,Content,Worker,WorkerRuns,
Analytics}.ts` + `src/lib/social/{provider,facebook,instagram,tiktok,index}.ts`; schema —
`social_posts`, `social_post_analytics`, `social_worker_runs` in `src/lib/db.ts`; content-integration
via `content_calendar`'s `syncCalendarStatusFromSocialPost()` (`src/lib/contentCalendar.ts`).

**Data flow trace (Content → Queue → Worker → Post → Analytics)** — all verified against code +
live safe tests:
- IDs: `product_id` validated against real DB row at every write point (queue/post/prepare) — no
  orphan creation possible (FK + explicit existence check before insert)
- content reference: `/api/social/prepare` builds a Content Package from real product data +
  `/api/content/generate` (or caller-supplied caption override) — does NOT read the unrelated legacy
  `content` table (verified by design comment in `socialContent.ts`, correct architecture)
- platform: strict allowlist (`facebook`/`reels`/`instagram`/`tiktok`) enforced identically across
  prepare/queue/post/worker (shared `isValidPlatform()`)
- status transitions: `draft → scheduled → processing → published|failed`, plus `cancelled` from
  draft/scheduled only — enforced by `SocialQueueError` (409) and atomic `UPDATE ... WHERE
  status='scheduled'` claim (no invalid transition observed in testing)
- scheduledAt: must be a valid ISO date strictly in the future (queue creation) — verified rejected
  correctly for past/invalid dates
- retry: `markFailed()` correctly separates `allowRetry:false` (permanent fail, no retry — used for
  not_configured/error/stale-recovery) from `allowRetry:true` (transient, backs off 5 min, caps at
  `MAX_RETRY_COUNT=3`) — code-verified, matches STEP 26.6's prior audit exactly, no drift
- failed jobs never marked success: confirmed live — not_configured path never calls
  `markPublished()`/sets `external_post_id`
- duplicate posting prevention: atomic `claimSocialPostForProcessing()` (single UPDATE with
  `WHERE status='scheduled'`, better-sqlite3 synchronous/single-connection) — DB-level, not just
  in-memory lock
- worker doesn't over-process: `findDueSocialPosts()` only selects `status='scheduled' AND
  scheduled_at <= now`; claim re-checks status atomically before touching a row
- analytics reads correct source: `social_post_analytics` joined to `social_posts`, empty/null when
  no snapshot exists (never fabricates 0 as a stand-in for "unknown")
- no mock/hard-coded success: verified live — `not_configured` responses never write `published`/
  `external_post_id`
- no stale data path: `content_calendar` status is derived one-way from `social_posts` via
  `syncCalendarStatusFromSocialPost()` — never written directly as published/failed by calendar code
- error handling: malformed JSON guarded (STEP 18.11 pattern) on `prepare`/`queue`/`post` — re-verified
  live, all return clean 400, no raw parser leak

**C. API audit** (9 endpoints, all repository-verified):

| Method/Route | Purpose | Authorization | Validation | DB effect | External effect | Error handling |
|---|---|---|---|---|---|---|
| POST `/api/social/queue` | Schedule a post | None (no auth system, by design) | productId exists, platform allowlist, videoUrl path+on-disk check, caption ≤2200 chars, scheduledAt future ISO | INSERT `social_posts` (scheduled) | None | 400 malformed JSON/validation, 404 product, 500 generic (no leak) |
| GET `/api/social/queue` | List/paginate queue | None (read-only) | platform/status allowlist, productId int, pageSize ≤100 | SELECT only | None | 400 bad filter, 500 generic |
| POST `/api/social/queue/[id]/cancel` | Cancel draft/scheduled post | None | id int, must exist, must be draft/scheduled | UPDATE status=cancelled | None | 404/409 via `SocialQueueError`, 500 generic |
| POST `/api/social/post` | Post immediately (no queue) | None | same as queue minus scheduledAt | INSERT only after connection=connected; UPDATE published/failed after attempt | Would call provider only if configured (currently never — not_configured for all 3) | 400/503/502, no leak |
| POST `/api/social/worker/run` | Manually trigger one worker pass | `WORKER_TRIGGER_SECRET` via header, fail-closed | n/a | multiple (run bookkeeping + per-post updates) | Only for due posts on a configured platform (none now) | 503 not_configured, 401 wrong secret, 409 already-running, 500 generic |
| GET `/api/social/worker/status` | Worker state + last run(s) | None (read-only, no secret exposure) | n/a | SELECT only | None | 500 generic |
| GET `/api/social/status` | Provider connection status ×3 | None (read-only) | n/a | None | Only if a provider were configured (none) | 500 generic; never returns token/secret |
| GET `/api/social/analytics` | Dashboard summary | None | productId/platform/status/date filters validated | SELECT only, honest null when no snapshot | None | 400 bad filter, 500 generic |
| GET `/api/social/analytics/[id]` | Per-post analytics detail | None | id int, post must exist | SELECT only | None | 400/404/500 |
| POST `/api/social/prepare` | Content → Social Package | None | productId exists, platform allowlist, videoUrl on-disk check | Read-only (SELECT product) | Calls `/api/content/generate` (real OpenAI cost) ONLY when no `caption` override supplied | 400/404/500, malformed JSON guarded |

**D. Authorization/Security**: No project-wide authentication exists anywhere (confirmed by design,
same posture documented in STEP 26.10) — the only privileged operation, `worker/run`, is gated by
`WORKER_TRIGGER_SECRET` and **fails closed** (503) when unset; a guessed/wrong secret is rejected
(401), never bypassed — verified live. All platform/status/productId/videoUrl inputs are validated
against allowlists or real DB/disk existence before use — no arbitrary value reaches a query or
filesystem path unchecked (`isValidGeneratedVideoUrl()` blocks `..` and enforces the
`/generated/video/` prefix, reused identically across prepare/queue/post — same proven pattern as
STEP 26.5's render-path traversal guard). All SQL is parameterized (`?` placeholders) — no
string-interpolated user input in any social query. No raw exception/stack trace leaks (malformed
JSON guard re-verified live on all 3 POST endpoints). No credential is ever included in any response
(`ProviderStatus` only carries `status`/`accountName`/`message`) or logged (`maskSecret()` used
consistently in all 3 providers' catch blocks) — verified by code review across `facebook.ts`,
`instagram.ts`, `tiktok.ts`. No HIGH/CRITICAL issue found — **no source-code change made**.

**E. Safe testing performed** (live, against local dev server, zero external calls):
1. `GET /api/health` → 200, `database: ok` — PASS
2. `pnpm.cmd exec tsc --noEmit` → PASSED, no error
3. Validation tests with invalid/missing input on queue/post/prepare (missing productId, invalid
   platform, path-traversal videoUrl, videoUrl outside `/generated/video/`, nonexistent video file,
   missing caption, past/invalid `scheduledAt`, nonexistent productId) → all correctly rejected with
   400/404, zero DB writes confirmed
4. Authorization: `worker/run` with no header → 503; with a guessed `x-worker-secret` → still 503
   (fails closed, never 401-vs-503 timing leak since secret is unset) — PASS
5. Queue/DB behavior (no external call): created 2 test posts via temporary product id 43 — scheduled
   one (id 24), cancelled the other (id 25) → re-cancel same post → 409; cancel nonexistent id →
   404; cancel non-numeric id → 400 — all PASS
6. Worker dry-run via `pnpm social:worker` (same in-process call the HTTP endpoint would make; safe
   because all 3 providers are `not_configured` so zero network calls fire — same precedent approved
   in STEP 26.6): processed the due test post → `processed=1 published=0 failed=1` → post correctly
   marked `failed` permanently (`retryCount` stays 0, no `external_post_id`, error message
   `"facebook provider ยังไม่ได้เชื่อมต่อ"`) — no fake success, no retry attempted (correct: not_configured
   uses `allowRetry:false`)
7. Analytics read path: `GET /api/social/analytics?productId=43` and `GET
   /api/social/analytics/24` → correct counts (`failed:1, cancelled:1`), `postsWithAnalytics:0`,
   `analyticsAvailable:false` — honest empty state, no fabricated numbers
8. `POST /api/social/post` against `not_configured` facebook → 503, verified via `social_posts` count
   before/after (2 → 2) that **zero rows were inserted** — matches STEP 26.6's prior finding exactly
9. `POST /api/social/prepare` tested via caption-override path (zero AI cost) → 200 with correct
   package; invalid platform → 400; nonexistent video file → 400
10. Dev server log reviewed for the entire test session → every request resolved with the expected
    status code, **zero unhandled exceptions/stack traces/crashes**

**F. Regression**: `/api/health` → 200. 18 previously-verified endpoints (`/`, `/products`,
`/content`, `/content-studio`, `/content-calendar`, `/video-studio`, `/voice-studio`, `/costs`,
`/api/health`, `/api/products`, `/api/content/list`, `/api/content/plan`, `/api/costs`,
`/api/costs/summary`, `/api/social/status`, `/api/social/worker/status`, `/api/social/queue`,
`/api/social/analytics`) → **HTTP 200 ทั้งหมด**. `pnpm.cmd exec tsc --noEmit` → PASSED.

**G. External API**: **NOT USED** — no Facebook/Instagram/TikTok credential exists in this
environment (`.env` confirmed empty for all 3), so every provider path is `not_configured` and no
network call to any social platform fired during this audit. No BLOCKED condition — full pipeline
behavior (validation → queue → worker → failure handling → analytics) was verifiable end-to-end
without needing real credentials.

**Database cleanup**: test product (id 43, `STEP12-SOCIAL-AUDIT-TEST-PRODUCT`) deleted via API; test
`social_posts` rows (id 24, 25) deleted directly (no DELETE endpoint exists for this table — same
precedent as STEP 26.6's cleanup method); dummy test video file removed from
`public/generated/video/`. Verified 0 remaining. The `social_worker_runs` row created by the test
run (id 10) was **intentionally left in place** — it is designed as permanent run-history audit trail
(same as STEP 26.6's precedent), not test-specific data.

**Defects found**: None.
**Defects fixed**: None — no source code was changed in this STEP.
**Files changed**: None (source code) — `PROJECT_STATUS.md` updated with this entry only.
`PROJECT_CHECKPOINT.md` not touched.

**STEP 12 STATUS: PASS**

---

## STEP 13 — AI Cost Ledger Audit
Date: 2026-08-30

**Scope**: Full audit-only verification of the AI Cost Ledger system (recording, calculation,
aggregation, API) — no source-code changes, no real AI provider calls, no real-cost operations. Static
code review + read-only database queries + safe GET-only API tests.

**A. Code discovered** (repository-verified): `src/lib/costConfig.ts` (pricing config, pure function,
no DB/network), `src/lib/costLedger.ts` (all DB access — **better-sqlite3 only, confirmed again: no
Prisma anywhere in this project**), routes `src/app/api/costs/{route,summary/route,
products/[id]/route,content-plans/[id]/route}.ts`. 8 call sites that write to the ledger, all
reviewed: `content/generate` (text_generate), `voice/route.ts` (voice_generate, manual),
`video/auto/route.ts` (voice_generate, automated), `products/[id]/media/generate` (image_generate),
`products/[id]/ai-video/generate` + `.../jobs/[jobId]` (video_generate, create+finalize split across
2 requests by design), `content/plan` (content_plan_generate, with per-plan cost-split logic),
`content/calendar/plan` (weekly_plan_generate, intentionally `product_id: NULL` — covers multiple
products in one call). Every site follows the same two-phase pattern
(`recordAiGeneration()` before the provider call → `finalizeAiGenerationCost()` after) with exactly
one record + one finalize per request — **no double-recording found**.

**B. Database verification** (schema: `ai_cost_ledger` in `src/lib/db.ts`, columns: id, product_id,
content_plan_id, media_id, ai_video_job_id, provider NOT NULL, model, operation NOT NULL, status NOT
NULL DEFAULT 'processing', input_units, output_units, duration_seconds, estimated_cost, actual_cost,
currency NOT NULL DEFAULT 'USD', metadata, created_at, completed_at — with FKs to products/
content_plans/product_media/ai_video_jobs, all NO ACTION per STEP 27.1's design):

Read-only queries against the real database (10 rows total, no INSERT/UPDATE/DELETE performed):
- Status breakdown: `succeeded: 10` — **0 rows stuck in `processing`** (checked both >1h old and any
  age) — no incomplete finalize anywhere
- `succeeded`/`failed` rows missing `completed_at`: **0** — `finalizeAiGenerationCost()` always sets it
- Negative `estimated_cost`/`actual_cost`: **0** each
- Rows with `actual_cost IS NOT NULL`: **0** — confirms no fake billing has ever been written (matches
  the architecture: no provider in this codebase returns real billing data yet)
- Duplicate-row heuristic (same product_id+operation+created_at+input_units+output_units, count>1):
  **0** — no evidence of a single request recording twice
- Orphan references (`product_id`/`content_plan_id`/`ai_video_job_id` pointing to a deleted parent):
  **0 each** — referential integrity intact

**C. Cost calculation verification** — **every configured operation type's real stored row was
manually recomputed by hand against the exact formula in `costConfig.ts` and the exact price
currently in `.env`, not assumed correct because the code runs**:
- **OpenAI text** (`OPENAI_TEXT_PRICE_INPUT_PER_1K=0.00025`, `OPENAI_TEXT_PRICE_OUTPUT_PER_1K=0.002`):
  3 `text_generate` rows (id 10, 26, 28) + 1 `content_plan_generate` row (id 25, which uses the same
  text formula) — all 4 recomputed by hand from stored `input_units`/`output_units`, **all match the
  stored `estimated_cost` to floating-point precision** (e.g. row 10: 1124 in/1576 out →
  `(1124/1000)×0.00025 + (1576/1000)×0.002 = 0.003433`, matches exactly)
- **OpenAI TTS voice** (`OPENAI_TTS_PRICE_PER_1K_CHARS=0.03`): 2 rows (id 9, 27) — both recomputed and
  match exactly (row 9: 25 chars → `0.00075`; row 27: 693 chars → `0.02079`)
- **OpenAI image** (`OPENAI_IMAGE_PRICE_PER_IMAGE_HIGH=0.167`): 4 `image_generate` rows —
  2 (id 8, 24, `quality:"high"`) → `0.167` each, matches exactly; the other 2 (id 1, 2, also
  `quality:"high"`) have `estimated_cost: null` with `metadataPatch.pricingReason:
  "pricing_not_configured"` — **verified this is historical, not a live bug**: those 2 rows predate
  image pricing being added to `.env` (created 2026-08-29 09:2x, before the price env vars existed in
  this environment) — the design correctly never backfills a guessed price onto old rows (`"ห้าม
  backfill ค่าเดาเข้าไปแทน NULL"`), so they correctly stay `null` forever
- **`averageCostPerProduct`** (`/api/costs/summary`): recomputed by hand from the 3 product groups
  that have ≥1 priced row (product 41: 4 rows sum `0.03876025`; product 33: 1 row `0.167`; product 3:
  2 rows sum `0.170433`) → `(0.03876025+0.167+0.170433)/3 = 0.12539775` — **matches the API's returned
  value to the last digit**
- **Replicate video**: **0 real rows exist** (no `REPLICATE_API_TOKEN` has ever been configured in
  this environment, so no `video_generate` row has ever been created) — cost formula verified by
  **code review only** (same limitation as STEP 26.7's prior pure-function test, not re-run live here
  per this STEP's "no real AI generation" rule): `if durationSeconds && pricing.perSecond → duration ×
  perSecond`, `else if pricing.perGeneration → flat perGeneration`, `else → null` — logic unchanged
  since STEP 26.7, no drift
- Every calculation path returns `cost: null` with an explicit `reason` (`pricing_not_configured` /
  `insufficient_usage_data` / `image_quality_unknown`) when it cannot compute a real number — **never
  a fabricated 0 or guessed value**, verified across all 4 operation types in the pricing-config code

**D. API endpoints verified** (safe GET only, live against the running dev server):
- `GET /api/costs/summary` → matches the hand-computed totals exactly (`today: 0.20576025`,
  `month: 0.37694325`, `generationCount: 10`, `providerBreakdown`/`operationBreakdown`/
  `imageQualityBreakdown` all cross-checked against raw DB — identical)
- `GET /api/costs?pageSize=100` → raw ledger listing matches the DB read-only query row-for-row (same
  10 rows, same values)
- `GET /api/costs/products/3` → `total: 0.170433` (0.167 image + 0.003433 text), matches hand
  calculation exactly; `clips: []` correctly empty (no `ai_video_job` exists for this product)
- `GET /api/costs/content-plans/11` → correctly isolates only the 1 ledger row linked to that plan
  (`0.00581075`), other categories correctly empty
- `GET /api/costs/products/999999` (nonexistent) → 404, clean message
- Validation: `provider=azure` (invalid) → 400; `productId=1 OR 1=1` (SQL injection probe) → 400
  (rejected by `Number.isInteger()` check before ever reaching a query — confirms parameterized
  queries are the only path, no string interpolation of user input anywhere in `costLedger.ts`);
  `pageSize=500` (over the 100 cap) → 400
- No raw error/stack trace leaked in any response across all tests

**E. Safe database verification**: performed entirely via a read-only `better-sqlite3` connection
(`{ readonly: true }`) — confirmed no INSERT/UPDATE/DELETE was executed against `ai_cost_ledger` or
any other table during this STEP.

**F. Zero-cost regression**: `GET /api/health` → 200, `database: ok`. `pnpm.cmd exec tsc --noEmit` →
PASSED, no error. 18 previously-verified endpoints → HTTP 200 across the board. Dev server log
reviewed for the full session — **zero unhandled exceptions, zero database errors, zero crashes**
from any of this STEP's own requests.

**Unrelated observation (not part of this audit, noted for transparency)**: the dev server log shows
a live browser session was actively using the app concurrently with this audit — it deleted several
`product_media` rows from the real products (id 3 "เบี้ยแก้", id 4 "ตะกรุด") and made 4 attempts to
`DELETE /api/products?id=41`, each correctly rejected with **409** (blocked by real history: images,
content plans, AI cost ledger rows — the STEP 26.9/27.1 FK-protection design working exactly as
intended). This was not triggered by this audit session. Verified it has **no effect on Cost Ledger
integrity** — `ai_cost_ledger` rows referencing products 3/4/41 are all still intact (media deletion
does not cascade to the ledger, confirmed by the NO ACTION FK design).

**G. Known limitations** (configuration, not code defects):
- `REPLICATE_VIDEO_PRICE_PER_SECOND` — **not set** in `.env` (confirmed again by grep). Fallback:
  `calculateEstimatedCost()` uses the flat `REPLICATE_VIDEO_PRICE_PER_GENERATION=0.50` regardless of
  actual video duration whenever `perSecond` is unset. Effect on accuracy: any future
  `video_generate` cost will be a flat $0.50 estimate, not duration-proportional, until this variable
  is set — same standing limitation documented since STEP 25/26.7, unchanged.
- `COST_CURRENCY` — not set, defaults to `"USD"` in code (`getCostCurrency()`), consistent with every
  API response's `currency: "USD"` observed in this audit. Not a limitation, working as designed.
- Text/TTS/Image pricing — all 3 configured in `.env` (`OPENAI_TEXT_PRICE_INPUT_PER_1K=0.00025`,
  `OPENAI_TEXT_PRICE_OUTPUT_PER_1K=0.002`, `OPENAI_TTS_PRICE_PER_1K_CHARS=0.03`,
  `OPENAI_IMAGE_PRICE_PER_IMAGE_{LOW,MEDIUM,HIGH}=0.011/0.042/0.167`) and verified correct against
  real data in section C — no limitation.
- Replicate video generation itself has never been exercised end-to-end with a real credential (same
  standing limitation as STEP 26.4/11) — irrelevant to ledger *calculation* correctness (verified by
  code review) but means the `video_generate` code path has 0 real-world data points to validate
  against, unlike the other 3 operation types which now have real, hand-verified data.

**Defects found**: None.
**Defects fixed**: None — no source code was changed in this STEP.
**Files changed**: None (source code). `PROJECT_STATUS.md` updated with this entry only.
`PROJECT_CHECKPOINT.md` not touched.

**STEP 13 STATUS: PASS**

---

## STEP 14 — Voice Studio → Video Studio: Product Media Library Picker (Feature Development)
Date: 2026-08-30

**PHASE 1-2 — Current flow, determined from real code** (`src/lib/voice.ts`, `src/app/api/voice/
route.ts`, `src/app/voice-studio/page.tsx`, `src/lib/media.ts`, `src/lib/timeline.ts`,
`src/app/api/video/{auto,render}/route.ts`, `src/app/video-studio/page.tsx`, `src/lib/ai/video/
{index,provider}.ts`, `src/app/api/products/[id]/ai-video/{generate,jobs}/route.ts`,
`src/lib/costLedger.ts`, `src/lib/db.ts` — all read, no drift from STEP 11/13's prior audits):

1. Voice Studio (`/voice-studio`): user types a script → `POST /api/voice` → `generateVoice()`
   (real OpenAI TTS `tts-1-hd`) → MP3 saved to `public/generated/voice/{file}.mp3`, `ai_cost_ledger`
   row written with `product_id: NULL` (by design — Manual Workflow has no product context)
2. The audio file is stored **only on disk**, referenced by its public URL (`/generated/voice/...`)
   — no DB table tracks "generated voices" as a list/library
3. No `product_media` record is ever created for a voice — `product_media` only holds images/videos,
   never audio
4. Timeline is **not** created at this point — it's built later, client-side, in Video Studio, once
   both audio duration and a media file list are known
5. **Video Studio already receives the voice hand-off today**: the existing "🎬 ส่งไป Video Studio"
   button (`voice-studio/page.tsx`) already does `router.push('/video-studio?script=...&audioUrl=...')`,
   and the Manual Workflow section of `video-studio/page.tsx` already reads those two query params on
   mount and pre-fills `script`/`audioUrl` state — **this hand-off was already fully implemented and
   working before this STEP**, verified live (see Phase 6)
6. `POST /api/video/auto`: **a completely separate, product-driven pipeline** (used only by the
   `AutoVideoPanel` component, explicitly documented in the file's own comment as keeping "คนละชุด
   state กันโดยสิ้นเชิง" from the Manual Workflow). Given `{productId, script?}`, it always calls
   `generateVoice()` itself — **it has no way to accept an already-generated `audioUrl`**, so running
   it after Voice Studio would silently generate a second, redundant paid voice
7. `POST /api/video/render`: pure stateless FFmpeg composer — takes `timeline` (JSON), `script`,
   `audioUrl`, and raw `media` file blobs via multipart FormData, returns a real MP4. Never touches
   the database or the cost ledger (confirmed again, matches STEP 26.5/11's prior audit, file
   untouched this STEP)
8. **Manual step today**: after landing on Video Studio with `script`/`audioUrl` pre-filled, the user
   must pick media via a plain `<input type="file">` — i.e. **re-upload from their own computer**,
   even when the relevant product already has images sitting in `product_media` (uploaded or
   AI-generated) and visible one panel up in `AutoVideoPanel`. The Manual Workflow had **zero**
   connection to any product or `product_media` before this STEP
9. **The clearest remaining connector**: close that one gap — let the Manual Workflow (which already
   receives the Voice Studio hand-off) also pull images from a product's *existing* media library
   instead of forcing a redundant local re-upload, without touching `AutoVideoPanel`'s separate state
   (respecting the file's own stated design boundary)
10. **Functionality that existed but wasn't exposed to the Manual Workflow**: `GET /api/products` and
    `GET /api/products/[id]/media` — both already implemented, already used by `AutoVideoPanel`,
    completely unused by the Manual Workflow section before this STEP

**PHASE 3 — Feature selected**: **Product Media Library picker inside the Manual Workflow's "3.
รูปภาพ / คลิป" section** — lets the user pick images already uploaded/generated for a product (via
the existing, unmodified `GET /api/products` + `GET /api/products/[id]/media`) as an alternative to
local file upload. Selected items are fetched client-side and converted into real `File` objects fed
into the exact same `mediaFiles` state `createTimeline()`/`renderVideo()` already consume — those two
functions and `POST /api/video/render` are **completely unmodified**. Not "Generate Voice → send to
Video Studio" (already existed) or "reuse voice inside `/api/video/auto`" (would require merging the
file's two deliberately-separate state trees, explicitly against its own documented design boundary).

**PHASE 4 — Impact analysis**:
- FILES TO CHANGE: `src/app/video-studio/page.tsx` only (new state + 2 new `useEffect`s + 1 new
  handler + new JSX block, all additive, inside `VideoStudioContent` only)
- FILES NOT TOUCHED: `src/lib/voice.ts`, `src/app/api/voice/route.ts`, `src/app/voice-studio/
  page.tsx`, `src/lib/media.ts`, `src/lib/timeline.ts`, `src/app/api/video/auto/route.ts`,
  `src/app/api/video/render/route.ts`, `src/lib/ai/video/**`, `src/app/api/products/[id]/ai-video/**`,
  `src/lib/costLedger.ts`, `src/lib/costConfig.ts`, `src/lib/db.ts`, `AutoVideoPanel`/
  `AnalyticsDashboard`/`WorkerStatusPanel` (same file, different components — not touched),
  `PROJECT_CHECKPOINT.md`
- API IMPACT: none — reuses `GET /api/products` and `GET /api/products/[id]/media` exactly as they
  already exist, zero contract changes, zero new endpoints
- DATABASE IMPACT: NONE — pure read-only consumer of existing data
- COST IMPACT: NONE — no AI provider is ever called by this feature; it fetches static files already
  on disk
- REGRESSION RISK: LOW — purely additive block; no existing function body, state variable, or API
  contract was modified
- WHY SMALLEST SAFE CHANGE: single file, single component, zero backend/DB/API changes, reuses
  already-audited endpoints unmodified, existing Manual Workflow render path (`createTimeline`/
  `renderVideo`/`/api/video/render`) never touched — new code only ever *adds* `File` objects to the
  same array local file selection already produced

**PHASE 5 — Implementation**: added to `VideoStudioContent` in `src/app/video-studio/page.tsx`:
5 new state variables (`libraryProducts`, `libraryProductId`, `libraryMedia`,
`libraryMediaLoading`, `libraryAdding`), 2 new `useEffect`s (load product list once; load selected
product's media on change), 1 new async handler (`addLibraryMediaToSelection` — `fetch(item.url)` →
`blob()` → `new File([blob], item.fileName, {...})` → append to `mediaFiles`, reset `timeline`,
skip duplicates by filename), and a new JSX block (product `<select>` + thumbnail grid with
click-to-add) inserted into the existing "3. รูปภาพ / คลิป" section. Reused existing module-level
types `AutoProduct`/`ProductMediaItem` rather than declaring duplicates. No backup files were
created or removed (none pre-existed for this file at this section).

**PHASE 6 — Testing**:
1. `pnpm.cmd exec tsc --noEmit` → **PASSED**, no error
2. `GET /api/health` → 200, `database: ok`
3. Static/API safety: `POST /api/voice` and `POST /api/video/auto` with malformed JSON → both still
   400 clean (STEP 18.11 guard intact, files untouched) — **no real AI call made**
4. **Full real UI flow tested live via Playwright** (headless browser, separate from any human
   session): navigated to `/video-studio?script=...&audioUrl=...` reusing an **already-existing**
   real voice file already on disk from earlier legitimate usage (zero new AI cost, zero new OpenAI
   call) → confirmed "✅ รับสคริปต์และเสียงพากย์จาก Voice Studio แล้ว" / duration read correctly
   (1:01) → selected product "ลูกอมหน้าเสือ" (id 41) in the **new** library picker → its 2 real
   `product_media` images rendered as thumbnails → clicked both → status confirmed
   `"✅ เพิ่ม ... จากคลังสื่อสินค้าแล้ว"` each time, "เลือกแล้ว 2 ไฟล์" list updated correctly → clicked
   "สร้าง Timeline อัตโนมัติ" → 2 scenes created, `0:00→0:30` / `0:30→1:01`, splitting the real audio
   duration evenly (existing `createTimeline()` logic, unmodified) → clicked "สร้างวิดีโอ MP4" →
   real `POST /api/video/render` succeeded (**HTTP 200 in 42s**, confirmed in dev server log) →
   real MP4 produced on disk (5,078,140 bytes) and playable/downloadable in the UI. **Zero browser
   console errors or warnings throughout.**
5. Dev server log reviewed for the entire session → no unhandled exception, no crash, no raw stack
   trace, all requests resolved as expected
6. Cost ledger check: `GET /api/costs/products/41` before and after the full UI test →
   **identical** (`generationCount: 4`, `estimatedTotal: 0.03876025` unchanged) — confirms **zero**
   new `ai_cost_ledger` rows were created by this feature (expected: no AI call happens anywhere in
   this flow)
7. Regression: `/api/health`, all 18 previously-verified endpoints → HTTP 200 across the board
8. Cleanup: the test-rendered MP4 file was deleted from disk; no DB rows were created by this test
   (`/api/video/render` never writes to the database), so no DB cleanup was needed

**Observations found while testing (not fixed — out of scope for this feature, files untouched)**:
- `ESLint` (`react-hooks/set-state-in-effect`): my one new `useEffect` that calls `setLibraryMedia([])`
  synchronously triggers this rule — but the **same** rule already fires on 4 pre-existing effects
  elsewhere in this file (lines ~2906, 3097, 3230, 3241, none touched by this STEP), so this is
  pre-existing project-wide technical debt, not a regression introduced here. `tsc` (this project's
  actual mandated type-check) is unaffected and clean. Not fixed, per "ห้ามแก้หลายโมดูลพร้อมกันโดยไม่จำเป็น."
- `POST /api/video/render` with **no body/Content-Type at all** (an unusual client shape a real
  browser's `FormData` submission never produces, only reachable via a raw non-multipart request)
  returns **HTTP 500 with a raw internal error message** (`request.formData()` throwing, uncaught by
  an inner guard). This is pre-existing behavior in a file explicitly protected as hands-off
  (`render.ts`) throughout every prior STEP in this project — **not fixed**, reported here for a
  future STEP to decide on, matching the same reporting-not-fixing pattern used for prior findings.
- Confirmed again (unrelated to this feature): a live human browser session was active during
  testing (visible in the dev log as ordinary product/media browsing) — no conflict with this
  feature's automated Playwright test, no data corruption observed.

**Defects found**: None affecting this feature or its regression surface (the two items above are
pre-existing, out-of-scope observations, not defects introduced by this STEP).
**Defects fixed**: None (not needed).
**Files changed**: `src/app/video-studio/page.tsx` only. `PROJECT_STATUS.md` updated with this entry.
`PROJECT_CHECKPOINT.md` not touched.

**STEP 14 STATUS: PASS**

---

## STEP 15 — Video Studio Product Media Picker: Video Support
Date: 2026-08-30

**PHASE 1-2 — Current implementation read, media types verified** (`src/app/video-studio/
page.tsx`, `src/lib/productMedia.ts`, `src/app/api/products/[id]/media/route.ts` GET,
`src/app/api/video/render/route.ts` — no other files touched or needed):
- `GET /api/products/[id]/media` can return `type: "image" | "video"` per row (`ProductMediaType` in
  `src/lib/productMedia.ts`) — confirmed from the schema/type, not guessed
- A video row's `url` is a plain `/generated/...` static path exactly like an image row's — nothing
  URL-wise distinguishes them; only `type` does
- **The STEP 14 picker's `addLibraryMediaToSelection()` handler was already type-agnostic** — it
  already branched on `item.type === "video"` to set the `File`'s MIME type
  (`"video/mp4"`) as a fallback, and appended it into the same `mediaFiles: File[]` array used for
  everything else. **No change was needed there.**
- `createTimeline()` (Manual Workflow) only ever reads `file.name`/audio duration — fully
  type-agnostic already, confirmed unchanged
- `renderVideo()` → `POST /api/video/render`: **already fully supports video inputs** — the route
  branches on `file.type.startsWith("image/")` vs the `else` (video) case, using `-loop 1 -t
  <duration>` for images and `-stream_loop -1` for videos in the FFmpeg args. This logic predates
  STEP 14/15 entirely and was **not modified**.
- **Conclusion**: the entire pipeline (state → timeline → render) already accepted video `File`
  objects end-to-end. The only real gap was cosmetic: the picker's video tile showed a static "🎬
  วิดีโอ" placeholder box instead of an actual preview frame — not a functional blocker, but it also
  didn't yet have a *real* video item to prove this against, since **zero** `product_media` rows
  with `type='video'` exist in this database (verified via read-only query — expected, since
  `REPLICATE_API_TOKEN` has never been configured and no manual video-upload endpoint exists;
  `product_media` video rows are only ever written by `POST /api/products/[id]/ai-video/jobs/
  [jobId]`)

**PHASE 3 — Smallest change implemented**: replaced the static "🎬 วิดีโอ" placeholder `<div>` in the
picker's grid with a real `<video>` element (`muted`, `preload="metadata"`, no controls — same
`h-20 w-full object-cover` footprint as the image thumbnail) showing the video's actual first frame,
with a small "🎬 วิดีโอ" badge kept in the corner so image/video items stay visually distinguishable.
**No other code changed** — click handler, duplicate-by-filename check, `mediaFiles` state,
`createTimeline()`, `renderVideo()`, and `/api/video/render` are all byte-for-byte unchanged from
STEP 14.

**PHASE 4 — Impact analysis**:
- FILES TO CHANGE: `src/app/video-studio/page.tsx` only (one JSX block, ~10 lines)
- FILES NOT TOUCHED: `src/lib/voice.ts`, `/api/voice`, `/api/video/auto`, `/api/video/render`,
  `src/lib/timeline.ts`, `src/lib/media.ts`, `src/lib/costLedger.ts`, any AI provider code,
  `src/lib/db.ts`, `PROJECT_CHECKPOINT.md` — none needed since the pipeline already handled video
- DATABASE: NONE (schema already supports `type='video'`, no migration needed)
- API: existing only — no contract change
- AI COST: NONE — feature never calls an AI provider; test video was synthesized **locally via
  FFmpeg** (already a project dependency, used by `render.ts`/`timeline.ts` themselves), zero
  external network calls
- REGRESSION RISK: LOW — single cosmetic JSX change inside a picker branch that was previously dead
  code (no real video row ever existed to exercise it)

**PHASE 5 — Testing** (all real, live against the dev server — no AI provider called):
1. `pnpm.cmd exec tsc --noEmit` → **PASSED**
2. `GET /api/health` → 200, `database: ok`
3. **Existing image picker re-verified**: unaffected, still renders `<img>` thumbnails, still adds
   correctly (same code path, untouched)
4. **Real product video test**: since no `product_media` video row existed, created one safely and
   locally — (a) a 3-second H.264/AAC MP4 synthesized entirely offline via `ffmpeg -f lavfi` (color
   bars + silent audio, zero network/AI calls), (b) a temporary test product
   (`STEP15-VIDEO-PICKER-TEST-PRODUCT`, id 44) via the existing `POST /api/products`, (c) a
   `product_media` row inserted via the app's own real `insertProductMedia()` function (no manual
   video-upload HTTP endpoint exists, so a direct call to the existing function was used — the same
   "insert test row directly" method already established and approved as safe testing practice in
   this project's STEP 26.6 audit) pointing at the local test MP4
5. **Full live UI flow via Playwright** (headless, separate from any human browser session):
   navigated to Video Studio with the Voice Studio hand-off params (script + an **already-existing**
   real voice file reused from disk, zero new TTS cost) → selected the test product in the picker →
   video tile rendered with a real preview frame + "🎬 วิดีโอ" badge, no console errors → clicked it →
   status confirmed `"✅ เพิ่ม ... จากคลังสื่อสินค้าแล้ว"`, "เลือกแล้ว 1 ไฟล์" updated → clicked "สร้าง
   Timeline อัตโนมัติ" → 1 scene created spanning the full real audio duration (`0:00 → 1:01`) →
   clicked "สร้างวิดีโอ MP4" → **real `POST /api/video/render` succeeded, HTTP 200 in 21.3s**
   (confirmed in dev server log)
6. Rendering a real local video was safe (no external cost) — performed the full end-to-end render
   per the instruction
7. **Output verified with `ffprobe`**: valid MP4 container, `codec_name=h264` video stream,
   `codec_name=aac` audio stream, `duration=61.766667`s — the 3-second test clip was correctly
   looped by the existing (untouched) `-stream_loop -1` FFmpeg logic to fill the real audio's
   duration, confirming video inputs render correctly end-to-end
8. Browser console: **0 errors, 0 warnings** throughout the entire session
9. Dev server log reviewed for the full session: no unhandled exception, no crash beyond the
   already-known pre-existing observation (see Phase 6 below)
10. Cost ledger check: `GET /api/costs/products/44` → **all zero** (`generationCount: 0` in every
    category) — confirms zero AI calls were made anywhere in this test. No duplicate ledger entries.
    No unexpected external API call (verified: only `fetch()` of local static files + local FFmpeg)
11. Regression: `/api/health`, malformed-JSON safety on `/api/voice` and `/api/video/auto` (still
    400 clean, no real TTS/generation triggered), `GET /api/products/44/media`,
    `GET /api/costs/products/44`, and the full 18-endpoint suite → **all PASS**

**PHASE 6 — Pre-existing observation re-check**: the `/api/video/render` raw-error-message leak on a
request with no `Content-Type` (reported in STEP 14) was **not touched** in this STEP — `render.ts`
was not edited at all. It was incidentally reproduced once more during this STEP's regression
testing (same trigger as before, a bare request with no multipart body), confirming it is unchanged
— **not worsened, not fixed**, exactly as instructed.

**Cleanup**: deleted the rendered test MP4 and the local synthesized test source MP4 from disk,
deleted the test `product_media` row (id 54) via the existing `DELETE /api/products/[id]/media/
[mediaId]` endpoint, deleted the test product (id 44) via the existing `DELETE /api/products`
endpoint. Verified 0 remaining in all three places.

**Defects found**: None from this feature.
**Defects fixed**: None (not needed — pipeline already supported video).
**Files changed**: `src/app/video-studio/page.tsx` only (one JSX block). `PROJECT_STATUS.md` updated
with this entry. `PROJECT_CHECKPOINT.md` not touched. No backup files removed.

**STEP 15 STATUS: PASS**

---

## STEP 16 — VIDEO RENDER ERROR HANDLING FIX (Content-Type leak, first reported STEP 14)

Date: 2026-08-31

Scope: fix the pre-existing finding first reported in STEP 14 and re-confirmed untouched in STEP 15
Phase 6 — `POST /api/video/render` leaking a raw, English, unhandled `TypeError` message (from
`request.formData()` failing to parse a request with missing/invalid `Content-Type`) straight into
the HTTP 500 response body, instead of the app's normal controlled Thai 400 error convention.

**Audit phase (read-only, done first)**: confirmed the leak by code inspection —
`request.formData()` at `route.ts:185` sat inside the function's outer `try` with no inner guard,
unlike `JSON.parse(timelineRaw)` a few lines below which already had one. Compared against the
inner `try/catch` pattern established in **STEP 26.8** (JSON-parse guards on 5 other endpoints,
re-verified in STEP 9) — `content/plan/route.ts:61-68` — as the precedent for the fix shape.
`render.ts` had been explicitly hands-off/protected since STEP 14/15; this STEP is the first time it
was modified, on explicit user approval after reviewing the audit.

**Fix applied**: wrapped `request.formData()` in its own inner `try/catch` at `route.ts:185-193`,
returning `{ error: "รูปแบบคำขอไม่ถูกต้อง (ต้องเป็น FormData)" }` with HTTP 400 on parse failure,
before any other logic runs. No other line in the file changed — timeline/media/audio validation,
FFmpeg args, subtitle generation, and the success response are byte-identical to before.

**Tested (dev server running locally, zero AI calls, zero external cost)**:
1. `POST /api/video/render` with no `Content-Type` / no body → HTTP 400, clean Thai message, no raw
   parser text — **PASS**
2. `POST /api/video/render` with `Content-Type: text/plain` + garbage body → same clean 400 — **PASS**
3. Real end-to-end multipart render: 1×1 PNG test image + an already-existing real voice MP3 reused
   from disk (`public/generated/voice/`, zero new TTS cost) + a 1-scene timeline + script → real
   FFmpeg render completed, `HTTP 200`, valid `videoUrl` returned, matching the pre-fix response
   shape exactly — **PASS**. Rendered test MP4 deleted after verification; `.tmp/video-render`
   workDir cleanup confirmed empty after both the success run and an earlier expected validation
   error, same as before the fix.
4. `pnpm.cmd exec tsc --noEmit` → **PASSED**, no errors
5. Dev server log reviewed for the whole session: no unhandled exception, no crash, server stayed
   responsive throughout — only the expected 400s, one expected pre-existing 500
   (`audioUrl ไม่ถูกต้อง`, from an unrelated MSYS/Git-Bash path-mangling artifact in a manual test
   command, not an app defect) and the final 200
6. Regression: existing validation errors (missing timeline/script/audioUrl/media, malformed
   timeline JSON, bad scene index/duration) unchanged — none of that logic was touched

**Defects found**: none beyond the STEP 14 finding this STEP was scoped to fix.
**Defects fixed**: the raw-error-message leak on missing/invalid `Content-Type` — now returns a
controlled Thai 400 instead of a raw 500.
**Files changed**: `src/app/api/video/render/route.ts` only (one inner `try/catch` added around the
existing `request.formData()` call). `PROJECT_STATUS.md` updated with this entry.
`PROJECT_CHECKPOINT.md` not touched. No other source file modified.

**STEP 16 STATUS: PASS**

---

## STEP 18 — ORDERS READ API + ORDERS UI

Date: 2026-08-31

Scope: close the Orders read-access gap identified in the STEP 17 audit (read-only audit, not
logged as its own entry per its own instructions — no source touched) so a future Finance/Income
system can reference existing orders. Before this STEP, `orders`/`order_items` tables and
`POST /api/orders` (via `src/lib/orders.ts` → `createOrder()` → `decreaseStockForSale()`) already
existed and worked, but there was no way to read orders back — no `GET` endpoint, no `/orders` page,
despite the homepage nav already having an "🧾 ออเดอร์" menu entry sitting disabled
(`href: null`, "เร็วๆ นี้").

**Implementation** (additive only — no existing logic touched):
- `GET /api/orders` added to `src/app/api/orders/route.ts` (existing `POST` untouched, unchanged)
  — list with `LEFT JOIN customers` + `LEFT JOIN order_items` (item count / total quantity),
  optional `?limit=` (1-500, default 100, 400 on invalid)
- `GET /api/orders/[id]` — new file `src/app/api/orders/[id]/route.ts` — order + customer fields +
  full item list (joined to `products.name`), `404` on missing order, `400` on non-numeric id
- `src/app/orders/page.tsx` — new read-only list page (order number, date, customer, channel, item
  count/quantity, total, status, link to detail), styled to match the existing `inventory/page.tsx`
  pattern (Tailwind slate/white cards)
- `src/app/orders/[id]/page.tsx` — new detail page (customer info, channel/payment, itemized table,
  subtotal/shipping/discount/total breakdown)
- `src/app/page.tsx` — changed the existing disabled "🧾 ออเดอร์" nav entry's `href` from `null` to
  `/orders` (one line; menu structure itself untouched)

No database schema change — reused `orders`/`order_items`/`customers`/`products` exactly as they
are. No new order storage created.

**Backups created** (before editing, timestamped per convention):
`src/app/api/orders/route.ts.step18-backup-20260831-221759`,
`src/app/page.tsx.step18-backup-20260831-221759`

**Tested (dev server running locally, zero AI calls, zero external cost)**:
1. `pnpm.cmd exec tsc --noEmit` → **PASSED**, no errors
2. `GET /api/orders` → `200`, real existing order (id 1, the STEP 36 test order) returned with
   correct `item_count`/`total_quantity` — **PASS**
3. `GET /api/orders/1` → `200`, full item detail with joined product name (`ตะกรุด`) — **PASS**
4. `GET /api/orders/999999` → `404`, `{"error":"Order not found"}`, no raw DB/stack info — **PASS**
5. Edge cases: `GET /api/orders/abc` → `400` clean message; `GET /api/orders?limit=99999` → `400`
   clean message — both controlled, no leaks
6. **Regression — order creation + stock deduction**: created a real test order via the *unchanged*
   `POST /api/orders` (product id 3, qty 1) → `201`, `products.stock` went `13→12`, a new
   `inventory_movements` row was inserted (`movement_type='sale'`, `reference_type='order'`,
   `reference_id=2`) exactly as before this STEP — confirms `createOrder()`/`decreaseStockForSale()`
   logic is byte-identical to pre-STEP-18 behavior. Test order + its movement + stock change were
   then fully reverted via a temporary cleanup script (deleted after use) — verified `products.stock`
   back to `13` and only the original STEP 36 order remains
7. Regression — other endpoints: `/api/health` → `200`; `GET /api/products` → unchanged; 
   `GET /api/costs/summary` → unchanged (ledger untouched)
8. **UI (Playwright)**: `/orders` loads, shows both real orders with correct totals/status, 0
   console errors; clicking "ดูรายละเอียด →" navigates to `/orders/2` (then `/orders/1` after
   cleanup) and renders the full itemized breakdown correctly, 0 console errors; `/orders/999999`
   renders "ไม่พบออเดอร์ที่ต้องการ" correctly — the only console entries were the browser's own
   automatic "Failed to load resource: 404" network log lines for the intentional not-found fetch,
   not an application/JS error (page handled the 404 branch cleanly, no exception thrown); homepage
   nav link confirmed live and pointing at `/orders`, 0 console errors

**Defects found**: none.
**Defects fixed**: none needed (net-new read paths; existing write paths were not touched and
verified unchanged).
**Files changed**: `src/app/api/orders/route.ts` (GET added), `src/app/api/orders/[id]/route.ts`
(new), `src/app/orders/page.tsx` (new), `src/app/orders/[id]/page.tsx` (new), `src/app/page.tsx`
(one line — nav href). `PROJECT_STATUS.md` updated with this entry. `PROJECT_CHECKPOINT.md` not
touched.

**STEP 18 STATUS: PASS**

---

## STEP 19 — TRANSACTIONS + EXPENSE CATEGORIES SCHEMA (foundation only, no API/UI)

Date: 2026-08-31

Scope: database/schema foundation only for the future Income & Expense system, per the STEP 17
audit's recommended order. No `/api/transactions`, no Finance/Tax UI, no receipt upload, no OCR —
all deferred to STEP 20+.

**Inspection done first**: confirmed `src/lib/db.ts` uses `CREATE TABLE IF NOT EXISTS` for new
tables and `PRAGMA table_info` + guarded `ALTER TABLE` for evolving existing ones (no ORM, no
migration framework) — reused this exact pattern. Confirmed every existing enum-like TEXT column
(`inventory_movements.movement_type`, `ai_cost_ledger.provider`/`operation`/`status`) is validated
in the TS layer (`StockMovementType` in `inventory.ts`, `AiCostOperation` in `costLedger.ts`), not
via SQL `CHECK` constraints — followed the same convention for `transactions`. Confirmed money
columns project-wide use `REAL` (`products.price/cost`, `orders.total`, `ai_cost_ledger.*_cost`) —
used `REAL` for `transactions.amount` to match. Confirmed SQLite's FK-enforcement pragma is never
enabled anywhere in this codebase (only `journal_mode = WAL` is set) and no table anywhere uses
`ON DELETE CASCADE` — so declaring `product_id`/`order_id` as FKs on `transactions` carries zero
cascading-delete risk, matching the existing style exactly.

**Implementation**:
- `src/lib/db.ts` — added `CREATE TABLE IF NOT EXISTS transactions` (`id`, `transaction_type`,
  `amount REAL`, `transaction_date` — a business date, intentionally separate from `created_at`,
  `NOT NULL` with no default so a backdated entry can never be silently stamped "today" —
  `category`, `description`, `sales_channel`, nullable `product_id`/`order_id` FKs, `payment_method`,
  `notes`, `created_at`/`updated_at`) plus 5 indexes
  (`transaction_date`/`transaction_type`/`category`/`order_id`/`product_id`). Appended at the very
  end of the existing `db.exec()` block — no existing `CREATE TABLE`/`ALTER TABLE`/index statement
  touched or reordered.
- `src/lib/transactions.ts` (new) — fixed TS constant lists only, no DB access, no CRUD functions:
  `TransactionType` (`income`/`expense`), `ExpenseCategory` (the 8 required:
  `PRODUCT_PURCHASE`/`SHIPPING`/`COD_FEE`/`RETURNED_PARCEL`/`PACKAGING`/`FACEBOOK_ADS`/`FUEL`/`OTHER`),
  `IncomeCategory` (`PRODUCT_SALE`/`OTHER_INCOME`), and `SalesChannel`
  (`facebook`/`tiktok_shop`/`shopee`/`lazada`/`line`/`walk_in`/`other` — deliberately separate from
  the existing `SocialPlatform` enum used for content posting, a different business concept), each
  with an `isValid*()` type guard for STEP 20 to use.

**Backups created** (before editing, timestamped per convention, previous STEP backups untouched):
`src/lib/db.ts.step19-backup-20260831-222601` (note: an older, unrelated
`src/lib/db.ts.step19-backup` already existed from this project's earlier "Content Intelligence
STEP 19" — content_plans — numbering thread; confirmed via diff it predates `content_plans` and is
unrelated to this transactions work; left untouched, no collision since the new backup is
timestamped)

**Tested (dev server running locally, zero AI calls, zero external cost)**:
1. `pnpm.cmd exec tsc --noEmit` → **PASSED**, no errors
2. Dev server started successfully, `GET /api/health` → `database:"ok"` — confirms `db.ts` (and its
   new `CREATE TABLE`) loaded without error
3. Schema verified directly via `better-sqlite3`: `transactions` table exists with all 12 expected
   columns and correct types/NOT NULL/defaults; all 5 indexes present
   (`idx_transactions_transaction_date/transaction_type/category/order_id/product_id`); table had
   0 rows before the real-DB test
4. **Real DB test**: inserted one temporary expense row (`amount=100, category=PACKAGING,
   transaction_date=today, description="STEP 19 TEST"`) → read back, every field matched exactly
   (including `product_id`/`order_id` correctly `NULL`) — **PASS**. Inserted a second temporary
   linked row (`product_id=3, order_id=1`) and confirmed a live `LEFT JOIN` to the real `products`
   and `orders` tables resolves correctly (`product_name="เบี้ยแก้"`,
   `order_number="TEST-36-12F-5B-..."`) — confirms the nullable FK relationships work both when
   null and when populated. Both temporary rows deleted immediately after — final `transactions`
   row count back to `0`, and `products`/`orders` rows for the referenced ids confirmed completely
   unmodified (`product 3` stock still `13`, `order 1` still `status:"pending"`) — **PASS**
5. Regression: `GET /api/health`, `GET /api/products` (4 rows, unchanged), `GET /api/orders` /
   `GET /api/orders/1` (STEP 18, unchanged), `GET /api/inventory/movements` (4 rows, unchanged),
   `GET /api/costs/summary` (unchanged) — all **PASS**, byte-identical to pre-STEP-19 responses

**Defects found**: none.
**Defects fixed**: none needed (additive schema only).
**Files changed**: `src/lib/db.ts` (new `transactions` table + 5 indexes appended at the end of the
existing schema block only), `src/lib/transactions.ts` (new — constants/types only, no DB access).
`PROJECT_STATUS.md` updated with this entry. `PROJECT_CHECKPOINT.md` not touched. No API route, no
UI page, no existing table/data touched.

**STEP 19 STATUS: PASS**

---

## STEP 20 — TRANSACTIONS CRUD API + MANUAL INCOME/EXPENSE ENTRY UI

Date: 2026-08-31

Scope: build on the STEP 19 schema foundation — `POST/GET /api/transactions`,
`PATCH/DELETE /api/transactions/[id]`, and a manual-entry Finance UI at `/finance`. No receipt/slip
upload, no OCR/AI extraction, no Tax reports (all still deferred).

**Implementation**:
- `src/lib/transactions.ts` — extended (kept the existing STEP 19 constants section untouched) with
  a CRUD layer following the same `toRow()` snake_case→camelCase mapping convention as
  `src/lib/costLedger.ts`: `createTransaction()`, `listTransactions()` (filterable by type/category/
  salesChannel/productId/orderId/date range), `updateTransaction()`, `deleteTransaction()`.
  `productId`/`orderId` are validated against real `products`/`orders` rows when provided (same
  rigor as `createOrder()` in `src/lib/orders.ts` — `PRODUCT_NOT_FOUND`/`ORDER_NOT_FOUND`), unlike
  `ai_cost_ledger`'s `recordAiGeneration()` which trusts an already-validated caller — chosen because
  this is manually typed via a UI dropdown where mistakes are plausible.
- `src/app/api/transactions/route.ts` (new) — `GET` (list + filters) and `POST` (create), reusing
  the Orders subsystem's English-message `{success, data, error}` response shape and error-code
  mapping style (STEP 18) rather than the Thai-message style used by the AI/content routes, to stay
  consistent with its sibling back-office endpoints.
- `src/app/api/transactions/[id]/route.ts` (new) — `PATCH` (partial update) and `DELETE`, same
  response/error style.
- `src/app/finance/page.tsx` (new) — income/expense entry form (type toggle, amount, date, category
  — options change based on type, sales channel, product/order pickers sourced from the real
  `/api/products` and `/api/orders`, payment method, description, notes) + a filterable
  (all/income/expense) list table with inline edit/delete and income/expense/net summary cards.
- `src/app/page.tsx` — added a new "💰 การเงิน" sidebar entry (`href: "/finance"`), following the
  exact same pattern as the other `menuItems` entries (no placeholder slot fit this concept, unlike
  Orders in STEP 18 which reused an existing disabled entry).

**Defect found and fixed during testing** (before this STEP was reported done): the Finance page is
a Client Component and originally imported `EXPENSE_CATEGORIES`/`INCOME_CATEGORIES`/`SALES_CHANNELS`
directly from `src/lib/transactions.ts` — which, after this STEP added `import db from "./db"` to
that same file for the CRUD functions, caused Next.js to try to bundle `better-sqlite3`/`fs`/`path`
into the browser, producing `Module not found: Can't resolve 'fs'` and an HTTP 500 on `/finance`
(`tsc --noEmit` did not catch this — it's a bundler-level issue, not a type error). Fixed by
duplicating the type/constant lists locally inside `finance/page.tsx` instead of importing them,
mirroring the exact convention `src/app/video-studio/page.tsx` already uses for
`src/lib/costLedger.ts`'s types. Re-tested clean afterward (see below).

**Backups created** (before editing, timestamped per convention, previous STEP backups untouched):
`src/lib/transactions.ts.step20-backup-20260831-223440`,
`src/app/page.tsx.step20-backup-20260831-223440` (note: unrelated older
`db.ts.step20-backup`/`contentIntelligence.ts.step20-backup` files already existed from this
project's earlier "Content Intelligence STEP 20" — content_calendar — numbering thread; confirmed
unrelated, left untouched, no collision since the new backups are timestamped and target different
files)

**Tested (dev server running locally, zero AI calls, zero external cost)**:
1. `pnpm.cmd exec tsc --noEmit` → **PASSED** both before and after the client-bundle fix above
2. **API — creation & validation**: valid expense → `201`; valid income linked to a real
   product+order → `201` with correct FK values; wrong category for the given type → `400`; negative
   amount → `400`; invalid date string → `400`; nonexistent `productId` → `404 "Product not found"`;
   malformed JSON body → `400` clean message (no raw parser leak) — all **PASS**
3. **API — read/update/delete**: `GET /api/transactions` list and single-field filters
   (`transactionType`, `productId`, `dateFrom`/`dateTo`) all returned correct results; `PATCH`
   updated fields and bumped `updated_at`; `PATCH`/`DELETE` on a nonexistent id → `404`; deleting the
   same id twice → `200` then `404` (no crash) — all **PASS**
4. **Encoding check**: a Thai `paymentMethod`/`description` sent via a Git-Bash shell `curl -d`
   argument came back garbled in both the API response and the raw DB row — investigated and
   confirmed via a direct Node `fetch()` call (bypassing the shell entirely) that the exact same Thai
   text round-trips perfectly through the API and database — this is the same known Git-Bash/Windows
   console UTF-8 argument-passing artifact already documented in this file's own §16 ENCODING NOTE,
   not a defect in this STEP's code
5. **UI (Playwright, full interactive session)**: `/finance` loads (after the fix above), all
   dropdowns populated correctly from real data (categories switch when the type toggle is clicked,
   products/orders lists loaded from the real APIs); added a real income transaction through the
   form → appeared in the table and in the totals immediately; edited its amount through the inline
   edit flow → updated correctly; deleted it → removed correctly and edit form reset; income/expense
   filter buttons re-fetch correctly — **0 console errors across the entire session**
6. Regression: `GET /api/health`, `GET /api/products` (4 rows), `GET /api/orders`/`GET /api/orders/1`
   (STEP 18, unchanged), `GET /api/costs/summary` (unchanged) — all **PASS**
7. **Cleanup**: every transaction created during testing (via API and via UI) was deleted afterward
   — final `SELECT COUNT(*) FROM transactions` confirmed `0`; `products`/`orders` row counts
   unchanged throughout (`4`/`1`)

**Defects found**: 1 (the client-bundle `fs` resolution failure above).
**Defects fixed**: 1/1 — fixed and re-verified before reporting this STEP done.
**Files changed**: `src/lib/transactions.ts` (CRUD functions added, STEP 19 constants section
untouched), `src/app/api/transactions/route.ts` (new), `src/app/api/transactions/[id]/route.ts`
(new), `src/app/finance/page.tsx` (new), `src/app/page.tsx` (one new nav entry). `PROJECT_STATUS.md`
updated with this entry. `PROJECT_CHECKPOINT.md` not touched. No receipt/slip upload, no OCR, no Tax
reporting — correctly out of scope for this STEP.

**STEP 20 STATUS: PASS**

---

## STEP 21 — RECEIPT / TRANSFER SLIP ATTACHMENTS (upload + display only, no OCR)

Date: 2026-08-31

Scope: attach evidence images (receipt / transfer slip) to a transaction, on top of the STEP 20
CRUD. Upload + list + delete only — explicitly no OCR/AI extraction, no Tax reporting (still
deferred).

**Inspection done first**: read the existing image-upload pattern in
`src/app/api/products/[id]/media/route.ts` in full — it already has hardened security fixes from
STEP 26.10 (extension allowlist) and STEP 27 (magic-byte content verification cross-checked against
both the client-declared extension and Content-Type, fail-closed on any mismatch or undetectable
signature). Reused that exact validation logic rather than re-deriving it, since a
user-uploaded-image-written-to-disk is the same attack surface. Also read
`src/app/api/products/[id]/media/[mediaId]/route.ts` (delete pattern: safe-path check before
`unlink`, best-effort, scoped-to-parent lookup so a cross-parent id returns 404 without confirming
whether the id exists elsewhere) and reused that shape too.

**Implementation**:
- `src/lib/db.ts` — added `CREATE TABLE IF NOT EXISTS transaction_attachments` (`id`,
  `transaction_id`, `file_name`, `file_url`, `created_at`) + 1 index on `transaction_id`. Mirrors
  `product_media`'s shape. No `ON DELETE CASCADE` (same convention as every other table) —
  cascading cleanup is done explicitly in application code instead (see below).
- `src/lib/transactionAttachments.ts` (new) — `listTransactionAttachments()`,
  `getTransactionAttachmentById()` (scoped to `transactionId`, mirrors `getProductMediaById`),
  `insertTransactionAttachment()`, `deleteTransactionAttachment()`,
  `deleteAllAttachmentsForTransaction()`.
- `src/lib/transactions.ts` — `deleteTransaction()` now calls `deleteAllAttachmentsForTransaction()`
  first and returns the deleted attachment rows (previously returned `void`), so the route can
  `unlink` their files after the DB delete — prevents orphaned attachment rows/files when a
  transaction with evidence images is deleted. Also exported `getTransactionById()` (was a private
  `getById()`) so the new attachments routes can check a transaction exists without duplicating the
  query.
- `src/app/api/transactions/[id]/attachments/route.ts` (new) — `GET` (list) and `POST` (upload,
  `multipart/form-data` field `file`), full magic-byte validation as above, 404 if the parent
  transaction doesn't exist.
- `src/app/api/transactions/[id]/attachments/[attachmentId]/route.ts` (new) — `DELETE`, scoped to
  the parent transaction id (cross-transaction id → 404, doesn't leak existence), best-effort
  `unlink`.
- `src/app/api/transactions/[id]/route.ts` — `DELETE` handler updated to `unlink` each attachment
  file returned by `deleteTransaction()`, same safe-path check as the product-media delete route.
- `src/app/finance/page.tsx` — added a "📎 ไฟล์แนบ" button per row that expands an inline panel
  (loaded on demand, not eagerly for every row): thumbnail grid of existing attachments (each a link
  to the full file) + a file input restricted to `image/jpeg,png,gif,webp` + per-attachment delete.

**Defensive-consistency fix discovered and applied (in scope, not deferred)**:
`src/app/api/products/route.ts`'s `DELETE` handler already has a `PRODUCT_REFERENCE_TABLES` list
(STEP 27.1) that blocks deleting a product with any child rows in 8 other tables (`order_items`,
`product_media`, `ai_cost_ledger`, etc.) with a `409` explaining why, specifically to prevent
deleting a product out from under real business history. `transactions.product_id` (STEP 19) is
exactly this same kind of reference and was missing from that list — so a product with real
income/expense history could have been deleted, leaving `transactions.product_id` pointing at
nothing. Added `{ table: "transactions", label: "รายการรายรับ-รายจ่าย" }` to the existing list (one
line) — verified live below.

**Backups created** (before editing, timestamped per convention, previous STEP backups untouched):
`src/lib/db.ts.step21-backup-20260831-224900`,
`src/lib/transactions.ts.step21-backup-20260831-224900`,
`src/app/api/products/route.ts.step21-backup-20260831-224900`,
`src/app/finance/page.tsx.step21-backup-20260831-224900` (note: unrelated older
`db.ts.step21-backup`/`transactions.ts.step21-backup`-style files from this project's earlier
"Content Intelligence STEP 21"/AI-cost-tracking numbering threads already existed; confirmed
unrelated, left untouched — new backups are timestamped, no collision)

**Tested (dev server running locally, zero AI calls, zero external cost)**:
1. `pnpm.cmd exec tsc --noEmit` → **PASSED**
2. Schema verified directly: `transaction_attachments` exists with all 5 expected columns and its
   index; `0` rows before testing
3. **Upload & validation**: valid PNG (real magic bytes) → `201`, file written to
   `public/generated/transaction-attachments/`, DB row correct; upload to a nonexistent transaction
   id → `404 "Transaction not found"`; multipart request missing the `file` field → `400`; a
   `.jpg`-named text file (fake image) → `400` via the magic-byte check
   (`"ไม่สามารถตรวจสอบชนิดไฟล์จากเนื้อไฟล์จริงได้..."`) — all **PASS**, matching the product-media
   route's exact behavior for the same cases
4. **Cross-transaction isolation**: attempted `DELETE` of transaction A's attachment through
   transaction B's URL → `404 "Attachment not found"` (no leak of whether the id exists elsewhere),
   attachment confirmed still present under its real parent afterward — **PASS**
5. **Correct delete**: `DELETE` through the real parent → `200`, DB row gone, file gone from disk —
   **PASS**
6. **Cascade cleanup on transaction delete**: uploaded 2 attachments to a transaction, confirmed
   both files on disk, then `DELETE`d the transaction → both files removed from disk and both DB
   rows removed (`transaction_attachments` count for that id back to `0`) — **PASS**, confirms the
   orphan-prevention fix works
7. **Product-deletion safety fix**: created a transaction linked to `product_id=3`, then attempted
   `DELETE /api/products?id=3` → `409`, error message now correctly lists
   `"ประวัติต้นทุน AI, รายการรายรับ-รายจ่าย"` (was previously only the AI-cost-history reference) —
   **PASS**
8. **UI (Playwright, full interactive session)**: `/finance` loads clean; added a real transaction;
   expanded its "📎 ไฟล์แนบ" panel (shows "ยังไม่มีไฟล์แนบ" correctly when empty); uploaded a real
   PNG through the actual browser file picker → thumbnail appeared and rendered the real image,
   button updated to "📎 ไฟล์แนบ (1)"; deleted it through the UI → thumbnail removed, button reverted
   to unlabeled count — **0 console errors across the entire session**
9. Regression: `GET /api/health`, `GET /api/products` (4 rows), `GET /api/orders/1` (unchanged) —
   all **PASS**
10. **Cleanup**: every transaction/attachment created during testing (API and UI) was deleted
    afterward; final counts confirmed `transactions: 0`, `transaction_attachments: 0`, and
    `products`/`orders` unchanged throughout (`4`/`1`); the empty
    `public/generated/transaction-attachments/` directory remains (harmless, same as every other
    `public/generated/*` subdirectory in this project)

**Defects found**: none in this STEP's new code (the `PRODUCT_REFERENCE_TABLES` gap above was a
pre-existing gap in STEP 27.1's list, surfaced and fixed while building this STEP, not a defect
introduced by STEP 21 itself).
**Defects fixed**: 1 (the `PRODUCT_REFERENCE_TABLES` gap).
**Files changed**: `src/lib/db.ts` (new table + index), `src/lib/transactionAttachments.ts` (new),
`src/lib/transactions.ts` (`deleteTransaction()` return type change + `getTransactionById()`
export), `src/app/api/transactions/[id]/route.ts` (`DELETE` now unlinks attachment files),
`src/app/api/transactions/[id]/attachments/route.ts` (new),
`src/app/api/transactions/[id]/attachments/[attachmentId]/route.ts` (new),
`src/app/api/products/route.ts` (one line — `transactions` added to `PRODUCT_REFERENCE_TABLES`),
`src/app/finance/page.tsx` (attachment panel added). `PROJECT_STATUS.md` updated with this entry.
`PROJECT_CHECKPOINT.md` not touched. No OCR, no AI extraction, no Tax reporting — correctly out of
scope.

**STEP 21 STATUS: PASS**

---

## STEP 22 — TAX REPORTING / TAX PREPARATION SYSTEM (data organization, not a tax engine)

Date: 2026-08-31

Scope: first usable Tax Preparation layer on top of STEP 19-21's `transactions` table — monthly/
yearly/custom-range aggregation API, a `/tax` UI, and CSV export. Explicitly a **data organization**
feature, not a tax-calculation engine — no Thai tax rates, VAT rules, deductions, or legal
conclusions anywhere in this STEP.

**Implementation**:
- `src/lib/taxSummary.ts` (new) — `resolveTaxPeriod()` (turns `year` / `year+month` /
  `dateFrom+dateTo` into a concrete inclusive date range, throwing typed errors for the route to map
  to `400`) and `getTaxSummary()` (pure SQL aggregation over the existing `transactions` table —
  `totalIncome`/`totalExpense`/`netIncome`/`transactionCount`, `incomeBySalesChannel`,
  `expenseByCategory`, a `monthlyBreakdown` with every month in the range filled in — even ones with
  zero activity, so the UI/CSV never shows a misleading gap — and the raw transaction list for the
  period with a `hasAttachment` flag per row via a correlated subquery against
  `transaction_attachments`, STEP 21). **No new financial-data table** — every number is a fresh
  `SUM`/`COUNT` over `transactions`, per instructions.
- `src/app/api/tax/summary/route.ts` (new) — `GET`, read-only, maps `taxSummary.ts`'s typed errors to
  controlled `400`s, `500` on anything unexpected (no raw DB errors ever returned).
- `src/app/api/tax/export/route.ts` (new) — `GET`, same params, streams a CSV: one row per
  transaction in the period (date/type/category/channel/amount/description/payment
  method/product-order refs/has-attachment/notes — enough to continue bookkeeping outside the app)
  followed by a summary block (totals, channel breakdown, category breakdown). RFC-4180 field
  escaping implemented by hand (no new dependency, matching this codebase's style), UTF-8 BOM
  prepended so Thai text opens correctly in Excel.
- `src/app/tax/page.tsx` (new) — monthly/yearly toggle, year/month selectors, summary cards,
  channel/category tables, a monthly-breakdown table (yearly view only), the period's transaction
  list with a 📎/`-` attachment indicator, and a CSV export link. Local label maps duplicated (not
  imported from any `db`-touching lib) — same client-bundle-safety convention established in STEP 20.
- `src/app/page.tsx` — added a "📑 สรุปภาษี" nav entry (`href: "/tax"`), same pattern as the other
  entries.

**Backups created** (before editing, timestamped per convention): `src/app/page.tsx.step22-backup-
20260831-230201` (note: an older unrelated `db.ts`-adjacent "STEP 22" backup thread exists from this
project's earlier Image-Quality-Breakdown numbering — unrelated, untouched, no collision since this
backup targets a different file and is timestamped).

**Tooling issue hit and resolved during testing (not a code defect)**: partway through testing, every
API route — including long-stable ones this STEP never touched (`/api/health`, `/api/products`) —
started returning Next.js's generic 404 page instead of real responses, and one POST returned "Failed
to find Server Action" from Turbopack. Traced to Turbopack dev-cache corruption after many rapid
`pnpm dev` start/stop cycles across STEPs 16-22 in this session, not to `.env`, source code, or the
database (SQLite data was confirmed fully intact throughout). Fixed by stopping the server, deleting
the `.next` build-cache directory, and restarting — all routes (including brand-new `/api/tax/*` and
STEP 21's attachments routes) worked correctly afterward. No source file was changed to fix this.

**Tested (dev server running locally, zero AI calls, zero external cost)**:
1. `pnpm.cmd exec tsc --noEmit` → **PASSED**
2. **Empty-period test**: `GET /api/tax/summary?year=2026` before any test data existed → `200`, all
   totals `0`, all 12 months present in `monthlyBreakdown` with zeros, no crash — **PASS**
3. **Validation/security**: no params → `400`; `year=99999` → `400`; `month=13` → `400`;
   `dateFrom` after `dateTo` → `400`; unparsable `dateFrom` → `400` — all controlled messages, no raw
   DB/stack leaks — **PASS**
4. Created 9 real test transactions spanning July 2026, August 2026, and one deliberately in
   December 2025 (to test range exclusion)
5. **Monthly calculation**: August 2026 → `totalIncome=1700` (1000+500+200),
   `totalExpense=550` (300+150+100), `netIncome=1150`, `transactionCount=6` — all matched hand
   calculation exactly — **PASS**
6. **Yearly calculation**: 2026 → `totalIncome=3700`, `totalExpense=950`, `netIncome=2750`,
   `transactionCount=8` (excludes the 2025 row correctly); `monthlyBreakdown` July
   `{income:2000,expense:400,net:1600}` and August `{income:1700,expense:550,net:1150}` both matched
   exactly, all other months correctly `0` — **PASS**
7. **Custom date range**: `2026-08-01..2026-08-10` → `totalIncome=1500`, `transactionCount=3` —
   **PASS**
8. **Income/expense category & sales-channel aggregation**: August channel breakdown
   `facebook:1000(1), shopee:500(1), ไม่ระบุช่องทาง:200(1)`; category breakdown
   `PACKAGING:400(2), FUEL:150(1)` — both matched exactly — **PASS**
9. **Attachment indicator**: uploaded a real evidence file to one test transaction (via STEP 21's
   endpoint) → that transaction's `hasAttachment` was `true` in the summary response, every other
   transaction `false` — **PASS**
10. **CSV export test**: verified UTF-8 BOM present (`ef bb bf` via hexdump), correct
    `Content-Disposition`/`Content-Type` headers, all transaction rows present with correct
    "มี"/"ไม่มี" attachment flags, summary block totals matched the JSON API exactly; a transaction
    with a comma and embedded quotes in its description was correctly RFC-4180-escaped
    (`"ค่า, ""พิเศษ"" ทดสอบ..."`) — **PASS**
11. **UI (Playwright, full interactive session)**: `/tax` loads clean; monthly view shows correct
    totals/channel/category/transaction-list matching the API exactly, including the 📎 indicator on
    only the one transaction with a real attachment and the comma/quote description rendering intact;
    switching to yearly view correctly reveals the monthly-breakdown table (all 12 months, July/August
    correct, rest zero) and updates the CSV export link's query string — **0 console errors across the
    entire session**
12. Regression: `GET /api/health`, `GET /api/products` (4 rows), `GET /api/orders` (1),
    `GET /api/orders/1`, `GET /api/costs/summary` — all **PASS**, byte-identical to pre-STEP-22
13. **Cleanup**: all 10 test transactions (and their 1 test attachment) deleted afterward; final
    counts confirmed `transactions: 0`, `transaction_attachments: 0`; `products` (4), `orders` (1),
    `order_items` (1), `inventory_movements` (4), `ai_cost_ledger` (10) all confirmed byte-identical
    to their pre-STEP-22 values — nothing outside `transactions`/`transaction_attachments` was ever
    touched

**Defects found**: none in the STEP 22 code itself (the Turbopack dev-cache issue above was
environment/tooling state, not a bug in any file this STEP or prior STEPs wrote — resolved without
any source change).
**Defects fixed**: 0 (none needed).
**Files changed**: `src/lib/taxSummary.ts` (new), `src/app/api/tax/summary/route.ts` (new),
`src/app/api/tax/export/route.ts` (new), `src/app/tax/page.tsx` (new), `src/app/page.tsx` (one new
nav entry). `PROJECT_STATUS.md` updated with this entry. `PROJECT_CHECKPOINT.md` not touched.
`products`, `orders`, `inventory_movements`, `ai_cost_ledger` — untouched, verified via row-count
diff. No OCR, no tax-rate/legal logic — correctly out of scope.

**STEP 22 STATUS: PASS**

---

## STEP 23 — LOW-STOCK INDICATOR

Date: 2026-08-31

Scope: close the one Inventory sub-feature flagged as missing in the original STEP 17 audit —
a per-product low-stock threshold, surfaced on both the Products and Inventory pages.

**Implementation**:
- `src/lib/db.ts` — added `low_stock_threshold INTEGER NOT NULL DEFAULT 0` to `products` via the
  same guarded `ALTER TABLE ADD COLUMN` pattern already used for `model`/`master`/`year`. `DEFAULT 0`
  is the safe/backward-compatible choice specified: with threshold 0, `stock <= threshold` is only
  ever true at `stock = 0` (the pre-existing "out of stock" condition) — no existing product starts
  showing a low-stock warning until its owner sets a real threshold.
- `src/app/api/products/route.ts` — `GET` now selects `low_stock_threshold`; `POST` accepts
  `lowStockThreshold` (validated as a non-negative integer, defaults to `0` like every other field
  on create); `PATCH` accepts it too, but defaults to the **product's existing value** (not `0`) when
  omitted from the request — a deliberate difference from every other field on this endpoint,
  documented inline, so a caller that doesn't yet know about this new field can never silently reset
  a threshold that was already set. `PRODUCT_REFERENCE_TABLES` (STEP 27.1/21, the delete-protection
  list) was not touched — this STEP adds a column, not a new table, so it doesn't apply here.
- `src/app/products/page.tsx` — `Product` type + a local `getStockLevel()` helper (`out`/`low`/`ok`);
  threshold input added to both the "add product" and "edit product" forms (prefilled from the
  product's current value on edit); stock cell shows `"{stock} / เกณฑ์ {threshold}"` when a
  threshold is set; status badge now has 3 tiers (พร้อมขาย green / ⚠️ ใกล้หมด amber / หมด red,
  replacing the old 2-tier version); a new "สินค้าใกล้หมด" stat card; a
  "แสดงเฉพาะสินค้าใกล้หมด/หมด" filter toggle over the product table.
- `src/app/inventory/page.tsx` — added a new low-stock panel (own local `Product` type +
  `getStockLevel()`, independent of the existing movement-history table below it, which is
  completely untouched) listing products at `low`/`out` level by default, with a
  "แสดงสินค้าทั้งหมด" toggle to reveal every product with its status.
- No change to `src/lib/inventory.ts` (`adjustProductStock`/`decreaseStockForSale`) or
  `src/lib/orders.ts` (`createOrder`) — stock deduction logic is untouched, confirmed by regression
  test below.

**Backups created** (before editing, timestamped per convention):
`src/lib/db.ts.step23-backup-20260831-231656`,
`src/app/api/products/route.ts.step23-backup-20260831-231656`,
`src/app/products/page.tsx.step23-backup-20260831-231656`,
`src/app/inventory/page.tsx.step23-backup-20260831-231656`.

**Tested (dev server running locally, zero AI calls, zero external cost)**:
1. `pnpm.cmd exec tsc --noEmit` → **PASSED**
2. Schema verified directly: `low_stock_threshold INTEGER NOT NULL DEFAULT 0` present; all 4
   pre-existing products confirmed unchanged (`เบี้ยแก้` stock `13`, others `0`) with
   `low_stock_threshold` correctly backfilled to `0` — **PASS**
3. **Create/read**: `POST /api/products` with `lowStockThreshold: 5` → `201`, value stored and
   returned correctly — **PASS**
4. **Update**: `PATCH` with an explicit new threshold → updates correctly; a second `PATCH` that
   *omits* `lowStockThreshold` → threshold preserved at its previous value, not reset to `0` — both
   confirmed via direct response inspection — **PASS**
5. **Validation**: `lowStockThreshold: -1` → `400`; `lowStockThreshold: 2.5` → `400`, both with clean
   Thai messages, no raw errors — **PASS**
6. **Boundary tests**: stock `10` / threshold `5` → not flagged (`ok`); stock `5` / threshold `5` →
   flagged (`low`, `stock <= threshold` literally as specified); stock `0` / threshold `5` → flagged
   as `out` (status `out_of_stock`, matching existing `status` computation) — all **PASS**
7. **Order → stock deduction regression**: created a real order for the test product (existing
   `POST /api/orders`, `createOrder()`/`decreaseStockForSale()` completely untouched) → stock went
   `10→7` correctly, a `sale`-type `inventory_movements` row was created correctly, threshold stayed
   at `5` throughout — confirms zero impact on the STEP 18/36 order/inventory pipeline — **PASS**
8. **UI (Playwright, full interactive session)**: `/products` — 3-tier badges render correctly for
   real data (`พร้อมขาย`/`⚠️ ใกล้หมด`/`หมด`), "สินค้าใกล้หมด" stat card updates live, edit form
   correctly prefills and round-trips the threshold, filter toggle correctly narrows the table to
   only `low`/`out` products; `/inventory` — new low-stock panel correctly shows only `low`/`out`
   products by default, "แสดงสินค้าทั้งหมด" toggle correctly reveals `เบี้ยแก้` with a "ปกติ" badge,
   the pre-existing movement-history table below rendered unaffected throughout — **0 console errors
   across both pages' entire sessions**
9. Regression: `GET /api/health`, `GET /api/products` (4, unchanged), `GET /api/orders` (1),
   `GET /api/orders/1`, `GET /api/costs/summary`, `GET /api/tax/summary?year=2026`,
   `GET /api/inventory/movements` (4, unchanged) — all **PASS**
10. **Cleanup**: the test product (and the order/inventory-movement rows created to exercise the
    order-deduction regression) were removed via a temporary script after confirming the delete-
    protection correctly blocked a direct `DELETE` first (`409`, `PRODUCT_REFERENCE_TABLES` — matches
    STEP 27.1/21's existing behavior exactly, unrelated to this STEP's own changes); final state
    confirmed byte-identical to pre-STEP-23: 4 products, 1 order, 4 inventory movements

**Defects found**: none.
**Defects fixed**: none needed.
**Files changed**: `src/lib/db.ts` (new column), `src/app/api/products/route.ts` (GET/POST/PATCH
extended), `src/app/products/page.tsx` (form + table + filter), `src/app/inventory/page.tsx` (new
low-stock panel). `PROJECT_STATUS.md` updated with this entry. `PROJECT_CHECKPOINT.md` not touched.
Voice Studio, Video Studio, Social, AI Video, tax/finance logic — none touched.

**STEP 23 STATUS: PASS**

---

## STEP 24 — INITIALIZE GIT + BASELINE COMMIT

Date: 2026-08-31

Scope: version-control setup only — no application/source-code logic, database schema, or
`PROJECT_CHECKPOINT.md` changed. Create the project's first Git repository and one baseline commit
covering everything completed through STEP 23.

**Pre-flight checks (before touching anything)**: `pwd` confirmed `C:\Users\maxim\thai-amulet-ai`;
`git status` → `fatal: not a git repository`; `.git` directory confirmed absent — this was genuinely
the first Git initialization for this project, no prior history existed anywhere.

**`.gitignore` inspected before initializing**: a standard `create-next-app` `.gitignore` already
existed, correctly covering `node_modules`, `.next`, `.env*` (confirmed via `git check-ignore` after
init — `.env` itself is ignored; `.env.example`/`.env.example.*-backup` are also caught by the same
`.env*` pattern, which is safe, just means the template isn't tracked either — left as-is, no source
change needed to fix that), `*.tsbuildinfo`, build output, OS/log noise.

**Gap found and closed (minimum necessary additions only)**: `.gitignore` did **not** cover
`data/thai-amulet.db` (the real business database — real products, orders, transaction history) or
`public/generated/` (52MB / 76 files of runtime-generated media: product photos, AI images/video,
voice audio, and transaction receipt/slip attachments — exactly the kind of "generated/private"
content the task called out). Added exactly two directory rules — `/data/` and `/public/generated/`
— plus one more found during inspection: `/.playwright-mcp/` (3.3MB of this session's own Playwright
test-tool console logs/snapshots, pure testing exhaust with zero source value). All three verified
excluded via `git check-ignore -v` **before** running `git add .`, not after.

**Verified NOT a secret / left alone**: `check-openai-models.mjs` and the other root-level
`check-*.cjs`/`test-content-save.cjs` debug scripts were inspected line-by-line — `.mjs`/`.cjs`
scripts read `OPENAI_API_KEY` from `.env` at runtime, none hardcode a key; `.env.example`'s
`OPENAI_API_KEY=` line confirmed empty (genuine template, no real value) via direct inspection.

**Observation, not acted on** (outside this STEP's minimum-necessary-for-secrets scope, flagged for
the user to decide): `.claude/settings.local.json` (a Claude Code tool-permission allowlist — no
secrets in it, verified) and `.claude/launch.json` got committed as-is. `settings.local.json`'s own
naming convention signals "local, not meant to be shared," similar to `.env.local` — worth a
follow-up `.gitignore` entry if the user wants it excluded, but it contains no security-sensitive
data and wasn't in this STEP's explicit remit, so left untouched.

**Staged/committed**: `git add .` → 288 files staged (only CRLF-normalization warnings, no errors);
verified via `git diff --cached --name-only` that nothing under `data/` was staged, `public/` only
contained the 5 default Next.js SVG assets (not `generated/`), and no `.env*` path appeared anywhere
in the staged list. Committed with the exact requested message.

**Not addressed by this STEP (correctly out of scope)**: the repo also contains ~150 `.bak`/
`*-backup-*`/`*.step\d+-backup*` files scattered across `src/` from every prior STEP's file-safety
backups, plus loose root-level test artifacts (`voice-test*.mp3`, `voice-test.json`,
`products_check*.html`-style one-offs from earlier sessions). None are secrets and none block a safe
baseline, so all were committed as-is — the task asked only to protect secrets/large runtime
artifacts and create the baseline, not to clean up repo history; noted here for awareness only.

**Verification**:
- `git status --short` after `.gitignore` update, before `git add` → confirmed no `.env`,
  `data/*.db*`, `public/generated/**`, or `.playwright-mcp/` entries present
- `git check-ignore -v` on `.env`, `data/thai-amulet.db`, `data/thai-amulet.db-wal`, `data/app.db`,
  a sample `public/generated/voice/*.mp3` path, `node_modules`, `.next` → all correctly matched and
  ignored, each against the exact rule that should have caught it
- `git log -1 --oneline` → `fab1f02 STEP 24: Baseline after back-office completion through STEP 23`
- `git status --short` post-commit → empty (clean working tree)

**Defects found**: 1 — the pre-existing `.gitignore` did not protect the real SQLite database or
generated media directory (a real gap; if left unfixed, the first commit would have included live
business data and dozens of megabytes of regenerable media).
**Defects fixed**: 1/1 — closed via the three `.gitignore` additions above, verified before staging.
**Files changed**: `.gitignore` (3 additions). No application/source-code file's logic was modified
by this STEP — every other file in the commit was added to version control as-is, not edited.
**Database changed**: No — `data/thai-amulet.db` was read (for the `git check-ignore` sanity check)
but never staged or modified; STEP 23's live data is untouched and excluded from version control
entirely by design. `PROJECT_CHECKPOINT.md` not touched.

**STEP 24 STATUS: PASS**

---

## STEP 26 — FIX INVENTORY MOVEMENTS PRODUCT REFERENCE (back-office numbering thread)

Date: 2026-08-31 / 2026-09-01

Scope: fix the one Minor finding from the back-office STEP 25 read-only audit (not logged as its
own entry per that audit's own "PROJECT_STATUS.md: NOT UPDATED" instruction) — `inventory_movements`
was missing from `PRODUCT_REFERENCE_TABLES` in `src/app/api/products/route.ts`, so a product-deletion
attempt blocked only by stock-movement history fell back to a generic
`"(ข้อมูลที่เกี่ยวข้อง)"` message instead of naming the real reason.

**Confirmed before editing**: SQLite's `foreign_keys` pragma is `ON` for this app (`PRAGMA
foreign_keys` → `1`) and `inventory_movements` already has a real
`FOREIGN KEY (product_id) REFERENCES products(id)` in `src/lib/db.ts` — so deletion was **always**
correctly blocked at the database level; this was a message-accuracy gap only, never a data-loss
risk. `findProductReferences()` works generically over any table with a `product_id` column via
`SELECT COUNT(*) AS c FROM ${table} WHERE product_id = ?`, so no code-logic change was needed —
only a data entry, following the exact same shape as the existing `transactions` entry (STEP 21).

**Implementation**: added one entry to `PRODUCT_REFERENCE_TABLES`:
`{ table: "inventory_movements", label: "ประวัติการเคลื่อนไหวสต็อก" }`. Nothing else in the file
changed — no schema, no stock/order/finance/tax/attachment logic touched.

**Backup created**: `src/app/api/products/route.ts.step26-backup-20260901-001846`.

**Tested (dev server running locally, real production data used for the delete-protection test per
instructions — no synthetic test rows needed, nothing was ever actually deleted)**:
1. `pnpm.cmd exec tsc --noEmit` → **PASSED**
2. Baseline row counts recorded: `products:4, orders:1, order_items:1, inventory_movements:4,
   transactions:0, transaction_attachments:0`
3. `DELETE /api/products?id=3` (real product เบี้ยแก้, has 3 `ai_cost_ledger` rows + 3
   `inventory_movements` rows, nothing else) → `409`, message now reads
   `"...(ประวัติต้นทุน AI, ประวัติการเคลื่อนไหวสต็อก)..."` — **stock movement history is now named
   correctly**, same `409` status as before the fix — **PASS**
4. `DELETE /api/products?id=4` (real product ตะกรุด, has `order_items` + `content_plans` +
   `ai_cost_ledger` + `inventory_movements`) → `409`, all four reasons listed correctly including the
   new one — **PASS**
5. Row counts re-checked after both delete attempts: **byte-identical to baseline** — `products:4`
   confirmed still present (`เบี้ยแก้` stock still `13`), no row anywhere was touched
6. Regression: `GET /api/health`, `GET /api/products` (4), `GET /api/orders` (1),
   `GET /api/orders/1`, `GET /api/inventory/movements` (4), `GET /api/transactions`,
   `GET /api/tax/summary?year=2026`, `GET /api/costs/summary` — all **PASS**
7. Dev server log reviewed for the full session — only the two expected `409`s and the regression
   `200`s, no unhandled exception

**Git**: `git status` before and after confirmed only `src/app/api/products/route.ts` modified plus
the new backup file (untracked) — no commit, no push, per instructions.

**Defects found**: 0 new (this STEP closes the one already found in the prior audit).
**Defects fixed**: 1/1 — the `PRODUCT_REFERENCE_TABLES` gap.
**Files changed**: `src/app/api/products/route.ts` (one array entry added). `PROJECT_STATUS.md`
updated with this entry. `PROJECT_CHECKPOINT.md` not touched. Database: read-only for this STEP —
zero rows changed anywhere (verified before/after). Video Studio, AI Video, Voice Studio, Social,
video automation — none touched.

**STEP 26 STATUS: PASS**

---

## STEP 27 — NEW ORDER UI FOR REAL SHOP USE

Date: 2026-09-01

Scope: give the shop owner a real way to create an order from the browser — `/orders/new` + a
"➕ สร้างออเดอร์ใหม่" button on `/orders`. Uses the existing `POST /api/orders` →
`createOrder()` pipeline exactly as-is; zero backend logic changed.

**Phase 1 inspection (before writing any UI code)**: confirmed `POST /api/orders`
(`src/app/api/orders/route.ts`) already fully supports multi-item orders (`body.items` array, each
validated independently) and per-item custom sale price; `createOrder()` (`src/lib/orders.ts`) does
order + all items + all stock deductions + all inventory movements in one `db.transaction()`
(atomic — confirmed no partial rows possible). **Customer gap confirmed**: `customers` table and
`createOrder()`'s `customerId` parameter both exist, but `POST /api/orders`'s route handler never
reads `customerId` from the request body at all — so no customer can be attached to an order today
through any interface. Per instructions, did **not** extend the route to add this (would be a
backend change beyond "necessary for the New Order UI") — `/orders/new` has no customer field, and
this is reported here as a known limitation, not built around.

**Implementation**:
- `src/app/orders/new/page.tsx` (new) — product picker per line (shows live current stock in the
  option label + below the select), quantity, sale price (auto-filled from the product's list price
  on selection, freely editable), add/remove line items, live per-line and order-level
  subtotal/total, full client-side validation (empty selection, non-integer/zero/negative quantity,
  quantity over current stock, invalid price) with Thai messages, a `submitting` state that disables
  the confirm button and guards the handler against re-entry (`if (submitting) return`), and a
  Thai-message translation table for the backend's English error strings
  (`"Insufficient stock"` → `"สต็อกสินค้าไม่เพียงพอ..."`, etc.) since the backend intentionally
  wasn't touched. No shipping-fee/discount/channel/payment-method inputs — kept to exactly the 15
  requirements given, backend defaults (`channel:"manual"`, `payment_method:"unknown"`,
  `shippingFee:0`, `discount:0`) apply automatically when omitted, matching existing behavior.
- `src/app/orders/page.tsx` — added the "➕ สร้างออเดอร์ใหม่" button linking to `/orders/new`, next
  to the existing "← กลับหน้าแรก" link. No other line changed.

**Backup created**: `src/app/orders/page.tsx.step27-backup-20260901-002331` (the only existing file
modified; `src/app/orders/new/page.tsx` is new, no backup needed per convention).

**Minor finding, not fixed (out of strict scope)**: client-side stock validation checks each line
item's quantity against the product's stock independently — it does not sum quantities across
multiple line items referencing the *same* product before comparing to stock. If a user split one
product across two rows with a combined quantity exceeding stock, the client would not catch it, but
`createOrder()`'s real atomic transaction still would (each item's `decreaseStockForSale()` reads
current stock sequentially inside the same `db.transaction()`, so the whole order rolls back with
`INSUFFICIENT_STOCK` if it's ever actually exceeded) — a UX polish gap, not a data-safety gap.

**Tested (dev server running locally, zero AI calls, zero external cost, real production data used
carefully and fully restored)**:
1. `pnpm.cmd exec tsc --noEmit` → **PASSED**
2. Baseline recorded: `products:4, orders:1, order_items:1, inventory_movements:4, transactions:0,
   transaction_attachments:0, ai_cost_ledger:10`; product stock snapshot recorded for restore
3. **Browser test (Playwright), full flow A–R**: `/orders` loads (0 console errors) → clicked
   "➕ สร้างออเดอร์ใหม่" → `/orders/new` loads with real products + real stock (0 console errors) →
   validation tests **M** (qty 0), **N** (qty −5), **O** (qty 999 > stock 13), **P** (price −50) all
   correctly blocked client-side with clear Thai messages before ever reaching the API — **PASS**
4. **Valid single-item order**: selected real product เบี้ยแก้ (id 3, stock 13), qty 1, price ฿199
   (auto-filled, confirmed) → subtotal/total showed ฿199.00 correctly (**G/H**) → submitted (**I**)
   → redirected to `/orders/4` (**J**), rendered correctly, 0 console errors — **PASS**
5. **Stock deduction (K)**: product 3 stock `13→12` confirmed directly in DB — **PASS**
6. **Inventory movement (L)**: new `inventory_movements` row confirmed —
   `movement_type:'sale', quantity_change:-1, reference_type:'order', reference_id:4` — **PASS**
7. **Multi-item order (R)**: built a 2-line order (both referencing product 3, prices ฿199 and ฿150
   — a real 2-entry `items` array through the full UI→API path) → subtotal correctly summed to
   ฿349.00 → **double-submit test (Q)** fired two near-simultaneous clicks on the confirm button;
   Playwright's own retry log shows the button became disabled and the page navigated away before
   the second click could land — DB confirmed **exactly one** new order (`id 5, total 349`), not two
   — **PASS** for both R and Q. Order 5 verified with 2 correct `order_items` rows (different prices
   preserved), stock correctly deducted twice sequentially (`12→11→10`), 2 separate
   `inventory_movements` rows — **PASS**
8. Regression: `GET /api/health`, `GET /api/products` (4), `GET /api/orders` (3 during testing),
   `GET /api/orders/1` (real order, confirmed byte-identical: `TEST-36-12F-5B-...`, total `299`,
   untouched throughout), `GET /api/inventory/movements`, `GET /api/transactions`,
   `GET /api/tax/summary?year=2026`, `GET /api/costs/summary` — all **PASS**
9. Dev server log reviewed for the full session — no unhandled exception
10. **Cleanup**: test orders 4 and 5 + their `order_items` (3 rows) + their `inventory_movements` (3
    rows) deleted; product 3 stock explicitly restored `10→13`; final row counts confirmed
    byte-identical to baseline (`products:4, orders:1, order_items:1, inventory_movements:4,
    transactions:0, transaction_attachments:0, ai_cost_ledger:10`); real order id 1 re-verified
    completely untouched (`order_number`/`total` unchanged) — real order id 1 was never at risk since
    only ids 4/5 (the test orders themselves) were ever touched

**Security**: `POST /api/orders` (and every other back-office endpoint) has **no authentication or
authorization** — confirmed unchanged from the STEP 25 audit finding (no `src/middleware.ts`, no
session/auth code anywhere in `src/`). Not addressed here per explicit instruction — logged as a
**STEP 29 dependency**, not built in this STEP.

**Git**: `git status` checked before and after — only `src/app/orders/page.tsx` (modified),
`src/app/orders/new/` (new), and the one backup file changed/added this STEP (plus STEP 26's
still-uncommitted `src/app/api/products/route.ts`/`PROJECT_STATUS.md`, untouched again here). No
commit, no push.

**Defects found**: 1 Minor (the same-product-multi-row client-validation gap above).
**Defects fixed**: 0 (out of strict scope — reported, not fixed, per instructions to STOP and report
rather than fix anything beyond the New Order UI).
**Files changed**: `src/app/orders/new/page.tsx` (new), `src/app/orders/page.tsx` (one button
added). `PROJECT_STATUS.md` updated with this entry. `PROJECT_CHECKPOINT.md` not touched. Database
schema: unchanged. `createOrder()`/stock-deduction logic: unchanged. Video Studio, AI Video, Voice
Studio, Social, Tax, Finance, Attachments — none touched.

**STEP 27 STATUS: PASS**

---

## LIVE SMOKE TEST — /orders/new (post STEP 27)

Date: 2026-09-01

Scope: live smoke test of `/orders/new` against the running dev server. Not a numbered STEP — no
source code changed, no database schema changed.

**Results**:
- `/orders/new` UI: **PASS**
- Order creation through `POST /api/orders`: **PASS**
- Stock deduction: product 3 เบี้ยแก้, `13 → 12`: **PASS**
- Inventory movement: `sale`, `-1`, `reference_type=order`, `reference_id=6`: **PASS**
- Order detail (`/orders/6`): **PASS**
- Browser console errors: **0**
- Cleanup: **PASS** — test order/item/movement removed, stock restored to `13`
- Final database counts matched baseline: `products:4, orders:1, order_items:1,
  inventory_movements:4, transactions:0, transaction_attachments:0`

**Files changed**: none.
**Dev server**: remained running at `http://localhost:3000` throughout and after this test.

**RESULT: PASS**

---

## STEP 28 — AUTHENTICATION / BACK-OFFICE ACCESS CONTROL

Date: 2026-09-01

Scope: close the STEP 25 Blocking finding — no auth existed anywhere. Minimal single-admin
authentication gate for the 5 back-office pages and their APIs, per instructions: environment-based
credential, no new database table, no new dependency.

**Audit before implementing**: `package.json` has zero auth-related dependencies (no next-auth, no
iron-session, no jose, no bcrypt). No `middleware.ts`/`proxy.ts` existed. Critically, checked
`node_modules/next/dist/docs/` per `AGENTS.md`'s standing instruction and found this Next.js version
(16.3.2) **deprecated and renamed `middleware.ts` to `proxy.ts`** (different file name, different
export name `proxy` instead of `middleware`) — would have silently built a non-functional gate
otherwise. Also confirmed via the same docs that **Proxy defaults to the Node.js runtime** in this
version (not Edge), which is why `src/lib/auth.ts` can safely use Node's built-in `crypto` module —
no signing library needed.

**Approach**: `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars (checked with `crypto.timingSafeEqual`,
padded-length comparison to avoid a length-based timing signal) issue a `SESSION_SECRET`-HMAC-signed,
expiring session token (`base64url(payload).base64url(hmacSha256(payload))`) stored in an `HttpOnly`,
`SameSite=Lax` cookie (`Secure` only when `NODE_ENV=production`), 12-hour expiry. No password is ever
stored in the database, logged, or returned in any response. `src/proxy.ts` checks a **precise
allowlist in code** (not solely the declarative `matcher`, since this version's own matcher docs
note a bare path like `/about` also matches `/about/team` — wrong for our case) for exactly:
`/products`, `/inventory`, `/orders(+sub-paths)`, `/finance`, `/tax` (pages) and
`/api/products` (exact — list/create/edit/delete only), `/api/products/:id/stock-adjustment`
(regex, real inventory logic), `/api/orders(+sub-paths)`, `/api/inventory/*`,
`/api/transactions(+sub-paths, covers attachments)`, `/api/tax/*` (APIs) — redirecting unauthenticated
page requests to `/login?next=<path>` and returning a clean `401 {"success":false,"error":"Unauthorized"}`
for unauthenticated API requests. `/api/health` and `/api/costs*`/`/costs` deliberately left
unprotected (monitoring + not in the required scope). `/api/products/[id]/media`,
`/api/products/[id]/ai-video/*`, and everything Video/Voice/Social/Content-Studio-related are
untouched and confirmed to still work unauthenticated — verified live, not just by omission.

**New files**: `src/lib/auth.ts` (session/credential logic), `src/proxy.ts` (the gate),
`src/app/login/page.tsx` (public), `src/app/api/auth/login/route.ts`,
`src/app/api/auth/logout/route.ts` (both public), `src/components/LogoutButton.tsx` (shared).

**Modified**: the 5 protected pages (`products`, `inventory`, `orders`, `finance`, `tax`) each got
one import line + one `<LogoutButton />` placed next to their existing header link — no other logic
touched. `.env.example` — added `ADMIN_USERNAME`/`ADMIN_PASSWORD`/`SESSION_SECRET` as **empty
placeholders only**, with a comment on how to generate a real `SESSION_SECRET`. Local `.env` (never
committed, confirmed still `.gitignore`d) — set to **temporary generated test values**
(`ADMIN_USERNAME=admin`, a random 12-character password, a random 32-byte hex `SESSION_SECRET`) so
this STEP's tests could run against real credentials; **these must be changed to values of your own
choosing before relying on this for real protection** — communicated directly in this session, not
committed anywhere.

**Backups created** (before editing, timestamped per convention):
`.env.example.step28-backup-20260901-011916`,
`src/app/products/page.tsx.step28-backup-20260901-011916`,
`src/app/inventory/page.tsx.step28-backup-20260901-011916`,
`src/app/orders/page.tsx.step28-backup-20260901-011916`,
`src/app/finance/page.tsx.step28-backup-20260901-011916`,
`src/app/tax/page.tsx.step28-backup-20260901-011916`.

**Tested (dev server restarted fresh — `.env` changes require a restart — with `.next` cleared
proactively; zero AI calls, zero external cost)**:
1. `pnpm.cmd exec tsc --noEmit` → **PASSED**
2. **Unauthenticated API** (curl, no cookie): `/api/products`, `/api/orders`, `/api/orders/1`,
   `/api/inventory/movements`, `/api/transactions`, `/api/tax/summary` → all `401`, clean
   `{"success":false,"error":"Unauthorized"}` body, no leak — **PASS**. `/api/health`,
   `/api/costs/summary` → both `200`, unaffected — **PASS**
3. **Scope precision verified live**: `/api/products/3/media` → `200` unauthenticated (correctly
   untouched, video/AI-adjacent); `/api/products/3/stock-adjustment` → `401` unauthenticated
   (correctly protected, real inventory logic) — **PASS**
4. **Unauthenticated pages**: `/products`, `/inventory`, `/orders`, `/orders/new`, `/finance`,
   `/tax` → all `307` redirect to `/login?next=<original path>` — **PASS**
5. **Login failure**: wrong password → `401`, generic message; wrong username → identical `401`
   message (no field-level leak); missing fields → `400` — **PASS**
6. **Login success**: correct credentials → `200`, `Set-Cookie` confirmed `HttpOnly`,
   `SameSite=lax`, `Max-Age=43200`, no `Secure` flag in dev (correct — dev runs on plain HTTP) —
   **PASS**
7. **Forged/tampered cookie**: random garbage and a valid-shape-but-wrong-signature cookie → both
   `401` — **PASS**
8. **Authenticated** (curl with real session cookie): all 8 regression endpoints → `200` — **PASS**;
   all 6 protected pages → `200` — **PASS**
9. **Browser (Playwright), full real flow**: direct nav to `/finance` while logged out → redirected
   to `/login?next=%2Ffinance` (0 console errors) → entered wrong password → clean Thai error shown
   inline, stayed on login (the only console entry across the whole session was the browser's own
   native "401 resource" network log line for that intentional failed attempt — not an app error) →
   entered correct password → **redirected to `/finance`, the originally-requested page** →
   page rendered fully (income/expense form, product/order dropdowns loaded from the now-authenticated
   API calls) → **direct navigation reload to `/finance`** stayed on `/finance` (session persisted,
   0 console errors) → navigated to `/orders` while authenticated → loaded correctly, logout button
   present → **clicked "🚪 ออกจากระบบ"** → redirected to `/login` (0 console errors) → navigated to
   `/products` → correctly redirected to `/login?next=%2Fproducts` again — **PASS**, full login →
   use → logout → re-block cycle confirmed end-to-end in a real browser
10. Dev server log reviewed for the whole session — no unhandled exception
11. **Database**: row counts identical before/after (`products:4, orders:1, order_items:1,
    inventory_movements:4, transactions:0, transaction_attachments:0`) — confirmed **not changed**,
    as expected (no schema touched, no data-writing test needed for an auth-only STEP)

**Defects found**: none.
**Defects fixed**: the STEP 25 Blocking finding itself (no auth anywhere) — closed.
**Files changed**: see New/Modified above. `PROJECT_STATUS.md` updated with this entry.
`PROJECT_CHECKPOINT.md` not touched. Video Studio, AI Video, Voice Studio, Social, Content Studio,
Tax/Finance *calculation* logic, product/order *business* logic — all untouched and confirmed still
working exactly as before (unauthenticated, unchanged) via live tests above.

**No STEP 29 was started.** No commit, no push, per instructions.

**STEP 28 STATUS: PASS**

---

## STEP 29 — AI SLIP / RECEIPT EXTRACTION

Date: 2026-09-01

Scope: AI-assisted financial document workflow on the Finance page — upload a slip/receipt image,
AI extracts structured suggestions, user reviews/edits, user explicitly confirms, only then is a
transaction created. AI result is a suggestion only; it can never silently create a transaction.

**Audit before implementing**: read `src/lib/transactions.ts` (STEP 20 CRUD + STEP 19 enum
constants), `src/lib/transactionAttachments.ts` and `src/app/api/transactions/[id]/attachments/route.ts`
(STEP 21 — magic-byte-validated image upload pattern), `src/lib/auth.ts` + `src/proxy.ts` (STEP 28 —
confirmed `/api/transactions` and every `/api/transactions/*` prefix is already protected, so this
new route needed **zero `proxy.ts` changes**), `src/lib/costLedger.ts` + `src/lib/costConfig.ts`
(STEP 21/23 — two-phase ledger pattern, `gpt-5-mini` text pricing already configured), and
`src/app/api/content/generate/route.ts` (existing `openai.responses.create({model:"gpt-5-mini", input})`
call pattern). Confirmed via `developers.openai.com/api/docs/models/gpt-5-mini` (checked 2026-09-01)
that **gpt-5-mini supports image input** (input modalities: text, image) — so the existing text model
already in use is vision-capable; **no new AI provider/model was installed**. Confirmed via the
installed `openai@7.5.0` SDK types (`resources/responses/responses.d.ts`) that the Responses API
accepts a multimodal `input: [{role:"user", content:[{type:"input_text",...},{type:"input_image",...}]}]`
shape. **No database schema change was needed or made** — every extracted field either maps directly
to an existing `transactions` column or (for `payerName`/`recipientName`/`referenceNumber`, which have
no dedicated columns) is folded into the existing free-text `notes` column at confirm time.

**Approach**: new `POST /api/transactions/ai-extract` (multipart image upload) — validates the image
with the exact magic-byte/extension/MIME-cross-check pattern copied from the STEP 21 attachments
route (fail-closed, 10MB limit), saves the original to a **new, separate**
`public/generated/ai-slip-previews/` directory (deliberately not `transaction-attachments/`, which
must stay 1:1 with confirmed `transaction_attachments` rows — a slip the user never confirms must not
pollute it), then calls `gpt-5-mini` via the Responses API with the image as `input_image` and a
prompt that explicitly forbids inventing data, forbids any VAT/tax/legal computation, and asks for a
strict JSON shape (`documentType`, `transactionType`, `transactionDate`, `amount`, `payerName`,
`recipientName`, `bankOrProvider`, `referenceNumber`, `description`, `suggestedCategory`,
`suggestedSalesChannel`, `confidence`, `fieldsNeedingReview`). **Every field is independently
re-validated server-side as untrusted input** against the same enums the rest of the app already
enforces (`isValidTransactionType`/`isValidTransactionCategory`/`isValidSalesChannel` from
`src/lib/transactions.ts`, a fixed 7-value `documentType` allowlist, `amount > 0`, `Date.parse`-able
date, `confidence` in `[0,1]`) — anything invalid/unrecognized is nulled and added to
`fieldsNeedingReview` rather than trusted or guessed. The route **never creates a transaction** — it
only returns the preview image URL and the validated suggestion. Cost tracking reuses the STEP 21
`ai_cost_ledger` two-phase pattern with the existing `text_generate` operation (no new operation/enum
needed — image-input token usage is just counted as input tokens by the Responses API `usage` field,
same cost formula as pure-text `gpt-5-mini` calls) and `metadata.feature="ai_slip_extract"` for
traceability. If the AI call or JSON parse fails, the route still returns `success:true` with
`extraction:null` and a generic Thai error — **the saved evidence image is never lost or deleted**
just because extraction failed, and the user can fill the form manually. Raw OpenAI errors/stack
traces are never returned to the client (caught, logged server-side by message only).

Finance page (`src/app/finance/page.tsx`) got a new "📷 อ่านสลิป/บิลด้วย AI" section above the existing
manual add form (untouched): file input → loading state → image preview + confidence/review banner →
a **read-only summary view by default** (forces a deliberate "แก้ไข" click to edit — human-review-
safety by default) that switches to a fully editable form (all fields, including
payer/recipient/bank/reference-number, which get combined into `notes` only at submit time) →
"ยกเลิก" / "ยืนยันและบันทึก". Confirming calls the **existing, unmodified `POST /api/transactions`**
(no duplicated transaction-creation logic) and, on success, re-submits the *same* `File` object the
user originally picked to the **existing, unmodified `POST /api/transactions/[id]/attachments`**
endpoint to attach the real evidence copy — no new attachment-linking mechanism, no duplicate
attachment system. The confirm button is disabled for the whole request (`aiConfirming` state) and
becomes permanently unavailable the instant one save succeeds (the whole AI section resets), which is
what prevents a double-click from creating two transactions — same guard pattern already used by the
manual form's `saving` state and the delete button's `deletingId` state elsewhere on this page.

**New files**: `src/app/api/transactions/ai-extract/route.ts`.
**Modified**: `src/app/finance/page.tsx` (new AI section + supporting state/handlers only — the
manual add/edit form and the attachments UI from STEP 20/21 are untouched).
**Backup created**: `src/app/finance/page.tsx.step29-backup-20260901-131548`.

**Tested (dev server, real browser via chrome-devtools MCP, real `gpt-5-mini` call — real minor
OpenAI cost incurred, see below; a synthetic test slip image was rendered from HTML and screenshotted
since no real slip photo was available)**:
1. `pnpm.cmd exec tsc --noEmit` → **PASSED**. `pnpm.cmd run build` → **compiled successfully**,
   `/api/transactions/ai-extract` present in the route list as a server function.
2. **Unauthenticated**: `POST /api/transactions/ai-extract` (curl, no cookie) → `401
   {"success":false,"error":"Unauthorized"}` — **PASS** (via the existing `/api/transactions/*`
   `proxy.ts` prefix rule, unchanged). `GET /finance` unauthenticated → `307` to `/login` — **PASS**.
3. **Authenticated extraction, real image**: uploaded a synthetic Kasikorn-style transfer slip PNG
   (bank name, Thai/English labels, sender, recipient, amount 1,250.00 THB, date 15/03/2026, ref
   number) → AI correctly extracted `documentType:"customer_payment_slip"`, `transactionType:"income"`,
   `transactionDate:"2026-03-15"` (correctly parsed DD/MM/YYYY), `amount:1250`, `payerName`,
   `recipientName`, `bankOrProvider:"KASIKORN BANK"`, `referenceNumber`, `description`,
   `confidence:0.9` — **PASS**. `suggestedCategory`/`suggestedSalesChannel` were correctly rejected by
   server-side validation (AI's raw guess didn't match the app's fixed enums) and correctly surfaced
   in `fieldsNeedingReview` rather than silently accepted — untrusted-AI-output handling confirmed
   working as designed.
4. **Invalid file type** (a `.png`-named file containing plain text): rejected `400`, no file written
   to disk — **PASS**.
5. **Oversized file** (11MB): rejected `400` before reaching the app's own 10MB check — traced to
   this Next.js version's **`proxyClientMaxBodySize` (default 10MB, experimental)**, which buffers
   the whole request body when `proxy.ts` is active and truncates anything over the limit, which then
   fails multipart parsing (`request.formData()` throws) before this route's own explicit size check
   ever runs (see `node_modules/next/dist/docs/.../proxyClientMaxBodySize.md`). Net effect is still a
   clean `400` rejection either way (fail-closed, no partial file ever written) — same platform
   behavior already applies to the existing STEP 21 attachments route (also behind `proxy.ts`), not
   something introduced by this STEP. Documented here rather than changed, since raising the limit
   would be an auth-infrastructure-adjacent change outside this STEP's scope. No file was written to
   disk for this rejected upload — confirmed.
6. **No automatic transaction creation**: confirmed `transactions` row count stayed `0` after
   extraction returned (before confirm) — **PASS**.
7. **Edit mode**: clicked "แก้ไข", changed `amount` from `1250` to `1275.50`, all other fields
   editable and pre-filled correctly — **PASS**.
8. **Confirm creates exactly one transaction**: clicked "ยืนยันและบันทึก" → exactly one `transactions`
   row created (`id=23`, `amount:1275.5` — the edited value, `category:"PRODUCT_SALE"`,
   `payment_method:"KASIKORN BANK"`, `notes:"ผู้โอน: ... | ผู้รับ: ... | เลขอ้างอิง: ..."` — confirming
   payer/recipient/reference were correctly folded into `notes` without any schema change) and exactly
   one `transaction_attachments` row, both via the pre-existing unmodified endpoints — **PASS**.
9. **Original evidence remains available**: the confirmed transaction's "📎 ไฟล์แนบ (1)" panel showed
   the real slip image, viewable/openable — **PASS**.
10. **Cost ledger**: one new `ai_cost_ledger` row, `operation:"text_generate"`, `model:"gpt-5-mini"`,
    `status:"succeeded"`, `input_units:1204`, `output_units:716`,
    `estimated_cost:0.001733` (= 1204/1000×$0.00025 + 716/1000×$0.002, matches the STEP 23 pricing
    formula exactly) — **PASS**. Real-world cost for one slip extraction with `gpt-5-mini`: roughly
    **$0.0015–0.002 per extraction** at this image size/prompt length (exact image-tokenization cost
    is OpenAI-internal and not independently verifiable from this repo, consistent with STEP 21's
    "never invent a price" rule — this is an *observed* estimated-cost figure from a real test call,
    not a published rate).
11. **Regression** (authenticated, browser): `/products`, `/orders`, `/inventory`, `/tax`, `/costs`
    → all `200`, zero console errors. `/`, `/api/health` → `200`. `/video-studio`, `/voice-studio`,
    `/content-studio` → still `200` **unauthenticated** (untouched, as required). Existing manual
    Finance add/edit/delete form and existing attachment upload/delete (STEP 20/21) re-exercised live
    during this same test session — both still work.
12. **Browser console**: zero real application errors across the whole session (the only entries were
    the two expected `400`s from the invalid-type/oversized negative tests above).
13. **No secrets in client bundle**: `pnpm.cmd run build` output searched — `OPENAI_API_KEY` (the env
    var *name*) appears only inside pre-existing STEP-14-era Video Studio error-message strings
    (`"ยังไม่ได้ตั้งค่า OPENAI_API_KEY"`), unrelated to this STEP; the actual key **value** does not
    appear anywhere in `.next/static` — **PASS**.
14. **Database safety**: baseline recorded before testing
    (`products:4, orders:1, order_items:1, inventory_movements:4, transactions:0,
    transaction_attachments:0, ai_cost_ledger:10`). After testing, the one test transaction, its one
    attachment (DB row + disk file, via the real DELETE endpoint), the one test `ai_cost_ledger` row,
    and the orphaned `ai-slip-previews/` preview file were all removed — **all counts confirmed back
    to baseline exactly**, including `ai_cost_ledger:10`.

**Defects found**: none in the new code. One incidental slip during testing — a pre-existing tracked
utility script (`check-db.cjs`, committed in STEP 24) was overwritten and then deleted while building
an ad-hoc row-count checker for this STEP's before/after verification; caught before finishing and
restored via `git checkout -- check-db.cjs` (confirmed clean, matches HEAD). No user work was lost.
**Files changed**: see New/Modified above. `PROJECT_STATUS.md` updated with this entry.
Video Studio, AI Video, Voice Studio, Social, Content Studio — all untouched, confirmed still working
unauthenticated exactly as before.

**No STEP 30 was started.** No commit, no push, per instructions.

**STEP 29 STATUS: PASS**

---

## STEP 30 — DATABASE & EVIDENCE BACKUP / RECOVERY

Date: 2026-09-01

Scope: a read-only-audited-first back-office readiness gap (identified in this same session's
pre-STEP-30 audit) — `data/thai-amulet.db` and `public/generated/` (transaction slip/receipt
evidence, product photos, AI media) had **no backup mechanism at all**, and both are intentionally
`.gitignore`'d, so git provided zero protection either. This STEP closes that gap only — no other
back-office behavior touched, no video/voice/content-studio code touched.

**Audit before implementing**: confirmed via `src/lib/db.ts` that the DB path is
`path.join(process.cwd(), "data", "thai-amulet.db")` and runs in **WAL mode**
(`db.pragma("journal_mode = WAL")`) — confirmed live by the presence of `.db-shm`/`.db-wal` files
next to it. This matters because a plain file copy of a WAL-mode database can miss recent writes
still sitting in the `-wal` file or capture a torn/inconsistent snapshot if anything is writing
concurrently — a blind `cp` was explicitly ruled out for this reason. Checked `package.json` /
`scripts/` / full source search: no existing backup mechanism anywhere. Checked
`node_modules/.pnpm/@types+better-sqlite3@9.6.0` and confirmed `better-sqlite3` (already a project
dependency, no new one added) ships a native `Database#backup(destinationFile)` method implementing
SQLite's official **Online Backup API** — explicitly designed to produce a complete, consistent
snapshot even while another process/connection is actively writing to the source database. Checked
`public/generated/` — 6 subdirectories (`ai-images`, `ai-video`, `product-media`,
`transaction-attachments`, `video`, `voice`); all are runtime-written business/user content, none is
source, so the whole tree is backed up (not just `transaction-attachments`). Followed the existing
`docs/SOCIAL_WORKER.md` documentation convention and `scripts/run-social-worker.ts` /
`"social:worker": "tsx ..."` one-shot-CLI-script convention for consistency.

**Approach**: `scripts/backup.ts` (new, run via `pnpm backup`) —
1. Refuses to run (exit 1) if `BACKUP_DIR` resolves inside the project repository.
2. Records table row counts from the **live** database via the existing `@/lib/db` singleton
   connection (same WAL-configured connection the app itself would use).
3. Calls `db.backup(destinationFile)` to produce a consistent SQLite snapshot — not a raw file copy.
4. Copies `data/app.db` (a pre-existing, unused, 0-byte stray file noted in this session's earlier
   audit) verbatim for completeness.
5. Recursively copies the entire `public/generated/` tree with its own file-counting walker (Node
   built-in `fs`/`fs/promises` only — no archive library added, since none was needed or installed).
6. **Verifies** the backup by opening the freshly-written backup `.db` file read-only and
   re-counting the same tables — any table-count difference from step 2 is logged as an informational
   note (expected if a real write happened during the backup window — the Online Backup API still
   guarantees a consistent snapshot regardless) rather than a hard failure, but a backup file that
   **fails to open at all** does hard-fail the script (non-zero exit).
7. Defense-in-depth: walks the finished backup output and hard-fails if any file named `.env`/
   `.env.local`/`.env.production`/`.env.development` is found anywhere in it — belt-and-suspenders on
   top of the fact that the script never reads the project root or any dotfile by construction (it
   only ever touches `data/thai-amulet.db`, `data/app.db`, and `public/generated/**`).
8. Writes `manifest.json` into the backup folder (table counts at start + verified, count
   mismatches if any, evidence file count/bytes, timestamps) and prints the same summary to stdout.
9. Exit code `0` on success, `1` on any failure, with a clear message either way — no raw stack
   traces, no secrets logged.

**Backup destination**: `C:\Users\maxim\thai-amulet-backups` (outside the repository — this exact
path was already suggested in the STEP 30 instructions and fits this single-machine Windows setup;
no reason found to deviate from it). Overridable via the new optional `BACKUP_DIR` env var, documented
in `.env.example` with a comment. `git check-ignore`/`git ls-files` against this path from inside the
repo confirms it is **entirely outside** the repository (git refuses to even evaluate it — "outside
repository" error), not merely `.gitignore`'d.

**New files**: `scripts/backup.ts`, `docs/BACKUP_AND_RECOVERY.md` (full recovery procedure — identify
a backup, stop the app, rescue-copy the current DB before overwriting anything, restore DB, restore
evidence files, verify the restored DB's row counts against the backup's `manifest.json` *before*
restarting the app, restart, verify the running app — plus a documented-only, not-yet-created Windows
Task Scheduler example for future nightly automation, matching the `docs/SOCIAL_WORKER.md` pattern
exactly per instructions not to auto-create a scheduled task in this STEP).
**Modified**: `package.json` (added `"backup": "tsx scripts/backup.ts"`, same convention as
`"social:worker"`), `.env.example` (added optional `BACKUP_DIR=` with an explanatory comment — no
real value, consistent with every other var in that file).
**No dependencies added.** `pnpm-lock.yaml` untouched.

**Tested (real backup run against the live database, plus a non-destructive recovery dry-run)**:
1. `pnpm.cmd exec tsc --noEmit` → **PASSED** (checked before and after all edits).
2. Baseline row counts recorded via a temporary readonly-mode `.cjs` script (deleted immediately
   after use, per this project's established convention — `check-db.cjs` itself was left untouched
   this time, unlike an earlier session's mistake):
   `products:4, orders:1, order_items:1, inventory_movements:4, transactions:0,
   transaction_attachments:0, customers:0, ai_cost_ledger:10`.
3. `pnpm backup` → **exit code 0**, real backup created at
   `C:\Users\maxim\thai-amulet-backups\backup-20260901-140539\` — printed table counts matched the
   baseline exactly, `76` evidence files backed up (`53,466,745` bytes), zero count mismatches
   reported (no concurrent writes occurred during the backup window).
4. **Backup DB opens and reads correctly**: `manifest.json`'s `tableCountsVerifiedInBackupCopy`
   matches `tableCountsAtBackupStart` exactly for all 8 tables — **PASS**.
5. **Production database unchanged**: re-ran the same readonly row-count check against the live
   `data/thai-amulet.db` immediately after the backup completed — identical to the baseline in step 2
   — **PASS**, confirming the backup process is fully read-only against production.
6. **No secrets in backup output**: `find` across the entire backup tree for
   `.env*`/`*.bak`/`*secret*`/`*credential*` → **zero matches** — **PASS**.
7. **Backup location confirmed outside git**: `git check-ignore`/any git command against the backup
   path from inside the repo errors with "outside repository" — **PASS**, stronger guarantee than a
   `.gitignore` rule (this path is never even reachable by any git operation from this repo).
8. **Non-destructive recovery dry-run**: copied the backup's `db/` and `generated/` folders into an
   isolated temp directory (outside both the repo and the real backup folder — never touched
   `data/thai-amulet.db` or `public/generated/` at any point), opened the restored `.db` file
   read-only from that temp path, and re-ran the same 8-table count query — **identical to
   production** — **PASS**. Confirmed all `76` evidence files present in the restored copy, spot-checked
   `product-media/` files by name — **PASS**. Temp directory deleted after verification.
9. The real backup created in step 3 was **kept** (not deleted) — it is a legitimate first real
   backup of production data, not test pollution, and directly satisfies this STEP's goal.

**Defects found**: none. One incidental observation, not a defect: opening the backup `.db` file for
the verify step (step 4 above) causes SQLite to create empty `-shm`/`0-byte -wal` companion files
next to it in the backup folder — harmless (the backup `.db` file itself is a complete, consistent
snapshot on its own via the Online Backup API; these companions carry no pending data), documented in
`docs/BACKUP_AND_RECOVERY.md` so a future restore isn't confused by their presence.

**Database safety**: no schema change, no test business data inserted, no production rows
modified/deleted, no stock changes, no transaction/attachment changes — every verification above was
either a `SELECT COUNT(*)` against the live DB or a read against a copy sitting outside both the repo
and the live `data/` directory.

**Files changed**: see New/Modified above. `PROJECT_STATUS.md` updated with this entry.
`PROJECT_CHECKPOINT.md` not touched, per instructions. Video Studio, AI Video, Voice Studio, Social,
Content Studio — not touched at all in this STEP (this STEP's `public/generated/` backup covers their
output directories too, since that's what the requirements specified, but no *code* for any of those
features was read, modified, or executed).

**Git**: nothing committed, nothing pushed, per instructions — `scripts/backup.ts`,
`docs/BACKUP_AND_RECOVERY.md` remain untracked and `package.json`/`.env.example`/this file remain
modified-but-unstaged in the working tree, exactly as the STEP 28/29 pattern left prior work before
its own explicit commit step.

**No STEP 31 was started.**

**STEP 30 STATUS: PASS**

---

## STEP 31 — AUTOMATIC ORDER → INCOME TRANSACTION LINK

Date: 2026-09-01

Scope: closes the "Orders and Transactions/Tax are disconnected ledgers" BLOCKING gap identified in
this session's earlier back-office readiness audit — a sale recorded via "New Order" previously never
appeared in Finance/Tax unless someone *also* manually created a matching income transaction. Every
successfully created order now automatically creates exactly one linked income transaction, in the
same atomic operation as the order itself.

**Audit before implementing**: confirmed `createOrder()` (`src/lib/orders.ts`) already runs entirely
inside a single `db.transaction(() => {...})()` callback (order insert → per-item stock deduction via
`decreaseStockForSale()`/`adjustProductStock()` → `order_items` inserts), and that better-sqlite3
auto-rolls-back the whole callback on any thrown error — this is the safest and only place to add the
income transaction, since it gets atomicity for free rather than needing a new transaction wrapper.
Confirmed `createTransaction()` (`src/lib/transactions.ts`) never opens its own `db.transaction()` —
it only issues plain `db.prepare().run()` calls on the shared connection — so calling it from inside
`createOrder()`'s callback correctly participates in the same atomic unit; specifically confirmed its
internal `assertOrderExists(orderId)` (`SELECT id FROM orders WHERE id = ?`) successfully sees the
just-inserted, still-uncommitted order row, since both run on the same connection before commit.
Confirmed two data-integrity traps that would have broken things if not handled: (1)
`src/app/orders/new/page.tsx` never sends a `channel` at all, so `POST /api/orders` always defaults it
to the free-text `"manual"` — which is **not** a valid `transactions.sales_channel` enum value
(`facebook/tiktok_shop/shopee/lazada/line/walk_in/other`); passing it straight through would have
thrown `INVALID_SALES_CHANNEL` and rolled back every single order. (2) `createOrder()` has always
allowed a `total === 0` order (only `total < 0` is rejected), but `createTransaction()` requires
`amount > 0` — would have turned every legitimate free/fully-discounted order into a hard failure.
Confirmed `submitOrder()` in `orders/new/page.tsx` already guards double-clicks via a `submitting`
state (pre-existing, STEP 27), and `orders.order_number` already has a `UNIQUE` constraint enforced
server-side — together these already prevent a genuine duplicate order (and therefore a duplicate
income transaction) without any new schema/index. **No database schema change was made or found
necessary.**

**Approach** (`src/lib/orders.ts`): after the `order_items` insert loop, still inside the same
`db.transaction()` callback, if `total > 0`:
```
createTransaction({
  transactionType: "income",
  amount: total,                          // server-computed subtotal + shippingFee - discount —
                                            // never a client-submitted figure; using `total` (not
                                            // `subtotal`) means shipping revenue is counted exactly
                                            // once, never double-counted
  transactionDate: <today, ISO date>,
  category: "PRODUCT_SALE",                // existing INCOME_CATEGORIES value, no new enum added
  description: `รายรับจากออเดอร์ ${orderNumber}`,
  salesChannel: mapOrderChannelToSalesChannel(input.channel),  // new small helper — the order's
                                            // channel only if it's a recognized SalesChannel value,
                                            // else null (never invents/coerces an invalid value)
  productId: null,                         // orders can have multiple line items; transactions.
                                            // product_id is a single nullable FK with no meaningful
                                            // multi-item representation — left null uniformly
                                            // (not just for multi-item orders) so behavior doesn't
                                            // silently differ by item count; orderId already gives
                                            // full traceability via order_items
  orderId,
  paymentMethod: input.paymentMethod ?? null,
  notes: `สร้างอัตโนมัติจากออเดอร์ ${orderNumber} (STEP 31)`,
});
```
`total === 0` orders skip this block entirely (not an error) — preserves the pre-existing
zero-total-order behavior exactly instead of turning it into a new failure mode.

Two small, read-only-adjacent additions to make the new link visible without redesigning anything:
- `GET /api/orders/[id]` (`src/app/api/orders/[id]/route.ts`) — added one extra `SELECT id FROM
  transactions WHERE order_id = ? AND transaction_type = 'income' LIMIT 1` and returns it as
  `linkedIncomeTransactionId: number | null`. Pure read addition, no existing field changed.
- `src/app/orders/[id]/page.tsx` — small badge next to the existing status pill: "✅ บันทึกรายรับแล้ว
  (#id)" or "ยังไม่มีรายรับที่บันทึกไว้" (the latter is what every pre-STEP-31 order, including
  historical order id 1, shows — intentionally not backfilled per instructions).
- `src/app/finance/page.tsx` — small "🔗 ออเดอร์ #N" badge next to the description cell whenever a
  transaction row has `orderId` set. Deliberately generic (any order-linked transaction, not just
  auto-generated ones) rather than parsing `notes` text to detect "auto-generated" specifically —
  a manually-entered transaction someone links to an order via the existing "ออเดอร์ที่เกี่ยวข้อง"
  dropdown is just as legitimately "order-linked," and the badge conveys exactly that either way.

`POST /api/orders` (`src/app/api/orders/route.ts`) was **not modified at all** — since the new logic
lives entirely inside `createOrder()`, the route's request/response shape is byte-for-byte unchanged,
which is what "preserve existing STEP 27 order behavior" required.

**New files**: none. **Modified**: `src/lib/orders.ts`, `src/app/api/orders/[id]/route.ts`,
`src/app/orders/[id]/page.tsx`, `src/app/finance/page.tsx`. **No dependencies added.** **No database
schema change.**
**Backups created**: `src/lib/orders.ts.step31-backup-20260901-143605`,
`src/app/api/orders/[id]/route.ts.step31-backup-20260901-143638`,
`src/app/finance/page.tsx.step31-backup-20260901-143707` (order detail page had no prior STEP-31
backup convention entry since it was untouched before this STEP).

**Tested (real dev server, real browser via chrome-devtools MCP + curl for precise/concurrent
requests; a fresh `pnpm backup` — STEP 30 — was run immediately before testing, per instructions)**:

Baseline recorded: `products:4, orders:1, order_items:1, inventory_movements:4, transactions:0,
transaction_attachments:0, customers:0, ai_cost_ledger:10`; product 3 (เบี้ยแก้) stock 13, product 4
(ตะกรุด) stock 0.

1. `pnpm.cmd exec tsc --noEmit` → **PASSED**. `pnpm.cmd run build` → **compiled successfully**.
2. **Test 1 (single-item order)**: `POST /api/orders` with 1× product 3 → order created, total `199`
   (server-computed) — verified: exactly 1 new order, 1 new `order_items` row, stock 13→12, exactly 1
   new `inventory_movements` row (`movement_type='sale'`, `-1`), **exactly 1 income transaction**
   (`amount:199`, `category:PRODUCT_SALE`, `orderId:7`, `salesChannel:null` — correctly rejected the
   invalid `"manual"` default rather than passing it through) — **PASS**. Confirmed via `GET
   /api/transactions` and `GET /api/tax/summary?year=2026&month=9` that both immediately reflected
   the new income (`totalIncome:199`) — **PASS**.
3. **Test 2 (multi-item order + shipping + discount)**: temporarily topped up product 4's stock via
   the existing `POST /api/products/[id]/stock-adjustment` endpoint (needed a second in-stock product
   for a real multi-item order; reversed in cleanup below), then created an order with 2× product 3 +
   1× product 4, `shippingFee:30`, `discount:10`, `channel:"facebook"` → server total `717` (=
   398+299+30-10) — verified: correct stock deduction on **both** products, 2 correct
   `inventory_movements` rows, **exactly 1** income transaction with `amount:717` (matches the full
   order total exactly — shipping counted once, not double-counted) and `salesChannel:"facebook"`
   (correctly forwarded this time, since `"facebook"` *is* a valid enum value) — **PASS**.
4. **Test 3 (double-submit / concurrency)**: fired two `POST /api/orders` requests with the
   **identical** explicit `orderNumber` concurrently (backgrounded shell jobs) — one succeeded
   (order 9), the other correctly failed `409 "Order number already exists"` (pre-existing STEP 18
   `UNIQUE` constraint behavior, unmodified) — verified exactly 1 order with that number and
   **exactly 1** income transaction exist afterward, no duplicate — **PASS**.
5. **Test 4 (failure paths)**: attempted an order exceeding available stock (`409 "Insufficient
   stock"`) and an order for a nonexistent product (`404 "Product not found"`) — verified **zero**
   change in every table count before vs. after both attempts, and zero orphan orders/transactions
   matching either attempt — **PASS**, confirming the whole-callback rollback covers the new income-
   transaction step exactly like every other step in `createOrder()`.
6. **Finance UI** (real browser): all 3 test orders' income entries appeared immediately with correct
   amounts (199/717/199, totalIncome ฿1,115.00) and the new "🔗 ออเดอร์ #N" badges — **PASS**, zero
   console errors.
7. **Order detail UI** (real browser): order 8's page showed "✅ บันทึกรายรับแล้ว (#25)" next to its
   status pill, matching the transaction actually created for it — **PASS**, zero console errors.
8. **Tax UI** (real browser, `/tax`, September 2026): `รายรับรวม ฿1,115.00`, correctly split by sales
   channel (`Facebook: ฿717.00`, `ไม่ระบุช่องทาง: ฿398.00` = 199+199) — **PASS**, zero console errors.
   Tax aggregation logic itself (`src/lib/taxSummary.ts`) was not touched, exactly as instructed —
   this is purely the pre-existing aggregation now having real data to sum.
9. **AI slip extraction (STEP 29) regression**: confirmed via `git diff` that
   `src/app/api/transactions/ai-extract/route.ts` has **zero** changes from this STEP. Live-verified
   (no AI cost incurred): unauthenticated request still `401`; authenticated request with an invalid
   file still correctly rejected `400` with the same validation message as before — **PASS**, no
   regression, and confirmed the AI-extract confirm flow (`POST /api/transactions`, unmodified) is a
   fully separate code path from the new automatic order-income logic — no duplicate income is ever
   created from an AI-extracted slip.
10. **Regression** (authenticated): `GET /api/health`, `/api/products`, `/api/orders`, `/api/orders/1`,
    `/api/inventory/movements`, `/api/transactions`, `/api/tax/summary`, `/api/costs/summary` → all
    `200`. `/products`, `/inventory`, `/orders`, `/orders/new`, `/finance`, `/tax` → all load with
    **zero console errors** (verified individually per page).
11. **Historical order id 1 verified untouched**: `linkedIncomeTransactionId: null` (correctly not
    backfilled), `order_number`/`total` unchanged (`TEST-36-...`/`299`) — **PASS**.

**Cleanup**: all 3 test orders (ids 7-9), their 4 `order_items` rows, their 3 income transactions
(ids 24-26), and all 5 `inventory_movements` rows created during testing (including the temporary
stock top-up for product 4) were deleted by exact id via a temporary script (deleted immediately
after use, per this project's established convention). Product 3 stock restored to `13`, product 4
restored to `0`/`out_of_stock`. **Final table counts verified identical to baseline** in every column
(`transactions:0` again, etc.) — historical order id 1 was never touched by either the test or the
cleanup.

**Defects found**: none. Two design traps were caught during the audit (not live bugs, since they
were designed around before any code was written) — the invalid `"manual"` sales-channel default and
the zero-total-order edge case, both described above.

**Files changed**: see New/Modified above. `PROJECT_STATUS.md` updated with this entry.
`PROJECT_CHECKPOINT.md` not touched, per instructions. Video Studio, AI Video, Voice Studio, Social,
Content Studio — not touched at all in this STEP.

**Git**: nothing committed, nothing pushed, per instructions.

**No STEP 32 was started.**

**STEP 31 STATUS: PASS**

---

## STEP 32 — ORDER STATUS WORKFLOW

Date: 2026-09-01

Scope: adds a real order status lifecycle (`pending → paid → shipped → completed`, with cancellation
from any of `pending`/`paid`/`shipped`) on top of the existing order system — previously `status` was
hardcoded to `'pending'` at creation with no way to ever change it. Business rules approved before
implementation (2026-09-01): the 5 status values and exact transition graph above; `completed` and
`cancelled` are both terminal (no outgoing transitions, including no self-transition); status changes
persist **only** `orders.status` — explicitly must NOT reverse the STEP 31 income transaction, modify
Finance totals, modify Tax aggregation, restore inventory, modify inventory movements, or modify
customers; refund/reversal/stock-restoration is explicitly out of scope for this STEP.

**Audit before implementing** (this project uses raw SQL via `better-sqlite3`, not Prisma — no
`schema.prisma` exists anywhere, confirmed by search; audited the actual `orders` table DDL in
`src/lib/db.ts` instead): `status TEXT NOT NULL DEFAULT 'pending'`, no `CHECK` constraint (matches
this codebase's established convention of validating enum-like columns in the TS layer). Confirmed
`'pending'` in `createOrder()`'s `INSERT` (STEP 18/27) was the **only** place `status` was ever
written anywhere in the codebase — full-repo search for every status literal (`pending`/`paid`/
`shipped`/`completed`/`cancelled`) found zero other order-status writers, only a duplicated **display-
only** `statusLabels` map independently defined in both `src/app/orders/page.tsx` and
`src/app/orders/[id]/page.tsx`. Confirmed `src/app/api/orders/[id]/route.ts` was GET-only (no PATCH/
PUT/DELETE existed for orders anywhere). Confirmed no automated tests exist anywhere in this repo —
testing methodology here is entirely live/manual, documented per-STEP in this file (consistent with
STEPs 28–31). **No database schema change was needed or made.** **No dependencies added.**

**Approach**:
- New `src/lib/orderStatus.ts` — plain, **zero-import** constants: `OrderStatus` type,
  `ORDER_STATUSES`, `isValidOrderStatus()`, `ORDER_STATUS_LABELS`, the approved
  `ORDER_STATUS_TRANSITIONS` table, `isValidOrderStatusTransition()`, `getAllowedNextStatuses()`.
  This file was **not** in the originally-approved modify list (only `src/lib/orders.ts` was) — added
  because `src/lib/orders.ts` imports `./db` (`better-sqlite3`), which cannot be imported from a
  Client Component (confirmed failure mode: `Module not found: Can't resolve 'fs'` — the exact
  constraint `src/app/finance/page.tsx`'s own header comment already documents, where it's worked
  around by duplicating constants locally). Since this STEP's explicit requirement was "one shared
  plain definition, used everywhere instead of duplicated local maps," and duplicating status labels
  a third time would have contradicted that, this small new file is the correct fix for a codebase
  constraint the original file list couldn't have anticipated — not a business-rule change or scope
  expansion. Flagged here for visibility rather than silently added.
- `src/lib/orders.ts` — new `updateOrderStatus(orderId, nextStatus)`: validates `orderId` is a
  positive integer, validates `nextStatus` against `isValidOrderStatus()`, loads the order (404 if
  missing), validates the transition via `isValidOrderStatusTransition(current, next)` — which also
  correctly rejects a duplicate/repeated request for a status the order has already reached, since
  every status's transition list excludes itself as a valid target — then runs exactly one
  `UPDATE orders SET status = ? WHERE id = ?`. Nothing else is touched, for any target status
  including `cancelled`, per the approved rules.
- New `src/app/api/orders/[id]/status/route.ts` (`PATCH` only) — validates the id, parses the body,
  calls `updateOrderStatus()`, maps its typed errors to `400` (invalid id/status value), `404` (order
  not found), `409` (disallowed transition), or a generic `500` with no raw error detail. Already
  covered by the existing `src/proxy.ts` rule (`pathname.startsWith("/api/orders/")`) — no proxy.ts
  change needed, same pattern as STEP 31's `/api/orders/[id]` field and STEP 29's
  `/api/transactions/ai-extract`.
- `src/app/orders/[id]/page.tsx` — replaced the local `statusLabels` map with the shared
  `ORDER_STATUS_LABELS`; added a small "เปลี่ยนสถานะ:" control row next to the existing status pill,
  rendering one button per value from `getAllowedNextStatuses(order.status)` (so it shows nothing at
  all once an order reaches a terminal status); a `changeStatus()` handler PATCHes the new endpoint,
  disables the buttons for the duration of the request (same `submitting`-state guard pattern already
  used elsewhere in this codebase), and updates the local `order` state's `status` field immediately
  on success — no page reload needed to see the new status or the newly-recomputed set of next-step
  buttons.
- `src/app/orders/page.tsx` — replaced its own independently-duplicated `statusLabels` map with the
  same shared `ORDER_STATUS_LABELS` import. Cosmetic dedup only; no new controls added to the list
  page (status changes happen on the detail page).

**New files**: `src/lib/orderStatus.ts`, `src/app/api/orders/[id]/status/route.ts`.
**Modified**: `src/lib/orders.ts`, `src/app/api/orders/[id]/route.ts` (no changes needed beyond what
STEP 31 already added — confirmed, not re-touched), `src/app/orders/[id]/page.tsx`,
`src/app/orders/page.tsx`. **No dependencies added. No database schema change.**
**Backups created**: `src/lib/orders.ts.step32-backup-20260901-151847`,
`src/app/orders/page.tsx.step32-backup-20260901-151933`,
`src/app/orders/[id]/page.tsx.step32-backup-20260901-151957`.

**Tested (real dev server, real browser via chrome-devtools MCP + curl for precise/concurrent
requests; a fresh `pnpm backup` — STEP 30 — was run immediately before testing, per instructions,
confirming baseline counts matched exactly what STEP 31 left them at)**:

Baseline: `products:4, orders:1, order_items:1, inventory_movements:4, transactions:0,
transaction_attachments:0, customers:0, ai_cost_ledger:10`; product 3 (เบี้ยแก้) stock `13`; order id 1
status `pending`.

1. `pnpm.cmd exec tsc --noEmit` → **PASSED**. `pnpm.cmd run build` → **compiled successfully**,
   `/api/orders/[id]/status` present in the route list; the client build compiling cleanly with
   `orderStatus.ts` imported into both client pages confirms the client/server split actually works
   as designed, not just in theory.
2. **STEP 31 regression, confirmed before any status testing**: created a fresh order (id 10) →
   exactly one linked income transaction auto-created (`amount:199, category:PRODUCT_SALE`), status
   `'pending'` as always — **PASS**.
3. **Full valid chain** (order 10): `pending→paid` `200`, `paid→shipped` `200`, `shipped→completed`
   `200` — **PASS**.
4. **Terminal-state rejections** (order 10, now `completed`): `completed→pending` `409`,
   `completed→cancelled` `409`, `completed→completed` (repeat) `409` — all correctly
   `"This status transition is not allowed"` — **PASS**.
5. **Skip-ahead rejections** (fresh order 11): `pending→shipped` `409`, `pending→completed` `409` —
   **PASS**.
6. **Invalid status value**: `pending→"bogus-status"` → `400 "Invalid status value"` — **PASS**.
7. **Nonexistent order**: `PATCH /api/orders/999999/status` → `404 "Order not found"` — **PASS**.
8. **Cancellation from every allowed source state**: order 11 `pending→cancelled` `200`; fresh order
   12 `pending→paid→cancelled` (`paid→cancelled` `200`); fresh order 13
   `pending→paid→shipped→cancelled` (`shipped→cancelled` `200`) — **PASS** for all three approved
   cancellation paths.
9. **Backward-from-terminal rejection**: order 11 `cancelled→pending` `409`; order 12
   `cancelled→paid` `409` — **PASS**.
10. **Concurrency / duplicate-request test** (fresh order 14): fired two **simultaneous** `PATCH
    .../status {status:"paid"}` requests (backgrounded shell jobs, same instant) — exactly one
    succeeded (`200`), the other correctly failed (`409`, since by the time it read the row the status
    was already `paid`, and `paid→paid` is excluded from `paid`'s transition list) — **PASS**, proving
    the duplicate-protection holds under real concurrency, not just sequential re-requests.
11. **Finance/Tax totals unaffected by status, including cancellation** — the critical approved-rule
    check: queried all 5 test orders' (10–14) linked transactions directly — every one still exists
    with its original `amount:199` and `transaction_type:'income'` regardless of the order now being
    `completed`/`cancelled`/`paid` — **PASS**. `GET /api/tax/summary?year=2026&month=9` →
    `totalIncome:995` (= 199×5, all 5 orders counted equally) — **PASS**, confirms cancellation did
    **not** reverse or exclude its income.
12. **No orphan inventory/customer records from any status change**: exactly one
    `inventory_movements` row per order (5 total for orders 10–14), all `movement_type:'sale'` from
    the original order **creation** — zero new movements from any of the ~10 status PATCH calls made
    during testing; `customers` table still `0` rows — **PASS**.
13. **UI, real browser** (fresh order 15): detail page correctly showed only the two valid next-step
    buttons for `pending` ("✅ ชำระแล้ว" / "🚫 ยกเลิก"); clicking "ชำระแล้ว" updated the status pill to
    "✅ ชำระแล้ว" **immediately, no reload**, and the button row correctly re-rendered to the two new
    valid next steps for `paid` ("🚚 จัดส่งแล้ว" / "🚫 ยกเลิก") — **PASS**, zero console errors.
    `/orders` list page correctly displayed every test order's status via the same shared label map,
    with historical order id 1 still showing "⏳ รอดำเนินการ" — **PASS**, zero console errors.
14. **Regression** (authenticated): `GET /api/health`, `/api/products`, `/api/orders`, `/api/orders/1`,
    `/api/inventory/movements`, `/api/transactions`, `/api/tax/summary`, `/api/costs/summary` → all
    `200`. `/products`, `/inventory`, `/orders`, `/orders/new`, `/finance`, `/tax` → all load with
    **zero console errors** (verified individually per page).
15. **AI slip extraction (STEP 29) regression**: confirmed via `git diff` that
    `src/app/api/transactions/ai-extract/route.ts` has **zero** changes from this STEP; live-verified
    unauthenticated request still `401` — **PASS**, no regression.
16. **Historical order id 1 verified untouched** throughout all of the above: `status:'pending'`,
    `order_number`/`total` unchanged (`TEST-36-...`/`299`) — **PASS**.

**Cleanup**: all 6 test orders (ids 10–15), their 6 `order_items` rows, their 6 income transactions
(ids 27–32), and all 6 `inventory_movements` rows created during testing were deleted by exact id via
a temporary script (deleted immediately after use). Product 3 stock restored from `7` back to `13`.
**Final table counts verified identical to baseline** in every column; order id 1 was never touched by
either the tests or the cleanup.

**Defects found**: none.

**Files changed**: see New/Modified above. `PROJECT_STATUS.md` updated with this entry.
`PROJECT_CHECKPOINT.md` not touched, per instructions. Video Studio, AI Video, Voice Studio, Social,
Content Studio — not touched at all in this STEP.

**Git**: nothing committed, nothing pushed, per instructions.

**No STEP 33 was started.**

**STEP 32 STATUS: PASS**

---

## STEP 33 — AUTOMATED WINDOWS SCHEDULED DATABASE BACKUP

Date: 2026-09-01

Scope: closes the last remaining item from the original BLOCKING-risk tier — the STEP 30 backup
mechanism existed and worked, but only ever ran when a person remembered to type `pnpm backup`
(confirmed via this session's own STEP 33 pre-audit: all 3 backups that existed on disk were manually
triggered immediately before STEP 31/32 testing, zero had ever run unattended). This STEP registers a
real Windows Scheduled Task that runs the existing, unmodified `pnpm backup` automatically every
night, and verifies it actually executes — not just that it's configured.

**Audit before implementing**: confirmed the exact command chain (`pnpm backup` → `tsx
scripts/backup.ts`, package.json), confirmed `scripts/backup.ts` itself needed **zero changes** (STEP
30's WAL-safe `Database#backup()` Online Backup API and the `public/generated/` evidence copy are
reused exactly as-is), confirmed `.env` has no `BACKUP_DIR` override set (so the script's hardcoded
default `C:\Users\maxim\thai-amulet-backups` is what's actually in use), and confirmed
`scripts/start-production.ps1` already establishes this project's own convention of invoking `pnpm`
via its **full absolute path** to `pnpm.CMD` rather than relying on `pnpm` being resolvable on `PATH`
— reused that exact same path for the scheduled task's action, since Task Scheduler execution
contexts don't reliably inherit an interactive shell's `PATH`. Confirmed the current Windows username
(`maxim`) via `$env:USERNAME` at registration time rather than hardcoding it, per instructions — it
happens to match every other already-hardcoded path in this project, but the registration command
itself never assumes a specific username.

**Approach**: registered via `Register-ScheduledTask` (native PowerShell, no npm dependency):
- **Task name**: `thai-amulet-backup`
- **Trigger**: daily at 02:00 (`New-ScheduledTaskTrigger -Daily -At 2:00AM`)
- **Action**: `<full path to pnpm.CMD> backup`, working directory `C:\Users\maxim\thai-amulet-ai`
- **Principal**: `-UserId $env:USERNAME -LogonType Interactive -RunLevel Limited` — runs only while
  the user is logged on, **no password is stored anywhere in the task definition** (verified below);
  deliberately not "Run whether user is logged on or not," which would require either a stored
  credential or a Group Managed Service Account — unnecessary complexity for a single-shop-PC setup
- **Settings**: `MultipleInstances IgnoreNew` (won't stack a second run if one is still in progress —
  same guidance `docs/BACKUP_AND_RECOVERY.md` already gave for the never-implemented STEP 30 example)
  + `StartWhenAvailable` (if the PC is off/logged-out at 02:00, runs at next login instead of skipping
  the day entirely)

No source code was modified — `scripts/backup.ts`, `package.json`, and every business-logic file are
completely untouched. This is a pure OS-level registration plus documentation.

**Modified**: `docs/BACKUP_AND_RECOVERY.md` (replaced the STEP 30 "not yet configured, here's an
example" section with the actual configured task's real name/schedule/command/destination, plus how
to verify it, run it on demand, check its last-run result, inspect Task Scheduler history, disable it,
remove it, and inspect the latest backup — retention/pruning explicitly still out of scope, unchanged
from STEP 30). **No new files. No dependencies added. No database schema change.**

**Tested (real execution against the live database and the real registered task — not just
inspection)**:

Baseline: `products:4, orders:1, order_items:1, inventory_movements:4, transactions:0,
transaction_attachments:0, customers:0, ai_cost_ledger:10`.

1. **Manual `pnpm backup` control run** (before touching the task) → succeeded, exit `0` — **PASS**,
   confirms the underlying mechanism itself was healthy before adding scheduling on top of it.
2. **Task registered** → `Get-ScheduledTask` confirms `State: Ready`.
3. **Full definition verified via native tools** (`Get-ScheduledTask`, `Get-ScheduledTaskInfo`,
   `Export-ScheduledTask`): action `Execute` = the correct full `pnpm.CMD` path, `Arguments: backup`,
   `WorkingDirectory: C:\Users\maxim\thai-amulet-ai` — **PASS**. Trigger: `StartBoundary
   2026-09-01T02:00:00+07:00`, `DaysInterval: 1`, `Enabled: True` — **PASS**. Principal: `UserId:
   maxim` (SID form in the raw XML, `LogonType: InteractiveToken`) — **PASS**.
4. **No credentials embedded**: printed the full exported task XML directly — no `<Password>` element
   or any credential blob anywhere in the definition, only the identity SID (not a secret) — **PASS**.
5. **Real execution test**: `Start-ScheduledTask -TaskName "thai-amulet-backup"` (manually fired the
   registered task itself, not just re-running `pnpm backup` directly) → `Get-ScheduledTaskInfo`
   afterward showed `LastTaskResult: 0` (success) and a correctly-computed `NextRunTime` of the
   following day at 02:00 — **PASS**.
6. **New backup confirmed on disk**: a new `backup-20260901-161942` folder appeared under
   `C:\Users\maxim\thai-amulet-backups\` at the exact moment the task ran — **PASS**, proves the task
   genuinely executed the real backup script, not just that Task Scheduler reported success.
7. **Backup content verified**: `manifest.json` shows `tableCountsAtBackupStart` ==
   `tableCountsVerifiedInBackupCopy` for all 8 tables, `countMismatches: []`, `76` evidence files
   (`53,466,745` bytes) — **PASS**. Searched the entire backup tree for `.env*`/`*.bak`/`*secret*`/
   `*credential*` → zero matches — **PASS**. Searched for `*.ts`/`*.tsx`/`*.step*-backup*` source-code
   clutter → zero matches — **PASS**.
8. **Recovery dry-run**: copied the scheduled-task-produced backup's `db/` and `generated/` folders
   into an isolated temp directory (never touched `data/thai-amulet.db` or `public/generated/`),
   opened the restored `.db` read-only, re-ran the 8-table count query — identical to production —
   **PASS**. Temp directory deleted after.
9. **Production database verified unchanged** at every checkpoint (immediately after the manual
   control backup, immediately after the scheduled-task execution, and at the very end) — identical
   to baseline every time — **PASS**, zero business-data side effects from either backup run.
10. **Regression**: no source files were modified, so `tsc`/build weren't strictly required per
    instructions, but `pnpm.cmd exec tsc --noEmit` was run anyway as a final sanity check → **PASSED**.
    `GET /api/health`, `/api/products`, `/api/orders`, `/api/orders/1`, `/api/inventory/movements`,
    `/api/transactions`, `/api/tax/summary`, `/api/costs/summary` → all `200`. `/products`,
    `/inventory`, `/orders`, `/orders/new`, `/finance`, `/tax` → all `200`.

**Cleanup**: no test business data was created this STEP (backups are read-only against the live DB
by construction) — nothing to clean up beyond the temporary row-counting `.cjs` script and the
recovery dry-run's temp directory, both removed immediately after use. The 5 backup folders that now
exist under `C:\Users\maxim\thai-amulet-backups\` (from this and prior STEPs' testing) were
deliberately **not** deleted — they're legitimate real backups, not test pollution, and retention
remains explicitly out of scope per STEP 30's original decision, reaffirmed for this STEP.

**Defects found**: none.

**Files changed**: `docs/BACKUP_AND_RECOVERY.md` only (plus this `PROJECT_STATUS.md` entry). No `.ts`/
`.tsx` source file was touched. `PROJECT_CHECKPOINT.md` not touched, per instructions. Video Studio,
AI Video, Voice Studio, Social, Content Studio — not touched at all in this STEP. Orders/Finance/Tax/
Inventory/AI-slip business logic — not touched at all in this STEP (confirmed by the regression pass
above and by the fact that zero `.ts`/`.tsx` files show in this STEP's diff).

**Git**: nothing committed, nothing pushed, per instructions. Note: the registered Windows Scheduled
Task itself is OS state, not a repository file — it persists on this machine regardless of git commit
status, and isn't something `git status` will ever show.

**No STEP 34 was started.**

**STEP 33 STATUS: PASS**

---

## STEP 34 — ORDER-LINKED TRANSACTION INTEGRITY GUARDS

Date: 2026-09-01

Scope: closes three data-integrity gaps in the order↔transaction linkage that STEP 31/32 shipped
without originally testing (found by this session's own STEP 34 pre-audit, verified against current
code, not assumed): (1) a transaction could be deleted with one click and zero confirmation even when
it was the sole income record for a paid/shipped/completed order; (2) nothing stopped a second income
transaction being manually created against an order that already had one; (3) Finance/Tax had no
visibility into a linked order's status, so a cancelled order's still-counted income (an explicit,
approved STEP 32 design decision — cancellation must never touch Finance/Tax totals) was invisible
without clicking through to the order.

**Audit before implementing**: re-read `src/lib/transactions.ts`, `src/app/api/transactions/route.ts`,
`src/app/api/transactions/[id]/route.ts`, `src/lib/orders.ts`, `src/lib/orderStatus.ts`,
`src/lib/taxSummary.ts`, `src/app/finance/page.tsx`, `src/app/tax/page.tsx`, and `PROJECT_STATUS.md`
fresh rather than trusting prior summaries. Confirmed (again, this project uses raw SQL via
`better-sqlite3`, no Prisma) exactly how each piece works: `createTransaction()` validates
`productId`/`orderId` existence but never checked for a prior income link; `deleteTransaction()` had
zero awareness of `orderId` at all; `listTransactions()`/`getTaxSummary()` selected `transactions`
columns only, no join to `orders`. Confirmed `createOrder()`'s STEP 31 automatic-income call and
`updateOrderStatus()`'s STEP 32 logic were both otherwise untouched candidates to build on top of,
not replace.

**Approach**:

1. **Duplicate-income guard** (`src/lib/transactions.ts` `createTransaction()`) — when
   `transactionType === "income"` and `orderId` is set, the check-then-insert is wrapped in
   `db.transaction()` and looks for an existing `transactions` row with the same `order_id` and
   `transaction_type = 'income'`; if found, throws `DUPLICATE_ORDER_INCOME` (mapped to `409` with a
   Thai message in `src/app/api/transactions/route.ts`). Only income is restricted — an order can
   still have any number of linked *expense* transactions (e.g. a return-shipping cost). better-
   sqlite3 automatically uses a SAVEPOINT (documented nested-transaction support) when this runs from
   inside `createOrder()`'s already-open `db.transaction()` (STEP 31's automatic path) — that path is
   a guaranteed no-op there, since a brand-new order can never already have an income transaction; no
   other code creates one. Live-tested under a genuine race (two truly concurrent requests against an
   order with zero prior income) — exactly one succeeded.
2. **Deletion guard** (`deleteTransaction()`) — now takes `options?.confirmOrderLinked`; if the
   transaction's `orderId` is set and that flag isn't `true`, throws
   `ORDER_LINKED_CONFIRMATION_REQUIRED` (mapped to `409` in
   `src/app/api/transactions/[id]/route.ts`) instead of deleting anything. The route reads
   `?confirm=order-linked` from the query string. This is the real, server-side gate — the UI's
   `window.confirm()` (in `finance/page.tsx`'s `removeTransaction()`, now naming the specific linked
   order in the dialog text) is additional UX protection on top of it, not a substitute; a direct API
   call without the query param is rejected regardless of what any UI does. Unlinked transactions
   (`orderId` null) delete exactly as before, no confirmation needed.
3. **Linked order status visibility** (display-only) — `listTransactions()` and `getTaxSummary()`'s
   transaction-row query both gained a `LEFT JOIN orders o ON o.id = t.order_id`, selecting
   `o.status`/`o.order_number` as `linked_order_status`/`linked_order_number`. `TransactionRow` and
   `TaxSummaryTransaction` both gained `linkedOrderStatus`/`linkedOrderNumber` fields (null for every
   other query path — `getById()`/single-row create/update never join, which is harmless since
   nothing currently reads the field from those paths). `finance/page.tsx` and `tax/page.tsx` each
   import the shared `ORDER_STATUS_LABELS`/`OrderStatus` from `src/lib/orderStatus.ts` (zero-import,
   client-safe — same file STEP 32 created for exactly this constraint) and render a badge next to
   any order-linked transaction, turning red specifically when `linkedOrderStatus === "cancelled"`.
   **No total, sum, or the underlying transaction row is touched by this join** — verified live (see
   Test E below) that Tax's `totalIncome` is byte-for-byte identical before and after cancelling an
   order with a linked income transaction, preserving the STEP 32 rule exactly.

**New files**: none. **Modified**: `src/lib/transactions.ts`, `src/app/api/transactions/route.ts`,
`src/app/api/transactions/[id]/route.ts`, `src/lib/taxSummary.ts`, `src/app/finance/page.tsx`,
`src/app/tax/page.tsx`. **No dependencies added. No database schema change** — every guard is
read-then-validate logic against existing columns (`transactions.order_id`, `orders.status`); the two
new joins select existing columns only.
**Backups created**: `.step34-backup-20260901-164103` copies of all 6 modified files.

**Tested (real dev server, real browser via chrome-devtools MCP + curl for precise/concurrent
requests; a fresh `pnpm backup` — STEP 30 — was run immediately before testing)**:

Baseline: `products:4, orders:1, order_items:1, inventory_movements:4, transactions:0,
transaction_attachments:0, customers:0, ai_cost_ledger:10`; product 3 stock `13`; order id 1 status
`pending`, `total:299`.

1. `pnpm.cmd exec tsc --noEmit` → **PASSED**. `pnpm.cmd run build` → **compiled successfully**.
2. **Authentication regression (Test F)**, checked *before* any functional testing: unauthenticated
   `POST /api/transactions`, `DELETE /api/transactions/1`, `PATCH /api/orders/1/status` → all `401`;
   unauthenticated `GET /finance` → `307` — **PASS**.
3. **Test A (normal order → income)**: created a fresh order → exactly one income transaction
   auto-created, unchanged from STEP 31 — **PASS**.
4. **Test B (duplicate income)**: manual `POST /api/transactions` with the same `orderId` as an
   existing income transaction → `409` with the Thai message, transaction count for that order stayed
   at `1` — **PASS**. Confirmed an *expense* transaction on the same order is still allowed (`201`) —
   **PASS**, guard is income-only as designed. **Concurrent duplicate protection**: two genuinely
   simultaneous `POST` requests (backgrounded shell jobs) against an order with **zero** prior income
   (a `total:0` order, which skips STEP 31's auto-creation) → exactly one succeeded, the other
   correctly `409`'d — **PASS**, proving the SAVEPOINT-wrapped check-then-insert is race-safe, not
   just correct for sequential requests.
5. **Test C (deletion guard)**: unlinked transaction deleted with no `confirm` param → `200`,
   unchanged behavior — **PASS**. Linked transaction deleted *without* `?confirm=order-linked` →
   `409`, transaction and its linked order both verified unchanged afterward — **PASS**. Same
   transaction deleted *with* `?confirm=order-linked` → `200`, deleted, and the linked order verified
   completely unchanged (`status`/`total`/`order_number` all identical to before) — **PASS**.
   **Real browser UI**: clicking "ลบ" on an order-linked row opened a native `confirm()` dialog naming
   the exact order (`"...ผูกกับออเดอร์ STEP34-TEST-3-ZERO (#18)..."`); dismissing it left the
   transaction untouched (verified in DB); clicking "ลบ" again and accepting deleted it, list
   refreshed, order confirmed untouched — **PASS**, zero console errors throughout.
6. **Test D (order status display)**: advanced one order through `pending→paid→shipped→completed`
   via the existing STEP 32 endpoint, checking `GET /api/transactions?orderId=...` after every step —
   `linkedOrderStatus` correctly tracked each transition live — **PASS**. Verified in the real browser
   on both `/finance` and `/tax`: badges render with the correct label at every status, screenshotted
   — **PASS**, zero console errors on either page.
7. **Test E (cancellation accounting boundary)**: recorded Tax `totalIncome` before cancelling an
   order with a linked income transaction (`249`), cancelled it, re-checked — **identical (`249`)** —
   **PASS**. The linked transaction itself verified unchanged in the DB (`amount`/`transaction_type`
   untouched), with `linkedOrderStatus` now correctly reporting `cancelled` — **PASS**. Real browser:
   the cancelled order's badge rendered in red on both Finance (screenshotted) and Tax (screenshotted,
   using a second cancelled example on the expense side too, confirming the same non-reversal
   behavior generically) — **PASS**.
8. **Regression (Test G)**: `GET /api/health`, `/api/products`, `/api/orders`, `/api/orders/1`,
   `/api/inventory/movements`, `/api/transactions`, `/api/tax/summary`, `/api/costs/summary` → all
   `200`. `/products`, `/inventory`, `/orders`, `/orders/new`, `/finance`, `/tax` → all `200`, zero
   console errors (checked individually per page). Also spot-checked `/orders/[id]` (not in the
   required list, but closely related to this STEP) — loads correctly, correctly shows "ยังไม่มีรายรับ
   ที่บันทึกไว้" after its income transaction was deleted in Test C — **PASS**.
9. **Historical order id 1 verified untouched** throughout all of the above — `status:'pending'`,
   `order_number`/`total` unchanged — **PASS**.

**Cleanup**: all 3 test orders (ids 16-18), their 3 `order_items` rows, their remaining 2 transactions
(2 others were deleted mid-test as part of Test C itself), and all 3 `inventory_movements` rows were
deleted by exact id via a temporary script (deleted immediately after use). Product 3 stock restored
from `10` back to `13`. **Final table counts verified identical to baseline** in every column; order
id 1 was never touched by either the tests or the cleanup.

**Defects found**: none. One known, documented limitation *not* fixed in this STEP, staying within
the approved scope: `updateTransaction()` (the Finance "แก้ไข" edit path) is not guarded against being
used to retroactively turn an existing expense transaction into a second income transaction for an
already-covered order — only `createTransaction()` was in scope. Noted here for visibility, not
addressed.

**Files changed**: see New/Modified above. `PROJECT_STATUS.md` updated with this entry.
`PROJECT_CHECKPOINT.md` not touched, per instructions. Video Studio, AI Video, Voice Studio, Social,
Content Studio — not touched at all in this STEP.

**Git**: nothing committed, nothing pushed, per instructions.

**No STEP 35 was started.**

**STEP 34 STATUS: PASS**

---

## STEP 35 — BACK-OFFICE COMPLETENESS AUDIT (read-only)

Date: 2026-09-01

Read-only audit, no code/database changes, per its own explicit instructions (this file itself was
not to be modified during the audit — no entry was added at the time). Findings: a fresh read-only
integrity scan of the live database found zero orphaned records of any kind (no order without items,
no dangling transaction/attachment/movement references, no duplicate income per order, no stock
corruption, no order.total arithmetic mismatches) — STEP 30–34's guards holding up under direct
inspection, not just their own tests. Confirmed remaining gaps were all additive/reporting in nature
(customer capture, profit/margin, shipping reconciliation, daily date-filtering), none blocking.
Recommended order: STEP 36 (customer management) → STEP 37 (profit/margin reporting) → STEP 38
(order-detail linked-transactions view / shipping visibility). This entry is being added retroactively
alongside STEP 36's for continuity, since the audit turn itself correctly made no `PROJECT_STATUS.md`
edit.

**STEP 35 STATUS: PASS (audit only, no implementation)**

---

## STEP 36 — CUSTOMER MANAGEMENT

Date: 2026-09-01

Scope: the top recommendation from STEP 35 — customer creation/edit/list/search, selecting or
creating a customer during order creation, and passing `customerId` through to order creation. Fully
additive: zero changes to stock deduction, automatic order→income creation, order status workflow, or
Finance/Tax logic (all re-verified live, see Tested below).

**Audit before implementing**: confirmed the `customers` table (`id, name NOT NULL, phone, address,
district, province, postal_code, created_at` — no `notes`, no `updated_at`) already existed with
everything this STEP needed — **no schema change was required or made**. Confirmed `createOrder()`
(`src/lib/orders.ts`) already had a `customerId` field on `CreateOrderInput` but never validated it
(just wrote `input.customerId ?? null` straight into the `INSERT` — a value nothing had ever
supplied, since `orders/new/page.tsx` never sent one). Confirmed `GET /api/orders` and
`GET /api/orders/[id]` already `LEFT JOIN customers` and return `customer_name`/`phone`/`address`/
`district`/`province`/`postal_code` — the **display side was already fully built and waiting**, exactly
as STEP 35 predicted; zero changes were needed to the order-detail page itself. Confirmed
`src/proxy.ts` did **not** yet protect any `/customers` or `/api/customers` prefix — unlike STEP 29/
31/32/34's routes, which all landed under an already-protected existing prefix, this is a genuinely
new top-level prefix that needed its own rule.

**Approach**:
- New `src/lib/customers.ts` — `createCustomer()`/`listCustomers()` (name/phone `LIKE` search)/
  `updateCustomer()`/`getCustomerById()`/`assertCustomerExists()`, same `toRow()`/CRUD-layer
  convention as `transactions.ts`/`orders.ts`. `assertCustomerExists()` is exported specifically so
  `createOrder()` can validate a supplied `customerId` with the same rigor `assertProductExists()`/
  `assertOrderExists()` already apply — a bad reference now fails the whole order atomically instead
  of silently writing a dangling `customer_id`.
- New `src/app/api/customers/route.ts` (`GET` list/search, `POST` create) and
  `src/app/api/customers/[id]/route.ts` (`GET` single, `PATCH` edit). No delete endpoint — out of
  this STEP's stated scope (list/search/add/edit only).
- New `src/app/customers/page.tsx` — add/edit form at top + searchable list below, same layout
  convention as `finance/page.tsx`/`products/page.tsx`.
- `src/proxy.ts` — added `/customers` to `isProtectedPage()` and `/api/customers`(`/*`) to
  `isProtectedApi()`, plus both to the `matcher` array.
- `src/lib/orders.ts` `createOrder()` — added the same validate-then-use pattern already used for
  `productId`/`orderId`: `customerId` (if provided) must be a positive integer referencing a real
  customer, checked via `assertCustomerExists()`, before the `INSERT`.
- `src/app/api/orders/route.ts` — now reads `customerId` from the POST body (previously silently
  ignored) and maps the two new error cases (`CUSTOMER_NOT_FOUND` → `404`, `INVALID_CUSTOMER_ID` →
  `400`).
- `src/app/orders/new/page.tsx` — new "👤 ลูกค้า (ถ้ามี)" section: a debounced search-as-you-type box
  against `GET /api/customers?search=`, a dropdown of matches to select from, and a
  "+ เพิ่มลูกค้าใหม่" inline mini-form that `POST`s a new customer and auto-selects it — favoring
  reuse of an existing customer over creating a duplicate one, per the STEP's instruction not to
  create customer records unnecessarily. Entirely optional throughout — `submitOrder()` sends
  `customerId: selectedCustomer ? selectedCustomer.id : null`, so an order created with no customer
  selected behaves exactly as before.
- `src/app/page.tsx` — added a "👤 ลูกค้า" entry to the existing sidebar `menuItems` array, linking to
  `/customers`, next to "🧾 ออเดอร์".

**New files**: `src/lib/customers.ts`, `src/app/api/customers/route.ts`,
`src/app/api/customers/[id]/route.ts`, `src/app/customers/page.tsx`.
**Modified**: `src/proxy.ts`, `src/lib/orders.ts`, `src/app/api/orders/route.ts`,
`src/app/orders/new/page.tsx`, `src/app/page.tsx`. **No dependencies added. No database schema
change — the existing `customers` table already had every field this STEP needed.**
**Backups created**: `.step36-backup-<timestamp>` copies of all 5 modified files.

**Tested (real dev server, real browser via chrome-devtools MCP + curl; a fresh `pnpm backup` — STEP
30/33 — was run immediately before testing)**:

Baseline: `products:4, orders:1, order_items:1, inventory_movements:4, transactions:0,
transaction_attachments:0, customers:0, ai_cost_ledger:10`; product 3 stock `13`; order id 1
`customer_id:null`, `status:pending`, `total:299`.

1. `pnpm.cmd exec tsc --noEmit` → **PASSED**. `pnpm.cmd run build` → **compiled successfully**,
   `/customers`, `/api/customers`, `/api/customers/[id]` all present in the route list.
2. **Authentication regression**, checked before any functional testing: unauthenticated
   `GET /customers` → `307`; unauthenticated `GET`/`POST /api/customers` → both `401` — **PASS**.
3. **Customer create**: full-detail customer and name-only customer both created successfully
   (`201`); creating without a name → `400` with a clear Thai error — **PASS**.
4. **Customer edit**: `PATCH` updated an existing customer's phone correctly; editing a nonexistent
   id → `404` — **PASS**.
5. **Customer list/search**: listed both test customers; search by partial name and by partial phone
   both correctly narrowed to the matching customer; a non-matching search term correctly returned
   zero results — **PASS**.
6. **Order creation with `customerId`**: an order created with a valid `customerId` correctly stored
   it; an order created with **no** `customerId` (existing behavior) still worked identically —
   **PASS**. An order submitted with a nonexistent `customerId` (`99999`) → `404 "Customer not
   found"`, and verified **no orphan order was created** (the `INVALID_ORDER_NUMBER`/atomic-rollback
   behavior extends correctly to the new validation) — **PASS**.
7. **STEP 31/STEP 32 regression, confirmed alongside the above**: both valid test orders still got
   exactly one automatic income transaction each (`transaction_type:'income'`, correct `amount`), and
   stock deducted correctly (`13→11` after 2 orders) — **PASS**, customer wiring does not interfere
   with either.
8. **Order detail displays linked customer correctly**: `GET /api/orders/[id]` for a customer-linked
   order returned the customer's `name`/`phone`/`address` correctly (zero code changes needed here,
   confirmed); for a non-linked order, `customer_name` correctly `null` — **PASS**.
9. **Real browser, full UI flow**: on `/orders/new`, searched for an existing customer by name →
   dropdown showed the match → selected it → customer card displayed with a "เปลี่ยน" button →
   completed and submitted the order → redirected to the new order's detail page showing the correct
   customer name/phone/address **and** the STEP 31 "✅ บันทึกรายรับแล้ว" badge **and** the STEP 32
   status-change buttons, all together, zero console errors — **PASS**. Repeated with
   "+ เพิ่มลูกค้าใหม่" (inline new-customer creation) → new customer auto-selected immediately after
   saving → order submitted → detail page showed the newly-created customer correctly — **PASS**,
   zero console errors. `/customers` page tested directly: add form, list, and "แก้ไข" (pre-filling
   every field correctly) all confirmed working live — **PASS**, zero console errors.
10. **Historical order id 1 verified untouched** throughout all of the above (real browser
    screenshot): `customer_id` still `null`, displays "ไม่มีข้อมูลลูกค้า", `status`/`total` unchanged
    — **PASS**.
11. **`/orders` list page regression**: correctly displays the linked customer's name for
    customer-linked orders and `-` for unlinked ones (pre-existing join, unmodified) — **PASS**, zero
    console errors.
12. **Finance/Tax regression**: `/finance` and `/tax` pages both load with zero console errors;
    `GET /api/health`, `/api/products`, `/api/orders`, `/api/orders/1`, `/api/inventory/movements`,
    `/api/transactions`, `/api/tax/summary`, `/api/costs/summary`, `/api/customers` → all `200` —
    **PASS**.

**Cleanup**: all 4 test orders, their 4 `order_items` rows, their 4 income transactions, their 4
`inventory_movements` rows, and all 3 test customers were deleted by exact id via a temporary script
(deleted immediately after use). Product 3 stock restored from `9` back to `13`. **Final table counts
verified identical to baseline** in every column, including `customers:0`; order id 1 was never
touched by either the tests or the cleanup.

**Defects found**: none.

**Files changed**: see New/Modified above. `PROJECT_STATUS.md` updated with this entry (and STEP 35's,
retroactively). `PROJECT_CHECKPOINT.md` not touched, per instructions. Video Studio, AI Video, Voice
Studio, Social, Content Studio — not touched at all in this STEP.

**Git**: nothing committed, nothing pushed, per instructions.

**STEP 36 STATUS: PASS**

---

## STEP 37 — PROFIT / MARGIN REPORTING (COD/RETURN-AWARE)

**Business rule (approved 2026-09-01)**: profit reporting must reflect the shop's real profit
(กำไรจริงของร้าน), not raw transaction totals. A cancelled order's linked income must not count as
Revenue (and its items not count as COGS), since the sale never actually happened — but a real
shipping/return cost the shop incurred (e.g. a COD parcel that shipped and was refused) must still
count as a loss if that cost was actually recorded.

**Mandatory data audit (before writing any code)**: confirmed `EXPENSE_CATEGORIES` already includes
`SHIPPING`, `COD_FEE`, and `RETURNED_PARCEL` (pre-existing, nothing added), and `transactions.order_id`
already supports linking an expense to a specific order (proven working since STEP 34). **STOP
CONDITION did not trigger** — no schema/migration needed; the existing category + order-link system
is sufficient to record actual shipping/return costs, it just requires the operator to enter them.

**Design — a new, separate metric, not a change to Finance/Tax's own totals**: added
`src/lib/profitSummary.ts` (`getProfitSummary()`) and `GET /api/profit/summary`, reusing
`taxSummary.ts`'s `resolveTaxPeriod()`/`parseTaxSummaryParams()` directly so monthly/yearly/custom-range
date semantics are byte-for-byte identical to Tax's. **STEP 32's cancellation boundary is untouched**:
`getTaxSummary()` still sums every transaction regardless of order status, exactly as before — this
report's "Revenue" simply excludes order-linked income where that order's live status is `cancelled`
(non-order income is never excluded). Revenue = income transactions excluding cancelled-order-linked
ones; COGS = `SUM(order_items.cost * quantity)` for the same non-cancelled, revenue-bearing orders;
Gross Profit = Revenue − COGS; Gross Margin % = null (rendered "N/A") when Revenue is 0, never a guessed
number; Shipping Expense = category `SHIPPING`; COD/Return Loss = categories `COD_FEE` +
`RETURNED_PARCEL` (neither requires order-linkage, matching Tax's own category-only aggregation); all
other expense categories = Operating Expenses; Net Profit = Gross Profit − Operating − Shipping −
COD/Return Loss. `PRODUCT_PURCHASE` expense is deliberately kept separate from COGS (different
accounting concepts — cash spent restocking vs. cost of items actually sold — never netted together).

**UI**: added a "💰 กำไร / อัตรากำไร (Profit / Margin)" section to `/tax` (reuses the page's existing
`queryString`/date-filter state so it always matches the Tax summary's period exactly), showing all 8
figures above plus a transparency line ("นับรายรับ N รายการ · ไม่นับออเดอร์ที่ยกเลิก N ออเดอร์เป็น
รายได้") and an explicit note that this section's Revenue intentionally excludes cancelled orders while
"รายรับรวม" above it does not (per the STEP 32 boundary). No dedicated `/profit` page — added
`/api/profit/` to `src/proxy.ts`'s `isProtectedApi()`/`matcher` (same pattern as STEP 36's
`/api/customers`).

**New files**: `src/lib/profitSummary.ts`, `src/app/api/profit/summary/route.ts`.
**Modified**: `src/proxy.ts`, `src/app/tax/page.tsx`. **No dependencies added. No database schema
change.**
**Backups created**: `src/proxy.ts.step37-backup-<timestamp>`, `src/app/tax/page.tsx.step37-backup-<timestamp>`.

**Tested (real dev server, real browser via chrome-devtools MCP + curl; a fresh `pnpm backup` was run
immediately before testing)**:

Baseline: `products:4, orders:1, order_items:1, inventory_movements:4, transactions:0,
transaction_attachments:0, customers:0, ai_cost_ledger:10`; product 3 stock `13`; products 41/33/4
stock `0`/`status:out_of_stock`; order id 1 untouched throughout.

1. `pnpm.cmd exec tsc --noEmit` → **PASSED**. `pnpm.cmd run build` → **compiled successfully**,
   `/api/profit/summary` present in the route list.
2. **Test data** (5 orders, ids 23–27, covering every required scenario): Order A — single item,
   progressed `pending→paid→shipped→completed` (real completed sale). Order B — multi-item (3
   products, qty 1/1/3), progressed to `paid` (real sale, non-terminal). Order C — cancelled before
   shipment (`pending→cancelled` directly). Order D — COD-reject simulation
   (`pending→paid→shipped→cancelled`), with two manually-entered *actual* cost transactions linked via
   `orderId`: `SHIPPING` ฿40 (outbound) and `RETURNED_PARCEL` ฿40 (return). Order E — zero-total
   (full-discount) order, confirming `createOrder()`'s pre-existing "total=0 → no income transaction
   created" behavior naturally produces a genuine zero-revenue case. Plus 3 standalone (non-order-linked)
   expenses: `SHIPPING` ฿15, `COD_FEE` ฿10, `PACKAGING` ฿25.
3. **Calculation correctness, custom range/monthly/yearly all cross-checked against hand-computed
   expected values and each other** (all test data dated today, so all three ranges agreed): Revenue
   ฿1,593 (398 + 1,195 — Orders A and B only, C and D correctly excluded), COGS ฿700 (200 + 500), Gross
   Profit ฿893, Gross Margin 56.06% (rounded 56.1%), Operating Expenses ฿25, Shipping Expense ฿55 (15
   standalone + 40 linked), COD/Return Loss ฿50 (10 standalone + 40 linked), Net Profit ฿763,
   `includedIncomeEntryCount:2`, `excludedCancelledOrderCount:2` — **PASS** on all three view modes.
4. **Cancelled-order exclusion vs. STEP 32 boundary preservation, the critical check**: `/api/tax/summary`
   for the identical period still showed `totalIncome:2191` (all 4 income transactions, including
   Orders C's and D's, i.e. the cancelled ones) and `totalExpense:130` — **confirmed Finance/Tax totals
   are completely unaffected by order cancellation**, exactly as STEP 32 requires, while the new Profit
   report correctly shows the smaller, cancellation-aware figures — **PASS**.
5. **Out-of-range periods correctly return zero, not stale/leaked data**: August 2026, year 2025, and a
   custom range excluding today all returned `revenue:0` through `netProfit:0` with
   `grossMarginPercent:null` — **PASS**.
6. **N/A rendering, real browser**: at zero revenue, the Gross Margin card visibly renders "N/A" (never
   "0%" or "NaN%") — **PASS**, zero console errors. At non-zero revenue, all 8 figures rendered
   correctly matching the API response exactly, including the STEP 34 order-status badges next to each
   linked transaction in the list below (e.g. `#26 (🚫 ยกเลิก)` next to Order D's linked expenses) —
   **PASS**.
7. **Full regression, real browser, zero console errors on every page**: `/tax` (monthly, yearly, and
   the zero-data month), `/finance`, `/orders`, `/orders/26` (a cancelled order's detail page),
   `/products`, `/inventory`, `/customers`, `/orders/new` — **PASS** (orders/new showed 2 pre-existing,
   STEP-37-unrelated accessibility lint issues, not errors, not touched by this STEP).
8. **Authentication regression**: confirmed via the same login flow used throughout — `/api/profit/summary`
   correctly required a valid session (proxy.ts rule added and verified working) — **PASS**.

**Cleanup**: all 5 test orders and their `order_items`/`inventory_movements` rows, all 9 test
transactions (4 automatic income + 2 order-linked expense + 3 standalone expense), and the 3 stock-bump
`inventory_movements` rows were deleted by exact id via a temporary script (deleted immediately after
use). Products 41/33/4 stock restored `0`; product 3 stock restored `13`. **One extra fix required**:
directly restoring `products.stock` via SQL bypassed the app's own stock↔status sync logic (in
`adjustProductStock()`), leaving products 41/33/4 stuck at `status:'active'` despite `stock:0` —
caught by comparing against the recorded baseline (not just row counts) and corrected with a
targeted `UPDATE ... WHERE stock = 0` restoring `status:'out_of_stock'` to match baseline exactly. Final
table counts and every product's `stock`/`status` verified identical to baseline; order id 1 was never
touched by either the tests or the cleanup.

**Defects found**: none in the STEP 37 code itself. The one issue above was in my own cleanup procedure
(bypassing app logic with a raw SQL restore), not a defect in `profitSummary.ts`/`tax/page.tsx`/`proxy.ts`
— caught and fixed before finishing.

**Files changed**: see New/Modified above. `PROJECT_STATUS.md` updated with this entry.
`PROJECT_CHECKPOINT.md` not touched, per instructions. Video Studio, AI Video, Voice Studio, Social,
Content Studio — not touched at all in this STEP.

**Git**: nothing committed, nothing pushed, per instructions.

**STEP 37 STATUS: PASS**

---

## STEP 38 — ORDER DETAIL LINKED TRANSACTIONS + SHIPPING VISIBILITY

**Goal**: read-only visibility on `/orders/[id]` for every transaction linked to that order
(income, expense, shipping, COD/return, etc.), plus a clear breakdown of customer-facing shipping
fee vs. actual shipping/return/COD costs — using only data that already exists, N/A wherever it
doesn't.

**Mandatory audit (before writing any code)**: dumped the live schema for `orders`, `order_items`,
`transactions`, `transaction_attachments` — confirmed no schema change is needed. Found that
`GET /api/transactions?orderId=` (`listTransactions()` in `src/lib/transactions.ts`) already exists,
already filters by exact `t.order_id = ?` equality (no leakage risk), already LEFT JOINs `orders` for
`linkedOrderStatus`/`linkedOrderNumber` (STEP 34), and is already behind auth (`proxy.ts`'s existing
`/api/transactions*` rule) — **reused as-is, no new API route created**. Also found
`GET /api/transactions/[id]/attachments` already exists (STEP 21) and is read-only-safe to call from
this page — **reused as-is, no attachment logic duplicated**. `orders.shipping_fee` is the only one
of the four shipping figures that is a plain column (always known); actual shipping/return/COD costs
have nowhere to live except as `transactions` rows with `category` = `SHIPPING`/`RETURNED_PARCEL`/
`COD_FEE` and `order_id` set (same mechanism STEP 37 already established) — confirmed working, so
**no STOP condition triggered, no schema change**.

**Design**: `src/app/orders/[id]/page.tsx` now fetches `GET /api/transactions?orderId=<id>` after the
order loads (separate effect/loading state from the order fetch, so a failure here never blocks the
order itself from rendering), then fetches attachment presence per-transaction via the existing
attachments endpoint in parallel. Two new read-only sections render below the existing items table:
"🚚 สรุปค่าจัดส่ง" (4 cards: Customer Shipping Fee from `order.shipping_fee`; Actual Shipping Expense,
Return Shipping Expense, COD Fee — each summed from this order's linked expense transactions by
category, or **N/A** if none exist, never guessed/defaulted to 0) and "💳 ธุรกรรมที่เกี่ยวข้องกับออเดอร์"
(every linked transaction, income/expense with sign and color, category label, the order's own status
label per row, attachment presence + link if any, and รายได้รวม/ค่าใช้จ่ายรวม totals) — or
"ยังไม่มีธุรกรรมที่ผูกกับออเดอร์นี้" when the order has none. **No mutation anywhere on this page for
transactions** — no create, no edit, no delete; the existing STEP 32 status-change buttons are
untouched and unrelated. Cancelled orders display their linked transactions completely unaltered
(the STEP 32 boundary is a property of the data this page reads, not something this page enforces
itself — nothing here writes to `transactions` or `orders.status`).

**New files**: none. **Modified**: `src/app/orders/[id]/page.tsx` only. **No dependencies added. No
database schema change. No new API route** (both reused, per audit above).
**Backup created**: `src/app/orders/[id]/page.tsx.step38-backup-<timestamp>`.

**Tested (real dev server, real browser via chrome-devtools MCP + curl; a fresh `pnpm backup` was run
immediately before testing)**:

Baseline: `products:4, orders:1, order_items:1, inventory_movements:4, transactions:0,
transaction_attachments:0, customers:0, ai_cost_ledger:10`; product 3 stock `13`/`active`; products
41/33/4 stock `0`/`out_of_stock`; order id 1 untouched throughout.

1. `pnpm.cmd exec tsc --noEmit` → **PASSED**. `pnpm.cmd run build` → **compiled successfully**, route
   list unchanged (confirms no new API route was added, as intended).
2. **Authentication regression, checked before any functional testing**: unauthenticated
   `GET /orders/1` → `307`; unauthenticated `GET /api/transactions?orderId=1` → `401`; unauthenticated
   `GET /api/transactions/1/attachments` → `401` — **PASS**.
3. **Test data** (4 orders, ids 28–31): Order F — single item, progressed to `completed`, with one
   linked `PACKAGING` expense (₿20) that had a real image file attached via the existing attachments
   endpoint — covers income visibility, expense visibility, income+expense combo, and attachment
   visibility. Order G — progressed `pending→paid→shipped→cancelled` (COD-reject pattern), with three
   linked expenses: `SHIPPING` ₿40, `RETURNED_PARCEL` ₿40, `COD_FEE` ₿15 — covers cancelled-order
   visibility and all three shipping/COD categories simultaneously. Order H — zero-total (full
   discount, so no automatic income transaction), with one linked `FUEL` ₿20 expense — covers
   "order with an expense transaction and no income". Order I — zero-total, no manual transaction
   added — covers the empty state.
4. **Order F (`/orders/28`), real browser**: Shipping summary showed Customer Shipping Fee ₿0.00 (real
   column value) and N/A for all three others (no linked SHIPPING/RETURNED_PARCEL/COD_FEE transaction
   exists for this order) — **PASS**. Transaction list showed the expense (`-₿20.00`, "📎 มีหลักฐานแนบ —
   ดูหลักฐาน" link) and the income (`+₿199.00`, "ไม่มีหลักฐานแนบ"), both labeled "สถานะออเดอร์: ✅ สำเร็จ";
   totals รายได้รวม ₿199.00 / ค่าใช้จ่ายรวม ₿20.00 — **PASS**. The attachment link resolved
   (`200 image/png`) — **PASS**. Zero console errors.
5. **Order G (`/orders/29`), the critical cancelled-order check**: order badge clearly showed "🚫
   ยกเลิก"; shipping summary showed all four real figures (₿50 / ₿40 / ₿40 / ₿15, none guessed); all
   4 linked transactions (including the ₿249 income) displayed completely unaltered, each labeled
   "สถานะออเดอร์: 🚫 ยกเลิก"; totals รายได้รวม ₿249.00 / ค่าใช้จ่ายรวม ₿95.00 — **PASS**, confirming STEP 32's
   rule holds (the income transaction itself is untouched — this page only displays it, cancellation
   never modified it). Zero console errors.
6. **Order H (`/orders/30`)**: expense-only order correctly showed รายได้รวม ₿0.00 / ค่าใช้จ่ายรวม
   ₿20.00, pre-existing "ยังไม่มีรายรับที่บันทึกไว้" badge unaffected — **PASS**. Zero console errors.
7. **Order I (`/orders/31`)**: correctly showed "ยังไม่มีธุรกรรมที่ผูกกับออเดอร์นี้" — **PASS**. Zero console
   errors.
8. **Transaction isolation**: `GET /api/transactions?orderId=28/29/30/31` each returned exactly that
   order's own rows (2/4/1/0 respectively) — cross-checked no order's response contained another
   order's transaction ids — **PASS**.
9. **Historical order id 1 (`/orders/1`)**: renders correctly with both new sections (shipping summary
   all N/A except the real ₿0.00 customer fee; "ยังไม่มีธุรกรรมที่ผูกกับออเดอร์นี้", since order 1 predates
   STEP 31's automatic income linking) — confirmed untouched by any test/cleanup step — **PASS**. Zero
   console errors.
10. **Full regression, real browser, zero console errors on every page**: `/products`, `/inventory`,
    `/orders`, `/orders/new` (2 pre-existing, STEP-38-unrelated accessibility lint issues, not errors),
    `/finance`, `/tax` (Profit/Margin and Finance totals both correctly reflected the new test data —
    Revenue ₿199/COGS ₿100/Gross Profit ₿99 excluding Order G's cancelled income, while Finance's own
    รายรับรวม ₿448 correctly still included it, per the STEP 32/37 boundary), `/customers` — **PASS**.
11. **API regression**: `/api/health`, `/api/products`, `/api/orders`, `/api/orders/1`,
    `/api/inventory/movements`, `/api/transactions`, `/api/tax/summary`, `/api/costs/summary`,
    `/api/profit/summary` all responded correctly (the two summary endpoints' bare `400`s were the
    pre-existing "year or dateFrom/dateTo required" validation, confirmed `200` once given params —
    not a regression) — **PASS**.

**Cleanup**: all 4 test orders and their `order_items`/`inventory_movements` rows, all 7 test
transactions, the 1 test attachment row **and its physical file on disk**, and the 1 stock-bump
`inventory_movements` row were deleted by exact id via a temporary script (deleted immediately after
use). **One mistake caught and fixed**: the cleanup script restored product 4's stock/status but I
initially forgot product 3 (consumed by Orders F and G, 2 units total) — live-verified against the
recorded baseline afterward, caught the `13→11` discrepancy, and corrected it with a direct, scoped
fix before finishing. Final table counts and every product's `stock`/`status` verified identical to
baseline; order id 1 was never touched by either the tests or the cleanup.

**Defects found**: none in the STEP 38 code itself. The one issue above was in my own cleanup
procedure (an incomplete stock restore), not a defect in `orders/[id]/page.tsx` or the reused APIs —
caught and fixed before finishing.

**Files changed**: `src/app/orders/[id]/page.tsx` (modified only). `PROJECT_STATUS.md` updated with
this entry. `PROJECT_CHECKPOINT.md` not touched, per instructions. Video Studio, AI Video, Voice
Studio, Social, Content Studio — not touched at all in this STEP. Order status workflow, the STEP 32
cancellation boundary, STEP 34's transaction integrity rules, STEP 36 customer management, and STEP 37
profit calculation logic were all read from but not modified.

**Git**: nothing committed, nothing pushed, per instructions.

**STEP 38 STATUS: PASS**

---

## STEP 39 — BACK-OFFICE READINESS AUDIT (read-only)

Date: 2026-09-01

Read-only audit, no code/database changes, per its own explicit instructions (this file itself was
not to be modified during the audit — no entry was added at the time, same convention as STEP 35).
Confirmed the core daily workflow (login → products → stock → order → customer → status → income →
Finance/Tax/Profit → order-detail visibility → backup) is functionally sound: authentication/proxy
coverage correct across every in-scope back-office page and API, empty/loading states present and
correct, order-creation error messages already translated to Thai (including `Insufficient stock`/
`Customer not found`, added in earlier STEPs), Windows Scheduled Backup Task confirmed registered and
actually succeeding (`LastTaskResult: 0`), `pnpm run backup` confirmed working. Zero BLOCKING findings.

One IMPORTANT finding, confirmed live (not just from source): `updateTransaction()`
(`src/lib/transactions.ts`, used by `PATCH /api/transactions/[id]` — the same endpoint Finance's edit
form calls) had no equivalent of STEP 34's duplicate-income-per-order guard, unlike `createTransaction()`.
Reproduced live: an order with an existing automatic income transaction, then `PATCH`ing an unrelated
transaction's `orderId` to that same order while also setting `transactionType: "income"` succeeded
(`200`), leaving the order with two income rows — which then silently doubled that order's COGS in
`GET /api/profit/summary` (JOIN matched the same `order_items` row once per income transaction).
Reachable through the Finance page's existing edit form, not just a raw API call. Test data fully
cleaned up afterward, baseline verified restored.

Also noted (MINOR/ACCEPTABLE, none blocking): order-status-change errors show untranslated English
text (low reachability — the UI only ever offers valid transitions); no delete UI for customers
(intentionally out of STEP 36's scope); 66 accumulated `.step*-backup-*` files under `src/` are not
`.gitignore`d (mitigated in practice by this project's consistent use of explicit `git add <file>`
lists, never `-A`/`.`); local backup folders accumulate with no retention policy (STEP 33's own
explicitly deferred decision); `data/app.db` stray 0-byte file (already documented/accepted in
STEP 30); `/costs` + `/api/costs/*` (AI cost dashboard, STEP 21) remain unauthenticated — Content/
Video-Studio-adjacent, explicitly out of this STEP's scope.

Recommended next step: STEP 40, scoped narrowly to just the IMPORTANT finding above.

**STEP 39 STATUS: PASS (audit only, no implementation) — 1 IMPORTANT finding, addressed in STEP 40**

---

## STEP 40 — UPDATE TRANSACTION DUPLICATE-INCOME GUARD

Date: 2026-09-01

Scope: close exactly the one IMPORTANT gap STEP 39 found — `updateTransaction()` could be used to
turn any transaction into a second `income` row linked to an order that already had one, bypassing
STEP 34's guard (which only ever covered `createTransaction()`). Strictly scoped to
`src/lib/transactions.ts` and `src/app/api/transactions/[id]/route.ts` only, per instructions.

**Audit before implementing**: re-read `createTransaction()`'s existing STEP 34 guard (an inline
`SELECT ... WHERE order_id = ? AND transaction_type = 'income'` check, run inside the same
`db.transaction()` as the `INSERT`, for atomicity under concurrent requests) to reuse its exact
business rule rather than re-deriving or duplicating it.

**Approach**: extracted the inline check into one small shared helper,
`assertNoDuplicateOrderIncome(orderId, excludeTransactionId?)` — `createTransaction()` now calls it
with no exclusion (unchanged behavior, same query, same error, `DUPLICATE_ORDER_INCOME`);
`updateTransaction()` now calls it with `excludeTransactionId: id` whenever the update's *resulting*
type is `income` and its *resulting* `orderId` is non-null, so re-saving an order's own existing
income transaction (e.g. correcting its amount) is never rejected as a false-positive duplicate of
itself — only linking a genuinely different row to an order that already has income is rejected. The
check + `UPDATE` are wrapped in one `db.transaction()`, mirroring the create path's atomicity.
`src/app/api/transactions/[id]/route.ts`'s `errorToResponse()` gained one new mapping —
`DUPLICATE_ORDER_INCOME` → `409`, identical Thai message to the existing create-path one in
`src/app/api/transactions/route.ts`, for consistency. No other file was touched; no schema change.

**New files**: none. **Modified**: `src/lib/transactions.ts`, `src/app/api/transactions/[id]/route.ts`.
**No dependencies added. No database schema change.**
**Backups created**: `src/lib/transactions.ts.step40-backup-<timestamp>`,
`src/app/api/transactions/[id]/route.ts.step40-backup-<timestamp>`.

**Tested (real dev server, real browser via chrome-devtools MCP + curl; a fresh `pnpm backup` was run
immediately before testing)**:

Baseline: `products:4, orders:1, order_items:1, inventory_movements:4, transactions:0,
transaction_attachments:0, customers:0, ai_cost_ledger:10`; product 3 stock `13`/`active`; order id 1
untouched throughout.

1. `pnpm.cmd exec tsc --noEmit` → **PASSED**. `pnpm.cmd run build` → **compiled successfully**, route
   list unchanged.
2. **Authentication regression**: unauthenticated `PATCH /api/transactions/1` → `401`; unauthenticated
   `GET /api/transactions` → `401` — **PASS**.
3. **Exact STEP 39 reproduction, now fixed**: order with an existing automatic income transaction
   (id 60, order 33) + an unrelated standalone expense transaction (id 61) → `PATCH`ing id 61 to
   `{transactionType:"income", orderId:33}` → **`409`**, same Thai duplicate-income message as the
   create path. Verified the database afterward: order 33 still had exactly 1 income transaction
   (id 60, completely unchanged including `updated_at`); transaction 61 completely unchanged
   (still `expense`, `orderId:null`, `updated_at` unchanged) — confirming the rejected request never
   reached the `UPDATE` statement — **PASS**.
4. **Positive test A** (self-update an order's own existing income transaction, amount only) →
   `200` — **PASS**.
5. **Positive test B** (expense → income for an order with no existing income) → `200` — **PASS**.
6. **Positive test C** (income → expense) → `200` — **PASS** (rule only applies when the *resulting*
   type is income).
7. **Positive test D** (update an unrelated transaction, `orderId` stays null throughout) → `200` —
   **PASS**.
8. **Edge cases**: two standalone income transactions both with `orderId:null` never conflict with
   each other — **PASS**. Nonexistent transaction id → `404 "Transaction not found"`, unchanged from
   before — **PASS**. Nonexistent `orderId` → `404 "Order not found"`, unchanged from before (this
   validation still runs before the new duplicate check) — **PASS**.
9. **STEP 34 deletion guard regression**: unlinked transaction deletes without confirmation (`200`);
   order-linked transaction delete without confirmation → `409` requiring confirmation, exactly as
   before; with `?confirm=order-linked` → succeeds (`200`) — **PASS**, completely unaffected by this
   STEP's changes.
10. **Real browser, end-to-end UI verification**: reproduced the exact scenario through Finance's
    actual "แก้ไข" edit form (not just the raw API) — selecting an order that already had income in
    the "ออเดอร์ที่เกี่ยวข้อง" dropdown and saving displayed the same Thai duplicate-income error inline,
    gracefully, via the form's existing error-banner mechanism (no UI code changes were needed) —
    **PASS**. The only console entry was Chrome DevTools' standard "Failed to load resource: ...409"
    network-status log line — confirmed via a side-by-side test that this same line appears for
    *any* non-2xx fetch response (tested with an unrelated `404`), i.e. normal browser logging of the
    HTTP response itself, not a JS/React error — consistent with how every prior STEP's "zero console
    errors" checks have already treated routine 401/404/409 responses throughout this project.
11. **Full regression, zero console errors on every page**: `/products`, `/inventory`, `/orders`,
    `/orders/1`, `/customers`, `/tax`, `/finance` — **PASS**. API regression:
    `/api/health`, `/api/products`, `/api/orders`, `/api/orders/1`, `/api/inventory/movements`,
    `/api/transactions`, `/api/customers`, `/api/tax/summary`, `/api/profit/summary` all responded
    correctly — **PASS**.

**Cleanup**: all test orders/order_items/inventory_movements/transactions created during
reproduction and positive testing were deleted by exact id via a temporary script (deleted
immediately after use); product 3 stock restored to `13`. Final table counts and field values verified
identical to baseline; order id 1 was never touched by either the tests or the cleanup.

**Defects found**: none beyond the one STEP 39 already identified and this STEP fixed.

**Files changed**: `src/lib/transactions.ts`, `src/app/api/transactions/[id]/route.ts`.
`PROJECT_STATUS.md` updated with this entry (and STEP 39's, retroactively, same convention as
STEP 35/36). `PROJECT_CHECKPOINT.md` not touched, per instructions. Video Studio, AI Video, Voice
Studio, Social, Content Studio — not touched. `createTransaction()`'s guard, the STEP 34 deletion
guard, order status workflow, the STEP 32 cancellation boundary, STEP 36 customer management, STEP 37
profit calculation, and STEP 38 order-linked transaction visibility were all read from but not
modified (only reused/reduplicated-away, per the shared-helper extraction above).

**Git**: nothing committed, nothing pushed, per instructions.

**STEP 40 STATUS: PASS**

---

## STEP 41 — FINAL BACK-OFFICE PRODUCTION READINESS AUDIT (read-only)

Date: 2026-09-01

Read-only audit, no code/database changes, per its own explicit instructions (this file itself was
not to be modified during the audit — no entry was added at the time, same convention as STEP 35/39).
Overall readiness: **READY WITH MINOR ITEMS**. Zero BLOCKING findings. Zero new IMPORTANT findings —
the one from STEP 39 (duplicate-income-via-edit) was re-confirmed still fixed via a fresh live
reproduction (`409`, database unchanged). A live, whole-database relationship/arithmetic scan found
zero orphaned records and zero inconsistencies across every FK relationship and `orders.total`
arithmetic check. Security re-verified live: forged and tampered (both corrupted-signature and
payload/signature-mismatch) session cookies all correctly rejected against a real valid-cookie
baseline; cross-transaction attachment access blocked with live evidence (404, no leakage); fake-image
upload rejected by magic-byte content verification; SQL-injection-shaped search input safely
parameterized. Backup mechanism and the Windows Scheduled Task both re-verified live and working
(`LastTaskResult: 0`); full 8-step recovery procedure confirmed documented in
`docs/BACKUP_AND_RECOVERY.md`.

One MINOR finding (new): `POST /api/orders`'s catch-all error fallback (`src/app/api/orders/route.ts`)
returned the raw internal error message string to the client at `500` instead of following the
generic-message convention every other route in the codebase already uses — reachable via a discount
exceeding the order total (`INVALID_ORDER_TOTAL`, unmapped). No secrets/stack-trace exposure; the
underlying business rule itself was already correctly enforced (no negative-total order could ever be
created). Recommended STEP 42, scoped narrowly to this one fix.

Other MINOR/ACCEPTABLE items carried over unchanged from STEP 39 (order-status-change errors
untranslated; no customer delete UI; `.step*-backup-*` clutter not gitignored; local backup retention
undecided; `data/app.db`; `/costs` unauthenticated; AI Slip Extraction never auto-links orders; home
dashboard unauthenticated-but-static; COD/Return relies on manual expense entry) — none require
action per this STEP's own classification criteria.

**STEP 41 STATUS: PASS (audit only, no implementation) — 1 MINOR finding, addressed in STEP 42**

---

## STEP 42 — ORDERS ROUTE ERROR LEAKAGE FIX

Date: 2026-09-01

Scope: close exactly the one MINOR gap STEP 41 found — `POST /api/orders`'s catch-all error handler
leaked the raw internal error message to the client instead of a safe generic response. Strictly
scoped to `src/app/api/orders/route.ts` only, per instructions.

**Scope check before editing**: confirmed via `Select-String`/grep that the leak was the final
`catch` fallback (`{ error: message }` at `500`, where `message` is the raw `error.message`), and
confirmed the established convention to match by reading `orders/[id]/status/route.ts`'s fallback
(`console.error(...)` + generic `"Internal server error"` at `500`) — the same pattern already used
by `transactions/route.ts`, `transactions/[id]/route.ts`, `customers/route.ts`, `tax/summary/route.ts`,
`profit/summary/route.ts`, `stock-adjustment/route.ts`, and this same file's own `GET` handler.

**Approach**: replaced only the final fallback's `error: message` with `error: "Internal server error"`,
leaving the existing `console.error("Create order error:", error)` (server-side logging, unchanged)
and all 5 specifically-mapped error branches above it (`PRODUCT_NOT_FOUND` → 404, `CUSTOMER_NOT_FOUND`
→ 404, `INVALID_CUSTOMER_ID` → 400, `INSUFFICIENT_STOCK` → 409, duplicate order number → 409) completely
untouched. The `try` block (order creation itself) and the entire `GET` handler were not touched at all.

**New files**: none. **Modified**: `src/app/api/orders/route.ts` only. **No dependencies added. No
database schema change. No business logic changed** (stock deduction, automatic income transaction,
order status workflow, customer handling, cancellation — all untouched, confirmed by re-reading the
diff before testing).
**Backup created**: `src/app/api/orders/route.ts.step42-backup-<timestamp>`.

**Tested (real dev server, real browser via chrome-devtools MCP + curl; a fresh `pnpm backup` was run
immediately before testing)**:

Baseline: `products:4, orders:1, order_items:1, inventory_movements:4, transactions:0,
transaction_attachments:0, customers:0, ai_cost_ledger:10`; product 3 stock `13`/`active`; order id 1
untouched throughout.

1. `pnpm.cmd exec tsc --noEmit` → **PASSED**. `pnpm.cmd run build` → **compiled successfully**, route
   list unchanged.
2. **Authentication regression**: unauthenticated `POST /api/orders` → `401`; unauthenticated
   `GET /api/orders` → `401` — **PASS**.
3. **Valid order creation still succeeds**: `201`, order created normally with correct total/items —
   **PASS**.
4. **Existing pre-catch validation unchanged**: empty items array → `400 "Order must contain at least
   one item"` — **PASS**.
5. **Existing mapped errors unchanged**: nonexistent product → `404 "Product not found"`; quantity
   exceeding stock → `409 "Insufficient stock"`; duplicate order number → `409 "Order number already
   exists"` — all three **PASS**, byte-for-byte identical to before.
6. **The fix, confirmed live**: a discount exceeding the order total (previously leaked the raw
   `INVALID_ORDER_TOTAL` constant) now returns `500 {"success":false,"error":"Internal server error"}`
   — **PASS**. Confirmed no stray order was created by the rejected attempt (order list showed only
   the one valid test order plus historical order id 1) — the underlying business rule was already
   correctly enforced before this fix; only the client-facing error text/consistency changed.
7. **Full regression, zero console errors on every page**: `/orders`, `/finance`, `/tax`, `/customers`
   — **PASS**. API regression: `GET /api/profit/summary`, `GET /api/tax/summary` both `200` — **PASS**.

**Cleanup**: the one valid test order (and its `order_items`/`inventory_movements`/automatic income
transaction) was deleted by exact id via a temporary script (deleted immediately after use); product 3
stock restored to `13`. Final table counts and field values verified identical to baseline; order id 1
was never touched by either the tests or the cleanup.

**Defects found**: none beyond the one STEP 41 already identified and this STEP fixed.

**Files changed**: `src/app/api/orders/route.ts`. `PROJECT_STATUS.md` updated with this entry (and
STEP 41's, retroactively, same convention as STEP 35/36 and STEP 39/40). `PROJECT_CHECKPOINT.md` not
touched, per instructions. Video Studio, AI Video, Voice Studio, Social, Content Studio — not touched.
Order business logic, stock deduction, automatic income transaction, order status workflow, customer
handling, cancellation behavior, Finance, Tax, Profit, Transactions, Customers, and Backup were all
read from (for regression) but not modified.

**Git**: nothing committed, nothing pushed, per instructions.

**STEP 42 STATUS: PASS**

---

## STEP 43 — PRODUCTION READINESS SPOT-CHECK (read-only)

Date: 2026-09-01

Read-only diagnostic pass, no code/database changes. Confirmed: git tree clean (up to date with
`origin/master` at `ff11195`, only pre-existing `.step*-backup-*` clutter untracked); no stray Node
processes belonging to the app (the 3 running `node` processes were all identified via
`Get-CimInstance` command-line inspection as `chrome-devtools-mcp` tooling, not the app — nothing
listening on ports 3000–3002); `pnpm backup` succeeded with baseline row counts; Scheduled Task
`thai-amulet-backup` healthy (`State: Ready`, `LastTaskResult: 0`, correct `NextRunTime`);
`tsc --noEmit` clean. The dev server was not running at the time of this check — expected, since this
project's convention is to start it only for active testing, not run it persistently between STEPs
(Docker is not part of this project's stack, so `docker ps` failing to connect is unrelated/expected).

**STEP 43 STATUS: PASS (spot-check only, no implementation)**

---

## STEP 44 — FINAL LIVE SMOKE TEST / GO-LIVE CHECK

Date: 2026-09-01

Full end-to-end live smoke test of the daily back-office workflow, real browser + real dev server,
ahead of go-live. All 22 checklist items **PASS**: app start/health, login, Products, Inventory,
Customers, Orders, order creation via the real UI (including inline new-customer creation), correct
`customerId` linkage (order `#37` → customer `#4`), stock deduction (`13→12`), automatic income
transaction (`#68`, `฿199`, correctly linked), Finance/Tax/Profit all consistent (Revenue ฿199 / COGS
฿100 / Gross Profit ฿99 / Net Profit ฿99), full order status transition chain
(`pending→paid→shipped→completed`) via the real UI buttons, Order Detail's linked-transactions and
shipping-summary sections (STEP 38) rendering correctly with N/A shown honestly where no shipping/COD
data exists, `pnpm backup` succeeding mid-test, the Scheduled Task confirmed healthy
(`LastTaskResult: 0`), zero unexpected browser console errors across every page, correct API error
responses (`401`/`400`/`404`, no raw-error leakage — STEP 42's fix confirmed holding), `tsc --noEmit`
and `pnpm run build` both clean.

**Database counts** — before: `products:4, orders:1, order_items:1, inventory_movements:4,
transactions:0, transaction_attachments:0, customers:0, ai_cost_ledger:10`; after test data cleanup
(deleted by exact id via a temporary script): identical to before in every column. **Database restored
to baseline: confirmed** (row counts and field values — product 3 stock back to `13`/`active`).
**Historical order id 1: untouched** (`status: pending`, `customer_id: null`, unchanged throughout).

No defects found. No schema change, no dependency added, no source files modified.

**Overall: back-office confirmed ready for go-live.**

**STEP 44 STATUS: PASS**

---

## STEP 45 — POST-GO-LIVE AUDIT (read-only)

Date: 2026-09-01

Read-only audit, no code/database changes. Confirmed git tree clean at `e47d201`; confirmed the
STEP 39 IMPORTANT finding (duplicate-income-via-edit) and STEP 41 MINOR finding (orders route error
leakage) both remain fixed with no regression — the `error: message` leak pattern now matches only
in old `.step*-backup-*` files, never the live `orders/route.ts`. Zero `TODO`/`FIXME` anywhere in
`src/`. Scheduled Task `thai-amulet-backup` healthy (`LastTaskResult: 0`). One new MINOR observation:
16 backup folders had accumulated (818.66 MB total, `public/generated/` copied in full each time) —
informational only, consistent with STEP 30/33's already-accepted, explicitly deferred retention
decision; no action taken.

**STEP 45 STATUS: PASS (audit only, no implementation)**

---

## STEP 46 — PRODUCTS AUDIT + VISUAL FIX

Date: 2026-09-01

**Reported problems**: (1) test/newly-created products on `/products` could not be deleted; (2)
`/products`'s background/colors/layout/theme did not visually match the rest of the back-office.

**Audit (read-only, before any implementation)**:
- **Delete behavior**: traced `deleteProduct()` (`src/app/products/page.tsx`) → `DELETE
  /api/products?id=<id>` → `src/app/api/products/route.ts`. Confirmed the UI/API request format
  matches exactly (query-param `id`, no mismatch) and `DELETE` is authenticated identically to
  `GET`/`POST`/`PATCH` (`src/proxy.ts`'s `pathname === "/api/products"` rule is method-agnostic).
  Live, read-only DB inspection showed **all 4 products currently in the database have at least one
  reference row** (`ai_cost_ledger`, `inventory_movements`, `order_items`, `product_media`, or
  `content_plans`). This is the deliberate, documented business rule from STEP 26.9/27.1
  (`PRODUCT_REFERENCE_TABLES`/`findProductReferences()`/a real SQLite `FOREIGN KEY` constraint,
  `foreign_keys` pragma enabled) — a product can only be deleted while it has zero history anywhere
  in the system, specifically to prevent silent loss of real order/financial/inventory data.
  **Conclusion: delete behavior is working exactly as designed, not a defect** — any product a user
  interacts with in any way (a photo, a stock adjustment, an order, an AI-cost entry) permanently
  gains a reference row and can only be edited or set to `stock: 0`/`out_of_stock` afterward, never
  hard-deleted through the UI.
- **Theme**: confirmed `/products` was the only back-office page not using the shared `min-h-screen
  bg-slate-50 p-6` baseline that Finance/Tax/Orders (list/detail/new)/Customers/Inventory all share
  byte-for-byte — it instead used a self-contained "amulet shop" design (`Noto_Serif_Thai`/
  `Noto_Sans_Thai` Google Fonts, cream/gold custom hex palette, `rounded-md` cards) with no other
  back-office page match, and was missing the "← กลับหน้าแรก" nav link the others have.

**Approved scope**: visual fix only, `src/app/products/page.tsx` exclusively. Delete behavior,
`src/app/api/products/route.ts`, `src/proxy.ts`, `src/lib/db.ts`, and every other back-office page
were explicitly out of scope and confirmed untouched.

**Implementation**: rewrote every `className` in `src/app/products/page.tsx` to the established
slate/emerald/red/amber Tailwind token system (card `rounded-2xl border bg-white shadow-sm`, table
`thead bg-slate-50 text-slate-600` / `tr border-t hover:bg-slate-50`, buttons `rounded-xl bg-slate-900
.../ rounded-xl border ...`, status badges `bg-emerald-50`/`bg-amber-50`/`bg-red-50` — matching
Inventory's own three-state badge exactly), removed the `Noto_Serif_Thai`/`Noto_Sans_Thai` font
imports and all `fontFamily` usage, removed the page-unique decorative gold gradient bar and "THAI
AMULET TH" eyebrow label, and added the "← กลับหน้าแรก" link to match the other six back-office pages.
Every state variable, handler, `fetch()` call, HTTP method, and conditional was left untouched —
verified by diffing every function name/`useState` hook/`fetch()` call/HTTP-method string between the
backup and the edited file (zero differences).

**Files changed**: `src/app/products/page.tsx` only (134 insertions, 179 deletions — styling-only).
**No database/schema changes. No dependency changes. No financial/inventory logic changes** (the
delete business rule, stock deduction, and cost-ledger references were read for the audit but never
modified). **No changes to Video Studio, Voice Studio, Content Studio, or Social.**
**Backup created**: `src/app/products/page.tsx.step46-backup-20260901-212457`.

**Tested (real dev server, real browser via chrome-devtools MCP)**:
1. `pnpm exec tsc --noEmit` → **PASS**. `pnpm run build` → **PASS**, route list unchanged.
2. Page loads with the correct slate back-office theme, zero console errors.
3. Add Product form, Edit Product (correct pre-fill), Stock Adjustment panel (correct current-stock
   display), Image Viewer modal (open/navigate/close) — all **PASS**, visuals only changed.
4. **Delete behavior regression, the critical check**: confirm dialog text identical; delete attempt
   still correctly blocked with the exact same reference-based `409` message
   (`ประวัติต้นทุน AI, ประวัติการเคลื่อนไหวสต็อก`), now shown in the new red banner style only — **PASS,
   completely unchanged**.
5. Mobile viewport (390px width) — **PASS**, no horizontal page overflow; the table's pre-existing
   `overflow-x-auto` wrapper (untouched) correctly contains the wide table.
6. Console: only pre-existing accessibility "[issue]" notices (identical count before/after) and the
   same routine `409` network log + the app's own unmodified `console.error(err)` inside
   `deleteProduct()`'s catch block — no new errors.

**Defects found**: none — the reported "cannot delete" behavior was confirmed working as designed,
not a bug.

**Files changed**: `src/app/products/page.tsx`. `PROJECT_STATUS.md` updated with this entry (and
STEP 45's, retroactively, same convention as STEP 35/36, 39/40, 41/42, 43/44).
`PROJECT_CHECKPOINT.md` not touched, per instructions.

**Git**: nothing committed, nothing pushed, per instructions.

**STEP 46 STATUS: PASS**

---

## STEP 47 — ORDER PAYMENT & SHIPPING UI

Date: 2026-09-01

**Scope**: a prior read-only audit (this same date) found that `POST /api/orders`, `createOrder()`
(`src/lib/orders.ts`), and the `orders` table schema already fully supported `paymentMethod`,
`channel`, and `shippingFee` — the only gap was that `src/app/orders/new/page.tsx` never exposed any
of the three, so every order created through the real UI silently got `paymentMethod: "unknown"`,
`channel: "manual"` (→ `salesChannel: null` on the linked income transaction), and `shippingFee: 0`.
This STEP closes that UI-only gap.

**Implemented, isolated entirely to `src/app/orders/new/page.tsx`**:
- **Payment method**: a two-button toggle — "โอนเงิน" (transfer) / "COD / เก็บเงินปลายทาง" (COD) —
  sent as `paymentMethod` in the existing `POST /api/orders` body.
- **Sales channel**: a dropdown using the exact existing `SALES_CHANNELS` enum values
  (`facebook`/`tiktok_shop`/`shopee`/`lazada`/`line`/`walk_in`/`other`) with Thai-friendly labels,
  sent as `channel` — this is the fix for the `salesChannel: null` gap, since a real enum value now
  reaches `createOrder()`'s existing `mapOrderChannelToSalesChannel()`.
- **Shipping fee**: a number input, default `0`, min `0`; validated client-side (mirroring the
  existing server-side `INVALID_SHIPPING_FEE` rule in `src/lib/orders.ts`) so a negative value never
  reaches the API call at all; sent as `shippingFee`.
- **Live total**: `orderTotal` changed from `= orderSubtotal` to `= orderSubtotal + shippingFeeValue`,
  displayed with a new "ค่าจัดส่ง" line in the existing order-summary card, so the on-screen total
  always matches what `createOrder()` will actually persist.
- **COD collection display**: a banner shown only when `paymentMethod === "cod"`, showing the exact
  `orderTotal` (no new field, no new calculation — reuses the same total) — hidden entirely when
  "โอนเงิน" is selected.

All existing state (customer selection, product/quantity/price line items, add/remove item), the
existing `submitOrder()` request/response handling, the existing stock-sufficiency check, and the
existing API endpoint were left untouched — only the POST body gained three new fields the API
already accepted.

**Files changed**: `src/app/orders/new/page.tsx` only. **No changes to** `src/app/api/orders/route.ts`,
`src/lib/orders.ts`, `src/lib/db.ts`, `src/lib/transactions.ts`, any database schema, Finance,
Inventory, Products, Customers, Video Studio, Voice Studio, Content Studio, or Social — confirmed via
`git status` showing only this one file modified.
**No dependencies added.**
**Backup created**: `src/app/orders/new/page.tsx.step47-backup-20260901-222243`.

**Tested (real dev server, real browser via chrome-devtools MCP)**:
1. `pnpm exec tsc --noEmit` → **PASS**. `pnpm run build` → **PASS**, route list unchanged.
2. **Real-data discovery**: before testing, baseline row counts didn't match the expected prior state
   — investigation (read-only) found genuine post-go-live user data already present: product id 47
   ("ลูกอมหล่ออุดกริ่ง ยันต์แปดทิศ"), customer id 5 ("โน่"), and order id 38 (linked income transaction
   id 69). This was correctly identified as real data, not test data, and **left completely
   untouched** throughout — only one clearly-scoped test order (id 39) was created and later removed
   by exact id.
3. **Browser regression**: page loads; existing customer search/inline-create, product
   selection/quantity/price/add-remove-item all work unchanged; new payment method toggle, channel
   dropdown, and shipping fee input all render and respond correctly; zero new console errors (only
   pre-existing-pattern accessibility notices matching this page's existing unlabeled-input
   convention, and unrelated Next.js font-preload warnings).
4. **Negative shipping fee**: entering `-10` and submitting was correctly blocked client-side with a
   clear Thai message; confirmed via direct DB read that the order count was unchanged — no stray
   order was created by the rejected attempt.
5. **Live total correctness**: selecting a product (₿299) and entering shipping fee ₿40 correctly
   updated the on-screen total to ₿339; switching payment method to COD showed a banner with exactly
   ₿339; switching back to โอนเงิน made the COD banner disappear immediately.
6. **Order creation, the critical check**: submitted one test order (product 47 × 1, `channel:
   "other"`, `paymentMethod: "cod"`, `shippingFee: 40`). Server persisted `total: 339` exactly
   matching the UI. The linked automatic income transaction correctly got `amount: 339`,
   `payment_method: "cod"`, **and `sales_channel: "other"` — a real value instead of the previous
   `null`**, confirming the actual gap is fixed. The existing STEP 38 shipping-visibility section on
   Order Detail correctly showed the new ₿40 customer shipping fee.
7. **Stock integrity**: product 47 stock went `19 → 18` on the test purchase, confirmed via direct DB
   read; **restored to `19`** during cleanup.
8. **Cleanup**: the one test order's transaction, `order_items` row, and `inventory_movements` row
   were deleted by exact id, the order row deleted, and product 47's stock restored — all via a
   temporary script, deleted immediately after use. Verified afterward: real order 38, real customer
   5, and real product 47 are completely intact and unmodified; historical order id 1 untouched;
   `/orders` list correctly shows only the 2 real orders (the pre-existing real one and historical
   order 1), with zero trace of the test order remaining.

**Defects found**: none — implementation matched the approved audit scope exactly on the first pass.

**Git**: nothing committed, nothing pushed, per instructions.

**STEP 47 STATUS: PASS**

---

## STEP 48 — ORDER FULFILLMENT AUDIT + PRINT-FRIENDLY RECEIPT / PACKING SLIP

Date: 2026-09-01

**Audit (read-only, before implementation)**: confirmed `src/app/api/orders/[id]/route.ts` exports
only `GET` (no `PATCH`/`PUT`/`DELETE`), and `src/lib/orders.ts` exports only `createOrder()` and
`updateOrderStatus()` — Edit Order and Delete Order are unavailable because those code paths were
simply never built, not due to a hidden bug. The only order mutation anywhere is
`PATCH /api/orders/[id]/status` (status-only, gated by `src/lib/orderStatus.ts`'s fixed transition
graph). No carrier/tracking-number field, no order-level shipping-proof storage, and no `ใบปะหน้า`/
`เลขพัสดุ` capability exist anywhere in the schema (`orders` has only `shipping_fee REAL`, a monetary
amount) — confirmed via exhaustive search across all back-office files. `shipped` already exists as a
real order status (no schema change needed for that specific case). The only capability achievable
with zero schema/API change was a print-friendly receipt/packing-slip view, since every field it
needs (customer name/phone/address, items, subtotal/shipping/discount/total, payment method, channel)
is already returned by the existing `GET /api/orders/[id]`.

**Real-data discovery during audit-follow-up testing**: historical order id 1's `status` changed from
`pending` (unchanged through every prior STEP this session) to `cancelled` between STEP 47 and this
STEP's testing. No action in this STEP performed any mutation (only navigation, read-only script
evaluation, and a stubbed `window.print()` click) — this was the user's own live activity on the app.
**Documented as an observation only; not reverted, per instructions.**

**Implemented, isolated entirely to `src/app/orders/[id]/page.tsx`**:
- A "🖨️ พิมพ์ใบเสร็จ / ใบปะหน้าพัสดุ" button next to the existing back link, calling the browser's
  native `window.print()` (which already offers "Save as PDF" on every major browser — no extra code
  needed for that).
- The entire existing on-screen Order Detail UI (status card, status-change buttons, items table,
  shipping summary, linked-transactions section) wrapped in one `print:hidden` div — completely
  unchanged internally, only the wrapping element and one className are new.
- A new, separate `hidden print:block` section: a plain black-on-white receipt/packing-slip layout
  (order number, date, "จัดส่งถึง" customer block, item table, subtotal/shipping/discount/grand total,
  channel, payment method, and a COD-amount box shown only when `order.payment_method === "cod"`,
  always equal to `order.total`) — built entirely from the same `order` object the page already
  fetches. No carrier/tracking fields shown or invented, since none exist in the data.

**Files changed**: `src/app/orders/[id]/page.tsx` only. **No changes to** any API route, `src/lib/orders.ts`,
`src/lib/db.ts`, `src/lib/transactions.ts`, any database schema, Finance, Inventory, Customers,
Products, Video Studio, Voice Studio, Content Studio, or Social.
**No dependencies added.**
**Backup created**: `src/app/orders/[id]/page.tsx.step48-backup-20260901-225907`.

**Tested (real dev server, real browser via chrome-devtools MCP)**:
1. `pnpm exec tsc --noEmit` → **PASS**. `pnpm run build` → **PASS**, route list unchanged.
2. Real Order Detail pages (a real live order and historical order id 1) both load with zero console
   errors; existing status card, status-change buttons, items table, shipping summary, and
   linked-transactions section all render exactly as before.
3. Print button visible only once the order has loaded; clicking it correctly invoked `window.print()`
   — verified by stubbing `window.print` and confirming the stub was called, avoiding a real native
   print dialog that would have hung the automated browser.
4. **Print CSS verified at the source**: fetched the actual served CSS bundle and confirmed
   `@media print { .print\:block { display: block } .print\:hidden { display: none } }` compiled
   correctly — proving the on-screen UI is hidden and the receipt block shown when printing/saving as
   PDF.
5. Print-only block correctly rendered order number, date, customer name/phone/address, item table,
   subtotal/shipping/discount/grand total, channel, payment method — tested against two different real
   orders, including one with no customer (correctly showed "ไม่มีข้อมูลลูกค้า" instead of breaking).
6. COD banner logic present and derived entirely from the existing `order.total` — not exercised live
   (neither available real order is COD) but the same pattern was already proven correct end-to-end in
   STEP 47's live testing.
7. `/orders`, `/finance`, `/tax` regression-checked — zero console errors.
8. **Data integrity**: row counts identical before/after this STEP's testing
   (`products:5, orders:2, order_items:2, inventory_movements:5, transactions:1, customers:1`) —
   confirms this was a pure read/print-view feature with no write path at all.

**Defects found**: none.

**Git**: nothing committed, nothing pushed, per instructions.

**STEP 48 STATUS: PASS**

---

## 20. RECOVERY IN A NEW CHAT

If this chat reaches its limit:

Open a new ChatGPT chat and say:

"ทำโปรเจกต์ THAI AMULET AI ต่อจาก PROJECT_STATUS.md
โปรเจกต์อยู่ที่ C:\Users\maxim\thai-amulet-ai
อย่าเริ่มใหม่ ให้ตรวจสถานะจากไฟล์ก่อน"

Then provide the current PROJECT_STATUS.md if needed.

The next development target is:

VOICE STUDIO → VIDEO STUDIO

---

END OF PROJECT STATUS
