"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import LogoutButton from "@/components/LogoutButton";
import BackLink from "@/components/BackLink";
import {
  BoldIcon,
  FolderIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  NotebookIcon,
  QuoteIcon,
  XIcon,
} from "@/components/icons";

// Content Workspace ("สมุดโน้ต") — Rich Text note-taking + a flat folder tree, persisted to a local
// JSON file (data/notes.json) via /api/notes (src/lib/notes.ts does the actual file I/O). This page
// never touches the SQLite DB — notes are intentionally a separate, simpler storage mechanism.
type NoteFolder = {
  id: string;
  type: "folder";
  name: string;
  parentId: string | null;
  createdAt: string;
};

type NoteFile = {
  id: string;
  type: "note";
  name: string;
  content: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
};

function ToolbarButton({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all disabled:cursor-not-allowed disabled:opacity-30 ${
        active
          ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
          : "border-transparent text-neutral-400 hover:border-amber-500/20 hover:bg-amber-500/10 hover:text-amber-500"
      }`}
    >
      {children}
    </button>
  );
}

export default function NotesPage() {
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [notes, setNotes] = useState<NoteFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  const [noteNameInput, setNoteNameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderError, setFolderError] = useState("");

  const [creatingNote, setCreatingNote] = useState(false);
  const [newNoteName, setNewNoteName] = useState("");
  const [noteError, setNoteError] = useState("");

  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: "min-h-[400px] px-4 py-3 text-sm text-neutral-100 focus:outline-none",
      },
    },
  });

  async function loadNotes() {
    try {
      setLoading(true);
      setLoadError("");

      const response = await fetch("/api/notes", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถโหลดข้อมูลโน้ตได้");
      }

      setFolders(Array.isArray(data.folders) ? data.folders : []);
      setNotes(Array.isArray(data.notes) ? data.notes : []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "ไม่สามารถโหลดข้อมูลโน้ตได้");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Standard "fetch on mount" pattern (same shape as loadProducts()/loadOrders() elsewhere in
    // this codebase) — react-hooks/set-state-in-effect flags this as if setState ran synchronously
    // in the effect body, but the actual setState calls only run after the async fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadNotes();
  }, []);

  function selectNote(note: NoteFile) {
    setSelectedNoteId(note.id);
    setNoteNameInput(note.name);
    setSaveError("");
    setSaveMessage("");
    editor?.commands.setContent(note.content || "");
  }

  async function submitNewFolder() {
    const name = newFolderName.trim();

    if (!name) {
      setFolderError("กรุณาระบุชื่อโฟลเดอร์");
      return;
    }

    setFolderError("");

    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-folder", name }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถสร้างโฟลเดอร์ได้");
      }

      setFolders((current) => [...current, data.folder]);
      setNewFolderName("");
      setCreatingFolder(false);
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : "ไม่สามารถสร้างโฟลเดอร์ได้");
    }
  }

  async function submitNewNote() {
    const name = newNoteName.trim() || "โน้ตใหม่";

    setNoteError("");

    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-note", name, folderId: activeFolderId }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถสร้างโน้ตได้");
      }

      const note: NoteFile = data.note;
      setNotes((current) => [...current, note]);
      setNewNoteName("");
      setCreatingNote(false);
      selectNote(note);
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "ไม่สามารถสร้างโน้ตได้");
    }
  }

  async function saveNote() {
    if (!selectedNoteId || !editor) return;

    const name = noteNameInput.trim();

    if (!name) {
      setSaveError("กรุณาระบุชื่อไฟล์โน้ต");
      return;
    }

    setSaving(true);
    setSaveError("");
    setSaveMessage("");

    try {
      const response = await fetch("/api/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedNoteId,
          name,
          content: editor.getHTML(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถบันทึกโน้ตได้");
      }

      setNotes((current) =>
        current.map((n) => (n.id === selectedNoteId ? data.note : n))
      );
      setSaveMessage("บันทึกแล้ว ✓");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "ไม่สามารถบันทึกโน้ตได้");
    } finally {
      setSaving(false);
    }
  }

  async function removeFolder(folder: NoteFolder) {
    const confirmed = confirm(
      `ต้องการลบโฟลเดอร์ "${folder.name}" พร้อมโน้ตทั้งหมดในนี้หรือไม่?`
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/notes?id=${folder.id}&type=folder`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถลบโฟลเดอร์ได้");
      }

      setFolders((current) => current.filter((f) => f.id !== folder.id));
      setNotes((current) => current.filter((n) => n.folderId !== folder.id));
      if (activeFolderId === folder.id) setActiveFolderId(null);
      if (notes.find((n) => n.folderId === folder.id && n.id === selectedNoteId)) {
        setSelectedNoteId(null);
        editor?.commands.setContent("");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "ไม่สามารถลบโฟลเดอร์ได้");
    }
  }

  async function removeNote(note: NoteFile) {
    const confirmed = confirm(`ต้องการลบโน้ต "${note.name}" หรือไม่?`);
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/notes?id=${note.id}&type=note`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถลบโน้ตได้");
      }

      setNotes((current) => current.filter((n) => n.id !== note.id));
      if (selectedNoteId === note.id) {
        setSelectedNoteId(null);
        setNoteNameInput("");
        editor?.commands.setContent("");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "ไม่สามารถลบโน้ตได้");
    }
  }

  const uncategorizedNotes = useMemo(
    () => notes.filter((n) => !n.folderId),
    [notes]
  );

  return (
    <main className="min-h-screen bg-black bg-[linear-gradient(to_right,#f59e0b08_1px,transparent_1px),linear-gradient(to_bottom,#f59e0b08_1px,transparent_1px)] bg-[size:24px_24px] p-6">
      <div className="mx-auto flex max-w-6xl flex-col" style={{ minHeight: "calc(100vh - 3rem)" }}>
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">📓 สมุดโน้ต</h1>
            <p className="mt-1 text-sm text-neutral-500">
              จดโน้ตและจัดการคอนเทนต์ — จัดเก็บเป็นโฟลเดอร์และไฟล์โน้ตแบบจัดรูปแบบได้
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <BackLink href="/" label="กลับหน้าแรก" />
            <LogoutButton />
          </div>
        </div>

        {loadError && (
          <div className="mb-4 rounded-xl border border-red-900/50 bg-red-950/40 p-3 text-sm text-red-400">
            {loadError}
          </div>
        )}

        <div className="flex flex-1 flex-col gap-4 md:flex-row">
          <aside className="flex shrink-0 flex-col rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg shadow-[0_0_15px_rgba(245,158,11,0.05)] p-4 md:w-72">
            <div className="mb-3 flex flex-col gap-2">
              {creatingFolder ? (
                <div className="rounded-xl border border-amber-500/20 bg-black p-2">
                  <input
                    autoFocus
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitNewFolder()}
                    placeholder="ชื่อโฟลเดอร์..."
                    className="w-full rounded-lg border border-neutral-700 bg-black px-2 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  />
                  {folderError && <p className="mt-1 text-xs text-red-400">{folderError}</p>}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={submitNewFolder}
                      className="flex-1 rounded-lg bg-gradient-to-r from-amber-500 to-amber-400 py-1.5 text-xs font-medium text-black"
                    >
                      สร้าง
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingFolder(false);
                        setNewFolderName("");
                        setFolderError("");
                      }}
                      className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreatingFolder(true)}
                  className="flex items-center gap-2 rounded-xl border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-300 hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-400"
                >
                  <FolderIcon className="h-4 w-4" />+ สร้างโฟลเดอร์
                </button>
              )}

              {creatingNote ? (
                <div className="rounded-xl border border-amber-500/20 bg-black p-2">
                  <input
                    autoFocus
                    type="text"
                    value={newNoteName}
                    onChange={(e) => setNewNoteName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitNewNote()}
                    placeholder="ชื่อโน้ตใหม่..."
                    className="w-full rounded-lg border border-neutral-700 bg-black px-2 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  />
                  {noteError && <p className="mt-1 text-xs text-red-400">{noteError}</p>}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={submitNewNote}
                      className="flex-1 rounded-lg bg-gradient-to-r from-amber-500 to-amber-400 py-1.5 text-xs font-medium text-black"
                    >
                      สร้าง
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingNote(false);
                        setNewNoteName("");
                        setNoteError("");
                      }}
                      className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreatingNote(true)}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 px-3 py-2 text-sm font-medium text-black shadow-[0_0_15px_rgba(245,158,11,0.4)] hover:from-amber-400 hover:to-amber-300"
                >
                  <NotebookIcon className="h-4 w-4" />+ สร้างโน้ตใหม่
                </button>
              )}
            </div>

            <div className="flex-1 space-y-1 overflow-y-auto">
              {loading ? (
                <p className="p-3 text-center text-xs text-neutral-500">กำลังโหลด...</p>
              ) : (
                <>
                  {folders.map((folder) => (
                    <div key={folder.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveFolderId(folder.id)}
                        onKeyDown={(e) => e.key === "Enter" && setActiveFolderId(folder.id)}
                        className={`group flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-sm font-medium ${
                          activeFolderId === folder.id
                            ? "bg-amber-500/10 text-amber-400"
                            : "text-neutral-300 hover:bg-neutral-800"
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <FolderIcon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{folder.name}</span>
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFolder(folder);
                          }}
                          title="ลบโฟลเดอร์"
                          className="hidden shrink-0 text-neutral-500 hover:text-red-400 group-hover:block"
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="ml-4 space-y-0.5 border-l border-neutral-800 pl-2">
                        {notes
                          .filter((n) => n.folderId === folder.id)
                          .map((note) => (
                            <div
                              key={note.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => selectNote(note)}
                              onKeyDown={(e) => e.key === "Enter" && selectNote(note)}
                              className={`group flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-xs ${
                                selectedNoteId === note.id
                                  ? "bg-amber-500/10 text-amber-400"
                                  : "text-neutral-400 hover:bg-neutral-800"
                              }`}
                            >
                              <span className="truncate">{note.name}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeNote(note);
                                }}
                                title="ลบโน้ต"
                                className="hidden shrink-0 text-neutral-500 hover:text-red-400 group-hover:block"
                              >
                                <XIcon className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}

                  <div>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setActiveFolderId(null)}
                      onKeyDown={(e) => e.key === "Enter" && setActiveFolderId(null)}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium ${
                        activeFolderId === null
                          ? "bg-amber-500/10 text-amber-400"
                          : "text-neutral-300 hover:bg-neutral-800"
                      }`}
                    >
                      <FolderIcon className="h-4 w-4 shrink-0" />
                      <span>ไม่มีหมวดหมู่</span>
                    </div>

                    <div className="ml-4 space-y-0.5 border-l border-neutral-800 pl-2">
                      {uncategorizedNotes.map((note) => (
                        <div
                          key={note.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => selectNote(note)}
                          onKeyDown={(e) => e.key === "Enter" && selectNote(note)}
                          className={`group flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-xs ${
                            selectedNoteId === note.id
                              ? "bg-amber-500/10 text-amber-400"
                              : "text-neutral-400 hover:bg-neutral-800"
                          }`}
                        >
                          <span className="truncate">{note.name}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeNote(note);
                            }}
                            title="ลบโน้ต"
                            className="hidden shrink-0 text-neutral-500 hover:text-red-400 group-hover:block"
                          >
                            <XIcon className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {!loading && folders.length === 0 && notes.length === 0 && (
                    <p className="p-3 text-center text-xs text-neutral-500">
                      ยังไม่มีโฟลเดอร์หรือโน้ต — เริ่มสร้างได้เลย
                    </p>
                  )}
                </>
              )}
            </div>
          </aside>

          <section className="flex flex-1 flex-col rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg shadow-[0_0_15px_rgba(245,158,11,0.05)] p-5">
            {!selectedNoteId ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-neutral-700 text-center text-sm text-neutral-500">
                <NotebookIcon className="mb-3 h-8 w-8 text-neutral-700" />
                เลือกโน้ตด้านซ้าย หรือกด &ldquo;+ สร้างโน้ตใหม่&rdquo; เพื่อเริ่มเขียน
              </div>
            ) : (
              <>
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={noteNameInput}
                    onChange={(e) => setNoteNameInput(e.target.value)}
                    placeholder="ชื่อไฟล์โน้ต"
                    className="flex-1 rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm font-medium text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  />
                  <button
                    type="button"
                    onClick={saveNote}
                    disabled={saving}
                    className="rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 px-5 py-2 text-sm font-medium text-black shadow-[0_0_15px_rgba(245,158,11,0.4)] hover:from-amber-400 hover:to-amber-300 disabled:opacity-50"
                  >
                    {saving ? "กำลังบันทึก..." : "บันทึก (Save)"}
                  </button>
                </div>

                {saveError && (
                  <p className="mb-3 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-xs text-red-400">
                    {saveError}
                  </p>
                )}
                {saveMessage && !saveError && (
                  <p className="mb-3 text-xs text-emerald-400">{saveMessage}</p>
                )}

                <div className="mb-3 flex items-center gap-1 rounded-xl border border-amber-500/20 bg-black/30 p-1.5">
                  <ToolbarButton
                    active={!!editor?.isActive("bold")}
                    disabled={!editor}
                    onClick={() => editor?.chain().focus().toggleBold().run()}
                    title="ตัวหนา"
                  >
                    <BoldIcon className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton
                    active={!!editor?.isActive("italic")}
                    disabled={!editor}
                    onClick={() => editor?.chain().focus().toggleItalic().run()}
                    title="ตัวเอียง"
                  >
                    <ItalicIcon className="h-4 w-4" />
                  </ToolbarButton>
                  <div className="mx-1 h-5 w-px bg-neutral-800" />
                  <ToolbarButton
                    active={!!editor?.isActive("heading", { level: 1 })}
                    disabled={!editor}
                    onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
                    title="หัวข้อใหญ่"
                  >
                    <span className="text-xs font-bold">H1</span>
                  </ToolbarButton>
                  <ToolbarButton
                    active={!!editor?.isActive("heading", { level: 2 })}
                    disabled={!editor}
                    onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                    title="หัวข้อรอง"
                  >
                    <span className="text-xs font-bold">H2</span>
                  </ToolbarButton>
                  <div className="mx-1 h-5 w-px bg-neutral-800" />
                  <ToolbarButton
                    active={!!editor?.isActive("bulletList")}
                    disabled={!editor}
                    onClick={() => editor?.chain().focus().toggleBulletList().run()}
                    title="รายการหัวข้อย่อย"
                  >
                    <ListIcon className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton
                    active={!!editor?.isActive("orderedList")}
                    disabled={!editor}
                    onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                    title="รายการลำดับเลข"
                  >
                    <ListOrderedIcon className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton
                    active={!!editor?.isActive("blockquote")}
                    disabled={!editor}
                    onClick={() => editor?.chain().focus().toggleBlockquote().run()}
                    title="คำพูดอ้างอิง"
                  >
                    <QuoteIcon className="h-4 w-4" />
                  </ToolbarButton>
                </div>

                <div className="flex-1 overflow-y-auto rounded-xl border border-neutral-700 bg-black transition-colors focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 [&_h1]:mt-2 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-white [&_h2]:mt-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-white [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-amber-500/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-neutral-400 [&_strong]:font-bold [&_em]:italic">
                  <EditorContent editor={editor} />
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
