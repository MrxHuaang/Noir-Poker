// Minimal ANSI helpers. No dependency — keeps the CLI lean.
// Accent is violet/magenta to echo the web app brand (see CLAUDE.md color system).

const E = "\x1b[";
const sgr = (...n: number[]) => `${E}${n.join(";")}m`;

// Colors on only for a real terminal, off when piped or NO_COLOR is set.
const COLOR_ENABLED = !!process.stdout.isTTY && !process.env.NO_COLOR;

const wrap = (open: number, close: number) => (s: string) =>
  COLOR_ENABLED ? sgr(open) + s + sgr(close) : s;

export const color = {
  reset: sgr(0),
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  italic: wrap(3, 23),
  underline: wrap(4, 24),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  white: wrap(37, 39),
  gray: wrap(90, 39),
  brightRed: wrap(91, 39),
  brightMagenta: wrap(95, 39),
  brightWhite: wrap(97, 39),
  bgMagenta: wrap(45, 49),
  bgGreen: wrap(42, 49),
};

// Brand accent shortcut (violet ~ magenta in the 16-color space).
export const accent = (s: string) => color.brightMagenta(s);

export const screen = {
  clear: `${E}2J${E}3J${E}H`, // clear screen + scrollback, cursor home
  home: `${E}H`,
  clearBelow: `${E}0J`,
  hideCursor: `${E}?25l`,
  showCursor: `${E}?25h`,
};

// Visible length of a string ignoring SGR escape codes (for padding).
const ANSI_RE = /\x1b\[[0-9;]*m/g;
export function visibleLen(s: string): number {
  return s.replace(ANSI_RE, "").length;
}

// Pad to a visible width on the right, accounting for color codes.
export function padEndVisible(s: string, width: number): string {
  const pad = width - visibleLen(s);
  return pad > 0 ? s + " ".repeat(pad) : s;
}
