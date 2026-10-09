import { FileViewerError } from "./errors.js";
import type { FileSource } from "./types.js";

export interface LoadBytesOptions {
  maxBytes: number;
  fetchInit?: RequestInit;
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number | undefined) => void;
}

function tooLarge(size: number, maxBytes: number): FileViewerError {
  return new FileViewerError("too_large", `File is ${size} bytes; the preview limit is ${maxBytes} bytes.`);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new FileViewerError("aborted", "Loading was cancelled.");
}

function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  // A view may cover only part of a bigger buffer, so copy exactly its own bytes.
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

/** Size the source already reports, without reading it. */
export function knownSize(source: FileSource): number | undefined {
  if (source.data) return source.data.byteLength;
  if (source.file) return source.file.size;
  return source.size;
}

async function readStream(response: Response, options: LoadBytesOptions, total: number | undefined): Promise<ArrayBuffer> {
  const body = response.body;
  if (!body) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > options.maxBytes) throw tooLarge(buffer.byteLength, options.maxBytes);
    return buffer;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  try {
    for (;;) {
      throwIfAborted(options.signal);
      const { done, value } = await reader.read();
      if (done) break;
      loaded += value.byteLength;
      // Content-Length can be missing or wrong, so keep counting while reading.
      if (loaded > options.maxBytes) throw tooLarge(loaded, options.maxBytes);
      chunks.push(value);
      options.onProgress?.(loaded, total);
    }
  } catch (err) {
    void reader.cancel().catch(() => undefined);
    throw err;
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

/** Reads the whole source into memory, refusing anything bigger than `maxBytes`. */
export async function loadBytes(source: FileSource, options: LoadBytesOptions): Promise<ArrayBuffer> {
  throwIfAborted(options.signal);
  if (source.data) {
    if (source.data.byteLength > options.maxBytes) throw tooLarge(source.data.byteLength, options.maxBytes);
    return toArrayBuffer(source.data);
  }
  if (source.file) {
    if (source.file.size > options.maxBytes) throw tooLarge(source.file.size, options.maxBytes);
    const buffer = await source.file.arrayBuffer();
    throwIfAborted(options.signal);
    return buffer;
  }
  if (!source.url) throw new FileViewerError("fetch_failed", "No url, file or data was given.");

  let response: Response;
  try {
    response = await fetch(source.url, { ...options.fetchInit, signal: options.signal });
  } catch (err) {
    throwIfAborted(options.signal);
    throw new FileViewerError("fetch_failed", "Could not download the file.", err);
  }
  if (!response.ok) throw new FileViewerError("fetch_failed", `Download failed with HTTP ${response.status}.`);
  const header = Number(response.headers.get("content-length"));
  const total = Number.isFinite(header) && header > 0 ? header : undefined;
  if (total !== undefined && total > options.maxBytes) {
    void response.body?.cancel().catch(() => undefined);
    throw tooLarge(total, options.maxBytes);
  }
  return readStream(response, options, total);
}
