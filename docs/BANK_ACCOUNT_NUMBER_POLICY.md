# Bank Account — Account Number Normalization Policy — STEP B.7.1

เอกสารนี้บันทึก **policy ที่อนุมัติแล้ว** สำหรับการจัดการค่า `accountNumber` ของ `BankAccount`
(`src/lib/bankAccounts.ts`, ตาราง `bank_accounts` ใน `src/lib/db.ts`) ก่อนเริ่ม STEP C — Bank
Statement Import เป็น **decision/documentation เท่านั้น** ไม่มีการแก้ schema/library/API/UI ใดๆ
ประกอบเอกสารนี้ (ดู STEP B.7.1 safety verification ท้ายเอกสาร)

## หลักการ

1. **accountNumber ที่ผู้ใช้กรอกเป็น source of truth** — ค่าที่เก็บใน `bank_accounts.account_number`
   ต้องตรงกับสิ่งที่ผู้ใช้ตั้งใจกรอก ไม่มีการตีความ/เดารูปแบบแทนผู้ใช้
2. **ห้าม silently normalize หรือ rewrite ค่าที่จัดเก็บ** โดยเฉพาะ:
   - ห้าม strip เครื่องหมาย `-`
   - ห้าม strip whitespace ภายใน/ที่ตั้งใจพิมพ์ (แยกจากข้อ "ค่าเดิมที่มีอยู่แล้ว" ด้านล่าง)
   - ห้ามเติมเลข 0 นำหน้า หรือ pad ให้ครบความยาว
   - ห้ามตัดเลข 0 นำหน้าออก
   - ห้ามแปลงรูปแบบให้เข้ากับธนาคารใดธนาคารหนึ่งเป็นการเฉพาะ
   - ห้ามเดาความยาว/รูปแบบของเลขบัญชีตามธนาคาร (ไม่มี format ธนาคารใดที่ระบบนี้ถือเป็นมาตรฐานตายตัว)
3. ค่าที่เก็บใน DB ต้องคงตาม input ของผู้ใช้ **หลังผ่าน validation ที่มีอยู่จริงในระบบเท่านั้น** —
   ไม่เพิ่ม transformation ใหม่เกินกว่าที่ validation ปัจจุบันทำอยู่แล้ว
4. หาก STEP C ต้อง normalize เพื่อ matching กับ statement:
   - normalization นั้นใช้เป็นแค่ **comparison/candidate value ชั่วคราว** เท่านั้น
   - **ห้าม overwrite** ค่า `accountNumber` ต้นทางที่ผู้ใช้กรอกไว้เด็ดขาด
   - ต้องบันทึก/แสดงวิธีการ matching อย่างชัดเจนว่าใช้ค่าไหนเทียบกับค่าไหน
5. Matching engine ในอนาคต (STEP C) ควรมีระดับความมั่นใจ/กลยุทธ์ชัดเจน อย่างน้อย:
   - `EXACT` — ตรงกันเป๊ะกับค่าที่เก็บไว้
   - `BANK_PROVIDED_IDENTIFIER` — ธนาคารให้ identifier มาตรงๆ ในไฟล์ statement
   - `NORMALIZED_CANDIDATE` — ตรงกันหลัง normalize ชั่วคราว (ไม่ใช่ definitive match)
   - `MANUAL_CONFIRMED` — มนุษย์ยืนยันเอง
6. **ห้ามถือว่า `NORMALIZED_CANDIDATE` เป็น definitive match โดยอัตโนมัติ** หากข้อมูลต้นทางไม่เพียงพอ
   ต้องให้มนุษย์ยืนยัน (สอดคล้องกับหลักการเดิมของระบบนี้ที่ AI/ระบบเสนอได้แต่ต้องมี human confirmation
   เมื่อมีผลต่อบัญชี/ภาษี)
7. หาก statement มี account identifier ที่ธนาคารให้มาโดยตรง ให้ **ให้น้ำหนักกับ identifier นั้นมากกว่า**
   การเดาจาก display account number ที่ normalize เอง
8. Policy นี้ต้องใช้ได้กับทุกค่าของ `accountType` (`SAVINGS`/`CURRENT`/`OTHER`, nullable),
   `classification` (`BUSINESS`/`PERSONAL`/`MIXED`) และหลายธนาคารพร้อมกัน — policy นี้ผูกกับตัวฟิลด์
   `accountNumber` เท่านั้น ไม่ขึ้นกับ field อื่น
9. **ห้ามแก้ historical `BankAccount` data** เพื่อให้ "เข้ากับ" policy นี้ย้อนหลัง

## สถานะโค้ดปัจจุบันเทียบกับ policy (ตรวจแล้ว ไม่มีการแก้โค้ดใดๆ ในรอบนี้)

ตรวจ `src/lib/bankAccounts.ts` (STEP B.2/B.6) แล้วพบว่า **ไม่ขัดกับ policy นี้** โดยมีจุดเดียวที่ต้อง
อธิบายให้ชัด:

- `normalizeRequiredText()` (ใช้ร่วมกับ `bankName`/`accountName`/`accountNumber`) trim
  **whitespace ที่นำหน้า/ตามหลัง** ก่อนบันทึก — พฤติกรรมนี้มีอยู่ก่อน policy นี้ถูกกำหนด และถือเป็นส่วน
  หนึ่งของ "validation ที่มีอยู่แล้ว" ตามข้อ 3 ข้างต้น (ไม่ใช่ transformation ใหม่ที่ policy นี้เพิ่มมา)
  — ตีความว่าไม่ขัดกับข้อ 2 (ห้าม strip whitespace) เพราะข้อ 2 มุ่งห้าม transformation **ใหม่** ที่จะ
  เพิ่มเข้ามาในอนาคต (โดยเฉพาะเพื่อ matching ใน STEP C) ไม่ใช่ retroactive ต่อ trim ที่มีอยู่แล้วและผ่าน
  การ audit/approve มาตั้งแต่ STEP B.1/B.6 — internal whitespace, เครื่องหมาย `-`, เลข 0 นำหน้า/ตามหลัง
  ไม่ถูกแตะต้องเลยในทุกกรณี
- ไม่มี strip `-`, ไม่มี zero-padding, ไม่มีการตัดเลข 0 นำหน้า, ไม่มี format-guessing ตามธนาคารใดๆ ใน
  โค้ดปัจจุบัน — ยืนยันสอดคล้องกับข้อ 2 ทุกข้อย่อยที่เหลือ
- `assertAccountNumberLength()` (STEP B.6) เป็นเพียง length guard (ปฏิเสธ input ที่ยาวเกิน ไม่ได้
  ตัด/แก้ค่า) — ไม่ใช่ normalization ไม่ขัดกับ policy
- ยังไม่มี matching/comparison logic ใดๆ ในระบบ (STEP C ยังไม่เริ่ม) จึงยังไม่มีจุดใดขัดกับข้อ 4–7 —
  ข้อเหล่านี้เป็นข้อกำหนดล่วงหน้าสำหรับ STEP C ที่ยังไม่ถูกสร้าง

**สรุป:** ไม่จำเป็นต้องแก้โค้ดใดๆ เพื่อให้สอดคล้องกับ policy นี้ ณ ตอนนี้

## ผลต่อ STEP C ในอนาคต

เมื่อ STEP C ออกแบบ matching ระหว่าง `BankAccount.accountNumber` กับ statement:

- ห้ามเขียนทับ `bank_accounts.account_number` ด้วยค่าที่ normalize แล้วเด็ดขาด
- ค่า normalize (ถ้ามี) ควรเป็นค่าที่คำนวณชั่วคราว ณ เวลา match เท่านั้น (in-memory หรือเก็บแยกในตาราง
  matching เอง เช่น `bank_statement_transactions.match_strategy`/`match_confidence`) ไม่ปนกับตาราง
  `bank_accounts`
- Human confirmation ต้องอยู่ในทุก matching ที่ไม่ใช่ `EXACT`/`BANK_PROVIDED_IDENTIFIER`

---

STEP B.7.1 — decision/documentation only ตามที่อนุมัติ ไม่มีการแก้ schema, migration, API, library, UI,
dependency, ข้อมูล `BankAccount` ที่มีอยู่, หรือสร้าง test data ใดๆ ประกอบเอกสารนี้
