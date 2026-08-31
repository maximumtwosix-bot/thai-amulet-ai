import { NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";

export async function GET() {
  let db: Database.Database | null = null;

  try {
    db = new Database("./data/thai-amulet.db", {
      readonly: true,
    });

    const contents = db
      .prepare(`
        SELECT
          id,
          title,
          content_type,
          platform,
          caption,
          status,
          product_id,
          created_at
        FROM content
        ORDER BY id DESC
      `)
      .all();

    return NextResponse.json({
      success: true,
      contents,
    });
  } catch (error) {
    console.error("GET /api/content/list error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "ไม่สามารถโหลดคอนเทนต์ได้",
      },
      { status: 500 }
    );
  } finally {
    db?.close();
  }
}
