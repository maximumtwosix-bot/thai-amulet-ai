# Bank Statement PDF Import (Password-Protected) — Architectural Decisions — STEP E.1

เอกสารนี้บันทึก **decision/design เท่านั้น** สำหรับ STEP E — PDF Bank Statement Import ต่อจาก STEP
E.0 (audit) ยังไม่มีการแก้ source code, schema, migration, API, UI, หรือติดตั้ง dependency ใดๆ
ประกอบเอกสารนี้ (ดู Safety Check ท้ายเอกสาร)

เอกสารนี้เป็นส่วนขยายของ `docs/BANK_STATEMENT_IMPORT_POLICY.md` (STEP C.1) ซึ่งวาง decision สำหรับ
CSV ไว้แล้วและระบุชัดว่า PDF ถูก **Deferred** ("ไม่มี dependency รองรับ (ไม่มี `pdf-parse` หรือ
เทียบเท่า)") ทุก decision ในเอกสารนี้ต้อง **ไม่ขัดแย้ง** กับ decision เดิมของ STEP C.1 (money =
INTEGER satang, immutable source evidence, atomic confirm, never-trust-client-on-reparse ฯลฯ) —
เอกสารนี้เพิ่มเฉพาะส่วนที่เป็นของ PDF โดยเฉพาะเท่านั้น

---

## 1. PDF Decrypt Library

### Ecosystem ปัจจุบัน (ตรวจก่อนตัดสินใจ)

ยืนยันจาก `package.json`/`pnpm-lock.yaml` (อ่านทั้งไฟล์แล้ว): dependencies ปัจจุบันมีเพียง
`better-sqlite3`, `next`, `openai`, `react`, `react-dom` — **ไม่มี PDF library ใดๆ ติดตั้งอยู่เลย**
(ไม่มี `pdf-parse`, `pdf-lib`, `pdfjs-dist`, `mupdf`, `qpdf`, `hummus`/`muhammara`,
`node-poppler`) ตรงกับที่ STEP C.1 บันทึกไว้แล้ว

โปรเจกต์นี้มี native dependency อยู่แล้วหนึ่งตัว (`better-sqlite3`, ใช้ prebuilt binding ผ่าน
node-gyp/prebuild-install) — จึงไม่ใช่ "ไม่เคยมี native dependency มาก่อนเลย" แต่ก็ยังเป็น
convention ที่ต้องระมัดระวัง ไม่เพิ่มพร่ำเพรื่อ

### ตัวเลือกที่พิจารณา

| Library | ผล |
|---|---|
| **pdf-lib** | **ตัดออก** — ไม่รองรับการอ่าน/ถอดรหัส encrypted PDF จริง แม้จะมี option `ignoreEncryption: true` ผลลัพธ์ก็เป็นเอกสารว่าง/เสียหาย (documented limitation ที่ยังเปิดค้างอยู่ใน upstream repo ตั้งแต่ปี 2022-2024) ใช้ไม่ได้กับ use case นี้เลยตั้งแต่ต้น |
| **qpdf / node-qpdf (wrapper)** | **ตัดออก** — (ก) เป็น native CLI binary ต้องติดตั้งแยกจาก npm ลง host OS เอง (Windows dev/production ต้องมี installer ต่างหาก ไม่ใช่ `pnpm install` อย่างเดียว) เพิ่มความซับซ้อนการ deploy อย่างมีนัยสำคัญ (ข)wrapper ยอดนิยม `node-qpdf` มีช่องโหว่ **CVE-2023-26155 (Command Injection, CVSS 7.3, CWE-77)** ที่เมธอด `encrypt()` ไม่ sanitize input path ก่อนส่งเข้า command execution API และ **ยังไม่มี patched version เลย** ณ ปัจจุบัน — แม้จะใช้เฉพาะฟังก์ชัน decrypt ไม่ใช่ encrypt ความเสี่ยงเชิงหลักการของการ shell-out ไปยัง binary ด้วย path ที่มาจากไฟล์ผู้ใช้อัปโหลดก็เป็นรูปแบบเดียวกัน (command injection surface) — ไม่ยอมรับความเสี่ยงนี้กับระบบข้อมูลการเงิน |
| **pdfjs-dist (Mozilla PDF.js)** | **เลือก** — ดูเหตุผลด้านล่าง |

### Final Choice: `pdfjs-dist`

**Decision: ใช้ `pdfjs-dist` (Mozilla PDF.js) เป็น library เดียวสำหรับทั้ง decrypt และ text
extraction (ดูข้อ 2)**

เหตุผล:
- **Pure JavaScript, ไม่มี native binary** — ติดตั้งผ่าน `pnpm add` ตรงๆ ไม่ต้องพึ่ง binary แยกบน
  host เหมือน qpdf — สอดคล้องกับ deployment model ปัจจุบันของโปรเจกต์ (Next.js บน Node.js
  runtime, ไม่มี system-level binary dependency นอกจาก native addon ของ `better-sqlite3` ที่มี
  prebuilt binding อยู่แล้ว)
- **รองรับ password-protected PDF โดยตรงในตัว library เอง** — `getDocument()` API มี
  `onPassword` callback และโยน `PasswordException` พร้อม code แยกชัดระหว่าง
  `PasswordResponses.NEED_PASSWORD` กับ `INCORRECT_PASSWORD` — ทำให้แยก error case "ต้องใส่
  password" กับ "password ผิด" ได้ตรงไปตรงมา ไม่ต้องเขียน decrypt logic เองเลย (ต่างจากบาง
  library ที่ต้องแยก decrypt-then-parse เป็นสองขั้นตอนคนละ tool)
- **License: Apache License 2.0** — permissive, เข้ากันได้กับโปรเจกต์เชิงพาณิชย์ ไม่มีเงื่อนไข
  copyleft
- **Maintenance: active มาก** — พัฒนาโดย Mozilla, เป็น engine เดียวกับที่ใช้ใน Firefox
  built-in PDF viewer จริง (ผ่านการใช้งานระดับ production scale สูงสุดระดับหนึ่งของ ecosystem
  JS) เวอร์ชันล่าสุด ณ ช่วงเวลาที่ตรวจ (กันยายน 2026) คือ 6.3.x ออกใหม่สม่ำเสมอ, npm weekly
  download ระดับหลักล้าน
- **CVE history — ตรวจแล้ว ประเมินว่ายอมรับความเสี่ยงได้สำหรับ use case นี้ แต่ต้องมีมาตรการ
  ป้องกันเพิ่ม (ดู Section 9)**: ช่องโหว่ที่เคยพบ (เช่น CVE-2018-5158 — PostScript calculator
  function ที่ไม่ sanitize พอ ทำให้ inject JavaScript เข้าสู่หน้าเว็บที่ embed viewer;
  CVE-2015-2743 — worker สิทธิ์สูงเกินไป; CVE-2024-4367) **เกือบทั้งหมดเป็นช่องโหว่ในบริบทของ
  PDF viewer ที่ render ในเบราว์เซอร์ (canvas rendering + embedding page context)** ไม่ใช่บริบท
  headless text-extraction บน Node.js ที่ระบบนี้จะใช้ (ไม่ render เป็นภาพ, ไม่มี embedding web
  page ให้ inject เข้า) ความเสี่ยงที่เหลือจึงต่ำกว่ามาก แต่ไม่เป็นศูนย์ — ดู mitigation ที่บังคับ
  ไว้ใน Section 9

### ข้อจำกัด/Trade-off ที่ต้องบันทึกไว้ (ไม่ใช่ blocker แต่ต้องรู้ล่วงหน้า)

1. `pdfjs-dist` ออกแบบมาเพื่อเบราว์เซอร์เป็นหลัก — การใช้ใน Node.js ต้อง import จาก entry point
   `pdfjs-dist/legacy/build/pdf.mjs` (ไม่ใช่ entry point หลักที่ import ตรงๆ ซึ่งคาดหวัง DOM
   API เช่น `canvas`/`Worker` ของเบราว์เซอร์) — implementation STEP (E.3) ต้องตั้งค่า
   `GlobalWorkerOptions` และ/หรือปิดการใช้ web worker ให้เหมาะกับ Node runtime (ไม่ต้องการ
   canvas/รูปภาพเลยเพราะ E.1 ต้องการแค่ text layer ไม่ใช่การ render หน้าเป็นภาพ)
2. Bundle size ใหญ่กว่าที่คาดสำหรับงาน text-only (เพราะมี rendering engine เต็มรูปแบบรวมอยู่
   ด้วยแม้จะไม่ได้ใช้ทุกส่วน) — ยอมรับได้ เพราะเป็น server-side dependency ไม่กระทบ client
   bundle
3. ต้อง pin เวอร์ชันเป๊ะ (ไม่ใช้ range กว้าง) และติดตาม security advisory ของ `pdfjs-dist`
   สม่ำเสมอ เนื่องจากเป็น parser ของ untrusted binary format ที่มีประวัติช่องโหว่มาก่อน — เป็น
   ความรับผิดชอบต่อเนื่องของ implementation STEP ไม่ใช่ one-time decision
4. พิจารณาแล้วไม่เลือก wrapper สำเร็จรูปอย่าง `unpdf` (UnJS) ซึ่งห่อ `pdfjs-dist` อีกชั้นสำหรับ
   serverless — เพิ่ม abstraction layer และ dependency เพิ่มโดยไม่จำเป็น เพราะโปรเจกต์นี้ควบคุม
   Node.js runtime เองอยู่แล้ว (ไม่ใช่ edge/serverless ที่มีข้อจำกัดพิเศษ) เรียก `pdfjs-dist`
   ตรงๆ ให้ความโปร่งใส/ควบคุมได้มากกว่า สอดคล้องกับ convention เดิมของโปรเจกต์ที่หลีกเลี่ยง
   wrapper layer ที่ไม่จำเป็น (เช่นที่ CSV engine เขียนเองแทนพึ่ง `papaparse`)

---

## 2. PDF Text Extraction

**Decision: deterministic text extraction เป็น primary และ path เดียวที่รองรับใน STEP E.1 — ใช้
library เดียวกับข้อ 1 (`pdfjs-dist`) ทำทั้ง decrypt และ extract ในเครื่องมือเดียว ไม่เพิ่ม library
ที่สอง**

- วิธี: หลัง `getDocument()` decrypt สำเร็จ วน `page.getTextContent()` ทีละหน้า (deterministic,
  ไม่ใช่ heuristic/AI) รวม text items ตามตำแหน่ง (x/y) เพื่อสร้างโครงสร้างบรรทัด/ตารางโดยประมาณ —
  เป็นการ "อ่าน text layer ที่มีอยู่จริงในไฟล์" ล้วนๆ ไม่มีการเดา/สร้างข้อมูลใหม่
- **Text-based PDF (มี text layer จริง) = supported path เดียวใน STEP E.1** — statement PDF จาก
  ธนาคารไทยส่วนใหญ่ (สร้างจาก core banking system โดยตรง ไม่ใช่ scan) อยู่ในกลุ่มนี้
- **Scanned/image-only PDF (ไม่มี text layer เลย หรือ `getTextContent()` คืนค่าว่าง/แทบว่างทุก
  หน้า) = unsupported/deferred ใน STEP E.1** — ยังไม่มีหลักฐานทางธุรกิจ (business evidence) ว่า
  ผู้ใช้จริงมีไฟล์ statement แบบ scan-only ที่ต้องรองรับ ณ ตอนนี้ ตาม principle
  "ห้าม invent requirement ที่ยังไม่มีหลักฐาน" (แนวเดียวกับที่ STEP C.1 ปฏิเสธ Buddhist-Era
  date/currency อื่นโดยไม่มีหลักฐาน) — เมื่อพบ statement ที่ตกกลุ่มนี้ ระบบต้อง**ปฏิเสธอย่าง
  ชัดเจน** (ดู Section 10) ไม่ใช่พยายาม guess หรือคืนผลลัพธ์บางส่วนแบบเงียบๆ
- การ detect "text layer ว่าง" ใช้เกณฑ์ deterministic (เช่น จำนวนตัวอักษรที่สกัดได้รวมทุกหน้า ต่ำ
  กว่า threshold ที่กำหนดไว้ตายตัว) — ไม่ใช้ AI ในการตัดสินใจขั้นนี้เช่นกัน

---

## 3. Password Lifecycle

**Decision: password มีอายุอยู่ในขอบเขตของ request เดียวเท่านั้น (in-memory ระหว่างเรียก
decrypt เท่านั้น) ไม่มีที่ใดในระบบที่ password ถูก persist ในรูปแบบใดๆ ทั้งสิ้น**

กฎที่บังคับ (ไม่มีข้อยกเว้น):

1. รับ password จาก request body/formData field เฉพาะของ endpoint upload/confirm เท่านั้น —
   **ห้ามรับผ่าน query string หรือ URL ใดๆ เด็ดขาด** (query string ติดอยู่ใน server access log,
   browser history, `Referer` header ของ third-party request)
2. Password ถูกใช้เพื่อเรียก `getDocument({ password })`/`onPassword` callback ของ `pdfjs-dist`
   ทันทีที่ได้รับ แล้ว**ปล่อยให้ garbage collect โดยไม่ assign ไปเก็บใน variable ที่มี scope
   กว้างกว่าฟังก์ชัน decrypt เดียวนั้น** — ไม่มี module-level cache, ไม่มี in-memory session
   store ของ password
3. **ห้ามเขียน password ลง database ในรูปแบบใดๆ** — ไม่ plaintext, ไม่ hash, ไม่ encrypted-at-rest
   — ไม่มีเหตุผลทางธุรกิจใดที่ต้องเก็บ (ระบบไม่จำเป็นต้อง "จำ" password ของไฟล์เพื่อใช้ซ้ำ — ผู้ใช้
   กรอกใหม่ทุกครั้งที่ต้องประมวลผลไฟล์นั้นจริง — ดู implication ต่อ confirm flow ด้านล่าง)
4. **ห้าม log password** — ทุกจุดที่มี `console.log`/`console.error` ต้องไม่ dump ทั้ง
   request body/formData แบบดิบ (ตรวจสอบ implementation STEP ทุกครั้งว่า error handler ไม่หลุด
   log ค่านี้โดยไม่ตั้งใจ) — สอดคล้องกับ convention ที่มีอยู่แล้วใน `src/lib/auth.ts` (ไม่เก็บ
   `ADMIN_PASSWORD` ที่ไหนนอกจาก env var, ไม่ log) และใน `src/lib/bankStatementCsv.ts` (ไม่
   interpolate raw cell content ลง error message — ขยายหลักการเดียวกันมาใช้กับ password)
5. **ห้ามใส่ password ใน error message หรือ telemetry/analytics event ใดๆ** — error response ต่อ
   client ต้องเป็นข้อความคงที่ (เช่น "รหัสผ่านไม่ถูกต้อง") ไม่ echo ค่าที่ผู้ใช้กรอกกลับมาเลย
6. **ห้ามส่ง password กลับ client** ในทุก response (รวมถึงตอน error, ตอน preview, ตอน confirm) —
   response ทุกอันจะไม่มี field ใดบรรจุค่านี้เลย ไม่ว่ากรณีใด
7. **Confirm flow implication (สำคัญ — ต้อง design ใน STEP E.6):** เนื่องจากไม่มีการ persist
   password และ confirm route ของระบบนี้ต้อง re-decrypt+re-extract ไฟล์จริงจากดิสก์เสมอ (ตาม
   STEP C.1 §6's never-trust-client-on-reparse ที่ CSV ใช้อยู่แล้ว) — **ผู้ใช้ต้องกรอก password
   ซ้ำอีกครั้งตอนกด Confirm** (ไม่ใช่แค่ตอน upload/preview) เป็นผลลัพธ์ที่ตั้งใจ ไม่ใช่ bug — เป็น
   trade-off ที่ยอมรับเพื่อรักษาหลักการ "ห้าม persist password" ไว้อย่างเคร่งครัดเหนือกว่าความ
   สะดวกของ UX (ทางเลือกอื่น เช่น short-lived encrypted session token ผูก password ไว้ชั่วคราว
   ถูกพิจารณาแล้วและ**ปฏิเสธใน STEP E.1 นี้** เพราะเพิ่ม attack surface ใหม่ [ที่เก็บ token, การ
   encrypt/decrypt token เอง] โดยที่ยังไม่มีเหตุผลทางธุรกิจเร่งด่วนพอที่จะรับความเสี่ยงเพิ่ม — ถ้า
   ในอนาคตพบว่า UX นี้เป็นปัญหาจริงจัง ให้เปิด decision ใหม่แยกต่างหาก ไม่ใช่ default เงียบๆ)

---

## 4. Source File Metadata

**Decision: เพิ่มคอลัมน์ `source_file_type` ใน `bank_statements` เป็น additive schema change ที่
STEP E.2 เท่านั้น (ไม่ใช่ STEP นี้)**

- ค่าที่รองรับตอนนี้: `'CSV' | 'PDF'` (TS-layer enum, ตรวจใน `src/lib/bankStatements.ts` แบบ
  เดียวกับ `BankStatementStatus`/`isValidBankStatementStatus()` ที่มีอยู่แล้ว — **ไม่ใช้ SQL
  CHECK constraint** สอดคล้อง 100% กับ convention ที่มีอยู่แล้วทุกคอลัมน์ enum-like ในไฟล์นี้
  (`bank_accounts.classification`, `bank_statements.status` ฯลฯ)
- Default: `'CSV'` — เพื่อ backward-compatible กับทุกแถวที่มีอยู่แล้วในระบบจริง (ที่ล้วนเป็น CSV)
  โดยไม่ต้อง backfill/migration พิเศษ ตรงกับ pattern ที่ `bank_statements.status` ใช้ `DEFAULT
  'UPLOADED'` (ค่า default ที่ปลอดภัยเพราะไม่ได้ซ่อน human judgment ใดๆ — ทุกแถวเก่าเป็น CSV จริง
  ไม่ใช่การเดา)
- คอลัมน์นี้เป็นสิ่งเดียวที่ระบบต้องรู้เพื่อเลือก parser ที่ถูกต้องตอน confirm (re-parse) — ไม่ใช่
  MIME type/extension ที่เชื่อจาก client (เชื่อไม่ได้ในทางเดียวกับที่ MIME declaration ของ CSV
  upload ปัจจุบันก็เป็นแค่ soft signal ไม่ใช่ authority)

---

## 5. Original PDF Preservation

**Decision: เก็บไฟล์ PDF ต้นฉบับ (ที่ยังเข้ารหัสอยู่ ไม่ decrypt) ไว้ถาวรเป็นหลักฐาน โดยใช้ storage
path/protection convention เดียวกับ CSV ทุกประการ**

- Path: `public/generated/bank-statements/{bankAccountId}/{yyyy}/{mm}/{randomUUID}.pdf` — รูปแบบ
  เดียวกับ CSV ปัจจุบัน (`.../route.ts` บรรทัด 375-394) เปลี่ยนแค่ extension
- ป้องกันด้วย `src/proxy.ts`'s `isProtectedGeneratedFile()` ที่มี rule
  `pathname.startsWith("/generated/bank-statements/")` อยู่แล้ว (บรรทัด 98) — **ไม่ต้องแก้
  proxy.ts เลย** เพราะ prefix เดิมครอบคลุมไฟล์ PDF โดยอัตโนมัติ
- ชื่อไฟล์บนดิสก์เป็น `randomUUID()` เสมอ ไม่เคยมาจากชื่อไฟล์ที่ client ส่งมา (path-traversal-
  resistant by construction — pattern เดิมทุกอย่าง)
- **สิ่งที่ห้ามเก็บถาวรเด็ดขาด:**
  - **PDF password** (ตาม Section 3)
  - **เวอร์ชัน decrypted ของไฟล์** — ไม่มีเหตุผลต้องเขียนไฟล์ decrypted ลงดิสก์เลย เพราะ text
    extraction ทำงานกับ buffer ใน memory ของ request เดียวเท่านั้น (ไฟล์ที่เก็บถาวรต้องเป็นไฟล์
    ที่ยังเข้ารหัสอยู่เท่านั้น เพื่อไม่เพิ่มจุดรั่วไหลของข้อมูลการเงินที่อ่านได้โดยไม่ต้องมี
    password)
  - **Extracted text แบบเต็ม (full-text blob)** เป็นไฟล์แยกต่างหาก — ข้อมูลที่ extract แล้วที่
    ควร persist มีแค่ระดับ `bank_statement_transactions` (แถวที่ validate ผ่านแล้ว) เหมือน CSV
    ทุกประการ ไม่ใช่ raw extracted text ทั้งไฟล์
- **Security consideration ของการเก็บเอกสารการเงิน:** PDF statement มีข้อมูลอ่อนไหวสูง (เลขบัญชี
  เต็ม, ชื่อคู่ค้า, ยอดเงิน, บางครั้งมีเลขบัตรประชาชนใน metadata ของธนาคารบางแห่ง) — ต้องอยู่หลัง
  auth gate เสมอ (มีอยู่แล้ว), ไม่ควรมี caching layer ใดๆ ที่ทำให้ CDN/proxy ภายนอกเห็นไฟล์นี้ได้
  (ปัจจุบันไม่มี CDN อยู่แล้ว — บันทึกไว้เป็นข้อควรระวังหากเพิ่มในอนาคต)

---

## 6. Parsing Architecture

```
PDF file (encrypted, uploaded)
   ↓
[decrypt] pdfjs-dist getDocument({ data: buffer, password })
   - password ผิด/ไม่มี → PasswordException (NEED_PASSWORD | INCORRECT_PASSWORD) → fail fast
   ↓
[deterministic text extraction] page.getTextContent() ทุกหน้า
   - ข้อความว่าง/แทบว่างทุกหน้า → SCANNED_PDF_UNSUPPORTED (ไม่ไป AI ใน E.1)
   ↓
[row extraction] regex/layout-based ต่อรูปแบบ statement (explicit mapping, ไม่เดา — เหมือน CSV
   ที่ผู้ใช้ต้องประกาศ column mapping ชัดเจน)
   ↓
CanonicalStatementRow[]  ← รูปร่างเดียวกับที่ src/lib/bankStatementCsv.ts ใช้อยู่แล้ว
   ↓
[existing validation]  ← REUSE parseStatementRow()/parseMoneyToSatang()/parseDateToIso()/
   computeDuplicateFingerprint() เดิมทั้งหมด ไม่เขียนใหม่ (ดู Section 8)
   ↓
Preview (PREVIEW_READY, เหมือน CSV เป๊ะ)
   ↓
Confirm (re-decrypt + re-extract จากไฟล์จริงบนดิสก์ + password ที่ผู้ใช้กรอกใหม่ — Section 3.7)
   ↓
Atomic persistence → bank_statement_transactions (ตารางเดิม ไม่มีตารางใหม่)
```

---

## 7. AI/OCR Policy

**Decision: ห้ามเพิ่ม AI/OCR ใดๆ ใน STEP E.1 หรือ implementation ที่ตามมาจนถึง STEP E.7 — กำหนด
เป็น STEP E.8 แยกต่างหากอย่างเป็นทางการ (conditional, ไม่ใช่ทำแน่นอน)**

เงื่อนไขที่ต้องครบก่อน STEP E.8 จะถูกอนุมัติให้เริ่มได้:

1. มี **หลักฐานทางธุรกิจจริง** ว่าผู้ใช้มี scanned/image-only PDF statement ที่ต้องรองรับ (ไม่ใช่
   สมมติฐานล่วงหน้า) หรือ deterministic extraction (Section 2/6) ให้ confidence ไม่พอสำหรับ
   รูปแบบ statement บางประเภทจริง (มีตัวอย่างไฟล์จริงที่ deterministic path ล้มเหลว)
2. ผ่าน **security review** แยกต่างหาก — โดยเฉพาะประเด็นการส่งข้อมูลการเงิน (ชื่อ, เลขบัญชี
   บางส่วน, ยอดเงิน) ออกไปยัง external API (`openai`) ซึ่งเป็น third-party นอกระบบ
3. ผ่าน **cost review** — ทุก call ไปยัง AI API มีต้นทุนต่อไฟล์ ต้องมี cost ceiling/monitoring
   ก่อนเปิดใช้จริง (โปรเจกต์นี้มี `src/lib/costLedger.ts`/`costConfig.ts` อยู่แล้วสำหรับ AI cost
   tracking ด้าน content — ต้อง extend มาครอบ use case นี้ ไม่ใช่ปล่อยไม่มี tracking)
4. ผ่าน **privacy review** — พิจารณา PDPA implication ของการส่งเอกสารการเงินออกนอกระบบ ต้องมี
   การแจ้ง/ขออนุมัติจาก user ชัดเจนก่อนเปิดใช้เส้นทางนี้ ไม่ใช่ default เปิดไว้เงียบๆ

เมื่อเปิดใช้จริงในอนาคต (STEP E.8) หลักการที่ต้องคงไว้:
- ใช้เป็น **fallback เท่านั้น** เมื่อ deterministic path (Section 2) explicitly ล้มเหลว/ไม่รองรับ
  — ไม่ใช่ path หลักหรือ path คู่ขนานที่รันพร้อมกันเสมอ
- ทุกแถวที่มาจาก AI ต้อง flag แยกชัดเจน (เช่น `extraction_method = 'AI_ASSISTED'`) ให้ user เห็น
  ใน preview ว่าแถวไหนมาจาก AI ไม่ใช่จากการอ่านตรงๆ — ต้อง confirm เข้มกว่าแถวปกติ (เช่น บังคับ
  ต้องกด review ทีละแถว ไม่ใช่ bulk-confirm รวมกับแถว deterministic)
- ไม่มีการตัดสินใจอัตโนมัติฝ่ายเดียวจาก AI ที่ import เข้า DB โดยไม่ผ่าน human confirm — หลักการ
  เดียวกับ STEP C.1 §5 ("ห้าม silently discard duplicate") ขยายมาเป็น "ห้าม silently trust
  AI-derived row"

---

## 8. CSV Compatibility

**Decision: CSV flow ที่มีอยู่ต้องทำงานเหมือนเดิม 100% ไม่มีข้อยกเว้น — PDF เป็น separate branch
โดยสมบูรณ์**

- **ห้ามแก้** `src/lib/bankStatementCsv.ts` (pure CSV parsing engine), โดยเฉพาะ
  `parseAndValidateStatementCsv()`, `parseStatementRow()`, `parseMoneyToSatang()`,
  `parseDateToIso()`, `computeDuplicateFingerprint()` — ฟังก์ชันเหล่านี้ยังคงเป็น CSV-specific
  entry point เดิมเป๊ะ
- **สิ่งที่ PDF path จะ reuse ได้จริงคือ shared validation logic ระดับ row** (money-shape
  validation, date-shape validation, debit/credit conflict check, duplicate fingerprint
  algorithm) — implementation STEP (E.4) ต้องออกแบบให้ PDF-extracted rows แปลงเข้ารูป
  `CanonicalStatementRow` เดียวกันก่อน แล้วป้อนผ่าน validation ที่มีอยู่ ไม่ใช่ copy-paste
  validation logic ไปเขียนซ้ำสำหรับ PDF — แต่ถ้าจำเป็นต้อง extract ฟังก์ชันร่วมออกมาเพื่อให้ทั้ง
  สอง path เรียกใช้ได้ ต้องทำเป็น STEP แยกที่ audit ผลกระทบต่อ CSV ก่อน ไม่ทำเนียนไปกับ STEP อื่น
- **Upload/confirm route** (`src/app/api/bank-statements/route.ts`,
  `[id]/confirm/route.ts`) จะมี PDF เป็น **branch ใหม่คู่ขนาน** (แยกตาม `source_file_type` หรือ
  extension ของไฟล์ที่รับ) — branch เดิมของ CSV ต้องไม่ถูกแตะโครงสร้างเลย นอกจากจุดแยก
  if/else ที่ต้นทาง
- STEP E.9 (CSV regression) เป็น**เงื่อนไขบังคับก่อนขึ้น production** ไม่ใช่ optional — ต้องมี
  หลักฐานว่า CSV test case เดิมทั้งหมดผ่าน 100% หลังรวม PDF path เข้าไปแล้ว

---

## 9. Security Policy

| หัวข้อ | Policy |
|---|---|
| **File size limit** | กำหนด max size แยกต่างหากสำหรับ PDF (ไม่ใช้ค่าเดียวกับ `DEFAULT_CSV_LIMITS.maxFileSizeBytes` ตรงๆ เพราะ PDF โดยธรรมชาติมีขนาดใหญ่กว่า plain text มาก — ต้องกำหนดค่าที่เหมาะสมแยกใน implementation STEP พร้อมเหตุผล ไม่ใช้ unlimited) ตรวจ**ก่อน**เรียก decrypt เสมอ |
| **MIME/content validation** | ตรวจ magic byte `%PDF` (4 byte แรกของไฟล์) ก่อนส่งเข้า `pdfjs-dist` เลย — reuse pattern เดียวกับที่ `src/app/api/tax/documents/route.ts` ทำอยู่แล้วสำหรับ PDF (บรรทัด ~101-102) ไม่ใช้ MIME ที่ client declare เป็น authority |
| **Malicious PDF** | `pdfjs-dist` ใช้เฉพาะโหมด text-extraction เท่านั้น — **ห้ามเปิด rendering เป็น canvas/image, ห้ามเปิด `isEvalSupported`, ห้าม execute embedded JavaScript action/form action ใดๆ** ของ PDF (ฟีเจอร์เหล่านี้ไม่จำเป็นต่อการอ่าน text layer เลย ปิด/ไม่เรียกใช้ตั้งแต่ต้น ไม่ใช่แค่ไม่ตั้งใจเปิด) |
| **Oversized/decompression bomb** | ต้องมี timeout ต่อการ decrypt/extract หนึ่งไฟล์ (fail-closed ถ้าเกิน) และจำกัดจำนวนหน้าสูงสุดที่จะประมวลผล (ป้องกัน PDF ที่มี nested compression stream ขยายขนาดมหาศาลตอน decompress) |
| **Path traversal** | ใช้ pattern เดิม 100% — ชื่อไฟล์บนดิสก์เป็น `randomUUID()` เสมอ ไม่เคยมาจาก client (Section 5) |
| **Temporary file cleanup** | Design นี้**ไม่สร้าง temp file แยกเลย** — decrypt/extract ทำงานบน in-memory `Buffer` ตลอด (อ่านจากดิสก์ครั้งเดียวเข้า memory, ประมวลผลใน memory, ไม่เขียนไฟล์ชั่วคราวใดๆ ลงดิสก์) จึงไม่มีปัญหา orphaned temp file ให้ต้อง cleanup ตั้งแต่ต้น |
| **Password handling** | ตาม Section 3 ทั้งหมด |
| **Logging redaction** | ตาม Section 3 ข้อ 4 — ขยายหลักการเดิมของ `bankStatementCsv.ts` (ห้าม interpolate raw cell content ลง error message) ให้ครอบคลุม password และเนื้อหา extracted text ที่อาจมีข้อมูลอ่อนไหว (ห้าม log extracted transaction text/description เต็มๆ ใน error log เช่นกัน) |
| **Authorization** | ใช้ auth gate เดิมทั้งหมด (`src/proxy.ts` ป้องกัน `/api/bank-statements/*` อยู่แล้ว) — **ไม่ต้องแก้ proxy.ts** เพราะ endpoint เดิมรองรับ PDF ผ่าน route เดิม |
| **Tenant/taxpayer isolation** | ระบบนี้เป็น single-admin session (ไม่มี multi-tenant/multi-user model ตาม `src/lib/auth.ts`) — bank account ownership ผูกกับ `bank_accounts.id` ตรงๆ ไม่มี isolation เพิ่มเติมที่ต้องออกแบบใหม่สำหรับ PDF โดยเฉพาะ เหมือน CSV ทุกประการ |
| **Duplicate/idempotency** | ใช้ SHA-256 ของไฟล์ PDF **ดิบที่ยังเข้ารหัสอยู่** (ไฟล์ตามที่อัปโหลดจริง) เป็น file-level hash — เหมือน CSV เป๊ะ ไม่ hash เนื้อหาที่ decrypt แล้ว (เพราะ hash ต้อง reproducible จากไฟล์บนดิสก์โดยไม่ต้องมี password ก็เปรียบเทียบซ้ำได้); transaction-level fingerprint ใช้ algorithm เดิม (`computeDuplicateFingerprint`) ไม่เปลี่ยน |

---

## 10. Failure Behavior

| Scenario | Behavior | Statement status |
|---|---|---|
| Wrong password | คืน error ทันที ข้อความคงที่ ("รหัสผ่านไม่ถูกต้อง") ไม่ retry อัตโนมัติ ไม่ lockout (single-admin session ความเสี่ยง brute-force ภายในต่ำ แต่ยังไม่ auto-retry) | ไม่สร้าง `bank_statements` row เลย (fail ก่อนถึงขั้น create — เหมือน mapping ผิดรูปแบบของ CSV) |
| Encrypted PDF, ไม่มี password ส่งมา | ขอ password จาก user ก่อน ไม่พยายาม decrypt โดยไม่มี password | ไม่สร้าง row |
| Corrupted PDF (ไฟล์เสีย, ไม่ใช่ PDF ที่ถูกต้อง) | ตรวจ magic byte ก่อน หากผ่านแต่ parse ล้มเหลวจริง → fatal file error แบบเดียวกับ `MALFORMED_CSV_STRUCTURE` ของ CSV | `FAILED` (หลัง create row แล้วถ้าผ่านจุดตรวจ magic byte ไปแล้ว) |
| Text extraction ล้มเหลว (decrypt สำเร็จแต่ extract text ไม่ได้) | fatal error แยก code ชัดเจน ไม่ import อะไรบางส่วน | `FAILED` |
| Scanned PDF (ไม่มี text layer) | error เฉพาะ `SCANNED_PDF_UNSUPPORTED` พร้อมข้อความอธิบายว่ายังไม่รองรับ ณ ตอนนี้ (อ้างอิง Section 2/7) | `FAILED` |
| Malformed rows (บางแถวใน PDF parse ไม่ผ่าน validation) | เหมือน CSV เป๊ะ — แถวนั้นเป็น `INVALID` แต่ไม่ทำให้ทั้งไฟล์ fail แถวอื่นยังเข้า preview ได้ปกติ | `PREVIEW_READY` (ถ้ามีอย่างน้อย 1 แถวผ่าน หรือ preview ว่างแต่ระบุ 0 valid ชัดเจน — เหมือน CSV) |
| Duplicate statement (hash ไฟล์ตรงกับที่เคย import) | ตรวจก่อน create เหมือน CSV — คืน `alreadyImported: true` พร้อม statement id เดิม | ไม่สร้าง row ใหม่ |
| Partial extraction (บางหน้า extract ได้ บางหน้าไม่ได้ เช่น หน้ากลางไฟล์เสียหาย) | **ห้าม import บางส่วนแบบเงียบๆ** — ถือเป็น fatal file error ทั้งไฟล์ (ตรงกับหลักการ STEP C.1 "Malformed/malicious input → fatal file error ก่อนเข้าสู่ขั้น preview เลย ไม่ใช่ปล่อยให้ parse บางส่วนแล้วเดาที่เหลือ") — ต่างจาก "malformed rows" ด้านบนตรงที่นี่คือปัญหาระดับไฟล์ (extraction engine เองล้มเหลวบางหน้า) ไม่ใช่ปัญหาระดับข้อมูลรายแถวที่ extract ได้ครบแต่ค่าไม่ valid | `FAILED` |
| Oversized file | reject ก่อนอ่านเข้า memory เต็มไฟล์ (ตรวจ `file.size` จาก formData ก่อน) | ไม่สร้าง row |

---

## 11. Testing Policy

Test matrix ที่ต้องผ่าน**ก่อน** STEP ใดๆ ที่เกี่ยวกับ PDF ถือว่า "พร้อม production":

1. Valid password-protected text-based PDF → decrypt + extract + import สำเร็จ ตรงกับจำนวน
   transaction จริงที่ manual count
2. Wrong password → error ชัดเจน, ไม่มี row ถูกสร้าง, ไม่มี password หลุดใน log
3. Corrupted PDF (bytes เสียหาย/ไม่ใช่ PDF จริงแม้ extension เป็น .pdf) → fatal error, ไม่ crash
   process
4. Empty PDF (0 หน้า หรือไฟล์ขนาด 0 byte) → fatal error แบบเดียวกับ `EMPTY_FILE` ของ CSV
5. Unsupported/scanned PDF (ไม่มี text layer) → `SCANNED_PDF_UNSUPPORTED` ตาม Section 10
6. Duplicate import (ไฟล์เดียวกันซ้ำ) → ตรวจพบ hash ซ้ำ ไม่ import ซ้ำ
7. Mixed valid/invalid rows ภายในไฟล์เดียวกัน → preview แสดงแยกหมวดถูกต้อง เหมือน CSV
8. **CSV regression (บังคับ)** — รัน test suite เดิมของ CSV import ทั้งหมดซ้ำ ต้องผ่าน 100% ไม่มี
   ข้อยกเว้น หลังรวมโค้ด PDF เข้า codebase แล้ว — เป็นเกณฑ์ที่สำคัญที่สุดตามคำสั่งเดิม ("CSV Import
   ที่มีอยู่แล้วต้องไม่ถูกทำลาย")
9. Security-specific: ตรวจ log/console output ทั้งหมดของทุก test case ข้างต้น → ยืนยันว่าไม่มี
   password ปรากฏที่ไหนเลยในทุกกรณี รวมถึงกรณี error

---

## 12. Implementation Boundaries

แต่ละ STEP ต้อง audit/test/verify แล้วหยุดรอ approve ก่อนไป STEP ถัดไป (ห้าม big refactor รวมหลาย
STEP เข้าด้วยกัน):

- **STEP E.2 — Schema**: เพิ่ม `bank_statements.source_file_type` (additive, `DEFAULT 'CSV'`)
  เท่านั้น
- **STEP E.3 — Dependency + pure decrypt/extract**: เพิ่ม `pdfjs-dist` (pin เวอร์ชันเป๊ะ), เขียน
  pure function decrypt+extract แยกไฟล์ใหม่ (เช่น `src/lib/bankStatementPdf.ts`) ไม่แตะ
  `bankStatementCsv.ts`
- **STEP E.4 — Row extraction**: แปลง extracted text → `CanonicalStatementRow[]` โดย reuse
  validation ที่มีอยู่ (Section 8)
- **STEP E.5 — Upload integration**: เพิ่ม branch PDF ใน `POST /api/bank-statements`
- **STEP E.6 — Confirm integration**: เพิ่ม re-decrypt+re-extract branch ใน confirm route
  (รวม design ของ "กรอก password ซ้ำตอน confirm" — Section 3.7)
- **STEP E.7 — UI**: เพิ่ม password field + format selector ใน `bank/statements/page.tsx`
- **STEP E.8 — AI/OCR fallback (conditional)**: เริ่มได้ก็ต่อเมื่อเงื่อนไขใน Section 7 ครบเท่านั้น
  — ไม่ใช่ STEP ที่ตามมาอัตโนมัติ
- **STEP E.9 — CSV regression**: ยืนยัน CSV flow เดิมผ่าน 100% ก่อนขึ้น production — บังคับ ไม่ใช่
  optional

---

STEP E.1 — decision/design only ตามที่อนุมัติ ไม่มีการแก้ source code, schema, migration, library,
UI, parser, dependency, `.env`, `PROJECT_STATUS.md`, ไฟล์ backup ใดๆ, ข้อมูลจริง, หรือสร้าง test
data ใดๆ ประกอบเอกสารนี้ ไม่มีการ commit/push/restart production ใดๆ ในขั้นตอนนี้
