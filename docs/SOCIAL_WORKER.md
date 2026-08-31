# Social Worker — การตั้งเวลารัน (Scheduler)

`pnpm social:worker` รัน `scripts/run-social-worker.ts` ซึ่งเรียก `runSocialWorker()` **หนึ่งครั้งแล้วจบ**
(ไม่ใช่ process ที่ค้างรันตลอดเวลา ไม่มี `setInterval`/loop ใดๆ) — หน้าที่ของมันคือ:

1. ปิด run ที่ค้างสถานะ `running` จาก process ก่อนหน้าที่ตายกลางคัน (ถ้ามี)
2. กู้คืน `social_posts` ที่ค้างสถานะ `processing` นานเกิน `SOCIAL_PROCESSING_TIMEOUT_MINUTES`
3. ประมวลผล `social_posts` ที่ `scheduled_at` ถึงเวลาแล้วทั้งหมด (โพสต์จริงเฉพาะแพลตฟอร์มที่ตั้งค่า
   credential ไว้แล้วเท่านั้น — ถ้ายังไม่ตั้งค่าจะ mark เป็น `failed` ทันที ไม่ retry ไม่ fake สำเร็จ)
4. บันทึกผลลัพธ์ของรอบนี้ลงตาราง `social_worker_runs` แล้ว exit

เพราะเป็น one-shot process จึงต้องมี **scheduler ภายนอก** เรียกมันซ้ำเป็นระยะ (แนะนำทุก 1 นาที)
เอกสารนี้อธิบายวิธีตั้ง scheduler สำหรับแต่ละ environment — **ไม่มีการตั้งค่า scheduler อัตโนมัติใดๆ
ในเครื่องผู้ใช้จากคำสั่งนี้** เป็นแค่คำแนะนำให้ผู้ดูแลระบบนำไปตั้งเองเมื่อพร้อม

## ก่อนใช้งานจริง

1. คัดลอก `.env.example` เป็น `.env` แล้วตั้งค่า credential จริงของแพลตฟอร์มที่ต้องการ (Facebook /
   Instagram / TikTok) — **ไม่ตั้งค่า = worker จะ mark ทุกโพสต์เป็น `failed` (not_configured) โดย
   ไม่พยายามโพสต์จริงเลย ไม่ใช่ error ของ worker**
2. (ทางเลือก) ตั้งค่า `SOCIAL_PROCESSING_TIMEOUT_MINUTES` ถ้าต้องการเปลี่ยนจากค่า default 15 นาที
3. (ทางเลือก) ตั้งค่า `WORKER_TRIGGER_SECRET` ถ้าต้องการเรียก worker ผ่าน `POST
   /api/social/worker/run` แทนที่จะเรียกผ่าน CLI โดยตรง (`pnpm social:worker` ไม่ต้องใช้ secret นี้
   เพราะรันตรงบนเครื่อง ไม่ผ่าน HTTP)

**ห้ามใส่ค่า credential จริงในเอกสารนี้หรือที่ใดในระบบควบคุมเวอร์ชัน — ตั้งค่าเฉพาะใน `.env` เท่านั้น**

## Linux cron

```bash
crontab -e
```

เพิ่มบรรทัด (รันทุก 1 นาที, แก้ path ให้ตรงกับตำแหน่งจริงของโปรเจกต์):

```
* * * * * cd /path/to/thai-amulet-ai && /usr/bin/pnpm social:worker >> /var/log/social-worker.log 2>&1
```

## Windows Task Scheduler

1. เปิด Task Scheduler → Create Task
2. General: ตั้งชื่อ เช่น `thai-amulet-social-worker`, เลือก "Run whether user is logged on or not"
3. Triggers → New: "Repeat task every: 1 minute", "for a duration of: Indefinitely"
4. Actions → New:
   - Program/script: `pnpm`
   - Add arguments: `social:worker`
   - Start in: `C:\Users\maxim\thai-amulet-ai` (path เต็มของโปรเจกต์)
5. Settings: เปิด "If the task is already running, then the following rule applies:" →
   **Do not start a new instance** (worker เองก็มี in-memory lock กันซ้อนอยู่แล้ว แต่ตั้งฝั่ง
   Task Scheduler ด้วยเพื่อลด process ที่ไม่จำเป็น)

หรือใช้ PowerShell (ต้องรันในฐานะ Administrator):

```powershell
$action = New-ScheduledTaskAction -Execute "pnpm" -Argument "social:worker" -WorkingDirectory "C:\Users\maxim\thai-amulet-ai"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration ([TimeSpan]::MaxValue)
Register-ScheduledTask -TaskName "thai-amulet-social-worker" -Action $action -Trigger $trigger
```

## Docker / Production

ถ้า deploy ด้วย Docker แนะนำรัน worker เป็น container/service แยกจาก web server โดยใช้ image เดียวกัน
แต่เปลี่ยน command เป็น loop ระดับ shell ง่ายๆ ที่เรียก one-shot process ซ้ำ (ไม่ใช่ setInterval ใน
Node — คนละเรื่องกับสิ่งที่ห้ามในโปรเจกต์นี้ ซึ่งหมายถึงห้ามผูก loop ไว้ใน Next.js server process เอง):

```yaml
# docker-compose.yml ตัวอย่าง (ไม่ใช่ค่าที่ configure ไว้แล้วในโปรเจกต์นี้)
services:
  social-worker:
    build: .
    command: sh -c "while true; do pnpm social:worker; sleep 60; done"
    env_file: .env
```

หรือใช้ Kubernetes CronJob (`schedule: "* * * * *"`) เรียก `pnpm social:worker` เป็น one-shot Job —
เหมาะกับ production มากกว่าเพราะแยก lifecycle ของแต่ละรอบชัดเจน ไม่มี long-running shell loop

## ตรวจสอบว่า worker ทำงานถูกต้อง

- `GET /api/social/worker/status` — ดูสถานะล่าสุด (never_run / idle / running, ผลลัพธ์รอบล่าสุด)
- `GET /api/health` — ดูภาพรวมระบบ (`socialWorker: ok/never_run/error`)
- ส่วน "⚙️ Worker Status" ในหน้า Video Studio (`/video-studio`)

## Output ของ `pnpm social:worker`

```
Worker completed
Processed: 0
Published: 0
Failed: 0
Retried: 0
Skipped: 0
Recovered (stale): 0
```

ตัวเลขทั้งหมดเป็นค่าจริงจากรอบนั้นเสมอ — ถ้า queue ว่างเปล่าทุกค่าจะเป็น 0 ไม่ใช่ error
