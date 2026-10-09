export type FileViewerErrorCode =
  | "too_large"
  | "fetch_failed"
  | "aborted"
  | "password_protected"
  | "missing_dependency"
  | "config"
  | "unsupported_media"
  | "render_failed";

/** Every failure the viewer reports carries a stable `code` callers can switch on. */
export class FileViewerError extends Error {
  readonly code: FileViewerErrorCode;
  readonly cause?: unknown;

  constructor(code: FileViewerErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "FileViewerError";
    this.code = code;
    this.cause = cause;
  }
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof FileViewerError) return err.code === "aborted";
  return !!err && typeof err === "object" && "name" in err && (err as { name: unknown }).name === "AbortError";
}

export function toFileViewerError(err: unknown): FileViewerError {
  if (err instanceof FileViewerError) return err;
  if (isAbortError(err)) return new FileViewerError("aborted", "Loading was cancelled.", err);
  const message = err instanceof Error ? err.message : String(err);
  return new FileViewerError("render_failed", message || "Could not show this file.", err);
}

/** Loads an optional peer dependency and turns "module not found" into a clear, typed error. */
export async function importPeer<T>(load: () => Promise<T>, packageName: string): Promise<T> {
  try {
    return await load();
  } catch (err) {
    throw new FileViewerError(
      "missing_dependency",
      `The "${packageName}" package is needed for this preview. Install it next to any-file-viewer.`,
      err,
    );
  }
}
