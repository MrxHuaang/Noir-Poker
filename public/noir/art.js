// Card art shared by the 3D scene (scene.html) and the React previews (the
// table's settings, the open-a-table form). Pure canvas drawing, no THREE:
// every function returns a <canvas>; `canvas.nearest` says whether it is pixel
// art (scale it with hard edges) or a smooth vector face.
let OPT = { four: "off", back: "carmesi", face: "gordo" };
function makeCanvas(w, h, draw, nearest = true) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.imageSmoothingEnabled = false; draw(g, w, h);
  c.nearest = nearest; return c;
}
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const F5 = { A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"], "2": [".###.", "#...#", "....#", "..##.", ".#...", "#....", "#####"], "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."], "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."], "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."], "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."], "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."], "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."], "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."], "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."], "1": [".#.", "##.", ".#.", ".#.", ".#.", ".#.", "###"], J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."], Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"], K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"], N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"] };
const S5 = [["..#..", ".###.", "#####", "#####", "..#.."], [".#.#.", "#####", "#####", ".###.", "..#.."], ["..#..", ".###.", "#####", ".###.", "..#.."], [".###.", ".###.", "#####", "#.#.#", "..#.."]];
const S7 = [["...#...", "..###..", ".#####.", "#######", "#######", "...#...", "..###.."], [".##.##.", "#######", "#######", "#######", ".#####.", "..###..", "...#..."], ["...#...", "..###..", ".#####.", "#######", ".#####.", "..###..", "...#..."], ["..###..", "..###..", "#######", "#######", "##.#.##", "...#...", "..###.."]];
const FACE = { 9: ["....######..", "...##########", "....######..", "....######..", ".....####...", ".....####...", "...########.", "..##########", "..###r#####.", "..###r#####."], 10: ["...######...", "..########..", ".##########.", ".##.####.##.", ".##.####.##.", ".....##.....", "...##oo##...", "..###oo###..", "..########..", "..########.."], 11: ["....####....", "....####....", "..#rrrrrr#..", "############", ".....##.....", "....####....", "..########..", ".####r#####.", ".####r#####.", ".####r#####."] };
const INK = "#15171a", PAPER = "#efe6d3", SHADE = "#d6c7a8";
const suitCol = s => OPT.four === "on" ? [INK, "#b3261e", "#2c62a3", "#2c7a4b"][s] : (s === 1 || s === 2 ? "#b3261e" : INK);
const texCache = new Map();
function drawCard(c) {
  if (c && OPT.face !== "pix") { const make = FACES[OPT.face] || FACES.gordo; const k = `${OPT.face in FACES ? OPT.face : "gordo"}-${c.r}-${c.s}-${OPT.four}`; if (!texCache.has(k)) texCache.set(k, make(c)); return texCache.get(k); }
  const key = c ? `${c.r}-${c.s}-${OPT.four}` : "back-" + OPT.back; if (texCache.has(key)) return texCache.get(key);
  const t = makeCanvas(32, 44, g => {
    const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const gl = (rows, x, y, col, s = 1) => rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === "#") px(x + i * s, y + j * s, s, s, col); });
    px(1, 0, 30, 44, INK); px(0, 1, 32, 42, INK);
    if (!c) {
      const B = OPT.back;
      const bg = B === "deco" ? "#10201a" : B === "pica" ? "#15171a" : B === "azul" ? "#0f141c" : "#1a1210"; px(1, 1, 30, 42, bg);
      for (let y = 2; y < 42; y++) for (let x = 2; x < 30; x++) {
        if ((B === "carmesi" || B === "azul") && ((x + y) % 4 === 0 || (x - y + 64) % 4 === 0)) px(x, y, 1, 1, B === "azul" ? "#2c4a78" : "#8e2a22");
        if (B === "deco" && (Math.abs(((x - 16) % 8 + 8) % 8 - 4) === (y % 8) - 2 || y % 8 === 0)) px(x, y, 1, 1, "#9a7030");
      }
      const edge = B === "deco" ? "#c98f3c" : "#cdbd98"; px(2, 2, 28, 1, edge); px(2, 41, 28, 1, edge); px(2, 2, 1, 40, edge); px(29, 2, 1, 40, edge);
      if (B === "pica") { px(4, 4, 24, 1, edge); px(4, 39, 24, 1, edge); px(4, 4, 1, 36, edge); px(27, 4, 1, 36, edge); gl(S7[0], 9, 15, "#e6d6b8", 2); }
      else { for (let j = 0; j < 11; j++) { const w = 5 - Math.abs(j - 5); px(16 - w - 1, 16 + j, (w + 1) * 2, 1, bg); } for (let j = 0; j < 11; j++) { const w = 5 - Math.abs(j - 5); px(16 - w - 1, 16 + j, 1, 1, edge); px(16 + w, 16 + j, 1, 1, edge); } gl(F5.N, 14, 18, edge, 1); }
      return;
    }
    px(1, 1, 30, 42, PAPER); px(1, 42, 30, 1, SHADE); px(30, 1, 1, 41, SHADE);
    const col = suitCol(c.s), rk = RANKS[c.r];
    if (rk === "10") { gl(F5["1"], 2, 3, col, 2); gl(F5["0"], 10, 3, col, 2); } else gl(F5[rk], 3, 3, col, 2);
    if (c.r === 12) gl(S7[c.s], 6, 20, col, 3);
    else { gl(S5[c.s], 4, 20, col); if (c.r >= 9 && c.r <= 11) { FACE[c.r].forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[i]; if (ch === "#") px(17 + i, 30 + j, 1, 1, INK); if (ch === "r") px(17 + i, 30 + j, 1, 1, col === INK ? "#b3261e" : col); if (ch === "o") px(17 + i, 30 + j, 1, 1, PAPER); } }); gl(S5[c.s], 24, 22, col); }
      else gl(S7[c.s], 15, 26, col, 2); }
  });
  texCache.set(key, t); return t;
}
// "Clásica 1929": a finer 64x88 face with big corner indices (top-left and,
// upside down, bottom-right), the real pip layouts and double-headed court cards
// in a frame, like the old saloon decks
const PIPS = { 2: [[1, 0], [1, 4]], 3: [[1, 0], [1, 2], [1, 4]], 4: [[0, 0], [2, 0], [0, 4], [2, 4]], 5: [[0, 0], [2, 0], [1, 2], [0, 4], [2, 4]], 6: [[0, 0], [2, 0], [0, 2], [2, 2], [0, 4], [2, 4]], 7: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2], [0, 4], [2, 4]], 8: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2], [1, 3], [0, 4], [2, 4]], 9: [[0, 0], [2, 0], [0, 1.33], [2, 1.33], [1, 2], [0, 2.67], [2, 2.67], [0, 4], [2, 4]], 10: [[0, 0], [2, 0], [1, .67], [0, 1.33], [2, 1.33], [0, 2.67], [2, 2.67], [1, 3.33], [0, 4], [2, 4]] };
function classicTex(c) {
  const key = `c-${c.r}-${c.s}-${OPT.four}`; if (texCache.has(key)) return texCache.get(key);
  const t = makeCanvas(64, 88, g => {
    const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const gl = (rows, x, y, col, s = 1, flip = false) => { const R = flip ? rows.slice().reverse().map(r => r.split("").reverse().join("")) : rows; R.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === "#") px(x + i * s, y + j * s, s, s, col); }); };
    const col = suitCol(c.s), rk = RANKS[c.r], n = c.r + 2;
    px(2, 0, 60, 88, INK); px(0, 2, 64, 84, INK); px(2, 2, 60, 84, PAPER); px(2, 85, 60, 1, SHADE); px(61, 2, 1, 83, SHADE);
    // corner index: rank over suit, and the same upside down in the far corner
    // the far corner is the near one turned half a turn: x' = 64 - x - w, y' = 88 - y - h
    const index = (flip) => { const at = (x, y, w, h) => (flip ? [64 - x - w, 88 - y - h] : [x, y]);
      if (rk === "10") { gl(["#", "#", "#", "#", "#", "#", "#"], ...at(3, 5, 2, 14), col, 2, flip); gl(F5["0"], ...at(7, 5, 10, 14), col, 2, flip); }
      else gl(F5[rk], ...at(4, 5, 10, 14), col, 2, flip);
      gl(S5[c.s], ...at(5, 21, 10, 10), col, 2, flip); };
    index(false); index(true);
    if (c.r === 12) { // ace: one big pip, the spade dressed up
      if (c.s === 0) { for (let a = 0; a < 64; a++) { const th = a / 64 * Math.PI * 2; px(Math.round(32 + Math.cos(th) * 17), Math.round(44 + Math.sin(th) * 17), 1, 1, "#9a7030"); } }
      gl(S7[c.s], 18, 30, col, 4); return; }
    if (c.r >= 9 && c.r <= 11) { // court: framed, double headed
      const fr = c.s === 1 || c.s === 2 ? "#b3261e" : "#9a7030";
      px(16, 12, 32, 1, fr); px(16, 75, 32, 1, fr); px(16, 12, 1, 64, fr); px(47, 12, 1, 64, fr); px(18, 43, 28, 1, SHADE);
      const F = FACE[c.r], paint = (flip) => { const R = flip ? F.slice().reverse().map(r => r.split("").reverse().join("")) : F, oy = flip ? 46 : 20;
        R.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[i], x = 20 + i * 2, y = oy + j * 2; if (ch === "#") px(x, y, 2, 2, INK); if (ch === "r") px(x, y, 2, 2, col === INK ? "#b3261e" : col); if (ch === "o") px(x, y, 2, 2, PAPER); } }); };
      paint(false); paint(true); gl(S5[c.s], 19, 14, col); gl(S5[c.s], 40, 69, col, 1, true); return; }
    // pips: three columns, five rows; the lower half stands upside down
    for (const [cx, cy] of PIPS[n] || []) { const x = 20 + cx * 8, y = 24 + Math.round(cy * 12); gl(S5[c.s], x, y, col, 2, cy > 2); }
  });
  texCache.set(key, t); return t;
}
// Card faces chosen in the table's settings: "gordo" (pixel, giant index) is
// the default; the vector ones follow Bicycle decks (classic pips, jumbo
// index, half and half). Drawn once per card and cached.
const PAPER2 = "#f4ecdc", RED = "#b3261e";
const col4 = s => OPT.four === "on" ? ["#15171a", "#b3261e", "#2c62a3", "#2c7a4b"][s] : (s === 1 || s === 2 ? RED : "#15171a");
const RK = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
// vector suits, centred on (x, y), size = height
function pSuit(g, s, x, y, size, col, flip) {
  g.save(); g.translate(x, y); if (flip) g.rotate(Math.PI); const k = size / 100; g.scale(k, k); g.fillStyle = col; g.beginPath();
  if (s === 1) { g.moveTo(0, 42); g.bezierCurveTo(-60, -2, -52, -50, -24, -50); g.bezierCurveTo(-10, -50, -2, -40, 0, -30); g.bezierCurveTo(2, -40, 10, -50, 24, -50); g.bezierCurveTo(52, -50, 60, -2, 0, 42); }
  else if (s === 2) { g.moveTo(0, -50); g.quadraticCurveTo(22, -22, 40, 0); g.quadraticCurveTo(22, 22, 0, 50); g.quadraticCurveTo(-22, 22, -40, 0); g.quadraticCurveTo(-22, -22, 0, -50); }
  else if (s === 0) { g.moveTo(0, -50); g.bezierCurveTo(30, -18, 54, -6, 50, 16); g.bezierCurveTo(46, 36, 18, 38, 6, 22); g.quadraticCurveTo(8, 40, 20, 50); g.lineTo(-20, 50); g.quadraticCurveTo(-8, 40, -6, 22); g.bezierCurveTo(-18, 38, -46, 36, -50, 16); g.bezierCurveTo(-54, -6, -30, -18, 0, -50); }
  else { g.arc(0, -24, 22, 0, Math.PI * 2); g.moveTo(-22, 10); g.arc(-24, 10, 22, 0, Math.PI * 2); g.moveTo(46, 10); g.arc(24, 10, 22, 0, Math.PI * 2); g.moveTo(-6, 10); g.lineTo(6, 10); g.quadraticCurveTo(8, 38, 20, 50); g.lineTo(-20, 50); g.quadraticCurveTo(-8, 38, -6, 10); }
  g.fill(); g.restore();
}
const pBlank = (W, H, draw) => makeCanvas(W, H, draw, false);
function pFrame(g, W, H, r) {
  g.fillStyle = "#15171a"; g.beginPath(); g.roundRect(0, 0, W, H, r); g.fill();
  g.fillStyle = PAPER2; g.beginPath(); g.roundRect(W * .02, W * .02, W * .96, H - W * .04, r * .8); g.fill();
}
function pRank(g, rk, x, y, size, col, flip, font) {
  g.save(); g.translate(x, y); if (flip) g.rotate(Math.PI); g.fillStyle = col; g.font = font.replace("SIZE", size + "px"); g.textAlign = "center"; g.textBaseline = "alphabetic";
  if (rk === "10") { g.scale(.78, 1); } g.fillText(rk, 0, 0); g.restore();
}
const SERIF = "700 SIZE Georgia, 'Times New Roman', serif";
const COND = "800 SIZE 'Arial Narrow', 'Roboto Condensed', Arial, sans-serif";
// corner index: rank over suit, top-left and turned half round bottom-right
function pCorner(g, W, H, c, rs, ss, font, inset = .13) {
  const col = col4(c.s), rk = RK[c.r], x = W * inset, y = W * .05;
  pRank(g, rk, x, y + rs * .82, rs, col, false, font); pSuit(g, c.s, x, y + rs * .98 + ss * .5, ss, col, false);
  pRank(g, rk, W - x, H - y - rs * .82, rs, col, true, font); pSuit(g, c.s, W - x, H - y - rs * .98 - ss * .5, ss, col, true);
}
const PIPL = { 2: [[1,0],[1,4]], 3: [[1,0],[1,2],[1,4]], 4: [[0,0],[2,0],[0,4],[2,4]], 5: [[0,0],[2,0],[1,2],[0,4],[2,4]], 6: [[0,0],[2,0],[0,2],[2,2],[0,4],[2,4]], 7: [[0,0],[2,0],[1,1],[0,2],[2,2],[0,4],[2,4]], 8: [[0,0],[2,0],[1,1],[0,2],[2,2],[1,3],[0,4],[2,4]], 9: [[0,0],[2,0],[0,1.33],[2,1.33],[1,2],[0,2.67],[2,2.67],[0,4],[2,4]], 10: [[0,0],[2,0],[1,.67],[0,1.33],[2,1.33],[0,2.67],[2,2.67],[1,3.33],[0,4],[2,4]] };
function pCourt(g, W, H, c, font, big) {
  const col = col4(c.s), fr = c.s === 1 || c.s === 2 ? RED : "#9a7030", x0 = W * .24, y0 = H * .16, w = W * .52, h = H * .68;
  g.strokeStyle = fr; g.lineWidth = W * .02; g.strokeRect(x0, y0, w, h);
  g.fillStyle = c.s === 1 || c.s === 2 ? "rgba(179,38,30,.08)" : "rgba(154,112,48,.10)"; g.fillRect(x0, y0, w, h);
  const L = { J: "J", Q: "Q", K: "K" }[RK[c.r]];
  pRank(g, L, W / 2, H * .5 + big * .1, big, col, false, font);
  pSuit(g, c.s, W / 2, H * .5 + big * .42, big * .42, col, false);
  // crown / cap mark over the letter, like the court cards' headgear
  g.fillStyle = "#9a7030"; const cy = H * .5 - big * .78; g.beginPath();
  if (L === "K") { for (let i = 0; i < 5; i++) { const xx = W / 2 - big * .3 + i * big * .15; g.moveTo(xx - big * .05, cy + big * .14); g.lineTo(xx, cy - (i % 2 ? 0 : big * .1)); g.lineTo(xx + big * .05, cy + big * .14); } }
  else if (L === "Q") { g.arc(W / 2, cy + big * .06, big * .1, Math.PI, 0); }
  else { g.rect(W / 2 - big * .22, cy + big * .02, big * .44, big * .08); }
  g.fill();
}
// P1 Bicycle clásica: pips reales, índice de esquina, figuras enmarcadas
function protoRider(c) { return pBlank(128, 176, (g, W, H) => {
  pFrame(g, W, H, 9); pCorner(g, W, H, c, 30, 20, SERIF, .14);
  const col = col4(c.s), n = c.r + 2;
  if (c.r === 12) { if (c.s === 0) { g.strokeStyle = "#9a7030"; g.lineWidth = 2; g.beginPath(); g.arc(W / 2, H / 2, 36, 0, Math.PI * 2); g.stroke(); } pSuit(g, c.s, W / 2, H / 2, c.s === 0 ? 56 : 50, col); return; }
  if (c.r >= 9 && c.r <= 11) { pCourt(g, W, H, c, SERIF, 50); return; }
  for (const [cx, cy] of PIPL[n]) pSuit(g, c.s, 40 + cx * 24, 36 + cy * 26, 23, col, cy > 2);
}); }
// P2 Índice gigante: el número y el palo enormes, un solo palo grande al centro
function protoJumbo(c) { return pBlank(128, 176, (g, W, H) => {
  pFrame(g, W, H, 9);
  const col = col4(c.s), rk = RK[c.r];
  pRank(g, rk, 30, 52, 50, col, false, COND); pSuit(g, c.s, 30, 80, 34, col);
  pRank(g, rk, W - 30, H - 52, 50, col, true, COND); pSuit(g, c.s, W - 30, H - 80, 34, col, true);
  pSuit(g, c.s, W * .64, H * .44, 46, col);
}); }
// P3 Mitad y mitad: arriba el índice muy grande, abajo un palo grande; sin rotar nada
function protoPoker(c) { return pBlank(128, 176, (g, W, H) => {
  pFrame(g, W, H, 9);
  const col = col4(c.s), rk = RK[c.r];
  pRank(g, rk, W / 2, 78, 76, col, false, COND);
  pSuit(g, c.s, W / 2, 124, 62, col);
}); }
// P4 Pixel grueso: la estética pixel de la escena, pero con índice gigante
function protoPixel(c) { return makeCanvas(64, 88, g => {
  const px = (x, y, w, h, cc) => { g.fillStyle = cc; g.fillRect(x, y, w, h); };
  const gl = (rows, x, y, cc, s = 1) => rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === "#") px(x + i * s, y + j * s, s, s, cc); });
  const col = col4(c.s), rk = RK[c.r];
  px(2, 0, 60, 88, INK); px(0, 2, 64, 84, INK); px(2, 2, 60, 84, PAPER);
  if (rk === "10") { gl(["#","#","#","#","#","#","#"], 5, 5, col, 4); gl(F5["0"], 12, 5, col, 4); }
  else gl(F5[rk], 6, 5, col, 4);
  gl(S7[c.s], 18, 42, col, 4);
}); }

const FACES = { gordo: protoPixel, clasica: classicTex, bicycle: protoRider, jumbo: protoJumbo, mitad: protoPoker };

/** One card face (c = { r: 0..12 (2..A), s: 0..3 (S H D C) }) or the back (c = null). */
export function cardCanvas(c, opt = {}) {
  OPT = { four: opt.four === "on" || opt.four === true ? "on" : "off", back: opt.back || "carmesi", face: opt.face || "gordo" };
  return drawCard(c);
}
export const FACE_IDS = ["gordo", "pix", "clasica", "bicycle", "jumbo", "mitad"];
export const BACK_IDS = ["carmesi", "azul", "deco", "pica"];
export { RANKS, F5, S5, S7, FACE, INK, PAPER, SHADE };
