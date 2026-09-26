/**
 * Brand palette — SINGLE SOURCE OF TRUTH for accent colors used in
 * JavaScript / canvas / inline styles (confetti, card backs, chip colours,
 * etc.) where Tailwind `accent-*` utility classes cannot reach.
 *
 * The Tailwind `accent-*` scale lives in src/app/globals.css (@theme block)
 * and MUST stay in sync with the hex values here. To re-skin the whole app,
 * change the hues here AND the `--color-accent-*` oklch hue in globals.css.
 *
 * Current brand: muted violet ink (hue ~300) on warm ink neutrals.
 */

/** Solid hex ramp, mirrors the Tailwind accent-* scale. */
export const ACCENT = {
  50: "#f6f3fc",
  100: "#ede8fa",
  200: "#dfd4f8",
  300: "#c9b5f0",
  400: "#b192e7",
  500: "#9a75d6",
  600: "#835cbe",
  700: "#6d4ba0",
  800: "#573b82",
  900: "#422f60",
  950: "#291c3c",
} as const;

/** RGB tuple of the primary accent (accent-400) for rgba() composition. */
export const ACCENT_RGB = "177,146,231";

/** Build an rgba() string from the primary accent at the given alpha. */
export function accentAlpha(alpha: number): string {
  return `rgba(${ACCENT_RGB},${alpha})`;
}
