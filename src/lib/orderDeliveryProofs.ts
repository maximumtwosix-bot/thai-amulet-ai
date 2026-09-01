import db from "@/lib/db";

// Delivery proof photos for an order (STEP 49, approved 2026-09-01) — mirrors
// src/lib/transactionAttachments.ts's shape and conventions exactly (same getById-scoped-to-parent
// pattern so a cross-order proofId returns undefined → route maps to 404).

type OrderDeliveryProofRow = {
  id: number;
  order_id: number;
  file_name: string;
  file_url: string;
  created_at: string;
};

export type OrderDeliveryProof = {
  id: number;
  orderId: number;
  fileName: string;
  fileUrl: string;
  createdAt: string;
};

const SELECT_COLUMNS = "id, order_id, file_name, file_url, created_at";

function mapRow(row: OrderDeliveryProofRow): OrderDeliveryProof {
  return {
    id: row.id,
    orderId: row.order_id,
    fileName: row.file_name,
    fileUrl: row.file_url,
    createdAt: row.created_at,
  };
}

export function listOrderDeliveryProofs(orderId: number): OrderDeliveryProof[] {
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM order_delivery_proofs
       WHERE order_id = ?
       ORDER BY created_at ASC, id ASC`
    )
    .all(orderId) as OrderDeliveryProofRow[];

  return rows.map(mapRow);
}

export function getOrderDeliveryProofById(
  orderId: number,
  proofId: number
): OrderDeliveryProof | undefined {
  const row = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM order_delivery_proofs WHERE id = ? AND order_id = ?`
    )
    .get(proofId, orderId) as OrderDeliveryProofRow | undefined;

  return row ? mapRow(row) : undefined;
}

// ไฟล์ต้องถูกเขียนลงดิสก์เรียบร้อยแล้วก่อนเรียกฟังก์ชันนี้ (เหมือน insertTransactionAttachment)
export function insertOrderDeliveryProof(params: {
  orderId: number;
  fileName: string;
  fileUrl: string;
}): OrderDeliveryProof {
  const result = db
    .prepare(
      `INSERT INTO order_delivery_proofs (order_id, file_name, file_url)
       VALUES (?, ?, ?)`
    )
    .run(params.orderId, params.fileName, params.fileUrl);

  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM order_delivery_proofs WHERE id = ?`)
    .get(result.lastInsertRowid) as OrderDeliveryProofRow;

  return mapRow(row);
}

/**
 * ลบรูปหลักฐานการจัดส่ง 1 รายการ — คืนแถวที่ลบไปแล้ว (เพื่อให้ route เอา fileUrl ไปลบไฟล์จริงบนดิสก์ต่อ)
 * หรือ undefined ถ้าไม่พบ (รวมถึงกรณี proofId มีอยู่จริงแต่เป็นของ order อื่น)
 */
export function deleteOrderDeliveryProof(
  orderId: number,
  proofId: number
): OrderDeliveryProof | undefined {
  const existing = getOrderDeliveryProofById(orderId, proofId);

  if (!existing) {
    return undefined;
  }

  db.prepare(`DELETE FROM order_delivery_proofs WHERE id = ?`).run(proofId);

  return existing;
}
