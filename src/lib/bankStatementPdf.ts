// Bank Statement PDF Import — STEP E.3 — pure PDF decrypt + deterministic text extraction module.
//
// Per docs/BANK_STATEMENT_PDF_IMPORT_POLICY.md (§1/§2/§6/§9), this file:
//   - is the ONLY place in this codebase that imports `pdfjs-dist`
//   - performs decrypt + text extraction ONLY — no row/transaction interpretation (STEP E.4), no
//     AI/OCR (STEP E.8, conditional and not yet approved), no DB access, no filesystem read/write,
//     no HTTP call, no session/env read. Every exported function is (input) -> (structured output).
//   - never persists, logs, or echoes the password it is given. The password lives only inside this
//     module's call stack for exactly as long as pdfjs-dist needs it to open the document — it is
//     never assigned to a module-level variable, never written anywhere, and never appears in any
//     returned error (see classifyLoadError() below, which returns a fixed error CODE only).
//   - never writes a temp file. `getDocument({ data })` accepts an in-memory Uint8Array directly —
//     nothing here ever touches disk.
//   - never renders to canvas and never executes PDF JavaScript actions. This is true by
//     construction of what this module imports, not by a runtime flag: this file imports only from
//     `pdfjs-dist/legacy/build/pdf.mjs` (the core parsing/extraction API) and calls only
//     `getDocument()`/`doc.getPage()`/`page.getTextContent()`. It never imports anything from
//     `pdfjs-dist/web/*` (the viewer application) and never wires a `PDFScriptingManager` — the
//     component that actually executes a PDF's embedded JavaScript/AcroForm calculation scripts.
//     That component ships only as part of the separate viewer app, not in this npm package's core
//     distribution (confirmed: no scripting/sandbox bundle exists anywhere under
//     node_modules/pdfjs-dist). `doc.getJSActions()`/`hasJSActions()` exist on the API but this
//     module never calls them; even if it did, they only return the raw action data, they do not
//     execute it. (Note: an earlier `isEvalSupported` option some pdfjs-dist versions/docs describe
//     does not exist in 6.3.289's `getDocument()` API at all — verified against this package's
//     shipped type definitions and runtime source; it is not used here because it would be a no-op,
//     not because it was deliberately omitted.)
//   - never renders to canvas for the same reason: `page.render()` is never called, only
//     `page.getTextContent()` — so pdfjs-dist's optional `@napi-rs/canvas` peer (used solely by the
//     rendering path) is never invoked and does not need to be installed (confirmed absent from
//     node_modules after `pnpm add pdfjs-dist` — it is declared as an optionalDependency of
//     pdfjs-dist itself, not a hard dependency, and pnpm did not fetch it).
//
// Text-based PDF is the only supported input (docs §2) — a PDF with no extractable text on any page
// (scanned/image-only) is reported as SCANNED_PDF_UNSUPPORTED, never guessed at or OCR'd here.

import { getDocument, PasswordResponses, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";

export type BankStatementPdfErrorCode =
  | "EMPTY_INPUT"
  | "NOT_A_PDF"
  | "PASSWORD_REQUIRED"
  | "INCORRECT_PASSWORD"
  | "CORRUPTED_PDF"
  | "EXTRACTION_FAILED"
  | "SCANNED_PDF_UNSUPPORTED";

export interface ExtractPdfTextResult {
  // null on any error path — never partially populated (docs §10 "Partial extraction" — an
  // extraction that fails partway through is reported as a whole-file failure, never a partial
  // result presented as if it were complete).
  text: string | null;
  // One entry per page, in page order (Section D "preserve page boundaries").
  pageTexts: string[] | null;
  // STEP E.4 addition — one entry per page, each an array of reconstructed LINES (in top-to-bottom
  // reading order) rather than one flattened string. `pageTexts` alone turned out to be
  // insufficient for row extraction: joining every item on a page with a single space collapses all
  // vertical structure, making it impossible to tell where one transaction row ends and the next
  // begins. Line boundaries are taken directly from pdfjs-dist's own `TextItem.hasEOL` flag (a
  // built-in, well-tested line-break signal already used by pdfjs-dist's own text-layer rendering)
  // rather than a hand-rolled Y-coordinate clustering heuristic — this module still only calls
  // `getTextContent()`, nothing new is added to what it reads from pdfjs-dist. Purely additive:
  // `text`/`pageTexts`/`pageCount`/`error` behave exactly as before (STEP E.3's existing tests are
  // unchanged and still pass) — src/lib/bankStatementPdfRows.ts (STEP E.4) is the only consumer of
  // this new field.
  pageLines: string[][] | null;
  pageCount: number | null;
  error: BankStatementPdfErrorCode | null;
}

// STEP E.5 addition — fixed, non-interpolated diagnostic text per error code, same convention as
// bankStatementCsv.ts's fileErrorMessage()/rowErrorMessage(): never echoes the password, the
// document's internal structure, or any extracted content — every message here is a compile-time
// constant string.
const PDF_ERROR_MESSAGES: Record<BankStatementPdfErrorCode, string> = {
  EMPTY_INPUT: "ไฟล์ PDF ว่างเปล่า",
  NOT_A_PDF: "ไฟล์นี้ไม่ใช่ไฟล์ PDF ที่ถูกต้อง",
  PASSWORD_REQUIRED: "ไฟล์ PDF นี้มีการป้องกันด้วยรหัสผ่าน กรุณาระบุรหัสผ่าน",
  INCORRECT_PASSWORD: "รหัสผ่านไม่ถูกต้อง",
  CORRUPTED_PDF: "ไม่สามารถอ่านไฟล์ PDF นี้ได้ — ไฟล์อาจเสียหายหรือมีโครงสร้างที่ไม่รองรับ",
  EXTRACTION_FAILED: "ไม่สามารถดึงข้อความจากไฟล์ PDF นี้ได้",
  SCANNED_PDF_UNSUPPORTED:
    "ไฟล์ PDF นี้ไม่มีชั้นข้อความที่อ่านได้ (อาจเป็นไฟล์สแกน) — ยังไม่รองรับรูปแบบนี้ในขณะนี้",
};

export function pdfFileErrorMessage(code: BankStatementPdfErrorCode): string {
  return PDF_ERROR_MESSAGES[code];
}

// "%PDF" — first 4 bytes of every valid PDF file, per ISO 32000-1 §7.5.2. Checked before handing
// anything to pdfjs-dist, matching this codebase's existing convention
// (src/app/api/tax/documents/route.ts's PDF magic-byte check) of never trusting a claimed
// extension/MIME type as the real content gate.
const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46] as const;

function hasPdfMagicBytes(data: Uint8Array): boolean {
  if (data.length < PDF_MAGIC_BYTES.length) return false;

  for (let i = 0; i < PDF_MAGIC_BYTES.length; i++) {
    if (data[i] !== PDF_MAGIC_BYTES[i]) return false;
  }

  return true;
}

// A page whose extracted text (after trimming whitespace) is shorter than this is treated as
// carrying no meaningful text layer. Deterministic, fixed threshold — never a judgment call made
// per-file (docs §2's "เกณฑ์ deterministic ... ไม่ใช้ AI ในการตัดสินใจขั้นนี้เช่นกัน"). A handful of
// stray characters (e.g. a lone page number) on an otherwise-scanned page must not count as "this
// PDF has a text layer".
const MIN_MEANINGFUL_PAGE_TEXT_LENGTH = 4;

function isTextLayerAbsent(pageTexts: string[]): boolean {
  return pageTexts.every((text) => text.trim().length < MIN_MEANINGFUL_PAGE_TEXT_LENGTH);
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// STEP E.4 addition. Reconstructs line boundaries from a page's `getTextContent()` items using
// pdfjs-dist's own `hasEOL` flag on each item (true when that item is immediately followed by a
// line break) — verified directly against pdfjs-dist@6.3.289's behavior for both a simple
// multi-line block and multiple same-line `Tj` calls before finalizing this approach, rather than
// assumed correct from documentation alone. Deterministic: the same items always produce the same
// lines, in the same order — no coordinate-based heuristic of this module's own invention.
function groupTextItemsIntoLines(
  items: Array<{ str: string; hasEOL?: boolean } | Record<string, unknown>>
): string[] {
  const lines: string[] = [];
  let current = "";

  for (const item of items) {
    if (!("str" in item)) continue;

    // Joined with a space (never raw-concatenated) — matches this module's existing per-page
    // `pageText` join convention. pdfjs-dist already merges genuinely-adjacent same-line runs into
    // one item with its own correct internal spacing (verified directly: two separate same-line
    // `Tj` calls came back as a single merged item, "Date: 01/01/2025", not two); a leftover extra
    // space between items pdfjs did NOT merge is harmless (collapsed below), whereas concatenating
    // two distinct items with no separator risks silently fusing two words/numbers together.
    current += (current ? " " : "") + item.str;

    if (item.hasEOL) {
      lines.push(collapseWhitespace(current));
      current = "";
    }
  }

  if (current.trim().length > 0) {
    lines.push(collapseWhitespace(current));
  }

  return lines;
}

// pdfjs-dist's PasswordException is checked structurally (duck-typed on `name`/`code`) rather than
// via `instanceof` — this codebase's existing convention never assumes a specific Error subclass
// survives unchanged across a module/runtime boundary. Any other load failure (malformed structure,
// unsupported feature, truncated file) is reported as CORRUPTED_PDF — deliberately not
// distinguished further, so an error message can never accidentally echo pdfjs-dist's own internal
// exception text (which may quote fragments of the file's internal structure) back to a caller
// (docs §9's "error message ต้องปลอดภัยและไม่เปิดเผยข้อมูล sensitive").
function classifyLoadError(error: unknown): BankStatementPdfErrorCode {
  if (error && typeof error === "object" && "name" in error && (error as { name?: string }).name === "PasswordException") {
    const code = (error as { code?: number }).code;

    if (code === PasswordResponses.NEED_PASSWORD) return "PASSWORD_REQUIRED";
    if (code === PasswordResponses.INCORRECT_PASSWORD) return "INCORRECT_PASSWORD";
  }

  return "CORRUPTED_PDF";
}

// The only exported function of this module. Pure in the sense that matters here: given the same
// bytes and the same password, it always produces the same result — no DB, no filesystem, no env,
// no clock. `password` is optional (an unencrypted PDF needs none); when required and omitted,
// PASSWORD_REQUIRED is returned rather than attempting to open without one.
export async function extractPdfText(
  input: Buffer | Uint8Array,
  password?: string
): Promise<ExtractPdfTextResult> {
  // pdfjs-dist deliberately rejects a Node `Buffer` passed directly as `data` (it throws "Please
  // provide binary data as `Uint8Array`, rather than `Buffer`") — a real, correct safety check on
  // its part: a Buffer is frequently a view into a larger shared pooled ArrayBuffer, so
  // `buffer.byteLength !== buffer.buffer.byteLength` in that case, which pdfjs-dist's own internal
  // check treats as untrustworthy. `Buffer instanceof Uint8Array` is true in Node.js, so a naive
  // instanceof check here would silently pass a Buffer straight through — this always constructs a
  // fresh, exactly-sized Uint8Array view (no data copy: same backing memory, correct offset/length)
  // regardless of whether `input` was a Buffer or already a plain Uint8Array.
  const data = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);

  if (data.length === 0) {
    return { text: null, pageTexts: null, pageLines: null, pageCount: null, error: "EMPTY_INPUT" };
  }

  if (!hasPdfMagicBytes(data)) {
    return { text: null, pageTexts: null, pageLines: null, pageCount: null, error: "NOT_A_PDF" };
  }

  const loadingTask = getDocument({
    data,
    password,
    disableFontFace: true, // never load/register real font programs — no rendering happens here
    verbosity: VerbosityLevel.ERRORS, // suppress non-fatal internal warnings (e.g. missing font
    // metrics for a standard font) — irrelevant to text-content extraction, and this module must
    // never let pdfjs-dist's own console output become a side channel for anything (docs §9).
  });

  let doc: Awaited<typeof loadingTask.promise>;

  try {
    doc = await loadingTask.promise;
  } catch (error) {
    return { text: null, pageTexts: null, pageLines: null, pageCount: null, error: classifyLoadError(error) };
  }

  try {
    const pageTexts: string[] = [];
    const pageLines: string[][] = [];

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();

      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");

      pageTexts.push(pageText);
      pageLines.push(groupTextItemsIntoLines(content.items));
      page.cleanup();
    }

    if (isTextLayerAbsent(pageTexts)) {
      return { text: null, pageTexts: null, pageLines: null, pageCount: null, error: "SCANNED_PDF_UNSUPPORTED" };
    }

    return {
      text: pageTexts.join("\n\n"),
      pageTexts,
      pageLines,
      pageCount: doc.numPages,
      error: null,
    };
  } catch {
    // Never echo the underlying error's message — it may embed fragments of the document's
    // internal structure/content (docs §9).
    return { text: null, pageTexts: null, pageLines: null, pageCount: null, error: "EXTRACTION_FAILED" };
  } finally {
    doc.cleanup();
    await loadingTask.destroy();
  }
}
