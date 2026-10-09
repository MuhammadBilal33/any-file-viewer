/** iOS Safari refuses canvases above about 16.7 million pixels and paints them blank. */
export const MAX_CANVAS_PIXELS = 16_777_216;

/** Device pixel ratio to draw with, lowered when the canvas would pass the browser's pixel limit. */
export function canvasOutputScale(cssWidth: number, cssHeight: number, devicePixelRatio: number, maxPixels = MAX_CANVAS_PIXELS): number {
  const ratio = devicePixelRatio > 0 && Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;
  const area = cssWidth * cssHeight;
  if (!(area > 0)) return ratio;
  const limit = Math.sqrt(maxPixels / area);
  return Math.max(0.1, Math.min(ratio, limit));
}

/**
 * Index of the last page whose top is at or above `y`, by binary search over sorted page tops.
 * Returns 0 for an empty list or a `y` above the first page.
 */
export function pageIndexAt(tops: readonly number[], y: number): number {
  let low = 0;
  let high = tops.length - 1;
  let found = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (tops[mid]! <= y) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/** Turns typed text into a page number inside 1..total, or null when it is not a number. */
export function parsePageInput(value: string, total: number): number | null {
  const n = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(n) || total < 1) return null;
  return Math.min(total, Math.max(1, n));
}
