// Social Worker — STEP 17, ขยาย persistence + stale recovery ใน STEP 18
//
// Wrapper บาง ๆ รอบ processScheduledPosts() (src/lib/socialQueue.ts, STEP 12) — ไม่รื้อ logic
// เดิม แค่เพิ่มสิ่งที่ processScheduledPosts() เองไม่มีหน้าที่ทำ:
//   1. in-memory lock กัน runSocialWorker() สองครั้งทำงานซ้อนกันในโปรเซสเดียวกัน (STEP 17)
//      (การป้องกันที่แท้จริงต่อ race ระดับ DB คือ claimSocialPostForProcessing() ใน
//      socialPosts.ts — atomic UPDATE ระดับแถว ทำงานถูกต้องข้าม process ได้จริงอยู่แล้ว โดยไม่ต้อง
//      พึ่ง in-memory lock เลย — ดู STEP 18.5 audit ในรายงาน — lock ตรงนี้เป็นแค่ fast-path
//      ป้องกันงานซ้อนในโปรเซสเดียวกัน ไม่ใช่ตัวค้ำประกันหลักด้าน correctness)
//   2. บันทึกทุกรอบการรันลง social_worker_runs (STEP 18.2 — ก่อนหน้านี้เก็บแค่ใน memory หายเมื่อ
//      restart) — DB คือ source of truth ตอนนี้ ส่วน in-memory cache (running flag) ยังใช้แค่
//      บอกว่า "โปรเซสนี้กำลังรันอยู่จริงหรือไม่" ซึ่งอ่านจาก DB อย่างเดียวไม่พอ (DB บอกแค่ว่ามีแถว
//      status='running' ค้างอยู่ ซึ่งอาจเป็นรอบที่ crash ไปแล้วก็ได้ ไม่ใช่รันอยู่จริงเสมอไป)
//   3. เรียก recoverStaleProcessingPosts() ก่อนเริ่มประมวลผล queue ทุกรอบ (STEP 18.4) และปิดแถว
//      social_worker_runs ที่ค้าง 'running' จาก process ก่อนหน้าที่ตายกลางคัน (STEP 18.2)
//
// ไม่มี setInterval/cron ใดๆ ในไฟล์นี้ — runSocialWorker() เป็นฟังก์ชันเปล่าที่รอถูกเรียก
// จาก POST /api/social/worker/run (manual trigger) หรือ scripts/run-social-worker.ts
// (เรียกครั้งเดียวจบ เหมาะกับ external cron/scheduled task) เท่านั้น

import {
  processScheduledPosts,
  recoverStaleProcessingPosts,
  type ProcessScheduledPostsSummary,
} from "@/lib/socialQueue";
import {
  closeStaleRunningWorkerRuns,
  completeWorkerRun,
  failWorkerRun,
  getLatestCompletedWorkerRun,
  getLatestWorkerRun,
  startWorkerRun,
  type SocialWorkerRunRow,
} from "@/lib/socialWorkerRuns";

export type WorkerRunSummary = ProcessScheduledPostsSummary & { recovered: number };

export type WorkerRunResult = {
  runId: number;
  startedAt: string;
  finishedAt: string;
  summary: WorkerRunSummary;
};

export type WorkerStateLabel = "never_run" | "idle" | "running";

export type WorkerStatus = {
  state: WorkerStateLabel;
  lastRun: SocialWorkerRunRow | null;
  lastCompletedRun: SocialWorkerRunRow | null;
};

// in-memory flag: ใช้แค่บอกว่า "โปรเซสปัจจุบันนี้" กำลัง await runSocialWorker() อยู่หรือไม่
// (fast-path กันเรียกซ้อนในโปรเซสเดียวกัน) ไม่ใช่ source of truth — DB (social_worker_runs) คือ
// source of truth ของประวัติการรันจริง
let runningInThisProcess = false;

export class WorkerAlreadyRunningError extends Error {
  constructor() {
    super("Worker กำลังทำงานอยู่แล้ว — ข้ามการเรียกซ้ำนี้ไป");
    this.name = "WorkerAlreadyRunningError";
  }
}

/**
 * รัน worker หนึ่งรอบ — ปิด run ที่ค้าง 'running' จาก process ก่อนหน้า (ถ้ามี) → recover stale
 * processing posts → ประมวลผล scheduled posts ที่ถึงเวลาแล้วทั้งหมดจนจบ (ไม่ใช่ loop ค้างรอ) →
 * บันทึกผลจริงลง DB เสมอ ไม่ว่าสำเร็จหรือพัง
 *
 * ถ้ามีอีก call กำลังทำงานอยู่ในโปรเซสเดียวกัน จะ throw WorkerAlreadyRunningError ทันที ไม่ queue รอ
 */
export async function runSocialWorker(): Promise<WorkerRunResult> {
  if (runningInThisProcess) {
    throw new WorkerAlreadyRunningError();
  }

  runningInThisProcess = true;
  const startedAt = new Date().toISOString();

  // STEP 18.2: ปิด run เก่าที่ค้าง 'running' (crash ของ process ก่อนหน้า) ก่อนเริ่มรอบใหม่เสมอ —
  // ไม่มีทางเป็น worker อีกตัวที่กำลังรันจริงพร้อมกัน เพราะ in-memory lock กันไว้แล้วในโปรเซสเดียวกัน
  // และแต่ละ process ก็มี lock ของตัวเอง ดังนั้นแถว 'running' ที่เจอตรงนี้คือของที่ตายไปแล้วเท่านั้น
  const closedStaleRuns = closeStaleRunningWorkerRuns(startedAt);

  if (closedStaleRuns > 0) {
    console.log(`[social-worker] closed ${closedStaleRuns} stale 'running' run row(s) from a previous process`);
  }

  const run = startWorkerRun(startedAt);

  console.log(`[social-worker] started at ${startedAt} (run id ${run.id})`);

  try {
    // STEP 18.4: recover stale processing posts ก่อนเริ่มประมวลผล queue ปกติ
    const recovery = recoverStaleProcessingPosts();

    if (recovery.recovered > 0) {
      console.log(
        `[social-worker] recovered ${recovery.recovered} stale processing post(s): ${recovery.ids.join(",")}`
      );
    }

    const summary = await processScheduledPosts();
    const finishedAt = new Date().toISOString();

    const fullSummary: WorkerRunSummary = { ...summary, recovered: recovery.recovered };

    completeWorkerRun(run.id, finishedAt, fullSummary);

    console.log(
      `[social-worker] finished at ${finishedAt} (run id ${run.id}) — ` +
        `processed=${summary.processed} published=${summary.published} ` +
        `failed=${summary.failed} retried=${summary.retried} skipped=${summary.skipped} ` +
        `recovered=${recovery.recovered}`
    );

    return { runId: run.id, startedAt, finishedAt, summary: fullSummary };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "ไม่ทราบสาเหตุ";

    failWorkerRun(run.id, finishedAt, message);

    console.error(`[social-worker] run id ${run.id} failed:`, message);

    throw error;
  } finally {
    runningInThisProcess = false;
  }
}

/**
 * สถานะปัจจุบัน — state="running" ถือตาม in-memory flag ของโปรเซสนี้เท่านั้น (แม่นยำที่สุดสำหรับ
 * "กำลังรันอยู่จริงตอนนี้ไหม") ส่วน lastRun/lastCompletedRun อ่านจาก DB เสมอ (รอด server restart)
 */
export function getWorkerStatus(): WorkerStatus {
  const lastRun = getLatestWorkerRun();
  const lastCompletedRun = getLatestCompletedWorkerRun();

  const state: WorkerStateLabel = runningInThisProcess
    ? "running"
    : lastRun === null
      ? "never_run"
      : "idle";

  return { state, lastRun, lastCompletedRun };
}
