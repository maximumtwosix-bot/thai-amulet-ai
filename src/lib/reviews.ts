import db from "./db";

export type ReviewRow = {
  id: number;
  customerName: string;
  rating: number;
  comment: string | null;
  imageUrl: string | null;
  createdAt: string;
};

type ReviewDbRow = {
  id: number;
  customer_name: string;
  rating: number;
  comment: string | null;
  image_url: string | null;
  created_at: string;
};

const SELECT_COLUMNS = "id, customer_name, rating, comment, image_url, created_at";

function mapRow(row: ReviewDbRow): ReviewRow {
  return {
    id: row.id,
    customerName: row.customer_name,
    rating: row.rating,
    comment: row.comment,
    imageUrl: row.image_url,
    createdAt: row.created_at,
  };
}

export function listReviews(limit = 100): ReviewRow[] {
  const rows = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM reviews ORDER BY id DESC LIMIT ?`)
    .all(limit) as ReviewDbRow[];

  return rows.map(mapRow);
}

export interface CreateReviewInput {
  customerName: string;
  rating: number;
  comment?: string | null;
  imageUrl?: string | null;
}

export function createReview(input: CreateReviewInput): ReviewRow {
  const customerName = input.customerName.trim();

  if (!customerName) {
    throw new Error("INVALID_CUSTOMER_NAME");
  }

  const rating = Number(input.rating);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error("INVALID_RATING");
  }

  const comment = input.comment?.trim() || null;
  const imageUrl = input.imageUrl?.trim() || null;

  const result = db
    .prepare(
      `INSERT INTO reviews (customer_name, rating, comment, image_url) VALUES (?, ?, ?, ?)`
    )
    .run(customerName, rating, comment, imageUrl);

  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM reviews WHERE id = ?`)
    .get(result.lastInsertRowid) as ReviewDbRow;

  return mapRow(row);
}
