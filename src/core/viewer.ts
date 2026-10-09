import { h, icons, svgIcon } from "../utils/dom.js";
import { formatBytes } from "../utils/format.js";
import { messageCard } from "../utils/message-card.js";
import { detectFileKind, extensionOf, nameFromUrl, normalizeMime, sniffFileKind } from "./detect.js";
import { FileViewerError, isAbortError, toFileViewerError } from "./errors.js";
import { messageFor, resolveOptions } from "./options.js";
import { STREAMED_KINDS, defaultRenderers } from "./registry.js";
import { knownSize, loadBytes } from "./source.js";
import type {
  FileSource,
  FileViewerOptions,
  RenderCleanup,
  RenderContext,
  ResolvedFile,
  ToolbarApi,
} from "./types.js";

export type FileViewerStatus = "idle" | "loading" | "ready" | "error";

export interface FileViewer {
  /** Shows a file. A newer call cancels an older one that has not finished. */
  open(source: FileSource): Promise<void>;
  /** Empties the viewer and frees memory, but keeps it usable. */
  clear(): void;
  /** Removes everything the viewer added. The instance cannot be used afterwards. */
  destroy(): void;
  readonly status: FileViewerStatus;
  readonly file: ResolvedFile | null;
}

function resolveFile(source: FileSource): ResolvedFile {
  const fileName = source.file && "name" in source.file ? (source.file as File).name : "";
  const name = source.name || fileName || nameFromUrl(source.url) || "file";
  const mimeType = normalizeMime(source.mimeType || source.file?.type);
  return {
    source,
    name,
    extension: extensionOf(name),
    mimeType,
    size: knownSize(source),
    kind: source.kind ?? detectFileKind({ name, mimeType }),
  };
}

/** Starts a viewer inside `container`. Works with any framework, or none. */
export function createFileViewer(container: HTMLElement, userOptions: FileViewerOptions = {}): FileViewer {
  const options = resolveOptions(userOptions);
  const { labels } = options;

  const title = h("span", { className: "fv-title" });
  const meta = h("span", { className: "fv-meta" });
  const controls = h("div", { className: "fv-controls", role: "group" });
  const downloadButton = h("button", { type: "button", className: "fv-icon-btn", "aria-label": labels.download, title: labels.download }, [
    svgIcon(icons.download),
  ]);
  const header = h("div", { className: "fv-header", role: "toolbar", "aria-label": labels.viewerRegion }, [
    h("div", { className: "fv-heading" }, [title, meta]),
    controls,
    downloadButton,
  ]);
  const body = h("div", { className: "fv-body", tabindex: 0, role: "region", "aria-label": labels.viewerRegion, "aria-busy": "false" });
  const root = h("div", { className: "fv-root", "data-fv-theme": options.theme }, [options.toolbar ? header : null, body]);
  container.append(root);

  let status: FileViewerStatus = "idle";
  let current: ResolvedFile | null = null;
  let abort: AbortController | null = null;
  let cleanup: RenderCleanup | null = null;
  let objectUrls: string[] = [];
  let bytesPromise: Promise<ArrayBuffer> | null = null;
  let objectUrlPromise: Promise<string> | null = null;
  let destroyed = false;

  const toolbar: ToolbarApi = {
    addButton(spec) {
      const button = h("button", { type: "button", className: "fv-icon-btn", "aria-label": spec.label, title: spec.label }, [svgIcon(spec.icon)]);
      button.addEventListener("click", spec.onClick);
      controls.append(button);
      return button;
    },
    addText(text = "") {
      const span = h("span", { className: "fv-control-text", "aria-live": "polite" }, [text]);
      controls.append(span);
      return span;
    },
    addSeparator() {
      controls.append(h("span", { className: "fv-separator", "aria-hidden": "true" }));
    },
    addNode(node) {
      controls.append(node);
      return node;
    },
  };

  const triggerDownload = async (): Promise<void> => {
    const file = current;
    if (!file) return;
    if (typeof options.download === "function") {
      options.download(file);
      return;
    }
    let href: string;
    try {
      href = await objectUrlFor(file);
    } catch {
      // Too large to hold in memory: hand the plain URL to the browser instead.
      if (!file.source.url) return;
      href = file.source.url;
    }
    const link = h("a", { href, download: file.name, rel: "noopener", target: "_blank" });
    root.append(link);
    link.click();
    link.remove();
  };
  const onDownloadClick = () => void triggerDownload();
  downloadButton.addEventListener("click", onDownloadClick);

  function objectUrlFor(file: ResolvedFile): Promise<string> {
    objectUrlPromise ??= (async () => {
      const { source } = file;
      // <img>/<video> cannot send custom headers, so a URL that needs them is downloaded first.
      if (source.url && !options.fetchInit?.headers) return source.url;
      const type = file.mimeType || undefined;
      // Bytes already in memory skip the size limit: there is nothing left to download.
      const blob = source.file ?? (source.data ? new Blob([source.data as BlobPart], { type }) : new Blob([await getBytes(file)], { type }));
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      return url;
    })();
    // A failed attempt (too large, network) must not stick for the next click.
    objectUrlPromise.catch(() => {
      objectUrlPromise = null;
    });
    return objectUrlPromise;
  }

  function getBytes(file: ResolvedFile): Promise<ArrayBuffer> {
    bytesPromise ??= loadBytes(file.source, {
      maxBytes: options.maxBytes,
      fetchInit: options.fetchInit,
      signal: abort?.signal,
      onProgress: userOptions.onProgress,
    });
    return bytesPromise;
  }

  function teardown(): void {
    abort?.abort();
    abort = null;
    try {
      cleanup?.();
    } catch (err) {
      console.warn("[file-viewer] cleanup failed", err);
    }
    cleanup = null;
    for (const url of objectUrls) URL.revokeObjectURL(url);
    objectUrls = [];
    bytesPromise = null;
    objectUrlPromise = null;
    controls.replaceChildren();
    body.replaceChildren();
    body.scrollTop = 0;
    body.scrollLeft = 0;
  }

  function setStatus(next: FileViewerStatus): void {
    status = next;
    root.dataset.fvStatus = next;
    body.setAttribute("aria-busy", next === "loading" ? "true" : "false");
  }

  function showError(error: FileViewerError, file: ResolvedFile | null, signal: AbortSignal): void {
    if (signal.aborted || destroyed) return;
    try {
      cleanup?.();
    } catch {
      // The renderer is being replaced by the error card either way.
    }
    cleanup = null;
    controls.replaceChildren();
    setStatus("error");
    const showDownload = !!file && options.download !== false && error.code !== "fetch_failed";
    body.replaceChildren(
      messageCard({
        tone: "error",
        title: messageFor(error, labels),
        detail: error.code === "too_large" || error.code === "password_protected" ? labels.downloadToOpen : undefined,
        action: showDownload ? { label: labels.download, onClick: onDownloadClick } : undefined,
      }),
    );
    if (error.code === "missing_dependency" || error.code === "config") console.warn(`[file-viewer] ${error.message}`);
    userOptions.onError?.(error, file);
  }

  function showSkeleton(): void {
    const lines = [0, 1, 2, 3, 4].map((i) => h("div", { className: `fv-skeleton-line fv-skeleton-line-${i}` }));
    body.replaceChildren(
      h("div", { className: "fv-skeleton", role: "status" }, [h("span", { className: "fv-sr-only" }, [labels.loading]), ...lines]),
    );
  }

  async function open(source: FileSource): Promise<void> {
    if (destroyed) throw new FileViewerError("config", "This viewer was destroyed.");
    teardown();
    const controller = new AbortController();
    abort = controller;
    const { signal } = controller;

    let file = resolveFile(source);
    current = file;
    title.textContent = file.name;
    title.title = file.name;
    meta.textContent = formatBytes(file.size);
    downloadButton.hidden = options.download === false;
    setStatus("loading");
    showSkeleton();

    try {
      // No usable name or type: read the first bytes and decide from those.
      if (file.kind === "unknown" && !source.kind) {
        const bytes = await getBytes(file);
        if (signal.aborted) return;
        const sniffed = sniffFileKind(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 64 * 1024)));
        file = { ...file, kind: sniffed, size: file.size ?? bytes.byteLength };
        current = file;
        meta.textContent = formatBytes(file.size);
      }

      const loader = options.renderers[file.kind] ?? defaultRenderers[file.kind];
      const renderer = await loader();
      if (signal.aborted) return;

      const content = h("div", { className: `fv-content fv-content-${file.kind}` });
      const resolved = file;
      const context: RenderContext = {
        file: resolved,
        root: content,
        scroller: body,
        toolbar,
        options,
        labels,
        signal,
        getBytes: async () => {
          const bytes = await getBytes(resolved);
          if (resolved.size === undefined) meta.textContent = formatBytes(bytes.byteLength);
          return bytes;
        },
        getObjectUrl: () => objectUrlFor(resolved),
        download: onDownloadClick,
        fail: (err) => showError(toFileViewerError(err), resolved, signal),
      };

      // Streamed kinds show at once. The rest build under the skeleton, hidden but measurable.
      if (STREAMED_KINDS.has(file.kind)) body.replaceChildren(content);
      else {
        content.classList.add("fv-pending");
        body.append(content);
      }
      const result = await renderer.render(context);
      if (signal.aborted) {
        result?.();
        return;
      }
      cleanup = result ?? null;
      if (status === "loading") {
        content.classList.remove("fv-pending");
        for (const child of Array.from(body.children)) if (child !== content) child.remove();
      }
      if (status === "loading") {
        setStatus("ready");
        userOptions.onLoad?.(file);
      }
    } catch (err) {
      if (isAbortError(err) || signal.aborted) return;
      showError(toFileViewerError(err), file, signal);
    }
  }

  return {
    open,
    clear() {
      teardown();
      current = null;
      title.textContent = "";
      meta.textContent = "";
      setStatus("idle");
    },
    destroy() {
      if (destroyed) return;
      teardown();
      destroyed = true;
      downloadButton.removeEventListener("click", onDownloadClick);
      root.remove();
      current = null;
    },
    get status() {
      return status;
    },
    get file() {
      return current;
    },
  };
}
