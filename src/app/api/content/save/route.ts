import { NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";

type SaveContentBody = {
  title?: string;
  contentType?: string;
  platform?: string;
  caption?: string;
  productId?: number;
};

export async function POST(request: Request) {
  try {
    let body: SaveContentBody;

    try {
      body = (await request.json()) as SaveContentBody;
    } catch {
      return NextResponse.json(
        { error: "รูปแบบคำขอไม่ถูกต้อง (ต้องเป็น JSON)" },
        { status: 400 }
      );
    }

    const title = String(body.title || "").trim();
    const contentType = String(body.contentType || "").trim();
    const platform = String(body.platform || "").trim();
    const caption = String(body.caption || "").trim();

    if (!title) {
      return NextResponse.json(
        { error: "กรุณาระบุชื่อคอนเทนต์" },
        { status: 400 }
      );
    }

    if (!caption) {
      return NextResponse.json(
        { error: "ไม่พบเนื้อหาที่ต้องการบันทึก" },
        { status: 400 }
      );
    }

    // STEP 26: productId เป็น optional เพื่อไม่ทำลาย caller เดิมที่ยังไม่ส่งมา — แต่ถ้าส่งมาต้องเป็น
    // integer บวกจริงเท่านั้น ไม่เดา ไม่ coerce ค่าที่ผิดรูปแบบให้ผ่าน
    let productId: number | null = null;

    if (body.productId !== undefined && body.productId !== null) {
      const parsedProductId = Number(body.productId);

      if (!Number.isInteger(parsedProductId) || parsedProductId <= 0) {
        return NextResponse.json(
          { error: "productId ไม่ถูกต้อง" },
          { status: 400 }
        );
      }

      productId = parsedProductId;
    }

    const db = new Database("./data/thai-amulet.db");

    if (productId !== null) {
      const product = db
        .prepare("SELECT id FROM products WHERE id = ?")
        .get(productId);

      if (!product) {
        db.close();

        return NextResponse.json(
          { error: `ไม่พบสินค้ารหัส ${productId}` },
          { status: 404 }
        );
      }
    }

    const result = db
      .prepare(`
        INSERT INTO content (
          title,
          content_type,
          platform,
          caption,
          status,
          product_id
        )
        VALUES (?, ?, ?, ?, 'draft', ?)
      `)
      .run(
        title,
        contentType || null,
        platform || null,
        caption,
        productId
      );

    const content = db
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
        WHERE id = ?
      `)
      .get(result.lastInsertRowid);

    db.close();

    return NextResponse.json({
      success: true,
      content,
      message: "บันทึกคอนเทนต์สำเร็จ",
    });
  } catch (error) {
    console.error("POST /api/content/save error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "ไม่สามารถบันทึกคอนเทนต์ได้",
      },
      { status: 500 }
    );
  }
}
