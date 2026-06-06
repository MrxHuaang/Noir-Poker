import { describe, it, expect } from "vitest";
import { cardFromId } from "./poker";

describe("cardFromId", () => {
  it("parses a two-char id", () => {
    expect(cardFromId("AS")).toEqual({ rank: "A", suit: "S", id: "AS" });
  });
  it("parses a ten (T)", () => {
    expect(cardFromId("TD")).toEqual({ rank: "T", suit: "D", id: "TD" });
  });
  it("parses every suit", () => {
    expect(cardFromId("2H")?.suit).toBe("H");
    expect(cardFromId("9C")?.suit).toBe("C");
  });
  it("returns null on bad suit", () => {
    expect(cardFromId("AX")).toBeNull();
  });
  it("returns null on bad rank", () => {
    expect(cardFromId("1S")).toBeNull();
  });
  it("returns null on too-short / empty input", () => {
    expect(cardFromId("A")).toBeNull();
    expect(cardFromId("")).toBeNull();
  });
});
