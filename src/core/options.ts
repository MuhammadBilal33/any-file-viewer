import { defaultLabels, type Labels } from "./labels.js";
import type { FileViewerError } from "./errors.js";
import type { FileViewerOptions, ResolvedOptions } from "./types.js";

export const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

export function resolveOptions(options: FileViewerOptions = {}): ResolvedOptions {
  return {
    theme: options.theme ?? "system",
    labels: { ...defaultLabels, ...options.labels },
    maxBytes: options.maxBytes && options.maxBytes >= 1 ? Math.floor(options.maxBytes) : DEFAULT_MAX_BYTES,
    toolbar: options.toolbar ?? true,
    download: options.download ?? true,
    fetchInit: options.fetchInit,
    pdf: { textLayer: true, ...options.pdf },
    tablePageSize: options.tablePageSize && options.tablePageSize > 0 ? Math.floor(options.tablePageSize) : 500,
    textMaxChars: options.textMaxChars && options.textMaxChars > 0 ? Math.floor(options.textMaxChars) : 2_000_000,
    renderers: { ...options.renderers },
  };
}

/** The plain-language line shown to the user for each error code. */
export function messageFor(error: FileViewerError, labels: Labels): string {
  switch (error.code) {
    case "too_large":
      return labels.tooLarge;
    case "fetch_failed":
      return labels.fetchFailed;
    case "password_protected":
      return labels.passwordProtected;
    case "missing_dependency":
      return labels.missingDependency;
    case "unsupported_media":
      return labels.mediaUnsupported;
    default:
      return labels.renderFailed;
  }
}
