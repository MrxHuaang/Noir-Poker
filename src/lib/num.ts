/** Numeric helpers shared across betting UI and pot math. */

/** Clamp a number into the inclusive range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Round to the nearest integer, then clamp into [min, max]. */
export function clampInt(value: number, min: number, max: number): number {
  return clamp(Math.round(value), min, max);
}
