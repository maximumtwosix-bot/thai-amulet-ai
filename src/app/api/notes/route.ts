import { NextResponse } from "next/server";
import {
  createFolder,
  createNote,
  deleteFolder,
  deleteNote,
  getNotesData,
  updateNote,
} from "@/lib/notes";

export const runtime = "nodejs";

export async function GET() {
  try {
    const data = await getNotesData();
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    console.error("GET /api/notes error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "ไม่สามารถโหลดข้อมูลโน้ตได้" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body?.action === "create-folder") {
      const name = typeof body.name === "string" ? body.name.trim() : "";

      if (!name) {
        return NextResponse.json({ success: false, error: "กรุณาระบุชื่อโฟลเดอร์" }, { status: 400 });
      }

      const folder = await createFolder(name);
      return NextResponse.json({ success: true, folder });
    }

    if (body?.action === "create-note") {
      const name = typeof body.name === "string" ? body.name.trim() : "";

      if (!name) {
        return NextResponse.json({ success: false, error: "กรุณาระบุชื่อโน้ต" }, { status: 400 });
      }

      const folderId = typeof body.folderId === "string" ? body.folderId : null;
      const note = await createNote(name, folderId);
      return NextResponse.json({ success: true, note });
    }

    return NextResponse.json({ success: false, error: "action ไม่ถูกต้อง" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/notes error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "ไม่สามารถบันทึกข้อมูลได้" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = typeof body?.id === "string" ? body.id : null;

    if (!id) {
      return NextResponse.json({ success: false, error: "กรุณาระบุรหัสโน้ต" }, { status: 400 });
    }

    const note = await updateNote(id, {
      name: typeof body.name === "string" ? body.name : undefined,
      content: typeof body.content === "string" ? body.content : undefined,
    });

    if (!note) {
      return NextResponse.json({ success: false, error: "ไม่พบโน้ตนี้" }, { status: 404 });
    }

    return NextResponse.json({ success: true, note });
  } catch (error) {
    console.error("PATCH /api/notes error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "ไม่สามารถบันทึกโน้ตได้" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const type = searchParams.get("type");

    if (!id || (type !== "note" && type !== "folder")) {
      return NextResponse.json({ success: false, error: "พารามิเตอร์ไม่ถูกต้อง" }, { status: 400 });
    }

    const deleted = type === "folder" ? await deleteFolder(id) : await deleteNote(id);

    if (!deleted) {
      return NextResponse.json({ success: false, error: "ไม่พบรายการนี้" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/notes error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "ไม่สามารถลบได้" },
      { status: 500 }
    );
  }
}
