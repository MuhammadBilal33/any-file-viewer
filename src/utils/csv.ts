export interface ParsedTable {
  rows: string[][];
  /** True when parsing stopped at `maxRows` and more data was left. */
  truncated: boolean;
}

const CANDIDATES = [",", ";", "\t", "|"] as const;

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) count += 1;
  }
  return count;
}

/** Picks the separator that splits the first lines into the most consistent number of columns. */
export function guessDelimiter(text: string): string {
  const lines = text
    .slice(0, 64 * 1024)
    .split(/\r\n|\n|\r/, 10)
    .filter((line) => line.length > 0);
  let best = ",";
  let bestScore = 0;
  for (const delimiter of CANDIDATES) {
    const counts = lines.map((line) => countOutsideQuotes(line, delimiter));
    const first = counts[0] ?? 0;
    if (first === 0) continue;
    const consistent = counts.filter((count) => count === first).length;
    const score = consistent * 1000 + first;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

/**
 * RFC 4180 parser: quoted fields, doubled quotes, separators and line breaks inside quotes,
 * and CRLF / LF / CR line ends. One pass over the text.
 */
export function parseDelimited(text: string, delimiter = ",", maxRows = Number.POSITIVE_INFINITY): ParsedTable {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let fieldStart = 0;
  let i = 0;
  const length = text.length;

  // Fast path: copy plain runs with slice() instead of adding one character at a time.
  const flushPlain = (end: number): void => {
    if (end > fieldStart) field += text.slice(fieldStart, end);
  };

  const endRow = (): boolean => {
    row.push(field);
    rows.push(row);
    row = [];
    field = "";
    return rows.length >= maxRows;
  };

  while (i < length) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        flushPlain(i);
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          quoted = false;
          i += 1;
        }
        fieldStart = i;
        continue;
      }
      i += 1;
      continue;
    }
    if (char === '"' && field.length === 0 && i === fieldStart) {
      quoted = true;
      i += 1;
      fieldStart = i;
      continue;
    }
    if (char === delimiter) {
      flushPlain(i);
      row.push(field);
      field = "";
      i += 1;
      fieldStart = i;
      continue;
    }
    if (char === "\n" || char === "\r") {
      flushPlain(i);
      i += char === "\r" && text[i + 1] === "\n" ? 2 : 1;
      fieldStart = i;
      if (endRow()) return { rows, truncated: i < length };
      continue;
    }
    i += 1;
  }
  flushPlain(length);
  if (field.length > 0 || row.length > 0) endRow();
  return { rows, truncated: false };
}
