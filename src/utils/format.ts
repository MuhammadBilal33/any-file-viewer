const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** 1536 -> "1.5 KB". Returns "" for missing or invalid sizes. */
export function formatBytes(size: number | null | undefined): string {
  if (size == null || !Number.isFinite(size) || size < 0) return "";
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${Number(value.toFixed(digits))} ${UNITS[unit]}`;
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA", like spreadsheet column headers. */
export function columnLabel(index: number): string {
  let n = Math.floor(index) + 1;
  if (!Number.isFinite(n) || n < 1) return "";
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

/** Decodes text, dropping a UTF-8 byte-order mark and honouring a UTF-16 one. */
export function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes.subarray(3));
  return new TextDecoder("utf-8").decode(bytes);
}

/** Only these link targets survive inside rendered documents; javascript:, data:, file: and the rest are dropped. */
export function isSafeHref(href: string | null | undefined): boolean {
  if (!href) return false;
  const value = href.trim().toLowerCase();
  return value.startsWith("http://") || value.startsWith("https://") || value.startsWith("mailto:") || value.startsWith("#");
}
