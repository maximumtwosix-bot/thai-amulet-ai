import db from "@/lib/db";

export type AiVideoJobStatus = "processing" | "published" | "failed";

export type AiVideoJobRow = {
  id: number;
  productId: number;
  provider: string;
  externalJobId: string | null;
  prompt: string;
  status: AiVideoJobStatus;
  errorMessage: string | null;
  productMediaId: number | null;
  duration: number | null;
  fileSize: number | null;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: number;
  product_id: number;
  provider: string;
  external_job_id: string | null;
  prompt: string;
  status: string;
  error_message: string | null;
  product_media_id: number | null;
  duration: number | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
};

function toRow(row: DbRow): AiVideoJobRow {
  return {
    id: row.id,
    productId: row.product_id,
    provider: row.provider,
    externalJobId: row.external_job_id,
    prompt: row.prompt,
    status: row.status as AiVideoJobStatus,
    errorMessage: row.error_message,
    productMediaId: row.product_media_id,
    duration: row.duration,
    fileSize: row.file_size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function insertAiVideoJob(params: {
  productId: number;
  provider: string;
  prompt: string;
}): AiVideoJobRow {
  const result = db
    .prepare(
      `INSERT INTO ai_video_jobs (product_id, provider, prompt, status)
       VALUES (?, ?, ?, 'processing')`
    )
    .run(params.productId, params.provider, params.prompt);

  const row = db
    .prepare("SELECT * FROM ai_video_jobs WHERE id = ?")
    .get(result.lastInsertRowid) as DbRow;

  return toRow(row);
}

export function getAiVideoJobById(
  productId: number,
  jobId: number
): AiVideoJobRow | undefined {
  const row = db
    .prepare("SELECT * FROM ai_video_jobs WHERE id = ? AND product_id = ?")
    .get(jobId, productId) as DbRow | undefined;

  return row ? toRow(row) : undefined;
}

export function listAiVideoJobs(productId: number): AiVideoJobRow[] {
  const rows = db
    .prepare("SELECT * FROM ai_video_jobs WHERE product_id = ? ORDER BY id DESC")
    .all(productId) as DbRow[];

  return rows.map(toRow);
}

export function setAiVideoJobExternalId(id: number, externalJobId: string): void {
  db.prepare(
    "UPDATE ai_video_jobs SET external_job_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(externalJobId, id);
}

export function markAiVideoJobPublished(
  id: number,
  productMediaId: number,
  duration: number,
  fileSize: number
): void {
  db.prepare(
    `UPDATE ai_video_jobs
     SET status = 'published', product_media_id = ?, duration = ?, file_size = ?,
         error_message = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(productMediaId, duration, fileSize, id);
}

export function markAiVideoJobFailed(id: number, errorMessage: string): void {
  db.prepare(
    "UPDATE ai_video_jobs SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(errorMessage, id);
}
