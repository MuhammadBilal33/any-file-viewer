export const ZOOM_STEPS = [0.25, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5] as const;

/** Next preset zoom in the given direction, so repeated clicks land on round numbers. */
export function stepZoom(current: number, direction: 1 | -1): number {
  if (direction > 0) {
    for (const step of ZOOM_STEPS) if (step > current + 0.001) return step;
    return ZOOM_STEPS[ZOOM_STEPS.length - 1]!;
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i -= 1) if (ZOOM_STEPS[i]! < current - 0.001) return ZOOM_STEPS[i]!;
  return ZOOM_STEPS[0]!;
}

export function canZoom(current: number, direction: 1 | -1): boolean {
  return direction > 0 ? current < ZOOM_STEPS[ZOOM_STEPS.length - 1]! - 0.001 : current > ZOOM_STEPS[0]! + 0.001;
}

/** Scale that makes `contentWidth` fit `available`, never enlarging past 1. */
export function fitScale(available: number, contentWidth: number): number {
  if (!(available > 0) || !(contentWidth > 0)) return 1;
  return Math.min(1, available / contentWidth);
}
