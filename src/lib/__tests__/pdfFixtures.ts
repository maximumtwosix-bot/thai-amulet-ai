// Test-only PDF fixture builders for src/lib/__tests__/bankStatementPdf.test.ts.
//
// Not imported by any production code — exists solely to construct minimal, byte-exact PDF files
// (including a genuinely password-encrypted one) without adding a PDF-authoring dependency, per
// STEP E.3's instruction to stop and report rather than add a library just to generate test
// fixtures. Everything here is built from Node's built-in `node:crypto` (MD5, for the PDF Standard
// Security Handler's own key-derivation algorithm — not used as a general-purpose hash anywhere in
// production code) plus a ~20-line hand-written RC4 stream cipher (the PDF spec's own encryption
// algorithm for Security Handler revision 2 — Node's `crypto` module has no RC4 available on this
// OpenSSL build, but the algorithm itself is short and precisely specified, and is round-tripped
// against src/lib/bankStatementPdf.ts's real `extractPdfText()` — i.e. against real pdfjs-dist
// decryption — while developing this file, not merely assumed correct).
//
// Page size is realistic (612x792pt = US Letter). An earlier draft of this file used an
// intentionally tiny 200x200pt page and discovered that pdfjs-dist's `getTextContent()` clips text
// runs that would render past the page's own MediaBox width — correct, expected pdfjs-dist behavior
// (irrelevant to real bank statements, which use standard page sizes), not a bug, but it means every
// fixture here must use a realistic page width or its own test would fail for a reason unrelated to
// what it's actually testing.

import crypto from "node:crypto";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

// Assembles a well-formed single-revision PDF (header, N sequentially-numbered objects starting at
// object 1, xref table, and returns the byte offset the caller needs to write `startxref` at) —
// shared by every fixture below so there is exactly one place that gets PDF object numbering/xref
// bookkeeping right, rather than three fixtures independently re-deriving byte offsets.
function assemblePdfObjects(objectBodies: Array<string | Buffer>): { body: Buffer; xrefOffset: number } {
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets: number[] = [0];
  let cursor = parts[0].length;

  for (let i = 0; i < objectBodies.length; i++) {
    offsets.push(cursor);
    const objNum = i + 1;
    const body = objectBodies[i];
    const bodyBuf = typeof body === "string" ? Buffer.from(body, "latin1") : body;
    const objBuf = Buffer.concat([
      Buffer.from(`${objNum} 0 obj\n`, "latin1"),
      bodyBuf,
      Buffer.from("\nendobj\n", "latin1"),
    ]);
    parts.push(objBuf);
    cursor += objBuf.length;
  }

  const xrefOffset = cursor;
  const count = objectBodies.length + 1;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  parts.push(Buffer.from(xref, "latin1"));

  return { body: Buffer.concat(parts), xrefOffset };
}

function buildTrailer(rootObjNum: number, size: number, extra: string, xrefOffset: number): Buffer {
  return Buffer.from(
    `trailer\n<< /Size ${size} /Root ${rootObjNum} 0 R${extra} >>\nstartxref\n${xrefOffset}\n%%EOF`,
    "latin1"
  );
}

// Builds an unencrypted PDF with one content stream per page. A `null` entry in `pageTexts`
// produces a page with an empty content stream (no text-drawing operators at all) — used to
// simulate a scanned/image-only page with no extractable text layer.
export function buildTextPdf(pageTexts: Array<string | null>): Buffer {
  const n = pageTexts.length;
  // Object layout: 1=Catalog, 2=Pages, 3=Font, then per page i (0-based): (4+2i)=Page, (5+2i)=Contents.
  const pageObjNums = pageTexts.map((_, i) => 4 + 2 * i);
  const contentObjNums = pageTexts.map((_, i) => 5 + 2 * i);

  const objects: string[] = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [${pageObjNums.map((num) => `${num} 0 R`).join(" ")}] /Count ${n} >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  ];

  for (let i = 0; i < n; i++) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentObjNums[i]} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`
    );
    const streamContent = pageTexts[i] === null ? "" : `BT /F1 12 Tf 50 700 Td (${pageTexts[i]}) Tj ET`;
    objects.push(`<< /Length ${Buffer.byteLength(streamContent, "latin1")} >>\nstream\n${streamContent}\nendstream`);
  }

  const { body, xrefOffset } = assemblePdfObjects(objects);
  return Buffer.concat([body, buildTrailer(1, objects.length + 1, "", xrefOffset)]);
}

// Builds a single-page, unencrypted PDF with multiple TEXT LINES on the one page (via repeated
// `Td` line-feed offsets between `Tj` calls) — used only to test bankStatementPdf.ts's `pageLines`
// line-reconstruction (STEP E.4), which needs a real multi-line page to exercise pdfjs-dist's
// `hasEOL` boundary detection. ASCII-only content: a hand-built PDF using the standard Helvetica
// font has no embedded Thai glyph program/encoding, so Thai text belongs in
// bankStatementPdfRows.test.ts's fixtures (which feed already-extracted `pageLines` text directly,
// per the STEP E.4 architecture boundary), never in a fixture that goes through real PDF text
// rendering/extraction.
export function buildMultiLineTextPdf(lines: string[]): Buffer {
  let ops = "BT /F1 12 Tf 50 700 Td\n";
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) ops += "0 -14 Td\n";
    ops += `(${lines[i]}) Tj\n`;
  }
  ops += "ET";

  const objects: string[] = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${Buffer.byteLength(ops, "latin1")} >>\nstream\n${ops}\nendstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  ];

  const { body, xrefOffset } = assemblePdfObjects(objects);
  return Buffer.concat([body, buildTrailer(1, objects.length + 1, "", xrefOffset)]);
}

// ===== RC4-40 (PDF Standard Security Handler V1/R2) — ISO 32000-1 Algorithms 1-4 =====

const PASSWORD_PAD = Buffer.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00,
  0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

function padPassword(pw: string): Buffer {
  const pwBuf = Buffer.from(pw, "latin1").subarray(0, 32);
  const result = Buffer.alloc(32);
  pwBuf.copy(result, 0);
  PASSWORD_PAD.copy(result, pwBuf.length, 0, 32 - pwBuf.length);
  return result;
}

function rc4(key: Buffer, data: Buffer): Buffer {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;

  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 0xff;
    const tmp = s[i];
    s[i] = s[j];
    s[j] = tmp;
  }

  const out = new Uint8Array(data.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + s[i]) & 0xff;
    const tmp = s[i];
    s[i] = s[j];
    s[j] = tmp;
    out[k] = data[k] ^ s[(s[i] + s[j]) & 0xff];
  }

  return Buffer.from(out);
}

function md5(buf: Buffer): Buffer {
  return crypto.createHash("md5").update(buf).digest();
}

function computeOwnerValue(ownerPassword: string, userPassword: string): Buffer {
  const paddedOwner = padPassword(ownerPassword || userPassword);
  const key = md5(paddedOwner).subarray(0, 5);
  const paddedUser = padPassword(userPassword);
  return rc4(key, paddedUser);
}

function computeEncryptionKey(userPassword: string, ownerValue: Buffer, permissions: number, fileId: Buffer): Buffer {
  const paddedUser = padPassword(userPassword);
  const permissionsBuf = Buffer.alloc(4);
  permissionsBuf.writeInt32LE(permissions, 0);
  const input = Buffer.concat([paddedUser, ownerValue, permissionsBuf, fileId]);
  return md5(input).subarray(0, 5);
}

function computeUserValue(encryptionKey: Buffer): Buffer {
  return rc4(encryptionKey, PASSWORD_PAD);
}

function computeObjectKey(encryptionKey: Buffer, objNum: number, genNum: number): Buffer {
  const extra = Buffer.from([
    objNum & 0xff,
    (objNum >> 8) & 0xff,
    (objNum >> 16) & 0xff,
    genNum & 0xff,
    (genNum >> 8) & 0xff,
  ]);
  const digest = md5(Buffer.concat([encryptionKey, extra]));
  return digest.subarray(0, Math.min(encryptionKey.length + 5, 16));
}

// Builds a single-page, RC4-40-encrypted PDF (Security Handler V1/R2) whose content stream is
// encrypted with the given user password. `ownerPassword` defaults to `userPassword` — this fixture
// only needs the "can this be opened for reading" (user password) check that extractPdfText()
// exercises, never a distinct owner-permissions scenario.
export function buildEncryptedTextPdf(userPassword: string, text: string, ownerPassword = userPassword): Buffer {
  const permissions = -4;
  const fileId = crypto.randomBytes(16);
  const ownerValue = computeOwnerValue(ownerPassword, userPassword);
  const encryptionKey = computeEncryptionKey(userPassword, ownerValue, permissions, fileId);
  const userValue = computeUserValue(encryptionKey);

  const streamPlain = Buffer.from(`BT /F1 12 Tf 50 700 Td (${text}) Tj ET`, "latin1");
  const streamEncrypted = rc4(computeObjectKey(encryptionKey, 4, 0), streamPlain);

  const objects: Array<string | Buffer> = [
    `<< /Type /Catalog /Pages 2 0 R >>`, // 1
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`, // 2
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`, // 3
    Buffer.concat([
      Buffer.from(`<< /Length ${streamEncrypted.length} >>\nstream\n`, "latin1"),
      streamEncrypted,
      Buffer.from("\nendstream", "latin1"),
    ]), // 4
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`, // 5
    `<< /Filter /Standard /V 1 /R 2 /O <${ownerValue.toString("hex")}> /U <${userValue.toString("hex")}> /P ${permissions} >>`, // 6
  ];

  const { body, xrefOffset } = assemblePdfObjects(objects);
  const idHex = fileId.toString("hex");
  const trailer = buildTrailer(1, objects.length + 1, ` /Encrypt 6 0 R /ID [<${idHex}> <${idHex}>]`, xrefOffset);

  return Buffer.concat([body, trailer]);
}

export function buildCorruptedPdf(): Buffer {
  // Has a valid magic-byte header (so it passes the cheap pre-check) but everything after it is
  // structurally nonsensical — no valid objects, no xref, no trailer.
  return Buffer.from("%PDF-1.4\nthis is not a real PDF body at all, just noise \x00\x01\x02", "latin1");
}

export function buildNonPdfBuffer(): Buffer {
  return Buffer.from("This is a plain text file, not a PDF at all.", "utf8");
}

// ===== Identity-H / ToUnicode-CMap Unicode fixture — needed for the SA1500_V1 E2E test.
// buildTextPdf()/buildMultiLineTextPdf() above write content-stream strings as
// Buffer.from(str, "latin1"), which silently truncates any codepoint above U+00FF (all Thai
// characters) to a garbage low byte with no ToUnicode CMap to recover it — harmless for those
// fixtures' own tests (which never assert exact Thai text), but not acceptable for a layout whose
// parsing depends on an EXACT Thai token match. This builder instead uses a synthetic 2-byte
// Identity-H composite font (no embedded glyph program — pdfjs-dist's getTextContent() text
// extraction does not require one, only the /ToUnicode CMap) with a full-BMP identity /ToUnicode
// CMap, so content-stream bytes ARE the UTF-16BE code units of the original JS string and decode
// back to the exact same Unicode text on extraction.

function utf16beHex(str: string): string {
  const buf = Buffer.from(str, "utf16le");
  buf.swap16();
  return buf.toString("hex");
}

// Horizontal-only relative advance between words on the same line, and the vertical advance
// between lines (unchanged from before). Neither value is rendering-accurate — never rendered —
// only needs to be a plausible positive gap.
const WORD_ADVANCE = 60;
const LINE_ADVANCE = 14;

// Emits a line's text as genuinely SEPARATE PDF Tj operator invocations, one per word, using only
// horizontal (dy=0) `Td` moves between words — never a vertical move within a line. STRUCTURAL FIX,
// second iteration (confirmed via two temporary diagnostics against this exact fixture, both
// removed): a single long Tj string AND a single TJ array bundling multiple hex-string elements
// were both found to be re-merged by pdfjs-dist into one continuous decoded run, which then
// deterministically corrupts/truncates its own tail once long enough — silently losing
// amount/balance content. Splitting into fully separate Tj operator calls (not bundled into one
// operator at all) is the next, more direct structural separation. Each non-final word's hex
// payload also carries an explicit trailing U+0020 SPACE as real encoded content — not inferred
// from the horizontal Td gap — because pdfjs-dist was separately found to sometimes merge two
// adjacent, horizontally-Td-separated word items into one item's string with NO space character
// inserted between them; encoding the space as actual content removes that dependency entirely.
// Returns the emitted ops text and the cumulative horizontal offset (so the caller can reset X
// before the next line's Td).
function buildWordTjOps(line: string): { ops: string; totalAdvance: number } {
  const words = line.split(" ");
  let ops = "";
  for (let wi = 0; wi < words.length; wi++) {
    if (wi > 0) ops += `${WORD_ADVANCE} 0 Td\n`;
    const text = wi < words.length - 1 ? `${words[wi]} ` : words[wi];
    ops += `<${utf16beHex(text)}> Tj\n`;
  }
  return { ops, totalAdvance: WORD_ADVANCE * (words.length - 1) };
}

// A standard, minimal ToUnicode CMap (ISO 32000-1 Annex H shape) whose single bfrange line maps
// every 2-byte code to itself — i.e. CID == Unicode codepoint, exactly matching how the content
// stream below encodes text (raw UTF-16BE), for any BMP character.
const TOUNICODE_IDENTITY_CMAP = [
  "/CIDInit /ProcSet findresource begin",
  "12 dict begin",
  "begincmap",
  "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
  "/CMapName /Adobe-Identity-UCS def",
  "/CMapType 2 def",
  "1 begincodespacerange",
  "<0000> <FFFF>",
  "endcodespacerange",
  "1 beginbfrange",
  "<0000> <FFFF> <0000>",
  "endbfrange",
  "endcmap",
  "CMapName currentdict /CMap defineresource pop",
  "end",
  "end",
].join("\n");

// Builds a multi-page PDF where each page has multiple text LINES (same repeated-Td-offset
// technique as buildMultiLineTextPdf, already verified against real pdfjs-dist hasEOL behavior),
// using the synthetic Identity-H font above so any Unicode text (Thai included) survives exactly.
// `pages` is one array of line strings per page.
export function buildUnicodeMultiPagePdf(pages: string[][]): Buffer {
  const n = pages.length;
  // Object layout: 1=Catalog, 2=Pages, 3=Font(Type0), 4=CIDFont, 5=FontDescriptor, 6=ToUnicode CMap,
  // then per page i (0-based): (7+2i)=Page, (8+2i)=Contents.
  const pageObjNums = pages.map((_, i) => 7 + 2 * i);
  const contentObjNums = pages.map((_, i) => 8 + 2 * i);

  const cmapBuf = Buffer.from(TOUNICODE_IDENTITY_CMAP, "latin1"); // CMap body is 100% ASCII syntax.

  const objects: Array<string | Buffer> = [
    `<< /Type /Catalog /Pages 2 0 R >>`, // 1
    `<< /Type /Pages /Kids [${pageObjNums.map((num) => `${num} 0 R`).join(" ")}] /Count ${n} >>`, // 2
    `<< /Type /Font /Subtype /Type0 /BaseFont /SyntheticIdentityH /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 6 0 R >>`, // 3
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /SyntheticIdentityH /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 5 0 R /CIDToGIDMap /Identity /DW 1000 >>`, // 4
    `<< /Type /FontDescriptor /FontName /SyntheticIdentityH /Flags 4 /FontBBox [0 0 1000 1000] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >>`, // 5
    Buffer.concat([
      Buffer.from(`<< /Length ${cmapBuf.length} >>\nstream\n`, "latin1"),
      cmapBuf,
      Buffer.from("\nendstream", "latin1"),
    ]), // 6
  ];

  for (let i = 0; i < n; i++) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentObjNums[i]} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`
    );

    let ops = "BT /F1 12 Tf 50 700 Td\n";
    const lines = pages[i];
    for (let li = 0; li < lines.length; li++) {
      const { ops: wordOps, totalAdvance } = buildWordTjOps(lines[li]);
      ops += wordOps;
      if (li < lines.length - 1) {
        // Line break: reset X back to the left margin AND move down — the only place a vertical
        // component appears, exactly matching a real line break (never between words).
        ops += `${-totalAdvance} -${LINE_ADVANCE} Td\n`;
      }
    }
    ops += "ET";

    // The operator SYNTAX (BT/Tf/Td/Tj/ET, hex digits) is ASCII; only the hex-string payload
    // between < > carries the real (already hex-encoded) Unicode text.
    const opsBuf = Buffer.from(ops, "latin1");
    objects.push(
      Buffer.concat([
        Buffer.from(`<< /Length ${opsBuf.length} >>\nstream\n`, "latin1"),
        opsBuf,
        Buffer.from("\nendstream", "latin1"),
      ])
    );
  }

  const { body, xrefOffset } = assemblePdfObjects(objects);
  return Buffer.concat([body, buildTrailer(1, objects.length + 1, "", xrefOffset)]);
}
