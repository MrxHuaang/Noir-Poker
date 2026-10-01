// Pixel-art rank emblems, painted procedurally pixel by pixel (no image
// files): a shield that grows and gets richer with the rank, bevelled metal
// lit from the top-left, dithered enamel, an object of the trade, and from
// Sicario up rays, a ribbon with stars, laurel wings, fire and a crown.
// Every emblem has FRAMES frames (flames, glints, a falling drop, blinking
// eyes, twinkles) that the component cycles like a sprite.
//
// Pure: returns RGBA pixel buffers. Colours are the Noir tokens plus the
// metal ramps below (mirrors NOIR in brand.ts where they overlap).

export const EMBLEM_W = 64;
export const EMBLEM_H = 60;
export const FRAMES = 8;

type Col = string;
const K = "#0b0908"; // outline ink

const RAMP = {
  iron: ["#2b2724", "#4a4540", "#6f6962", "#9d968b", "#c9c1b3"],
  bronze: ["#3a200d", "#6a3b1b", "#9a5c30", "#c98a52", "#efc08a"],
  steel: ["#23272c", "#434b53", "#6e7881", "#a3adb5", "#dfe6ea"],
  gold: ["#4a3210", "#7d5a1e", "#b98a3c", "#e0b764", "#fff0c4"],
  bone: ["#5e5648", "#8f8674", "#bdb29c", "#e3d9c3", "#fffaf0"],
  blood: ["#2e0b08", "#5c1a14", "#8f2a1f", "#c8402f", "#f27a5e"],
  soot: ["#0e0b09", "#17120f", "#221b16", "#30271f", "#3f342a"],
  leather: ["#1e120b", "#352015", "#553522", "#7a5033"],
};
const TUNG = ["#b07a2e", "#e8b25c", "#f3d08e", "#fff4d6"];

type Tier = {
  metal: Col[];
  field: Col[];
  hw: number;
  hh: number;
  rim: number;
};
const TIERS: Tier[] = [
  { metal: RAMP.iron, field: RAMP.soot, hw: 9, hh: 23, rim: 2 },
  { metal: RAMP.bronze, field: ["#140c07", "#20130b", "#2d1b10", "#3b2415", "#4a2e1a"], hw: 9.6, hh: 24, rim: 2 },
  { metal: RAMP.steel, field: ["#0d0f12", "#151a1f", "#1f262c", "#2a323a", "#353f48"], hw: 10.3, hh: 25.5, rim: 2 },
  { metal: RAMP.gold, field: RAMP.blood, hw: 11, hh: 27, rim: 3 },
  { metal: RAMP.gold, field: ["#1e0605", "#3a0d0a", "#5c1a14", "#7d241b", "#9c3023"], hw: 11.6, hh: 28, rim: 3 },
  { metal: RAMP.bone, field: ["#08080a", "#101014", "#18181e", "#22222a", "#2e2e38"], hw: 12.2, hh: 29, rim: 3 },
  { metal: RAMP.gold, field: ["#050404", "#0b0908", "#1a0907", "#2e0b08", "#471008"], hw: 13, hh: 30, rim: 3 },
];

class Canvas {
  c: (Col | null)[];
  metal: boolean[];
  constructor() {
    this.c = new Array(EMBLEM_W * EMBLEM_H).fill(null);
    this.metal = new Array(EMBLEM_W * EMBLEM_H).fill(false);
  }
  in(x: number, y: number) {
    return x >= 0 && y >= 0 && x < EMBLEM_W && y < EMBLEM_H;
  }
  set(x: number, y: number, col: Col | null, metal = false) {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.in(x, y) || !col) return;
    this.c[y * EMBLEM_W + x] = col;
    this.metal[y * EMBLEM_W + x] = metal;
  }
  get(x: number, y: number) {
    return this.in(x, y) ? this.c[y * EMBLEM_W + x] : null;
  }
}

const CX = 32; // pixels 31 and 32 straddle the axis
const dxOf = (x: number) => Math.abs(x + 0.5 - CX);
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Light from the top-left: 0 (shadow) .. 1 (lit). */
const lightAt = (x: number, y: number, cy: number) => clamp(0.55 - (x + 0.5 - CX) * 0.035 - (y - cy) * 0.03, 0, 1);

function shieldMask(t: Tier, top: number) {
  const m = new Array(EMBLEM_W * EMBLEM_H).fill(false);
  for (let y = 0; y < EMBLEM_H; y++)
    for (let x = 0; x < EMBLEM_W; x++) {
      const ry = y - top;
      const dx = dxOf(x);
      let ok = false;
      if (ry >= -3 && ry < 0) ok = dx <= ry + 3.2; // the crest point
      else if (ry >= 0 && ry <= t.hh) {
        const u = ry / t.hh;
        let hw = t.hw;
        if (u > 0.52) hw = t.hw * Math.pow(1 - (u - 0.52) / 0.48, 0.62);
        if (ry < 3) hw = Math.min(hw, t.hw - (3 - ry) * 0.9); // cut corners
        // deco steps on the top edge
        if (ry === 0 && dx > 3 && dx < t.hw - 3) ok = dx < hw && (Math.floor(dx) % 4 !== 2);
        else ok = dx < hw;
      }
      m[y * EMBLEM_W + x] = ok;
    }
  return m;
}

function erode(m: boolean[], n: number) {
  let cur = m;
  for (let k = 0; k < n; k++) {
    const nx = cur.slice();
    for (let y = 0; y < EMBLEM_H; y++)
      for (let x = 0; x < EMBLEM_W; x++) {
        const i = y * EMBLEM_W + x;
        if (!cur[i]) continue;
        const nb = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ];
        if (nb.some(([a, b]) => a < 0 || b < 0 || a >= EMBLEM_W || b >= EMBLEM_H || !cur[b * EMBLEM_W + a])) nx[i] = false;
      }
    cur = nx;
  }
  return cur;
}

/** Tiny ASCII sprites: each char maps to a colour, '.' is empty. */
function glyph(cv: Canvas, rows: string[], x0: number, y0: number, pal: Record<string, Col>, metal = false) {
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      if (ch !== "." && pal[ch]) cv.set(x0 + x, y0 + y, pal[ch], metal);
    }),
  );
}

const STAR = ["..s..", ".sss.", "sssss", ".sss.", "s...s"];
const HEART = [".rr.rr.", "rrrrrrr", "rrrrrrr", ".rrrrr.", "..rrr..", "...r..."];
const ACE = [".a.", "a.a", "aaa", "a.a"];
const SPADE_BIG = [
  ".....s.....",
  "....sss....",
  "...sssss...",
  "..sssssss..",
  ".sssssssss.",
  "sssssssssss",
  "sssssssssss",
  "sssssssssss",
  ".sss.s.sss.",
  ".....s.....",
  "....sss....",
  "..sssssss..",
];
const PAWN = [
  "....342....",
  "...34421...",
  "...34421...",
  "....321....",
  "...433211..",
  "....432....",
  "....431....",
  "....431....",
  "...44321...",
  "..4443211..",
  "..3332211..",
  ".444432211.",
  "43333322211",
];
const CROWN = [
  "g.....g.....g",
  "gg...ggg...gg",
  "ggg.ggrgg.ggg",
  "ggggggggggggg",
  "gRgggrgrgggRg",
  "ggggggggggggg",
  "ddddddddddddd",
];

function disk(cv: Canvas, cx: number, cy: number, r: number, colAt: (x: number, y: number) => Col | null, metal = false) {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++)
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) cv.set(x, y, colAt(x, y), metal);
}
function ring(cv: Canvas, cx: number, cy: number, r0: number, r1: number, ramp: Col[]) {
  for (let y = Math.floor(cy - r1 - 1); y <= cy + r1 + 1; y++)
    for (let x = Math.floor(cx - r1 - 1); x <= cx + r1 + 1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < r0 || d > r1) continue;
      // outer arc lit from the top-left, inner arc lit from the bottom-right
      const a = (x + 0.5 - cx) * -0.7 + (y + 0.5 - cy) * -1;
      const outer = d > (r0 + r1) / 2;
      const l = clamp(0.5 + (outer ? a : -a) / (r1 * 1.6), 0, 1);
      cv.set(x, y, ramp[1 + Math.round(l * 3)], true);
    }
}
function shadeRamp(ramp: Col[], l: number) {
  return ramp[clamp(Math.round(l * (ramp.length - 1)), 0, ramp.length - 1)];
}

/** Outline every non-empty region with ink, outside only. */
function outline(cv: Canvas) {
  const add: [number, number][] = [];
  for (let y = 0; y < EMBLEM_H; y++)
    for (let x = 0; x < EMBLEM_W; x++) {
      if (cv.get(x, y)) continue;
      if (cv.get(x - 1, y) || cv.get(x + 1, y) || cv.get(x, y - 1) || cv.get(x, y + 1)) add.push([x, y]);
    }
  add.forEach(([x, y]) => cv.set(x, y, K));
}

/** Outline a layer painted on a scratch canvas, then stamp it onto cv. */
function stamp(cv: Canvas, draw: (l: Canvas) => void, ink = K) {
  const l = new Canvas();
  draw(l);
  const add: number[] = [];
  for (let y = 0; y < EMBLEM_H; y++)
    for (let x = 0; x < EMBLEM_W; x++) {
      if (l.get(x, y)) continue;
      if (l.get(x - 1, y) || l.get(x + 1, y) || l.get(x, y - 1) || l.get(x, y + 1)) add.push(y * EMBLEM_W + x);
    }
  add.forEach((i) => (l.c[i] = ink));
  for (let i = 0; i < l.c.length; i++)
    if (l.c[i]) {
      cv.c[i] = l.c[i];
      cv.metal[i] = l.metal[i];
    }
}

function paint(tier: number, f: number): Canvas {
  const t = TIERS[tier];
  const cv = new Canvas();
  const top = tier === 6 ? 15 : tier >= 4 ? 14 : 13 + (3 - Math.min(tier, 3)) * 0.5;
  const TOP = Math.round(top);
  const cy = TOP + t.hh * (tier >= 3 ? 0.37 : 0.42); // icon centre, above the ribbon
  const mask = shieldMask(t, TOP);

  // 1. behind the shield: rays, wings, fire
  if (tier === 2 || tier === 3 || tier === 6) {
    const n = tier === 6 ? 16 : 10 + tier * 2;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (tier % 2 ? 0.14 : 0);
      const len = tier === 6 ? (k % 2 ? 20 : 26) : (k % 2 ? 15 : 21) + tier;
      if (tier === 6 && Math.sin(a) > 0.2) continue; // Noir: a halo over the crown only
      const wide = false;
      for (let r = 6; r < len; r += 0.5) {
        const x = CX - 0.5 + Math.cos(a) * r;
        const y = TOP + t.hh * 0.45 + Math.sin(a) * r * 0.92;
        const fade = r / len;
        if (fade > 0.8 && hash(k, Math.round(r)) > 0.5) continue;
        const col = k % 2 ? t.metal[1] : fade > 0.6 ? t.metal[1] : t.metal[2];
        cv.set(x, y, col);
        if (wide) cv.set(x + (Math.abs(Math.sin(a)) > 0.7 ? 1 : 0), y + (Math.abs(Math.sin(a)) > 0.7 ? 0 : 1), t.metal[1]);
      }
    }
  }
  if (tier >= 5) {
    // fire (Noir) or ghost flames (Espectro), licking up behind the shield
    const ramp = tier === 6 ? [RAMP.blood[1], RAMP.blood[2], RAMP.blood[3], TUNG[1], TUNG[3]] : ["#2a2a33", "#4a4a58", "#7c7c8c", "#b9b6c4", "#ecebf3"];
    const span = t.hw + 9;
    for (let x = Math.floor(CX - span); x <= CX + span; x++) {
      const e = 1 - dxOf(x) / span;
      if (e <= 0) continue;
      const h = (7 + Math.sin(e * Math.PI) * 12) * (0.75 + 0.25 * Math.sin(x * 1.3 + f * 1.7) * Math.sin(x * 0.51 - f * 0.9)) + hash(x, f) * 3;
      const base = TOP + 12 + Math.round((1 - e) * 10);
      for (let k = 0; k < h; k++) {
        const u = k / h;
        const wob = Math.round(Math.sin(k * 0.6 + f + x) * (u * 1.2));
        cv.set(x + wob, base - k, ramp[clamp(Math.floor(u * 5), 0, 4)]);
      }
    }
  }
  if (tier >= 4) {
    const wing = tier === 4 ? RAMP.gold : tier === 5 ? RAMP.bone : RAMP.blood;
    const tip = tier === 6 ? RAMP.gold : wing;
    const flap = tier >= 5 ? Math.round(Math.sin((f / FRAMES) * Math.PI * 2) * 1.2) : 0;
    for (const sd of [-1, 1]) {
      const rootX = CX - 0.5 + sd * (t.hw - 4);
      const rootY = TOP + 8;
      const n = tier === 4 ? 8 : 9;
      for (let k = n - 1; k >= 0; k--) {
        const th = -1.12 + (k / (n - 1)) * 1.5; // from up-and-out to out-and-down
        const len = 21 + (tier - 4) * 2 - Math.abs(k - 1.5) * 1.9;
        for (let r = 0; r < len; r += 0.5) {
          const u = r / len;
          const bend = u * u * 3; // feathers curl up at the tips
          const x = rootX + sd * Math.cos(th) * r;
          const y = rootY + Math.sin(th) * r - bend + (k === 0 ? 0 : flap * u);
          const thick = Math.max(2, Math.round(4.6 - u * 3));
          for (let j = 0; j < thick; j++) {
            const lit = j === 0 ? 4 : j === thick - 1 ? 1 : 2 + (k % 2);
            cv.set(x, y + j, u > 0.72 ? tip[Math.min(4, lit)] : wing[lit]);
          }
        }
      }
    }
  }

  // 2. the shield: bevelled metal rim, dithered enamel field
  const field = erode(mask, t.rim);
  const inner2 = erode(field, 2);
  for (let y = 0; y < EMBLEM_H; y++)
    for (let x = 0; x < EMBLEM_W; x++) {
      const i = y * EMBLEM_W + x;
      if (!mask[i]) continue;
      if (!field[i]) {
        const edgeOut = !mask[i - 1] || !mask[i + 1] || !mask[i - EMBLEM_W] || !mask[i + EMBLEM_W];
        const edgeIn = field[i - 1] || field[i + 1] || field[i - EMBLEM_W] || field[i + EMBLEM_W];
        let l = lightAt(x, y, cy);
        if (edgeOut) l -= 0.18;
        if (edgeIn) l = (y - cy) < 0 ? l - 0.3 : l + 0.25; // bevel: inner edge dark on top, lit below
        if (!edgeOut && !edgeIn && hash(x, y) > 0.86) l += 0.2; // hammered metal
        cv.set(x, y, shadeRamp(t.metal, l), true);
      } else {
        const u = (y - TOP) / t.hh;
        const v = clamp(3.4 - u * 3.2 - (dxOf(x) / t.hw) * 0.8, 0, 4);
        const lo = Math.floor(v);
        const dither = v - lo > 0.5 && (x + y) % 2 === 0 ? 1 : 0; // checker dither between steps
        let col = t.field[clamp(lo + dither, 0, 4)];
        if (tier >= 3 && !inner2[i] && (x + y) % 2 === 0) col = t.field[clamp(lo + 1, 0, 4)];
        cv.set(x, y, col);
      }
    }
  // gold filet inside the field from Capo up
  if (tier >= 3) {
    const inner1 = erode(field, 1);
    for (let i = 0; i < inner1.length; i++) if (inner1[i] && !inner2[i]) cv.set(i % EMBLEM_W, Math.floor(i / EMBLEM_W), t.metal[2], true);
  }

  // 3. the object of the trade
  const icx = CX;
  const icy = Math.round(cy);
  stamp(cv, (l) => {
    if (tier === 0) {
      const pal = { "1": RAMP.iron[1], "2": RAMP.iron[2], "3": RAMP.iron[3], "4": RAMP.iron[4] };
      glyph(l, PAWN, icx - 6, icy - 7, pal, true);
    } else if (tier === 1) {
      // two cards: a red-backed one tipped behind, the ace of hearts in front
      for (let y = 0; y < 12; y++)
        for (let x = 0; x < 8; x++) {
          const sx = icx - 9 + x + Math.floor(y / 4);
          const border = x === 0 || y === 0 || x === 7 || y === 11;
          l.set(sx, icy - 8 + y, border ? RAMP.blood[1] : (x + y) % 3 === 0 ? RAMP.blood[4] : RAMP.blood[3]);
        }
      for (let y = 0; y < 13; y++)
        for (let x = 0; x < 10; x++) {
          const edge = x === 0 || y === 0;
          const shade = x === 9 || y === 12;
          l.set(icx - 3 + x, icy - 6 + y, edge ? K : shade ? RAMP.bone[2] : RAMP.bone[3]);
        }
      glyph(l, ACE, icx - 1, icy - 4, { a: RAMP.blood[3] });
      glyph(l, HEART, icx - 1, icy + 1, { r: RAMP.blood[3] });
      l.set(icx, icy + 1, RAMP.blood[4]);
    } else if (tier === 2) {
      // the dagger, point down, and a drop that falls
      const y0 = icy - 9;
      disk(l, icx, y0 + 1, 1.8, (x, y) => shadeRamp(RAMP.gold, lightAt(x, y, y0)), true);
      for (let y = y0 + 3; y < y0 + 7; y++) for (let x = icx - 2; x <= icx + 1; x++) l.set(x, y, (y + x) % 2 ? RAMP.leather[1] : RAMP.leather[3]);
      for (let x = icx - 6; x <= icx + 5; x++) l.set(x, y0 + 7, shadeRamp(RAMP.gold, 0.9 - Math.abs(x - icx + 0.5) * 0.08), true);
      l.set(icx - 6, y0 + 8, RAMP.gold[2], true);
      l.set(icx + 5, y0 + 8, RAMP.gold[2], true);
      for (let y = y0 + 8; y < y0 + 20; y++) {
        const w = y > y0 + 16 ? 0 : 1;
        for (let x = icx - 1 - w; x <= icx + w; x++) {
          const bloody = y > y0 + 15;
          const col = bloody ? (x === icx - 1 ? RAMP.blood[3] : RAMP.blood[2]) : x < icx - 1 ? RAMP.steel[3] : x === icx - 1 ? RAMP.steel[4] : RAMP.steel[2];
          l.set(x, y, col, !bloody);
        }
      }
      const dropY = y0 + 21 + (f % 4) * 1.5;
      if (f % 4 !== 3) {
        l.set(icx - 1, dropY, RAMP.blood[3]);
        l.set(icx - 1, dropY + 1, RAMP.blood[2]);
      }
    } else if (tier === 3) {
      // the signet ring, onyx bezel with a gold crown
      disk(l, icx, icy + 3, 3.6, (x, y) => RAMP.soot[1 + ((x + y) % 2)]);
      ring(l, icx, icy + 3, 3.4, 7, RAMP.gold);
      for (let y = icy - 7; y <= icy - 1; y++)
        for (let x = icx - 5; x <= icx + 4; x++) {
          const border = y === icy - 7 || y === icy - 1 || x === icx - 5 || x === icx + 4;
          l.set(x, y, border ? shadeRamp(RAMP.gold, lightAt(x, y, icy - 4) + 0.2) : RAMP.soot[1 + ((x + y) % 2)], border);
        }
      glyph(l, ["g.g.g", "ggggg", "grgrg"], icx - 3, icy - 5, { g: RAMP.gold[3], r: RAMP.blood[3] }, true);
    } else if (tier === 4) {
      // brass knuckles
      [-6.6, -2.2, 2.2, 6.6].forEach((o) => ring(l, icx + o, icy - 3, 1.1, 3.3, RAMP.gold));
      for (let x = icx - 10; x <= icx + 9; x++) {
        const d = Math.abs(x + 0.5 - icx);
        const yb = icy + 3 - Math.round((d * d) / 26);
        for (let j = 0; j < 4; j++) l.set(x, yb + j, shadeRamp(RAMP.gold, j === 0 ? 0.95 : j === 1 ? 0.7 : j === 2 ? 0.45 : 0.2), true);
      }
    } else if (tier === 5) {
      // the fedora with nobody under it: two eyes in the dark
      for (let y = icy - 8; y <= icy - 1; y++) {
        const k = y - (icy - 8);
        const w = 3 + Math.min(k, 3) * 0.8 + (k > 3 ? 0.4 : 0);
        for (let x = Math.round(icx - w - 1); x <= Math.round(icx + w); x++) {
          if (k === 0 && Math.abs(x + 0.5 - icx) < 1.2) continue; // the pinch
          const band = y >= icy - 2;
          l.set(x, y, band ? RAMP.blood[band && x < icx ? 3 : 2] : shadeRamp(RAMP.soot, lightAt(x, y, icy - 6) + 0.3));
        }
      }
      for (let x = icx - 10; x <= icx + 9; x++) {
        const d = Math.abs(x + 0.5 - icx);
        const y = icy + (d > 7 ? -1 : 0);
        l.set(x, y, RAMP.soot[4]);
        l.set(x, y + 1, RAMP.soot[2]);
      }
      for (let y = icy + 2; y <= icy + 6; y++) for (let x = icx - 4; x <= icx + 3; x++) l.set(x, y, "#050404");
      const blink = f === 5;
      if (!blink) {
        l.set(icx - 3, icy + 3, TUNG[3]);
        l.set(icx - 2, icy + 3, TUNG[1]);
        l.set(icx + 1, icy + 3, TUNG[1]);
        l.set(icx + 2, icy + 3, TUNG[3]);
      } else {
        l.set(icx - 3, icy + 4, TUNG[0]);
        l.set(icx + 2, icy + 4, TUNG[0]);
      }
    } else {
      // Noir: the club's spade in gold, a keyhole burning inside it
      SPADE_BIG.forEach((r, y) =>
        [...r].forEach((ch, x) => {
          if (ch !== "s") return;
          const px = icx - 6 + x;
          const py = icy - 7 + y;
          l.set(px, py, shadeRamp(RAMP.gold, lightAt(px, py, icy - 3) + 0.15), true);
        }),
      );
      const glow = [RAMP.blood[3], TUNG[1], TUNG[2], TUNG[1]][f % 4];
      disk(l, icx, icy - 1.5, 1.6, () => glow);
      l.set(icx - 1, icy + 1, glow);
      l.set(icx, icy + 1, glow);
      l.set(icx - 1, icy + 2, glow);
      l.set(icx, icy + 2, glow);
      l.set(icx - 1, icy - 2, TUNG[3]);
    }
  });

  // 4. ribbon with the stars, from Capo up
  if (tier >= 3) {
    const ry = Math.round(TOP + t.hh * 0.7);
    const half = t.hw + 3;
    stamp(cv, (l) => {
      for (let x = Math.floor(CX - half); x <= CX + half - 1; x++) {
        const d = dxOf(x);
        const sag = Math.round((d * d) / 90);
        const tail = d > half - 3;
        for (let j = 0; j < 5; j++) {
          const col = tail ? RAMP.blood[j === 0 ? 2 : 1] : j === 0 ? RAMP.blood[4] : j === 4 ? RAMP.blood[1] : RAMP.blood[3 - (j === 3 ? 1 : 0)];
          l.set(x, ry - sag + j + (tail ? 2 : 0), col);
        }
        if (tail && d > half - 1.5) l.set(x, ry - sag + 7, RAMP.blood[1]);
      }
      const n = tier - 2;
      for (let k = 0; k < n; k++) {
        const sx = Math.round(CX - 2.5 + (k - (n - 1) / 2) * 6);
        const tw = (f + k * 2) % FRAMES === 0;
        glyph(l, STAR, sx, ry, { s: tw ? "#ffffff" : RAMP.bone[4] });
      }
    });
  }

  // 5. the crown on Noir
  if (tier === 6) {
    stamp(cv, (l) => glyph(l, CROWN, CX - 7, TOP - 9, { g: RAMP.gold[3], d: RAMP.gold[1], r: RAMP.blood[3], R: RAMP.blood[4] }, true));
    for (let x = CX - 7; x < CX + 6; x++) for (let y = TOP - 9; y < TOP - 2; y++) if (cv.get(x, y) === RAMP.gold[3] && (x - CX) * -1 + (y - TOP) * -1 > 9) cv.set(x, y, RAMP.gold[4], true);
  }

  // 6. rivets / gems on the rim
  const rv = [
    [CX - t.hw + 1.6, TOP + 2.4],
    [CX + t.hw - 2.6, TOP + 2.4],
  ];
  rv.forEach(([x, y]) => {
    if (tier >= 3) {
      cv.set(x, y, RAMP.blood[3]);
      cv.set(x + 1, y, RAMP.blood[2]);
      cv.set(x, y + 1, RAMP.blood[2]);
      cv.set(x + 1, y + 1, RAMP.blood[1]);
      cv.set(x, y, RAMP.blood[4]);
    } else cv.set(x, y, t.metal[4], true);
  });

  outline(cv);

  // 7. a glint sweeping across the metal, and twinkles
  if (tier >= 2) {
    const band = (f - 3) * 7 - 4;
    if (f >= 3 && f <= 7)
      for (let i = 0; i < cv.c.length; i++) {
        if (!cv.metal[i]) continue;
        const x = i % EMBLEM_W;
        const y = Math.floor(i / EMBLEM_W);
        const d = x + y * 0.6 - 10 - band;
        if (d >= 0 && d < 2.2) cv.c[i] = d < 1 ? "#ffffff" : TUNG[3];
      }
  }
  if (tier >= 3) {
    const spots = [
      [CX + t.hw + 3, TOP + 2],
      [CX - t.hw - 4, TOP + t.hh * 0.5],
      [CX + 2, TOP - (tier === 6 ? 12 : 5)],
    ];
    spots.forEach(([x, y], k) => {
      const ph = (f + k * 3) % FRAMES;
      if (ph === 0) {
        cv.set(x, y, "#ffffff");
      } else if (ph === 1) {
        cv.set(x, y, "#ffffff");
        cv.set(x - 1, y, TUNG[2]);
        cv.set(x + 1, y, TUNG[2]);
        cv.set(x, y - 1, TUNG[2]);
        cv.set(x, y + 1, TUNG[2]);
      } else if (ph === 2) cv.set(x, y, TUNG[1]);
    });
  }
  return cv;
}

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** All frames of one emblem as RGBA buffers (EMBLEM_W x EMBLEM_H each). */
export function emblemFrames(tier: number): Uint8ClampedArray[] {
  const out: Uint8ClampedArray[] = [];
  for (let f = 0; f < FRAMES; f++) {
    const cv = paint(clamp(Math.round(tier), 0, TIERS.length - 1), f);
    const buf = new Uint8ClampedArray(EMBLEM_W * EMBLEM_H * 4);
    cv.c.forEach((c, i) => {
      if (!c) return;
      const [r, g, b] = hex(c);
      buf.set([r, g, b, 255], i * 4);
    });
    out.push(buf);
  }
  return out;
}
