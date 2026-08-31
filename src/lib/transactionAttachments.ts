import db from "@/lib/db";

// Evidence attachments for a transaction (receipt / transfer slip photo) — STEP 21.
// Mirrors src/lib/productMedia.ts's shape and conventions exactly (same getById-scoped-to-parent
// pattern so a cross-transaction attachmentId returns undefined → route maps to 404, same as
// getProductMediaById/deleteProductMedia do for cross-product mediaId).

type TransactionAttachmentRow = {
  id: number;
  transaction_id: number;
  file_name: string;
  file_url: string;
  created_at: string;
};

export type TransactionAttachment = {
  id: number;
  transactionId: number;
  fileName: string;
  fileUrl: string;
  createdAt: string;
};

const SELECT_COLUMNS = "id, transaction_id, file_name, file_url, created_at";

function mapRow(row: TransactionAttachmentRow): TransactionAttachment {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    fileName: row.file_name,
    fileUrl: row.file_url,
    createdAt: row.created_at,
  };
}

export function listTransactionAttachments(transactionId: number): TransactionAttachment[] {
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM transaction_attachments
       WHERE transaction_id = ?
       ORDER BY created_at ASC, id ASC`
    )
    .all(transactionId) as TransactionAttachmentRow[];

  return rows.map(mapRow);
}

export function getTransactionAttachmentById(
  transactionId: number,
  attachmentId: number
): TransactionAttachment | undefined {
  const row = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM transaction_attachments WHERE id = ? AND transaction_id = ?`
    )
    .get(attachmentId, transactionId) as TransactionAttachmentRow | undefined;

  return row ? mapRow(row) : undefined;
}

// ไฟล์ต้องถูกเขียนลงดิสก์เรียบร้อยแล้วก่อนเรียกฟังก์ชันนี้ (เหมือน insertProductMedia)
export function insertTransactionAttachment(params: {
  transactionId: number;
  fileName: string;
  fileUrl: string;
}): TransactionAttachment {
  const result = db
    .prepare(
      `INSERT INTO transaction_attachments (transaction_id, file_name, file_url)
       VALUES (?, ?, ?)`
    )
    .run(params.transactionId, params.fileName, params.fileUrl);

  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM transaction_attachments WHERE id = ?`)
    .get(result.lastInsertRowid) as TransactionAttachmentRow;

  return mapRow(row);
}

/**
 * ลบไฟล์แนบ 1 รายการ — คืนแถวที่ลบไปแล้ว (เพื่อให้ route เอา fileUrl ไปลบไฟล์จริงบนดิสก์ต่อ)
 * หรือ undefined ถ้าไม่พบ (รวมถึงกรณี attachmentId มีอยู่จริงแต่เป็นของ transaction อื่น)
 */
export function deleteTransactionAttachment(
  transactionId: number,
  attachmentId: number
): TransactionAttachment | undefined {
  const existing = getTransactionAttachmentById(transactionId, attachmentId);

  if (!existing) {
    return undefined;
  }

  db.prepare(`DELETE FROM transaction_attachments WHERE id = ?`).run(attachmentId);

  return existing;
}

/**
 * ลบไฟล์แนบทั้งหมดของ transaction หนึ่งรายการ (DB rows เท่านั้น) — เรียกจาก deleteTransaction()
 * ก่อนลบตัว transaction เองเสมอ กัน orphaned rows คืนรายการที่ถูกลบ (เพื่อให้ caller เอา fileUrl
 * แต่ละไฟล์ไปลบไฟล์จริงบนดิสก์ต่อแบบ best-effort เหมือน route DELETE รายตัว)
 */
export function deleteAllAttachmentsForTransaction(
  transactionId: number
): TransactionAttachment[] {
  const rows = listTransactionAttachments(transactionId);

  if (rows.length > 0) {
    db.prepare(`DELETE FROM transaction_attachments WHERE transaction_id = ?`).run(
      transactionId
    );
  }

  return rows;
}
