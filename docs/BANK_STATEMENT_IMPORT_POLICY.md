# Bank Statement Import — Architectural Decisions — STEP C.1

เอกสารนี้บันทึก **decision/design เท่านั้น** สำหรับ STEP C — Bank Statement Import ต่อจาก STEP C.0
(audit) ยังไม่มีการแก้ schema, migration, API, UI, parser, หรือติดตั้ง dependency ใดๆ ประกอบเอกสารนี้
(ดู Safety Check ท้ายเอกสาร)

---

## 1. Money Representation

**Decision: money fields ของ `BankStatementTransaction` ในอนาคต (`debit`, `credit`, `amount`,
`balance`) จะเก็บเป็น INTEGER หน่วยสตางค์ (minor units, 1 บาท = 100 สตางค์) ไม่ใช่ JavaScript
floating-point**

### เหตุผล (ตรวจ existing convention ก่อนตัดสินใจ)

โปรเจกต์นี้**ไม่มี Prisma/Postgres** (ยืนยันซ้ำ — ไม่มี `prisma/` directory, ไม่มี dependency ชื่อ
`prisma`/`@prisma` ใน `package.json` มาตั้งแต่ STEP B.1) จึงไม่มี Prisma `Decimal` type ให้ตรวจสอบ
convention จริงคือ SQLite ผ่าน `better-sqlite3` ตรวจ `src/lib/db.ts` แล้วพบว่า **ทุกคอลัมน์เงินที่มีอยู่
จริงในระบบใช้ `REAL`** (IEEE-754 double) ไม่มีข้อยกเว้น:

```
products.price / products.cost         REAL
order_items.price / order_items.cost   REAL
orders.subtotal / shipping_fee /
  discount / total                     REAL
transactions.amount                    REAL
ai_cost_ledger.*_cost                  REAL
```

SQLite เองไม่มี fixed-point `DECIMAL`/`NUMERIC` type จริง (column affinity `NUMERIC`/`DECIMAL` เป็นแค่
"คำใบ้" การแปลงชนิดข้อมูล ไม่ใช่ arbitrary-precision storage) และ `better-sqlite3` ก็ marshal ค่าตัวเลข
ทุกตัวผ่าน JS number (IEEE-754 double) เข้า/ออกจากฐานข้อมูลเสมอ ไม่ว่าจะประกาศ column affinity เป็น
อะไรก็ตาม — ดังนั้น "เก็บเป็น Decimal/NUMERIC" ในบริบทของ SQLite/better-sqlite3 **ไม่สามารถทำได้จริง
โดยไม่เพิ่ม dependency** (เช่น decimal.js/big.js ที่ยังไม่ได้อนุมัติให้ติดตั้งใน STEP นี้)

เพื่อทำตามกฎ "ห้ามใช้ JavaScript floating-point number เป็น financial source of truth" โดยไม่เพิ่ม
dependency ใดๆ วิธีเดียวที่ทำได้จริงและเป็นมาตรฐานสำหรับระบบการเงินคือ **เก็บจำนวนเงินเป็น INTEGER
หน่วยที่เล็กที่สุดของสกุลเงิน (minor unit)** — จำนวนเต็มใน JS มีค่าตรงเป๊ะ (exact) ภายในขอบเขต
`Number.MAX_SAFE_INTEGER` (2^53-1 ≈ 9 ล้านล้านล้าน) ซึ่งเกินความจำเป็นของธุรกรรมจริงในระบบนี้มหาศาล
จึงไม่มีความเสี่ยงเรื่อง precision loss เลยตราบใดที่การแปลง string→integer ทำอย่างถูกต้อง (ดูข้อ
"Parsing pipeline" ด้านล่าง)

**ทำไมไม่เลือกเก็บเป็น TEXT string ของค่าทศนิยมแทน:** พิจารณาแล้วและไม่เลือก เพราะแม้จะหลีกเลี่ยง
floating-point ได้เหมือนกัน แต่การคำนวณ/เปรียบเทียบ (sum, running-balance check ตาม STEP C.0 §4/§8)
จะต้อง parse กลับเป็นตัวเลขทุกครั้งอยู่ดี (เสียประโยชน์ของการเก็บเป็น string ไป) หรือไม่ก็ต้องพึ่ง
big-decimal library (dependency ที่ยังไม่อนุมัติ) — INTEGER หน่วยสตางค์ให้ arithmetic ที่ปลอดภัยและ
เร็วโดยไม่ต้องเพิ่ม dependency เลย

### Precision/Scale

**Scale = 2 ตำแหน่งทศนิยม (สตางค์)** — ไม่ได้ invent เอง แต่มาจากหน่วยย่อยจริงของสกุลเงินบาท (THB)
ซึ่งเป็นสกุลเงินเดียวที่มีหลักฐานการใช้งานจริงในระบบนี้ (ตรวจแล้ว: ไม่มี currency อื่นใดถูกใช้จริงใน
`bank_accounts` หรือที่ใดในระบบ, `currency` field เป็น free text เผื่ออนาคตแต่ default `'THB'` เสมอ
ตาม STEP B.1) **หมายเหตุสำคัญ:** ถ้าในอนาคตมี currency อื่นที่ minor-unit ไม่ใช่ 2 ตำแหน่ง (เช่น JPY = 0
ตำแหน่ง) ต้อง revisit decision นี้ตอนนั้น ไม่ใช่เดาล่วงหน้าตอนนี้ — ตรงกับหลักการ "ห้าม invent precision
แบบไม่มีเหตุผล"

**"Precision" (ขนาดสูงสุด):** ไม่กำหนดเพดานเทียมใดๆ เพราะ INTEGER ใน SQLite รองรับถึง 64-bit signed
(ประมาณ 9.2 × 10^18) และ JS safe-integer range (2^53-1 ≈ 9 × 10^15 สตางค์ = ประมาณ 9 หมื่นล้านล้านบาท)
เกินความจำเป็นของธุรกิจนี้อย่างมหาศาลอยู่แล้ว ไม่มีเหตุผลทางธุรกิจใดที่จะกำหนดเพดานที่แคบกว่านี้

### Sign Convention

- `debit`, `credit` — แยกคอลัมน์ nullable, ไม่ติดลบ (ตรงกับที่ statement ธนาคารแสดงจริง 2 คอลัมน์)
- `amount` — signed INTEGER, derive จาก `credit - debit` (คำนวณด้วย integer arithmetic ที่แม่นยำ
  100% ไม่ผ่าน floating point เลย): **บวก = เงินเข้า (credit/inflow), ลบ = เงินออก (debit/outflow)**
  ตรงกับที่มนุษย์อ่าน statement และตรงกับแนวคิด income/expense ที่ `transactions.transaction_type`
  ใช้อยู่แล้ว
- `balance` (ถ้ามี) — signed INTEGER หน่วยสตางค์เช่นกัน

### Validation Rules (บันทึกเป็น decision สำหรับ implementation ในอนาคต)

- `debit` และ `credit` เป็นค่าที่ไม่ใช่ศูนย์**พร้อมกันในแถวเดียวกัน → invalid แถวนั้น** (ไม่ใช่รูปแบบ
  statement ธนาคารจริงที่เคยพบ)
- `debit` และ `credit` เป็น 0/null พร้อมกัน → ถือเป็นแถว informational (เช่น ยอดยกมา) ไม่ใช่ transaction
  จริง ต้องมี policy แยกจัดการ ไม่ import เป็นรายการเงิน ฿0 เงียบๆ
- Malformed cell (ไม่ใช่ตัวเลขที่ parse ได้) → **reject แถวนั้นทันที** ไม่เดา ไม่ปัดเป็น 0

### Parsing Pipeline (สำหรับ implementation ในอนาคต — ยังไม่ implement ใน C.1)

```
raw cell (string จาก CSV)
   ↓ string validation (regex ตรวจรูปแบบตัวเลข + ทศนิยมไม่เกิน 2 ตำแหน่ง, reject ถ้าไม่ผ่าน)
   ↓ แปลงเป็น integer สตางค์ ด้วย string-based scaling (แยกส่วนจำนวนเต็ม/ทศนิยมจาก string โดยตรง
     แล้วคูณ/รวมด้วย integer arithmetic — ห้ามใช้ Math.round(parseFloat(x) * 100) เพราะ parseFloat
     เข้าสู่ floating point ก่อนคูณ ซึ่งอาจคลาดเคลื่อนได้สำหรับบางค่า แม้จะ round ภายหลังก็ตาม)
   ↓ INTEGER (สตางค์) — ค่าที่ persist ลง DB จริง
```

- **ห้าม silently round** — ถ้า cell มีทศนิยมเกิน 2 ตำแหน่ง (ผิดปกติสำหรับ THB) ต้อง reject/flag ไม่ใช่
  ปัดเงียบๆ
- **ห้ามใช้ floating point คำนวณ financial totals** — ผลรวม/ยอดสรุปต้องคำนวณจาก integer สตางค์แล้ว
  ค่อยแปลงเป็นทศนิยมเฉพาะตอน**แสดงผล** เท่านั้น (division by 100 เพื่อ format เป็น string ให้มนุษย์อ่าน
  ไม่ใช่เพื่อคำนวณต่อ)
- Preview UI แสดงเป็น string/formatted value ได้ตามปกติ (เช่น "1,500.75 บาท") แต่ค่าที่ persist ต้องเป็น
  INTEGER สตางค์เสมอ ไม่ใช่ string หรือ float

### ผลกระทบที่ต้องรู้ล่วงหน้าสำหรับ STEP D (บันทึกไว้ ไม่ใช่ปัญหาที่ต้องแก้ใน C.1)

`transactions.amount` (ตารางเดิม) ยังเป็น `REAL` (บาท, floating point) ตาม convention เดิมของทั้งระบบ
— การตัดสินใจนี้ทำให้ `bank_statement_transactions.amount` (สตางค์, INTEGER) กับ `transactions.amount`
(บาท, REAL) มี representation ต่างกัน STEP D (matching/reconciliation) จะต้องแปลงหน่วยอย่างระมัดระวัง
ตอนเปรียบเทียบสองค่านี้ — ไม่ใช่ blocker ของ STEP C แต่เป็นสิ่งที่ STEP D ต้องออกแบบรับมือ ไม่ใช่เรื่อง
ที่ผิดพลาดโดยไม่ตั้งใจ

---

## 2. CSV Parsing Approach

**Decision: parser ต้อง RFC-4180-safe เต็มรูปแบบ ห้ามใช้ `split(",")` แบบ naive**

ต้องรองรับ (สำหรับ implementation ในอนาคต):
- quoted fields, comma ภายใน quoted field, escaped quotes (`""`)
- embedded newline ภายใน quoted field
- UTF-8 และ UTF-8 with BOM (strip BOM ก่อนประมวลผล — เคยมีประสบการณ์ตรงจากทิศทางตรงข้ามแล้วใน
  `src/app/api/tax/export/route.ts` ที่เขียน BOM ใส่ CSV export เพื่อให้ Excel เปิดภาษาไทยถูกต้อง)
- ตรวจจำนวนคอลัมน์ให้สม่ำเสมอทุกแถว (แถวที่คอลัมน์ไม่ครบ/เกิน → row-level error ไม่ใช่ fatal file error)
- คืนค่าเป็น structured rows + parse errors แยกกันชัดเจน ไม่ throw ทิ้งทั้งไฟล์เพราะบางแถวผิด
- parser layer ต้องแยกจาก business logic ของ statement (parser ไม่รู้จัก `BankAccount`/duplicate
  detection ใดๆ — รับ input คืน rows/errors เท่านั้น)
- parser **ต้องไม่ mutate DB** เด็ดขาด (เป็น pure function ของ input file → structured output)

### Security constraints (บันทึกเป็น decision สำหรับ implementation)

- จำกัด file size (ตาม pattern เดิมที่มีอยู่แล้วใน
  `src/app/api/transactions/[id]/attachments/route.ts`'s `MAX_IMAGE_SIZE_BYTES` — ใช้แนวคิดเดียวกัน
  กำหนดเพดานสำหรับ statement file)
- จำกัด row count และ column count (ป้องกัน memory exhaustion จากไฟล์ผิดปกติ/ประสงค์ร้าย)
- จำกัดความยาว cell แต่ละอัน (ป้องกัน single-cell payload ขนาดใหญ่ผิดปกติ)
- ห้าม execute formula ใดๆ — ค่า cell ที่ขึ้นต้นด้วย `=`, `+`, `-`, `@` ต้องถูกอ่านเป็น**ข้อมูลข้อความ
  ธรรมดาเท่านั้น** (parser ไม่มีทางรัน spreadsheet formula อยู่แล้วโดยธรรมชาติของการ parse เป็น string
  แต่ต้อง**เตรียมการป้องกันตอน export/re-render กลับเป็น spreadsheet ในอนาคต** — escape/prefix ค่าที่
  ขึ้นต้นด้วยอักขระเหล่านี้ตอนเขียนออกไปยัง CSV/Excel อื่นในอนาคต ไม่ใช่ตอน import เข้าระบบ, ค่าที่เก็บ
  ใน DB ต้องคง byte-faithful กับต้นฉบับเสมอ ตรงกับหลักการเดียวกับ `docs/BANK_ACCOUNT_NUMBER_POLICY.md`
  ที่ห้าม silently rewrite ค่าต้นทาง)
- Malformed/malicious input (invalid encoding ที่กู้ไม่ได้, ไฟล์เสียหาย) → fatal file error ก่อนเข้าสู่
  ขั้น preview เลย ไม่ใช่ปล่อยให้ parse บางส่วนแล้วเดาที่เหลือ

### Dependency Finding

ตรวจ `package.json` แล้ว **ไม่มี CSV parser dependency ใดๆ อยู่ในโปรเจกต์นี้เลย** (ไม่มี `csv-parse`,
`papaparse`, หรือ CSV library อื่นใด) โค้ดที่เกี่ยวกับ CSV ที่มีอยู่จริงมีจุดเดียวคือ
`src/app/api/tax/export/route.ts` ซึ่งเป็น **CSV writer ที่เขียนเองไม่พึ่ง library** (`csvField()`/
`csvRow()` escaping ธรรมดา) — เป็นทิศทางตรงข้าม (export ไม่ใช่ import) ใช้เป็นหลักฐานว่าโปรเจกต์นี้มี
convention "เขียนเองแทนที่จะเพิ่ม dependency" อยู่แล้วสำหรับงาน CSV ระดับพื้นฐาน

**ยังไม่เลือก/ติดตั้ง dependency ใดๆ ใน STEP C.1 นี้** — บันทึกไว้ 2 ทางเลือกสำหรับ implementation
ในอนาคต:

- **ทาง A — Internal RFC-4180-safe parser:** เขียนเอง ไม่เพิ่ม dependency สอดคล้องกับ convention เดิม
  ของโปรเจกต์ (`tax/export/route.ts`) ควบคุมพฤติกรรม/security ได้เต็มที่ แต่ต้อง implement +
  test ให้ครอบคลุม edge case ทั้งหมดข้างต้นเอง (quoted-comma, escaped-quote, embedded-newline ฯลฯ)
- **ทาง B — Vetted CSV parsing dependency:** เพิ่ม library ที่ได้รับการพิสูจน์แล้ว (เช่น
  `csv-parse`/`papaparse` หรือเทียบเท่า) ลดความเสี่ยงจาก parser bug ที่เขียนเอง แต่ต้องผ่านการอนุมัติ
  เพิ่ม dependency แยกต่างหาก (มี security/maintenance surface เพิ่มขึ้น)

การเลือกระหว่าง A/B เป็นการตัดสินใจของ implementation STEP ถัดไป ไม่ใช่ของ C.1

---

## 3. Format Scope

| Format | Scope | หลักฐาน dependency ที่มีอยู่ |
|---|---|---|
| **CSV** | MVP | ไม่มี dependency อยู่แล้ว (เขียนเองตาม §2) |
| **XLSX** | Future (หลัง security/parser strategy ชัดเจน — ดู STEP C.0 §12) | **ไม่มี** dependency รองรับ XLSX ในโปรเจกต์นี้เลย (ตรวจ `package.json` แล้ว) |
| **XLS** (legacy binary) | Deferred | ไม่มี dependency รองรับ |
| **PDF** | Deferred | ไม่มี dependency รองรับ (ไม่มี `pdf-parse` หรือเทียบเท่า) |
| **OFX** | Deferred | ไม่มี dependency รองรับ |
| **QFX** | Deferred | ไม่มี dependency รองรับ |

ไม่มีการติดตั้ง dependency ใดๆ ใน STEP นี้ ยืนยันจาก `package.json` (อ่านทั้งไฟล์แล้ว) ว่า dependencies
ปัจจุบันมีเพียง `better-sqlite3`, `next`, `openai`, `react`, `react-dom` — ไม่มีรายการใดรองรับ format
เหล่านี้เลยแม้แต่รายการเดียว

---

## 4. Source of Truth

```
BankAccount → BankStatement → BankStatementTransaction
```

`BankStatementTransaction` เป็น **immutable source evidence** จากธนาคาร — เมื่อ reconciliation (STEP D)
เริ่มทำงาน:

- ห้ามเปลี่ยน source `amount`
- ห้ามเปลี่ยน source `date`
- ห้ามเปลี่ยน source `description`
- ห้าม overwrite bank transaction ด้วยเหตุผลใดๆ เพื่อให้ match กับ Finance transaction

การ mapping ระหว่าง statement transaction กับ Finance transaction ต้องอยู่ใน **reconciliation/mapping
layer แยกต่างหาก** (เช่น ตาราง mapping ในอนาคตที่อ้างอิงทั้งสองฝั่งด้วย id ไม่ใช่แก้ค่าใดฝั่งหนึ่ง) —
หลักการเดียวกับที่ `docs/BANK_ACCOUNT_NUMBER_POLICY.md` วางไว้แล้วสำหรับ accountNumber matching
(normalized candidate ใช้เปรียบเทียบเท่านั้น ห้าม overwrite ค่าต้นทาง) ขยายใช้กับ statement transaction
ทั้งแถวด้วยหลักการเดียวกัน

---

## 5. Duplicate / Idempotency

สามระดับ (จาก STEP C.0 §6, บันทึกเป็น decision):

1. **File-level** — SHA-256 hash ของไฟล์ต้นฉบับ เทียบกับทุก statement ที่เคย import ของ
   `bankAccountId` เดียวกัน
2. **Statement-level** — `bankAccountId` + statement period + source identity (soft signal เตือน
   ผู้ใช้ ไม่ใช่ hard block เพราะช่วงเวลาที่ทับซ้อนกันอาจถูกต้องจริง เช่น export ซ้ำที่แก้ไขแล้ว)
3. **Transaction-level** — bank-provided transaction ID ก่อนเสมอถ้ามี (`BANK_PROVIDED_IDENTIFIER`
   ตาม `docs/BANK_ACCOUNT_NUMBER_POLICY.md`'s matching-strategy vocabulary) ตกมาที่ composite
   fingerprint เป็น fallback (`bankAccountId` + date + amount + debit/credit direction + description
   + ลำดับภายในกลุ่มที่ค่าเหมือนกัน — ไม่ใช่ description อย่างเดียว ไม่ใช่ amount อย่างเดียว)

**ห้าม silently discard duplicate ใดๆ** — duplicate candidate ทุกแถวต้องแสดงใน preview ให้ user
เห็นและตัดสินใจเอง (skip/import-anyway) ไม่มีการตัดสินใจอัตโนมัติฝ่ายเดียวจากระบบ

---

## 6. Preview / Commit

```
Upload → Validate → Parse → Preview → User Review → Confirm → Atomic Import
```

**Upload ≠ Import เสมอ**

- **Preview:** ห้าม mutate production DB โดยเด็ดขาด ต้องแสดง: total rows, valid, invalid, duplicate,
  new, warnings — ครบทุกหมวด ห้าม silently ตัดรายการใดออกโดยไม่แจ้ง
- **Confirm:**
  - **Atomic** — all-or-nothing ต่อ batch (ตาม convention `db.transaction()` ที่มีอยู่แล้วใน
    `createOrder()`/`createTransaction()`)
  - **Retry-safe** — ถ้า import ล้มเหลว ไม่มีแถวใดถูก persist เลย (atomic) การ retry จึงปลอดภัยโดย
    ธรรมชาติ ไม่ต้องมี retry-specific logic แยก
  - **Double-click-safe** — แนะนำให้ confirm re-validate ที่ server เสมอ (ไม่พึ่ง client-side
    disable-button อย่างเดียว) โดยอาศัย file-level SHA-256 duplicate check (ข้อ 5.1) เป็นกลไกหลัก:
    การ submit confirm ซ้ำสำหรับไฟล์เดียวกันจะ hash ตรงกันและถูกจับเป็น duplicate โดยอัตโนมัติ ตรงกับ
    pattern ที่มีอยู่แล้วในระบบ (STEP 34's duplicate-income-per-order guard ที่รันเช็คซ้ำภายใน
    `db.transaction()` เดียวกับการ insert เพื่อความปลอดภัยจาก concurrent/double-submit request)
  - **Failure state ชัดเจน** — สถานะ `FAILED` ต้องแยกจาก `IMPORTED` อย่างไม่กำกวม (ตาม state machine
    ที่ STEP C.0 §18 เสนอไว้)

---

STEP C.1 — decision/design only ตามที่อนุมัติ ไม่มีการแก้ schema, migration, API, library, UI, parser,
dependency, ข้อมูลจริง, หรือสร้าง test data ใดๆ ประกอบเอกสารนี้
