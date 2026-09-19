import { redirect } from "next/navigation";

// The Content Workspace ("สมุดโน้ต") moved into /assistant as its primary content (see
// src/components/NotesWorkspace.tsx, shared by both) — this route now only exists so an old
// bookmark/link to /notes still lands somewhere useful instead of 404ing.
export default function NotesPage() {
  redirect("/assistant");
}
