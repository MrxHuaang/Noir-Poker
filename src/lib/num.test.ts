import { describe, it, expect } from "vitest";
import { clamp, clampInt } from "./num";

describe("clamp", () => {
  it("returns value inside range unchanged", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it("clamps below min", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });
  it("clamps above max", () => {
    expect(clamp(42, 0, 10)).toBe(10);
  });
  it("handles min === max", () => {
    expect(clamp(7, 4, 4)).toBe(4);
  });
});

describe("clampInt", () => {
  it("rounds then clamps", () => {
    expect(clampInt(5.6, 0, 10)).toBe(6);
  });
  it("rounds before clamping at the boundary", () => {
    expect(clampInt(10.4, 0, 10)).toBe(10);
  });
  it("clamps a rounded value below min", () => {
    expect(clampInt(-0.4, 1, 10)).toBe(1);
  });
});
