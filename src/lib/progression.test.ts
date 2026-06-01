import { describe, it, expect } from "vitest";
import {
  MAX_LEVEL,
  addXp,
  levelFromXp,
  levelProgress,
  sessionXp,
  titleForLevel,
  totalXpForLevel,
} from "./progression";

describe("progression", () => {
  it("level 1 needs 0 xp", () => {
    expect(totalXpForLevel(1)).toBe(0);
    expect(levelFromXp(0)).toBe(1);
  });

  it("xp curve is strictly increasing across levels", () => {
    for (let n = 2; n <= MAX_LEVEL; n++) {
      expect(totalXpForLevel(n)).toBeGreaterThan(totalXpForLevel(n - 1));
    }
  });

  it("levelFromXp saturates at MAX_LEVEL", () => {
    expect(levelFromXp(Number.MAX_SAFE_INTEGER)).toBe(MAX_LEVEL);
  });

  it("levelFromXp is monotonic", () => {
    let prev = 1;
    for (let xp = 0; xp < 200_000; xp += 137) {
      const lvl = levelFromXp(xp);
      expect(lvl).toBeGreaterThanOrEqual(prev);
      prev = lvl;
    }
  });

  it("titles unlock by threshold", () => {
    expect(titleForLevel(1)).toBe("Peon");
    expect(titleForLevel(10)).toBe("Timador");
    expect(titleForLevel(49)).toBe("Capo");
    expect(titleForLevel(50)).toBe("Verdugo");
    expect(titleForLevel(100)).toBe("Noir");
  });

  it("addXp recomputes level and title", () => {
    const base = { xp: 0, level: 1, title: "Peon" };
    const big = totalXpForLevel(10);
    const r = addXp(base, big);
    expect(r.level).toBe(10);
    expect(r.title).toBe("Timador");
    expect(r.xp).toBe(big);
  });

  it("addXp never decreases xp on negative amount", () => {
    const r = addXp({ xp: 500, level: 1, title: "Peon" }, -100);
    expect(r.xp).toBe(500);
  });

  it("levelProgress ratio is within [0,1]", () => {
    for (const xp of [0, 50, 1000, 9999, 500000]) {
      const p = levelProgress(xp);
      expect(p.ratio).toBeGreaterThanOrEqual(0);
      expect(p.ratio).toBeLessThanOrEqual(1);
    }
    expect(levelProgress(Number.MAX_SAFE_INTEGER).isMax).toBe(true);
  });

  it("sessionXp rewards volume over winning", () => {
    // 10 manos sin ganar vs 1 mano ganada: el volumen domina.
    expect(sessionXp(10, 0)).toBeGreaterThan(sessionXp(1, 1));
  });
});
