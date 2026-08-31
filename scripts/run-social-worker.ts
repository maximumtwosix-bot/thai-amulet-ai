// One-shot CLI entry point for external scheduler/cron to call — STEP 17, output ปรับใน STEP 18
//
// เรียก runSocialWorker() ครั้งเดียวแล้วจบ (exit) ไม่ใช่ long-running process/loop — ตั้งใจให้
// cron หรือ scheduled task ภายนอกเรียกซ้ำเป็นระยะ (เช่น ทุก 1 นาที) เอง แทนที่จะมี setInterval()
// อยู่ในโปรเซสของ Next.js dev/prod server ซึ่งจะทำให้ dev server ทำงานผิดปกติ
//
// ใช้งาน: pnpm social:worker
// ดูตัวอย่างการตั้ง scheduler (Windows Task Scheduler / Linux cron / Docker) ที่ docs/SOCIAL_WORKER.md
//
// exit code 0 = worker ทำงานจบโดยไม่มี exception (นับรวมกรณี "worker กำลังทำงานอยู่แล้วข้ามรอบนี้"
// ด้วย เพราะไม่ใช่ error ของรอบนี้) / exit code 1 = worker พังจริง (throw) — ไม่เคย log secret ใดๆ

import { runSocialWorker, WorkerAlreadyRunningError } from "@/lib/socialWorker";

function printSummary(label: string, summary: { processed: number; published: number; failed: number; retried: number; skipped: number; recovered: number }) {
  console.log(label);
  console.log(`Processed: ${summary.processed}`);
  console.log(`Published: ${summary.published}`);
  console.log(`Failed: ${summary.failed}`);
  console.log(`Retried: ${summary.retried}`);
  console.log(`Skipped: ${summary.skipped}`);
  console.log(`Recovered (stale): ${summary.recovered}`);
}

async function main() {
  try {
    const result = await runSocialWorker();

    printSummary("Worker completed", result.summary);
    process.exit(0);
  } catch (error) {
    if (error instanceof WorkerAlreadyRunningError) {
      console.log("Worker skipped — already running in this process");
      process.exit(0);
    }

    console.log("Worker failed");
    console.error("Error:", error instanceof Error ? error.message : "ไม่ทราบสาเหตุ");
    process.exit(1);
  }
}

main();
