import type { FileKind, RendererLoader } from "./types.js";

/** Each renderer is its own chunk, so a page that only shows images never downloads pdf.js or SheetJS. */
export const defaultRenderers: Record<FileKind, RendererLoader> = {
  pdf: () => import("../renderers/pdf.js").then((m) => m.pdfRenderer),
  word: () => import("../renderers/word.js").then((m) => m.wordRenderer),
  spreadsheet: () => import("../renderers/spreadsheet.js").then((m) => m.spreadsheetRenderer),
  csv: () => import("../renderers/csv.js").then((m) => m.csvRenderer),
  presentation: () => import("../renderers/presentation/index.js").then((m) => m.presentationRenderer),
  image: () => import("../renderers/image.js").then((m) => m.imageRenderer),
  video: () => import("../renderers/media.js").then((m) => m.videoRenderer),
  audio: () => import("../renderers/media.js").then((m) => m.audioRenderer),
  text: () => import("../renderers/text.js").then((m) => m.textRenderer),
  html: () => import("../renderers/html.js").then((m) => m.htmlRenderer),
  archive: () => import("../renderers/archive.js").then((m) => m.archiveRenderer),
  unknown: () => import("../renderers/fallback.js").then((m) => m.fallbackRenderer),
};

/** Kinds the browser can stream straight from a URL, without us downloading the file first. */
export const STREAMED_KINDS: ReadonlySet<FileKind> = new Set<FileKind>(["image", "video", "audio"]);
