import type { FileViewerError } from "./errors.js";
import type { Labels } from "./labels.js";

export type FileKind =
  | "pdf"
  | "word"
  | "spreadsheet"
  | "csv"
  | "presentation"
  | "image"
  | "video"
  | "audio"
  | "text"
  | "html"
  | "archive"
  | "unknown";

/** What to show. Give exactly one of `url`, `file` or `data`. */
export interface FileSource {
  url?: string;
  file?: Blob;
  data?: ArrayBuffer | Uint8Array;
  /** Display name. Also used to detect the type. Taken from `File.name` or the URL when missing. */
  name?: string;
  mimeType?: string;
  /** Size in bytes, shown in the header when the source cannot tell. */
  size?: number;
  /** Skip detection and force a renderer. */
  kind?: FileKind;
}

export interface ResolvedFile {
  source: FileSource;
  name: string;
  extension: string;
  mimeType: string;
  size?: number;
  kind: FileKind;
}

export interface PdfOptions {
  /** URL of `pdf.worker.min.mjs`, served from YOUR origin. Required unless `GlobalWorkerOptions.workerSrc` is already set. */
  workerSrc?: string;
  /** Selectable text over each page. Default true. */
  textLayer?: boolean;
  /** Folder with pdf.js `cmaps/` for CJK fonts. Optional. */
  cMapUrl?: string;
  /** Folder with pdf.js `standard_fonts/`. Optional. */
  standardFontDataUrl?: string;
}

export interface FileViewerOptions {
  theme?: "light" | "dark" | "system";
  labels?: Partial<Labels>;
  /** Largest file the viewer will download and parse. Default 50 MB. Media streams are not limited. */
  maxBytes?: number;
  /** Show the header bar. Default true. */
  toolbar?: boolean;
  /** Show the Download button, or replace what it does. Default true. */
  download?: boolean | ((file: ResolvedFile) => void);
  /** Passed to `fetch` for `url` sources (headers, credentials). */
  fetchInit?: RequestInit;
  pdf?: PdfOptions;
  /** Rows added per "Show more" click in sheets and CSV. Default 500. */
  tablePageSize?: number;
  /** Characters shown for text files before the rest is cut. Default 2,000,000. */
  textMaxChars?: number;
  /** Replace or add a renderer for a kind. */
  renderers?: Partial<Record<FileKind, RendererLoader>>;
  onLoad?: (file: ResolvedFile) => void;
  onError?: (error: FileViewerError, file: ResolvedFile | null) => void;
  onProgress?: (loaded: number, total: number | undefined) => void;
}

export interface ResolvedOptions
  extends Required<Pick<FileViewerOptions, "theme" | "maxBytes" | "toolbar" | "download" | "tablePageSize" | "textMaxChars">> {
  labels: Labels;
  fetchInit?: RequestInit;
  pdf: PdfOptions;
  renderers: Partial<Record<FileKind, RendererLoader>>;
}

export interface ToolbarButtonSpec {
  label: string;
  icon: string;
  onClick: () => void;
}

/** Controls a renderer may put in the header. They are cleared on every `open`. */
export interface ToolbarApi {
  addButton(spec: ToolbarButtonSpec): HTMLButtonElement;
  addText(text?: string): HTMLSpanElement;
  addSeparator(): void;
  /** Adds a control the renderer built itself, such as a page-number box. */
  addNode<T extends HTMLElement>(node: T): T;
}

export interface RenderContext {
  file: ResolvedFile;
  /** The renderer owns everything inside this element. It is in the page (hidden) while loading, so sizes can be measured. */
  root: HTMLElement;
  /** The element that scrolls. Use it as the IntersectionObserver root. */
  scroller: HTMLElement;
  toolbar: ToolbarApi;
  options: ResolvedOptions;
  labels: Labels;
  signal: AbortSignal;
  getBytes(): Promise<ArrayBuffer>;
  /** A URL the browser can load directly: the source URL, or a blob URL the viewer revokes for you. */
  getObjectUrl(): Promise<string>;
  /** Starts the same download as the header button (or the `download` option's function). */
  download(): void;
  /** Report a failure that happens after `render` resolved (a broken image, an unplayable video). */
  fail(error: unknown): void;
}

export type RenderCleanup = () => void;

export interface Renderer {
  render(ctx: RenderContext): Promise<RenderCleanup | void>;
}

export type RendererLoader = () => Promise<Renderer>;
