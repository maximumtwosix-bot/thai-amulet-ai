# Backup & Recovery — STEP 30 (mechanism) / STEP 33 (scheduling)

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

## การตั้งเวลารัน backup อัตโนมัติ — STEP 33 (ตั้งค่าแล้ว, ทำงานจริงบนเครื่องนี้)

**Task name**: `thai-amulet-backup`
**Schedule**: ทุกวัน เวลา 02:00 (นอกเวลาทำการร้าน)
**คำสั่งที่รัน**: `pnpm backup` (เรียกผ่าน full path ของ `pnpm.CMD` — path เดียวกับที่
`scripts/start-production.ps1` ใช้อยู่แล้ว เพื่อเลี่ยงปัญหา `PATH` ไม่ถูก resolve ตอนรันผ่าน Task
Scheduler)
**Working directory**: `C:\Users\maxim\thai-amulet-ai`
**ปลายทาง backup**: `C:\Users\maxim\thai-amulet-backups\backup-<timestamp>\` (เหมือนเดิมทุกประการ —
task นี้แค่เรียก `pnpm backup` เฉยๆ ไม่ได้มี logic การ backup แยกต่างหาก)
**Run as**: user ปัจจุบันของเครื่อง (`$env:USERNAME` ตอนตั้งค่า — ไม่ได้ hardcode username คนอื่น),
`LogonType: InteractiveToken` (**ไม่มีการเก็บรหัสผ่านใดๆ ไว้ใน task เลย** — ตรวจสอบแล้วด้วย
`Export-ScheduledTask`, ไม่มี `<Password>` หรือ credential blob ใดๆ ในนิยาม task) — ผลคือ task นี้
**รันได้เฉพาะตอนที่ user login อยู่เท่านั้น** (ไม่ใช่ "Run whether user is logged on or not" ซึ่งต้องเก็บ
รหัสผ่านหรือใช้ Group Managed Service Account) ถ้าเครื่องถูก sign out/restart ตอน 02:00 จะไม่รัน แต่ตั้ง
`StartWhenAvailable = true` ไว้แล้ว — ถ้าพลาดรอบ 02:00 ระบบจะรันให้ทันทีที่ user login ครั้งถัดไป
**Multiple instances**: `IgnoreNew` (ถ้า backup รอบก่อนยังไม่เสร็จ จะไม่เริ่มรอบใหม่ซ้อน)

### วิธีตรวจสอบ task (native Windows tools, ไม่ต้องติดตั้งอะไรเพิ่ม)

```powershell
# ดูสถานะพื้นฐาน
Get-ScheduledTask -TaskName "thai-amulet-backup" | Select-Object TaskName, State

# ดู action/trigger/principal แบบละเอียด
Get-ScheduledTask -TaskName "thai-amulet-backup" | Select-Object -ExpandProperty Actions
Get-ScheduledTask -TaskName "thai-amulet-backup" | Select-Object -ExpandProperty Triggers
Get-ScheduledTask -TaskName "thai-amulet-backup" | Select-Object -ExpandProperty Principal

# ดูผลรันล่าสุด (0 = สำเร็จ, ไม่ใช่ 0 = ล้มเหลว) + รอบถัดไปจะรันเมื่อไหร่
Get-ScheduledTaskInfo -TaskName "thai-amulet-backup" | Select-Object LastRunTime, LastTaskResult, NextRunTime

# export XML เต็มของ task definition (ตรวจสอบได้เองว่าไม่มี credential ฝังอยู่)
Export-ScheduledTask -TaskName "thai-amulet-backup"
```

`LastTaskResult` คือวิธีหลักในการรู้ว่า backup คืนล่าสุด**ล้มเหลวเงียบๆ หรือไม่** — สคริปต์
`scripts/backup.ts` (STEP 30) จบด้วย `process.exit(1)` เสมอเมื่อล้มเหลว (เช่น เปิดไฟล์ backup ที่เพิ่ง
สร้างไม่ได้, พบไฟล์ต้องห้ามในผลลัพธ์, หรือ error อื่นๆ) ซึ่ง Task Scheduler จะสะท้อนเป็น
`LastTaskResult` ที่ไม่ใช่ 0 ทันที — **ไม่มีทางที่ backup ล้มเหลวแล้ว Task Scheduler จะรายงานว่าสำเร็จ**
ถ้า `LastTaskResult` ไม่ใช่ 0 หรือ `LastRunTime` เก่ากว่าที่ควร (เช่น ไม่มี backup ใหม่มาหลายวันแล้ว) ให้
เปิด Task Scheduler GUI → เลือก task นี้ → แท็บ "History" เพื่อดู event log ละเอียดของแต่ละรอบที่รัน
(ต้องเปิด "Enable All Tasks History" ในเมนู Action ของ Task Scheduler ก่อนครั้งแรก ถ้ายังไม่เห็น
ประวัติ)

### วิธีรัน task ทันที (ทดสอบ โดยไม่ต้องรอถึง 02:00)

```powershell
Start-ScheduledTask -TaskName "thai-amulet-backup"
# รอสักครู่แล้วเช็คผล
Get-ScheduledTaskInfo -TaskName "thai-amulet-backup" | Select-Object LastRunTime, LastTaskResult
```

แล้วตรวจที่ `C:\Users\maxim\thai-amulet-backups\` ว่ามีโฟลเดอร์ backup ใหม่เกิดขึ้นจริง

### วิธีปิดใช้งาน task ชั่วคราว (ไม่ลบ ตั้งค่าไว้เผื่อกลับมาเปิดใหม่)

```powershell
Disable-ScheduledTask -TaskName "thai-amulet-backup"
# เปิดกลับมาใช้งานอีกครั้งด้วย:
Enable-ScheduledTask -TaskName "thai-amulet-backup"
```

### วิธีลบ task ทิ้งถาวร

```powershell
Unregister-ScheduledTask -TaskName "thai-amulet-backup" -Confirm:$false
```

### วิธีตรวจดู backup ล่าสุด

```powershell
Get-ChildItem "C:\Users\maxim\thai-amulet-backups" | Sort-Object Name -Descending | Select-Object -First 1
```

แล้วเปิด `manifest.json` ข้างในโฟลเดอร์นั้นเพื่อดูจำนวนแถวแต่ละตาราง ณ เวลา backup

### Retention (การลบ backup เก่า) — ยังไม่ได้ทำอัตโนมัติ ตั้งใจ (STEP 30 กำหนดไว้แล้วว่านอกขอบเขต)

Task นี้ **ไม่ลบ backup เก่าเลย** — ทุกคืนจะได้โฟลเดอร์ใหม่เพิ่มขึ้นเรื่อยๆ ต้องลบเองด้วยตนเองเป็นระยะ
(เช่น เปิด `C:\Users\maxim\thai-amulet-backups\` แล้วลบโฟลเดอร์ที่เก่าเกินความจำเป็นออก) การทำ retention
อัตโนมัติเป็นงานที่ตั้งใจเก็บไว้เป็น STEP ในอนาคต ไม่ใช่ส่วนหนึ่งของ STEP 30/33
