import type { FileKind } from "./types.js";

const EXTENSION_KINDS: Record<string, FileKind> = {};

function register(kind: FileKind, extensions: string): void {
  for (const ext of extensions.split(" ")) EXTENSION_KINDS[ext] = kind;
}

register("pdf", "pdf");
register("word", "docx docm dotx dotm");
register("spreadsheet", "xlsx xlsm xltx xltm xlsb xls ods fods");
register("csv", "csv tsv");
register("presentation", "pptx pptm ppsx ppsm potx potm");
register("image", "png jpg jpeg jfif pjpeg pjp gif webp avif apng bmp ico svg");
register("video", "mp4 m4v webm ogv mov");
register("audio", "mp3 wav ogg oga opus m4a aac flac weba");
register("html", "html htm xhtml");
register("archive", "zip");
register(
  "text",
  "txt text log md markdown json jsonc json5 ndjson geojson xml yml yaml ini conf cfg toml env properties " +
    "sql js mjs cjs ts tsx jsx css scss sass less py rb php java kt kts swift go rs c h cc cpp hpp cs fs " +
    "dart r lua pl sh bash zsh ps1 psm1 bat cmd vue svelte gradle diff patch srt vtt tex rst adoc graphql gql " +
    "dockerfile makefile proto",
);

const EXACT_MIME_KINDS: Record<string, FileKind> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template": "word",
  "application/vnd.ms-word.document.macroenabled.12": "word",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "spreadsheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template": "spreadsheet",
  "application/vnd.ms-excel": "spreadsheet",
  "application/vnd.ms-excel.sheet.macroenabled.12": "spreadsheet",
  "application/vnd.ms-excel.sheet.binary.macroenabled.12": "spreadsheet",
  "application/vnd.oasis.opendocument.spreadsheet": "spreadsheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "presentation",
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow": "presentation",
  "text/csv": "csv",
  "application/csv": "csv",
  "text/tab-separated-values": "csv",
  "text/html": "html",
  "application/xhtml+xml": "html",
  "application/zip": "archive",
  "application/x-zip-compressed": "archive",
  "application/json": "text",
  "application/ld+json": "text",
  "application/xml": "text",
  "application/javascript": "text",
  "application/x-javascript": "text",
  "application/x-yaml": "text",
  "application/yaml": "text",
  "application/x-sh": "text",
  "application/sql": "text",
  "application/toml": "text",
};

/** Image types no browser decodes natively. Sending them to <img> only shows a broken icon. */
const UNDECODABLE_IMAGES = new Set(["image/tiff", "image/heic", "image/heif"]);

/** Content types that tell us nothing about the file. */
const GENERIC_MIME = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
  "application/unknown",
  "application/force-download",
]);

export function normalizeMime(mimeType: string | null | undefined): string {
  return (mimeType ?? "").split(";")[0]!.trim().toLowerCase();
}

/** Lower-case extension without the dot. Handles URLs with query strings and fragments. "Dockerfile" and "Makefile" count as their own extension. */
export function extensionOf(name: string | null | undefined): string {
  if (!name) return "";
  const clean = name.split(/[?#]/)[0]!;
  const base = clean.slice(Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\")) + 1).toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return base === "dockerfile" || base === "makefile" ? base : "";
  return base.slice(dot + 1);
}

/** Last path part of a URL, decoded. Empty string when there is none. */
export function nameFromUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("blob:")) return "";
  const path = url.split(/[?#]/)[0]!;
  const last = path.slice(path.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

export function kindFromMime(mimeType: string | null | undefined): FileKind {
  const mime = normalizeMime(mimeType);
  if (GENERIC_MIME.has(mime)) return "unknown";
  const exact = EXACT_MIME_KINDS[mime];
  if (exact) return exact;
  if (mime.startsWith("image/")) return UNDECODABLE_IMAGES.has(mime) ? "unknown" : "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("text/")) return "text";
  if (mime.endsWith("+json") || mime.endsWith("+xml")) return "text";
  return "unknown";
}

export function kindFromExtension(extension: string): FileKind {
  const key = extension.toLowerCase();
  return Object.prototype.hasOwnProperty.call(EXTENSION_KINDS, key) ? EXTENSION_KINDS[key]! : "unknown";
}

/**
 * Picks a renderer from what the caller told us. The extension wins over the MIME type because
 * servers often send `application/zip` for a .docx, or `text/plain` for a .csv.
 */
export function detectFileKind(input: { name?: string | null; mimeType?: string | null }): FileKind {
  const byExtension = kindFromExtension(extensionOf(input.name));
  if (byExtension !== "unknown") return byExtension;
  return kindFromMime(input.mimeType);
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) if (bytes[offset + i] !== signature[i]) return false;
  return true;
}

function containsAscii(bytes: Uint8Array, needle: string): boolean {
  const first = needle.charCodeAt(0);
  const last = bytes.length - needle.length;
  outer: for (let i = 0; i <= last; i += 1) {
    if (bytes[i] !== first) continue;
    for (let j = 1; j < needle.length; j += 1) if (bytes[i + j] !== needle.charCodeAt(j)) continue outer;
    return true;
  }
  return false;
}

/** True when the first bytes look like readable text: no NUL bytes and almost no control characters. */
export function looksLikeText(bytes: Uint8Array, sampleSize = 4096): boolean {
  const length = Math.min(bytes.length, sampleSize);
  if (length === 0) return true;
  let control = 0;
  for (let i = 0; i < length; i += 1) {
    const byte = bytes[i]!;
    if (byte === 0) return false;
    if (byte < 9 || (byte > 13 && byte < 32)) control += 1;
  }
  return control / length < 0.02;
}

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;

/**
 * A .docx / .xlsx / .pptx is a ZIP. When one starts with the old OLE2 header instead, Office has
 * encrypted it with a password (or it is a legacy binary file renamed).
 */
export function isOleContainer(bytes: Uint8Array): boolean {
  return startsWith(bytes, OLE_SIGNATURE);
}

/** Detects the kind from the file's first bytes, for files with no useful name or type. */
export function sniffFileKind(bytes: Uint8Array): FileKind {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) {
    if (containsAscii(bytes, "word/")) return "word";
    if (containsAscii(bytes, "xl/")) return "spreadsheet";
    if (containsAscii(bytes, "ppt/")) return "presentation";
    return "archive";
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x41, 0x56, 0x45], 8)) return "audio";
  if (startsWith(bytes, [0x42, 0x4d])) return "image";
  if (startsWith(bytes, [0x49, 0x44, 0x33]) || startsWith(bytes, [0xff, 0xfb])) return "audio";
  if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) return "video";
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "video";
  if (startsWith(bytes, [0x4f, 0x67, 0x67, 0x53])) return "audio";
  // OLE2 container: legacy .doc / .xls / .ppt. Only .xls can be read in the browser.
  if (isOleContainer(bytes)) {
    return containsAscii(bytes, "W\0o\0r\0k\0b\0o\0o\0k") ? "spreadsheet" : "unknown";
  }
  if (looksLikeText(bytes)) return "text";
  return "unknown";
}
