import { NextResponse } from "next/server";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { sanitizeUploadFolderName } from "@/lib/notes";

export const runtime = "nodejs";

// คลังรูปภาพโปรเจกต์ ("Asset Manager") — อ่านรายชื่อไฟล์รูปภาพที่มีอยู่จริงใน
// public/uploads/[folder]/ เท่านั้น (โฟลเดอร์เดียวกับที่ src/app/api/notes/upload/route.ts เขียน
// ไฟล์ลงไป, ใช้ sanitizeUploadFolderName ตัวเดียวกันจาก src/lib/notes.ts เพื่อไม่ให้ผลลัพธ์เพี้ยนกัน)
// ไม่มีการเขียน/ลบไฟล์ใดๆ จาก endpoint นี้ — read-only listing ล้วนๆ
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const folder = sanitizeUploadFolderName(searchParams.get("folder"));

    if (!folder) {
      return NextResponse.json({ success: false, error: "กรุณาระบุชื่อโฟลเดอร์" }, { status: 400 });
    }

    const directory = path.join(process.cwd(), "public", "uploads", folder);

    let entries: string[];

    try {
      entries = await readdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // โฟลเดอร์นี้ยังไม่เคยมีการอัปโหลดเลย — ไม่ใช่ error จริง แค่ยังไม่มีรูปภาพ
        return NextResponse.json({ success: true, images: [] });
      }
      throw error;
    }

    const images = await Promise.all(
      entries
        .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
        .map(async (name) => {
          const fileStat = await stat(path.join(directory, name));
          return {
            name,
            url: `/uploads/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`,
            uploadedAt: fileStat.mtime.toISOString(),
          };
        })
    );

    // ใหม่ล่าสุดก่อน
    images.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));

    return NextResponse.json({ success: true, images });
  } catch (error) {
    console.error("GET /api/notes/images error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "ไม่สามารถโหลดคลังรูปภาพได้" },
      { status: 500 }
    );
  }
}
