// Content Workspace ("สมุดโน้ต") — persistence layer. Deliberately a plain local JSON file
// (data/notes.json), not a new SQLite table, per the explicit requirement for this feature. Simple
// read-modify-write with no locking: this app has a single shared admin session and no concurrent-
// writer scenario to guard against (same assumption every other local-file write in this codebase
// already makes, e.g. product media uploads).
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type NoteFolder = {
  id: string;
  type: "folder";
  name: string;
  parentId: string | null;
  createdAt: string;
};

// STEP: multi-page pagination — `pages` (one HTML string per page) replaces the old single
// `content: string` field. Kept optional/nullable on the raw-disk shape (see RawNoteFile below) so
// existing data/notes.json rows written before this change still load correctly; normalizeNote()
// below is the single place that migrates an old `content`-only row into `pages: [content]` on
// read. Nothing after normalizeNote() ever needs to know the old shape existed.
export type NoteFile = {
  id: string;
  type: "note";
  name: string;
  pages: string[];
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
};

// Shape a note might actually have on disk — either current (`pages`) or pre-pagination legacy
// (`content`), or in principle neither if the file was hand-edited. Every field is optional/unknown
// on purpose; normalizeNote() is what turns this into a real NoteFile.
type RawNoteFile = {
  id?: unknown;
  name?: unknown;
  pages?: unknown;
  content?: unknown;
  folderId?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type NotesData = {
  folders: NoteFolder[];
  notes: NoteFile[];
};

const DATA_FILE = path.join(process.cwd(), "data", "notes.json");

function normalizeNote(raw: RawNoteFile): NoteFile {
  const pagesFromArray = Array.isArray(raw.pages)
    ? raw.pages.filter((p): p is string => typeof p === "string")
    : [];

  const pages =
    pagesFromArray.length > 0
      ? pagesFromArray
      : [typeof raw.content === "string" ? raw.content : ""];

  return {
    id: typeof raw.id === "string" ? raw.id : randomUUID(),
    type: "note",
    name: typeof raw.name === "string" ? raw.name : "โน้ตไม่มีชื่อ",
    pages,
    folderId: typeof raw.folderId === "string" ? raw.folderId : null,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

async function loadNotesData(): Promise<NotesData> {
  try {
    const raw = await readFile(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw) as { folders?: unknown; notes?: unknown };

    return {
      folders: Array.isArray(parsed.folders) ? (parsed.folders as NoteFolder[]) : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes.map((n) => normalizeNote(n as RawNoteFile)) : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { folders: [], notes: [] };
    }
    throw error;
  }
}

async function saveNotesData(data: NotesData): Promise<void> {
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export async function getNotesData(): Promise<NotesData> {
  return loadNotesData();
}

export async function createFolder(name: string): Promise<NoteFolder> {
  const data = await loadNotesData();

  const folder: NoteFolder = {
    id: randomUUID(),
    type: "folder",
    name,
    parentId: null,
    createdAt: new Date().toISOString(),
  };

  data.folders.push(folder);
  await saveNotesData(data);

  return folder;
}

export async function createNote(name: string, folderId: string | null): Promise<NoteFile> {
  const data = await loadNotesData();
  const now = new Date().toISOString();

  const note: NoteFile = {
    id: randomUUID(),
    type: "note",
    name,
    pages: [""],
    folderId,
    createdAt: now,
    updatedAt: now,
  };

  data.notes.push(note);
  await saveNotesData(data);

  return note;
}

export async function updateNote(
  id: string,
  patch: { name?: string; pages?: string[] }
): Promise<NoteFile | null> {
  const data = await loadNotesData();
  const note = data.notes.find((n) => n.id === id);

  if (!note) {
    return null;
  }

  if (typeof patch.name === "string") {
    note.name = patch.name;
  }

  if (Array.isArray(patch.pages) && patch.pages.length > 0) {
    note.pages = patch.pages;
  }

  note.updatedAt = new Date().toISOString();
  await saveNotesData(data);

  return note;
}

export async function deleteNote(id: string): Promise<boolean> {
  const data = await loadNotesData();
  const before = data.notes.length;

  data.notes = data.notes.filter((n) => n.id !== id);

  if (data.notes.length === before) {
    return false;
  }

  await saveNotesData(data);
  return true;
}

// Deleting a folder also deletes every note inside it — an orphaned note with a dangling folderId
// would otherwise be unreachable in the UI forever.
export async function deleteFolder(id: string): Promise<boolean> {
  const data = await loadNotesData();
  const before = data.folders.length;

  data.folders = data.folders.filter((f) => f.id !== id);

  if (data.folders.length === before) {
    return false;
  }

  data.notes = data.notes.filter((n) => n.folderId !== id);
  await saveNotesData(data);

  return true;
}

// ชื่อโฟลเดอร์เก็บรูปภาพ ("คลังรูปภาพโปรเจกต์") มาจากผู้ใช้เอง ใช้ร่วมกันโดย
// src/app/api/notes/upload/route.ts (เขียนไฟล์) และ src/app/api/notes/images/route.ts (อ่านรายชื่อ
// ไฟล์) — export จากที่นี่ที่เดียวเพื่อไม่ให้ตรรกะ sanitize เพี้ยนไปคนละแบบระหว่างสองฝั่ง ซึ่งจะทำให้
// อัปโหลดเข้าโฟลเดอร์หนึ่งแต่คลังรูปภาพหาไม่เจอ ตัดอักขระที่ใช้เป็น path separator/path traversal ออก
// ทั้งหมด (เหลือได้แค่ 1 ระดับโฟลเดอร์เสมอ) แต่ยังรองรับภาษาไทย/ตัวอักษร unicode อื่นๆ ตามปกติ
export function sanitizeUploadFolderName(raw: string | null): string {
  if (!raw) return "";

  return raw
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\.\./g, "")
    .slice(0, 100)
    .trim();
}
