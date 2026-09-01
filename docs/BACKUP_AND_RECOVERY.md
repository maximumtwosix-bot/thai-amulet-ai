# Backup & Recovery — STEP 30

`pnpm backup` รัน `scripts/backup.ts` เป็น **one-shot script** (เหมือน `pnpm social:worker` — ไม่ใช่
process ที่ค้างรันตลอดเวลา ไม่มี scheduler ในตัว) หน้าที่ของมันคือสำรองข้อมูลธุรกิจจริงทั้งหมด:

1. **ฐานข้อมูล** `data/thai-amulet.db` — ใช้ `Database#backup()` ของ `better-sqlite3` (ที่ติดตั้งอยู่แล้ว
   ไม่ได้เพิ่ม dependency ใหม่) ซึ่งเป็น SQLite Online Backup API ตัวจริง **ไม่ใช่การ copy ไฟล์ตรงๆ** —
   ปลอดภัยแม้ฐานข้อมูลจะอยู่ใน WAL mode และแอปกำลังใช้งาน/เขียนข้อมูลอยู่พร้อมกัน (ไม่ต้องปิดแอปก่อน
   backup ก็ได้ แต่แนะนำให้ backup สม่ำเสมอไม่ว่าจะปิดหรือเปิดแอปอยู่)
2. **หลักฐานทางธุรกิจ** ทั้งหมดใน `public/generated/` (สลิป/ใบเสร็จที่แนบกับ transaction, รูปสินค้า,
   ภาพ/เสียง/วิดีโอที่ AI สร้าง) — copy แบบ recursive ทั้งโฟลเดอร์

ปลายทางของ backup อยู่ **นอก git repository เสมอ** (ค่า default: `C:\Users\maxim\thai-amulet-backups`,
เปลี่ยนได้ผ่าน `BACKUP_DIR` ใน `.env`) — สคริปต์จะปฏิเสธและ exit code 1 ทันทีถ้า `BACKUP_DIR` ชี้เข้ามาใน
โฟลเดอร์โปรเจกต์นี้

**สิ่งที่ backup ไม่แตะต้องเลยโดยโครงสร้างของสคริปต์เอง (ไม่ใช่แค่ exclude list ที่อาจลืมอัปเดต)**:
`.env`, `node_modules/`, `.next/`, ไฟล์ `.step*-backup-*`/`.bak` ใดๆ, หรือไฟล์อื่นใดนอกเหนือจาก
`data/thai-amulet.db` + `data/app.db` + `public/generated/**` — เพราะสคริปต์ไม่เคย walk project root
เลย เข้าถึงเฉพาะ path ที่ระบุไว้ตรงๆ เท่านั้น

## วิธีใช้

```
pnpm backup
```

ทุกครั้งที่รัน จะได้โฟลเดอร์ใหม่ชื่อ `backup-YYYYMMDD-HHMMSS` ข้างใน `BACKUP_DIR` เช่น:

```
C:\Users\maxim\thai-amulet-backups\
  backup-20260901-140539\
    db\
      thai-amulet.db          ← สำเนาฐานข้อมูลที่ backup() สร้างขึ้น (สมบูรณ์ในตัวเอง)
      thai-amulet.db-shm      ← อาจมีติดมาด้วย (journal bookkeeping) — ไม่มีก็ไม่เป็นไร
      thai-amulet.db-wal      ← อาจมีติดมาด้วย ถ้า 0 byte แปลว่าไม่มีอะไรค้าง ไม่ต้องสนใจ
      app.db                  ← ไฟล์เก่าที่ไม่ได้ใช้งานจริง (0 byte) copy ไว้เผื่อ
    generated\                ← สำเนาทั้งหมดของ public/generated/
      ai-images\ ...
      product-media\ ...
      transaction-attachments\ ...
      ai-video\ voice\ video\ ...
    manifest.json              ← สรุปจำนวนแถวแต่ละตาราง ณ เวลา backup + จำนวนไฟล์หลักฐานที่ copy ไป
```

Exit code `0` = สำเร็จ (พิมพ์สรุปจำนวนแถวต่อตาราง + จำนวนไฟล์หลักฐานออกทาง stdout) / exit code `1` =
ล้มเหลว (พิมพ์เหตุผลออกทาง stderr ชัดเจน เช่น เปิดไฟล์ backup ที่เพิ่งสร้างไม่ได้, `BACKUP_DIR` ชี้เข้า
มาใน repo, หรือเจอไฟล์ต้องห้ามในผลลัพธ์)

**ก่อนใช้งานจริง**: ไม่ต้องตั้งค่าอะไรเพิ่ม ใช้ `pnpm backup` ได้ทันที (ค่า default ของ `BACKUP_DIR`
ใช้งานได้เลย) ตั้งค่า `BACKUP_DIR` ใน `.env` เฉพาะถ้าต้องการเปลี่ยนปลายทาง

---

## ขั้นตอนการกู้คืน (Recovery)

⚠️ **ทำตามลำดับนี้เท่านั้น** — การสลับลำดับ (เช่น แทนที่ฐานข้อมูลก่อนหยุดแอป) เสี่ยงต่อการเขียนทับข้อมูล
ระหว่างกู้คืน

### 1. ระบุ backup ที่ต้องการกู้คืน

เปิด `C:\Users\maxim\thai-amulet-backups\` แล้วเลือกโฟลเดอร์ `backup-YYYYMMDD-HHMMSS` ที่ต้องการ
(ชื่อโฟลเดอร์คือวันเวลาที่ backup เสร็จ) — เปิด `manifest.json` ข้างในเพื่อดูจำนวนแถวแต่ละตาราง ณ
เวลานั้นก่อนตัดสินใจ

### 2. หยุดแอปพลิเคชัน

ปิด dev server (`Ctrl+C` ใน terminal ที่รัน `pnpm dev`) หรือถ้ารันเป็น production ให้หยุด process ที่รัน
`pnpm start` (ปิด PowerShell/terminal window หรือ `Stop-Process` ตาม PID ที่รันอยู่) — **ต้องไม่มี
process ใดเปิดเชื่อมต่อ `data/thai-amulet.db` อยู่เลยก่อนไปขั้นตอนถัดไป** (ไม่งั้น SQLite/WAL อาจเขียน
ทับไฟล์ที่เพิ่งกู้คืนมา)

### 3. สำรองฐานข้อมูลปัจจุบันไว้ก่อนเสมอ (ป้องกันความผิดพลาดของการกู้คืนเอง)

ก่อนแทนที่อะไร ให้ย้าย (ไม่ใช่ลบ) ไฟล์ปัจจุบันออกไปไว้ที่อื่นก่อนเสมอ:

```powershell
$rescueDir = "C:\Users\maxim\thai-amulet-backups\pre-recovery-rescue-$(Get-Date -Format yyyyMMdd-HHmmss)"
New-Item -ItemType Directory -Path $rescueDir | Out-Null
Move-Item "C:\Users\maxim\thai-amulet-ai\data\thai-amulet.db*" $rescueDir
```

(ใช้ `Move-Item` ไม่ใช่ `Remove-Item` — ถ้ากู้คืนแล้วพบว่าเลือกผิด backup หรือมีปัญหา จะได้มีของเดิมกลับมา
ใช้ได้ทันที)

### 4. กู้คืนฐานข้อมูล

```powershell
$backup = "C:\Users\maxim\thai-amulet-backups\backup-20260901-140539"  # เปลี่ยนเป็น backup ที่เลือกไว้
Copy-Item "$backup\db\thai-amulet.db*" "C:\Users\maxim\thai-amulet-ai\data\" -Force
```

(คำสั่งเดียวกันนี้ copy ทั้ง `thai-amulet.db` และไฟล์ `-shm`/`-wal` ที่อาจติดมาด้วยโดยอัตโนมัติ ผ่าน
wildcard `*`)

### 5. กู้คืนไฟล์หลักฐาน (public/generated/)

```powershell
# ลบของเดิมออกก่อนกู้คืนทับ (ของเดิมควรอยู่ใน pre-recovery rescue ที่ทำไว้ในขั้นตอน 3 อยู่แล้วถ้าต้องการ
# ย้อนกลับ — ถ้าไม่มั่นใจ ให้ Move-Item ไปที่ $rescueDir ก่อนเหมือนขั้นตอน 3 แทนการลบตรงๆ)
Remove-Item "C:\Users\maxim\thai-amulet-ai\public\generated\*" -Recurse -Force
Copy-Item "$backup\generated\*" "C:\Users\maxim\thai-amulet-ai\public\generated\" -Recurse -Force
```

### 6. ตรวจสอบฐานข้อมูลที่กู้คืนมาก่อนเปิดแอป

```powershell
cd C:\Users\maxim\thai-amulet-ai
node -e "const Database = require('better-sqlite3'); const db = new Database('./data/thai-amulet.db', { readonly: true }); for (const t of ['products','orders','order_items','inventory_movements','transactions','transaction_attachments','customers','ai_cost_ledger']) { console.log(t, db.prepare('SELECT COUNT(*) c FROM ' + t).get().c); } db.close();"
```

เทียบตัวเลขที่ได้กับ `manifest.json` ของ backup ที่เลือก — ต้องตรงกัน ถ้าเปิดไฟล์ไม่ได้ (error) หรือ
ตัวเลขต่างจาก manifest มาก แสดงว่ากู้คืนผิดไฟล์หรือ backup เสียหาย **อย่าเพิ่งเปิดแอป** — กลับไปเอา
ของเดิมจาก `$rescueDir` (ขั้นตอน 3) คืนกลับมาก่อน แล้วลองใหม่

### 7. เริ่มแอปพลิเคชันใหม่

```
pnpm dev
```

หรือสำหรับ production: `pnpm build && pnpm start` (หรือรัน `scripts/start-production.ps1` ถ้าตั้งค่า
ไว้แล้ว)

### 8. ตรวจสอบแอปหลังกู้คืน

- เข้า `/products`, `/orders`, `/finance`, `/tax`, `/inventory` (ต้อง login ก่อนตามระบบ STEP 28) —
  ข้อมูลที่แสดงต้องตรงกับที่กู้คืนมา
- เปิดรายการที่มีไฟล์แนบ (เช่น transaction ที่มี "📎 ไฟล์แนบ") — รูปต้องโหลดได้ ไม่ใช่ broken image
- ตรวจ browser console ไม่มี error จริง

---

## การตั้งเวลารัน backup อัตโนมัติ (ยังไม่ได้ตั้งค่าใดๆ ในเครื่องผู้ใช้)

STEP นี้สร้างเฉพาะคำสั่ง `pnpm backup` ที่รันแล้วสำเร็จจริง — **ไม่ได้ตั้ง Windows Task Scheduler หรือ
scheduler ใดๆ ให้อัตโนมัติ** ตามที่กำหนดไว้ ด้านล่างคือตัวอย่างวิธีตั้งเองภายหลังเมื่อพร้อม (รูปแบบ
เดียวกับ `docs/SOCIAL_WORKER.md`):

### Windows Task Scheduler (แนะนำรันทุกคืน)

1. เปิด Task Scheduler → Create Task
2. General: ตั้งชื่อ เช่น `thai-amulet-backup`, เลือก "Run whether user is logged on or not"
3. Triggers → New: "Daily", ตั้งเวลาที่ร้านปิด/ไม่มีคนใช้งาน เช่น 02:00
4. Actions → New:
   - Program/script: `pnpm`
   - Add arguments: `backup`
   - Start in: `C:\Users\maxim\thai-amulet-ai`
5. Settings: "If the task is already running..." → **Do not start a new instance**

หรือ PowerShell (รันในฐานะ Administrator):

```powershell
$action = New-ScheduledTaskAction -Execute "pnpm" -Argument "backup" -WorkingDirectory "C:\Users\maxim\thai-amulet-ai"
$trigger = New-ScheduledTaskTrigger -Daily -At 2am
Register-ScheduledTask -TaskName "thai-amulet-backup" -Action $action -Trigger $trigger
```

แนะนำให้ลบ backup เก่าที่เกิน N วันเป็นระยะด้วยตนเอง (ยังไม่มีการลบอัตโนมัติในสคริปต์นี้ — ตั้งใจ
ไม่ลบข้อมูลใดๆ ทั้งสิ้นในทุก STEP ที่เกี่ยวกับการ backup)
