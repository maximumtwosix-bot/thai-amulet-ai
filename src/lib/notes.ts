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

export type NoteFile = {
  id: string;
  type: "note";
  name: string;
  content: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotesData = {
  folders: NoteFolder[];
  notes: NoteFile[];
};

const DATA_FILE = path.join(process.cwd(), "data", "notes.json");

async function loadNotesData(): Promise<NotesData> {
  try {
    const raw = await readFile(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<NotesData>;

    return {
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
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
    content: "",
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
  patch: { name?: string; content?: string }
): Promise<NoteFile | null> {
  const data = await loadNotesData();
  const note = data.notes.find((n) => n.id === id);

  if (!note) {
    return null;
  }

  if (typeof patch.name === "string") {
    note.name = patch.name;
  }

  if (typeof patch.content === "string") {
    note.content = patch.content;
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
