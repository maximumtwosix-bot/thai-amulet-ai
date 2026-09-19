"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Highlight } from "@tiptap/extension-highlight";
import { ResizableImage } from "@/components/tiptap/ResizableImage";
import {
  BoldIcon,
  FolderIcon,
  GalleryIcon,
  HighlighterIcon,
  ImageIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  NotebookIcon,
  PageBreakIcon,
  QuoteIcon,
  XIcon,
} from "@/components/icons";

type GalleryImage = {
  name: string;
  url: string;
  uploadedAt: string;
};

// Content Workspace ("สมุดโน้ต") — Rich Text note-taking + a flat folder tree, persisted to a local
// JSON file (data/notes.json) via /api/notes (src/lib/notes.ts does the actual file I/O). Never
// touches the SQLite DB — notes are intentionally a separate, simpler storage mechanism.
//
// Extracted out of the standalone /notes page into a shared component so it can be embedded as the
// main body of /assistant (its primary home now) without duplicating this logic — /notes itself
// just redirects here.
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
  pages: string[];
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

export default function NotesWorkspace() {
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

  const [textColor, setTextColor] = useState("#f59e0b");
  const [highlightColor, setHighlightColor] = useState("#f59e0b");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageFolderName, setImageFolderName] = useState("");
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  // คลังรูปภาพโปรเจกต์ (Asset Manager) — แสดงในโมดัลเดียวกับตัวอัปโหลด เพราะทั้งสองผูกกับ
  // "ชื่อโฟลเดอร์" ตัวเดียวกัน (imageFolderName ด้านบน) อยู่แล้ว
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState("");
  const [copiedImageUrl, setCopiedImageUrl] = useState<string | null>(null);

  // Tabbed pagination — `pages` holds every page's HTML for the currently open note; the editor
  // itself only ever holds ONE page's content at a time (`pages[activePageIndex]`). Switching pages
  // flushes the editor's current HTML back into `pages` first (see switchToPage/addPage/saveNote)
  // so nothing typed is lost.
  const [pages, setPages] = useState<string[]>([""]);
  const [activePageIndex, setActivePageIndex] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      ResizableImage.configure({ HTMLAttributes: { class: "rounded-xl" } }),
    ],
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
    const notePages = note.pages && note.pages.length > 0 ? note.pages : [""];
    setSelectedNoteId(note.id);
    setNoteNameInput(note.name);
    setSaveError("");
    setSaveMessage("");
    setImageError("");
    setPages(notePages);
    setActivePageIndex(0);
    editor?.commands.setContent(notePages[0] || "");
  }

  // สลับหน้า — flush เนื้อหาปัจจุบันใน editor กลับเข้า pages[activePageIndex] ก่อนเสมอ ไม่งั้นสิ่งที่
  // พิมพ์ไว้ในหน้าที่กำลังจะออกจะหายไป
  function switchToPage(index: number) {
    if (!editor || index === activePageIndex || index < 0 || index >= pages.length) return;

    const currentHtml = editor.getHTML();
    const nextPages = [...pages];
    nextPages[activePageIndex] = currentHtml;

    setPages(nextPages);
    setActivePageIndex(index);
    editor.commands.setContent(nextPages[index] || "");
  }

  function addPage() {
    if (!editor) return;

    const currentHtml = editor.getHTML();
    const nextPages = [...pages];
    nextPages[activePageIndex] = currentHtml;
    nextPages.push("");

    const newIndex = nextPages.length - 1;
    setPages(nextPages);
    setActivePageIndex(newIndex);
    editor.commands.setContent("");
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

    // flush เนื้อหาของหน้าที่กำลังเปิดอยู่กลับเข้า pages ก่อนส่ง — pages ช่องอื่นๆ ถูก sync ไว้แล้วตอน
    // สลับหน้าทุกครั้ง (switchToPage/addPage) มีแค่หน้าปัจจุบันเท่านั้นที่ editor ถืออยู่สดๆ
    const finalPages = [...pages];
    finalPages[activePageIndex] = editor.getHTML();

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
          pages: finalPages,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถบันทึกโน้ตได้");
      }

      setPages(finalPages);
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

  // โหลดคลังรูปภาพของโฟลเดอร์ที่ระบุ — ไม่ throw ออกไปให้ caller ต้อง try/catch เอง เก็บ error ไว้ใน
  // galleryError ให้ UI แสดงเองแทน
  async function loadGalleryImages(folder: string) {
    const trimmed = folder.trim();

    if (!trimmed) {
      setGalleryImages([]);
      return;
    }

    setGalleryLoading(true);
    setGalleryError("");

    try {
      const response = await fetch(`/api/notes/images?folder=${encodeURIComponent(trimmed)}`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "ไม่สามารถโหลดคลังรูปภาพได้");
      }

      setGalleryImages(Array.isArray(data.images) ? data.images : []);
    } catch (err) {
      setGalleryError(err instanceof Error ? err.message : "ไม่สามารถโหลดคลังรูปภาพได้");
    } finally {
      setGalleryLoading(false);
    }
  }

  // เปิด Modal คลังรูปภาพ/แทรกรูปภาพ — เติมชื่อโฟลเดอร์เริ่มต้นจากชื่อโน้ตปัจจุบัน (ผู้ใช้แก้ไขได้) แล้ว
  // โหลดคลังรูปภาพของโฟลเดอร์นั้นมาแสดงทันที
  function openImageModal() {
    if (!editor || !selectedNoteId) return;

    const defaultFolder = noteNameInput.trim() || selectedNoteId;
    setImageFolderName(defaultFolder);
    setImageError("");
    setShowImageModal(true);
    loadGalleryImages(defaultFolder);
  }

  // อัปโหลดได้หลายรูปพร้อมกัน (input มี multiple) — ยิงทุกไฟล์ไปที่ /api/notes/upload พร้อมกันด้วย
  // Promise.all แล้วค่อยแทรก URL ที่ได้ทั้งหมดเข้า editor ทีละรูปตามลำดับไฟล์ที่เลือก
  async function uploadImages(files: FileList | null) {
    if (!files || files.length === 0 || !selectedNoteId || !editor) return;

    const folder = imageFolderName.trim();

    if (!folder) {
      setImageError("กรุณาระบุชื่อโฟลเดอร์");
      return;
    }

    setUploadingImage(true);
    setImageError("");

    try {
      const urls = await Promise.all(
        Array.from(files).map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("folder", folder);

          const response = await fetch("/api/notes/upload", {
            method: "POST",
            body: formData,
          });

          const data = await response.json();

          if (!response.ok || !data?.success) {
            throw new Error(data?.error || `ไม่สามารถอัปโหลด ${file.name} ได้`);
          }

          return data.url as string;
        })
      );

      urls.forEach((url) => {
        editor.chain().focus().setImage({ src: url }).run();
      });

      await loadGalleryImages(folder);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "ไม่สามารถอัปโหลดรูปภาพได้");
    } finally {
      setUploadingImage(false);
    }
  }

  function insertGalleryImage(url: string) {
    if (!editor) return;
    editor.chain().focus().setImage({ src: url }).run();
  }

  async function copyImageUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedImageUrl(url);
      setTimeout(() => {
        setCopiedImageUrl((current) => (current === url ? null : current));
      }, 1500);
    } catch {
      setGalleryError("ไม่สามารถคัดลอกลิงก์ได้ (คลิปบอร์ดถูกบล็อกโดยเบราว์เซอร์)");
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
        setPages([""]);
        setActivePageIndex(0);
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
        setPages([""]);
        setActivePageIndex(0);
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
    <>
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

              {imageError && (
                <p className="mb-3 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-xs text-red-400">
                  {imageError}
                </p>
              )}

              <div className="mb-3 flex flex-wrap items-center gap-1 overflow-x-auto rounded-xl border border-amber-500/20 bg-black/30 p-1.5">
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

                <div className="mx-1 h-5 w-px bg-neutral-800" />

                <label
                  title="สีตัวอักษร"
                  className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-amber-500/20 text-neutral-300 transition-all hover:border-amber-400 hover:text-amber-500"
                >
                  <span className="text-xs font-bold" style={{ color: textColor }}>
                    A
                  </span>
                  <input
                    type="color"
                    value={textColor}
                    disabled={!editor}
                    onChange={(e) => {
                      setTextColor(e.target.value);
                      editor?.chain().focus().setColor(e.target.value).run();
                    }}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>

                <label
                  title="สีถมพื้นหลัง (Highlight)"
                  className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-amber-500/20 text-neutral-300 transition-all hover:border-amber-400 hover:text-amber-500"
                >
                  <span style={{ color: highlightColor }}>
                    <HighlighterIcon className="h-4 w-4" />
                  </span>
                  <input
                    type="color"
                    value={highlightColor}
                    disabled={!editor}
                    onChange={(e) => {
                      setHighlightColor(e.target.value);
                      editor?.chain().focus().setHighlight({ color: e.target.value }).run();
                    }}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>

                <div className="mx-1 h-5 w-px bg-neutral-800" />

                <ToolbarButton
                  active={false}
                  disabled={!editor || uploadingImage}
                  onClick={openImageModal}
                  title="แทรกรูปภาพ"
                >
                  <ImageIcon className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  active={false}
                  disabled={!editor}
                  onClick={openImageModal}
                  title="คลังรูปภาพโปรเจกต์"
                >
                  <GalleryIcon className="h-4 w-4" />
                </ToolbarButton>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const input = e.target;
                    const files = input.files;
                    uploadImages(files).finally(() => {
                      input.value = "";
                    });
                  }}
                />

                <ToolbarButton
                  active={false}
                  disabled={!editor}
                  onClick={() => editor?.chain().focus().setHorizontalRule().run()}
                  title="เส้นแบ่ง (Divider)"
                >
                  <PageBreakIcon className="h-4 w-4" />
                </ToolbarButton>

                {uploadingImage && (
                  <span className="ml-1 shrink-0 text-xs text-neutral-500">กำลังอัปโหลด...</span>
                )}
              </div>

              {/* แถบ Tab หน้ากระดาษจริง (Tabbed Pagination) — แยกจากปุ่ม "เส้นแบ่ง" ด้านบนโดยเจตนา:
                  เส้นแบ่งเป็นแค่ <hr> ตกแต่งภายในหน้าเดียวกัน ส่วนแถบนี้คือการสลับไปแก้ไข "หน้าอื่น" จริงๆ
                  (คนละ HTML string ใน pages[]) */}
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                {pages.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => switchToPage(index)}
                    className={`rounded-lg border px-3 py-1 text-xs font-medium transition-all ${
                      index === activePageIndex
                        ? "border-amber-500 bg-amber-500/10 text-amber-400"
                        : "border-neutral-700 text-neutral-400 hover:border-amber-500/40 hover:text-amber-500"
                    }`}
                  >
                    หน้า {index + 1}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={addPage}
                  disabled={!editor}
                  className="rounded-lg border border-dashed border-amber-500/40 px-3 py-1 text-xs font-medium text-amber-500 transition-all hover:border-amber-400 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  + เพิ่มหน้าถัดไป
                </button>
              </div>

              <div className="flex-1 overflow-y-auto rounded-xl border border-neutral-700 bg-black transition-colors focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 [&_h1]:mt-2 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-white [&_h2]:mt-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-white [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-amber-500/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-neutral-400 [&_strong]:font-bold [&_em]:italic [&_hr]:my-8 [&_hr]:h-0 [&_hr]:border-0 [&_hr]:border-t-2 [&_hr]:border-dashed [&_hr]:border-amber-500/50">
                <EditorContent editor={editor} />
              </div>
            </>
          )}
        </section>
      </div>

      {/* Modal คลังรูปภาพโปรเจกต์ (Asset Manager) — รวมทั้งอัปโหลด (multi-file) และคลังรูปภาพที่เคย
          อัปโหลดไว้แล้วในโฟลเดอร์เดียวกัน เพราะทั้งสองผูกกับ "ชื่อโฟลเดอร์" เดียวกันอยู่แล้ว */}
      {showImageModal && (
        <div
          role="presentation"
          onClick={() => setShowImageModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="คลังรูปภาพโปรเจกต์"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-amber-500/20 bg-neutral-900/90 backdrop-blur-lg shadow-[0_0_40px_rgba(245,158,11,0.15)] p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">คลังรูปภาพโปรเจกต์</h3>
              <button
                type="button"
                onClick={() => setShowImageModal(false)}
                aria-label="ปิด"
                className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-800 hover:text-white"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            <label className="mb-1 block text-xs font-medium text-neutral-400">
              ชื่อโฟลเดอร์สำหรับโปรเจกต์
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={imageFolderName}
                onChange={(e) => setImageFolderName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadGalleryImages(imageFolderName)}
                placeholder="เช่น product-launch"
                className="flex-1 rounded-lg border border-neutral-700 bg-black px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
              />
              <button
                type="button"
                onClick={() => loadGalleryImages(imageFolderName)}
                disabled={!imageFolderName.trim() || galleryLoading}
                className="shrink-0 rounded-lg border border-amber-500/30 px-3 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                โหลด
              </button>
            </div>
            <p className="mt-1 text-[11px] text-neutral-600">
              ไฟล์จะถูกเก็บไว้ที่ public/uploads/{imageFolderName.trim() || "..."}/
            </p>

            {imageError && <p className="mt-2 text-xs text-red-400">{imageError}</p>}

            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={!imageFolderName.trim() || uploadingImage}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 px-4 py-2 text-sm font-medium text-black shadow-[0_0_15px_rgba(245,158,11,0.4)] hover:from-amber-400 hover:to-amber-300 disabled:opacity-50"
            >
              <ImageIcon className="h-4 w-4" />
              {uploadingImage ? "กำลังอัปโหลด..." : "เลือกไฟล์ (อัปโหลดได้หลายรูป)"}
            </button>

            <div className="mt-5 flex min-h-0 flex-1 flex-col border-t border-neutral-800 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-neutral-400">คลังรูปภาพในโฟลเดอร์นี้</p>
                <button
                  type="button"
                  onClick={() => loadGalleryImages(imageFolderName)}
                  className="text-xs font-medium text-amber-500 hover:underline"
                >
                  รีเฟรช
                </button>
              </div>

              {galleryError && <p className="mb-2 text-xs text-red-400">{galleryError}</p>}

              {galleryLoading ? (
                <p className="p-4 text-center text-xs text-neutral-500">กำลังโหลด...</p>
              ) : galleryImages.length === 0 ? (
                <p className="p-4 text-center text-xs text-neutral-500">
                  ยังไม่มีรูปภาพในโฟลเดอร์นี้
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 overflow-y-auto">
                  {galleryImages.map((image) => (
                    <div
                      key={image.name}
                      className="group relative aspect-square overflow-hidden rounded-lg border border-amber-500/20 bg-black"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.url} alt={image.name} className="h-full w-full object-cover" />
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/80 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => insertGalleryImage(image.url)}
                          title="แทรกลงโน้ต"
                          className="w-full rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 text-[10px] font-medium text-amber-400 hover:bg-amber-500/20"
                        >
                          แทรกลงโน้ต
                        </button>
                        <button
                          type="button"
                          onClick={() => copyImageUrl(image.url)}
                          title="คัดลอกลิงก์"
                          className="w-full rounded-md border border-neutral-700 px-1.5 py-1 text-[10px] font-medium text-neutral-300 hover:bg-neutral-800"
                        >
                          {copiedImageUrl === image.url ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์"}
                        </button>
                        <a
                          href={image.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="เปิดรูปภาพ"
                          className="w-full rounded-md border border-neutral-700 px-1.5 py-1 text-center text-[10px] font-medium text-neutral-300 hover:bg-neutral-800"
                        >
                          เปิดรูปภาพ
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
