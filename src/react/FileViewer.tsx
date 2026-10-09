"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from "react";

import { createFileViewer, type FileViewer as FileViewerInstance } from "../core/viewer.js";
import type { FileViewerError } from "../core/errors.js";
import type { FileSource, FileViewerOptions, ResolvedFile } from "../core/types.js";

export interface FileViewerProps {
  /** The file to show. Keep the object stable (useMemo); a new object opens the file again. */
  source: FileSource | null;
  /** Read once when the viewer mounts. Change the `key` prop to apply new options. */
  options?: Omit<FileViewerOptions, "onLoad" | "onError" | "onProgress">;
  onLoad?: (file: ResolvedFile) => void;
  onError?: (error: FileViewerError, file: ResolvedFile | null) => void;
  onProgress?: (loaded: number, total: number | undefined) => void;
  className?: string;
  style?: CSSProperties;
}

export interface FileViewerHandle {
  /** The underlying instance, for calls the props do not cover. Null before mount. */
  readonly viewer: FileViewerInstance | null;
}

export const FileViewer = forwardRef<FileViewerHandle, FileViewerProps>(function FileViewer(
  { source, options, onLoad, onError, onProgress, className, style },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<FileViewerInstance | null>(null);
  const callbacks = useRef({ onLoad, onError, onProgress });
  const initialOptions = useRef(options);

  useEffect(() => {
    callbacks.current = { onLoad, onError, onProgress };
  }, [onLoad, onError, onProgress]);

  useImperativeHandle(ref, () => ({
    get viewer() {
      return viewerRef.current;
    },
  }), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const viewer = createFileViewer(host, {
      ...initialOptions.current,
      onLoad: (file) => callbacks.current.onLoad?.(file),
      onError: (error, file) => callbacks.current.onError?.(error, file),
      onProgress: (loaded, total) => callbacks.current.onProgress?.(loaded, total),
    });
    viewerRef.current = viewer;
    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (source) void viewer.open(source);
    else viewer.clear();
  }, [source]);

  return (
    <div
      ref={hostRef}
      className={className ? `fv-react-host ${className}` : "fv-react-host"}
      style={{ display: "flex", minHeight: 0, ...style }}
    />
  );
});
