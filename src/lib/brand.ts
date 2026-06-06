/**
 * Brand palette — SINGLE SOURCE OF TRUTH for accent colors used in
 * JavaScript / canvas / inline styles (BorderGlow, Grainient, confetti,
 * card backs, etc.) where Tailwind `accent-*` utility classes cannot reach.
 *
 * The Tailwind `accent-*` scale lives in src/app/globals.css (@theme block)
 * and MUST stay in sync with the hex values here. To re-skin the whole app,
 * change the hues here AND the `--color-accent-*` oklch hue in globals.css.
 *
 * Current brand: violet (hue ~290).
 */

/** Solid hex ramp, mirrors the Tailwind accent-* scale. */
export const ACCENT = {
  50: "#f3effe",
  100: "#e6ddfd",
  200: "#cfbdfb",
  300: "#b69bf7",
  400: "#a78bfa",
  500: "#8b6fe8",
  600: "#7c5cbf",
  700: "#6548a0",
  800: "#4a3580",
  900: "#3d2a6b",
  950: "#261747",
} as const;

/** RGB tuple of the primary accent (accent-400) for rgba() composition. */
export const ACCENT_RGB = "167,139,250";

/** Build an rgba() string from the primary accent at the given alpha. */
export function accentAlpha(alpha: number): string {
  return `rgba(${ACCENT_RGB},${alpha})`;
}

/**
 * Default BorderGlow gradient stops (light → dark accent). Pass to the
 * `colors` prop so every glow shares one palette.
 */
export const ACCENT_GLOW_COLORS: string[] = [
  ACCENT[400],
  ACCENT[600],
  ACCENT[900],
];

/** HSL triple for BorderGlow `glowColor` (matches accent-400). */
export const ACCENT_GLOW_HSL = "272 80 74";

/** Accent stops for the global Grainient background (light, near-black, mid). */
export const ACCENT_GRAINIENT = {
  color1: ACCENT[400],
  color2: "#0d0a12",
  color3: ACCENT[900],
} as const;
