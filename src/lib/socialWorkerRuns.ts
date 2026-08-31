import db from "@/lib/db";

export type SocialWorkerRunStatus = "running" | "completed" | "failed";

export type SocialWorkerRunRow = {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  status: SocialWorkerRunStatus;
  processed: number | null;
  published: number | null;
  failed: number | null;
  retried: number | null;
  skipped: number | null;
  recovered: number | null;
  errorMessage: string | null;
  createdAt: string;
};

type DbRow = {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  processed: number | null;
  published: number | null;
  failed: number | null;
  retried: number | null;
  skipped: number | null;
  recovered: number | null;
  error_message: string | null;
  created_at: string;
};

function toRow(row: DbRow): SocialWorkerRunRow {
  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status as SocialWorkerRunStatus,
    processed: row.processed,
    published: row.published,
    failed: row.failed,
    retried: row.retried,
    skipped: row.skipped,
    recovered: row.recovered,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

export function startWorkerRun(startedAt: string): SocialWorkerRunRow {
  const result = db
    .prepare(`INSERT INTO social_worker_runs (started_at, status) VALUES (?, 'running')`)
    .run(startedAt);

  const row = db
    .prepare("SELECT * FROM social_worker_runs WHERE id = ?")
    .get(result.lastInsertRowid) as DbRow;

  return toRow(row);
}

export function completeWorkerRun(
  id: number,
  finishedAt: string,
  summary: {
    processed: number;
    published: number;
    failed: number;
    retried: number;
    skipped: number;
    recovered: number;
  }
): void {
  db.prepare(
    `UPDATE social_worker_runs
     SET status = 'completed', finished_at = ?, processed = ?, published = ?,
         failed = ?, retried = ?, skipped = ?, recovered = ?, error_message = NULL
     WHERE id = ?`
  ).run(
    finishedAt,
    summary.processed,
    summary.published,
    summary.failed,
    summary.retried,
    summary.skipped,
    summary.recovered,
    id
  );
}

export function failWorkerRun(id: number, finishedAt: string, errorMessage: string): void {
  db.prepare(
    `UPDATE social_worker_runs
     SET status = 'failed', finished_at = ?, error_message = ?
     WHERE id = ?`
  ).run(finishedAt, errorMessage, id);
}

export function getLatestWorkerRun(): SocialWorkerRunRow | null {
  const row = db
    .prepare("SELECT * FROM social_worker_runs ORDER BY id DESC LIMIT 1")
    .get() as DbRow | undefined;

  return row ? toRow(row) : null;
}

export function getLatestCompletedWorkerRun(): SocialWorkerRunRow | null {
  const row = db
    .prepare(
      `SELECT * FROM social_worker_runs
       WHERE status = 'completed'
       ORDER BY id DESC LIMIT 1`
    )
    .get() as DbRow | undefined;

  return row ? toRow(row) : null;
}

// STEP 18.2/18.4: ถ้ามีแถว 'running' ค้างอยู่ตอนที่ worker เริ่มรอบใหม่ แปลว่า process ก่อนหน้า
// ตายกลางคัน (crash, kill, restart) ไม่มีทางเป็น worker อีกตัวที่กำลังรันจริงพร้อมกัน เพราะ
// in-memory lock (socialWorker.ts) กันการเรียกซ้อนกันในโปรเซสเดียวกันไปแล้ว — ปิดแถวเหล่านี้ให้
// เป็น 'failed' อย่างซื่อสัตย์ (ไม่ใช่ 'completed' เพราะไม่รู้ผลจริง) ก่อนเริ่มรอบใหม่เสมอ
export function closeStaleRunningWorkerRuns(nowIso: string): number {
  const result = db
    .prepare(
      `UPDATE social_worker_runs
       SET status = 'failed', finished_at = ?, error_message = 'ไม่พบผลลัพธ์ที่สมบูรณ์ — process อาจถูกปิดกลางคัน (restart/crash)'
       WHERE status = 'running'`
    )
    .run(nowIso);

  return result.changes;
}
