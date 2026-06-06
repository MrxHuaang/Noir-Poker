import { describe, it, expect } from "vitest";
import { aggregateHud } from "./handStats";
import type { HandRecord } from "./handHistory";

function hand(p: Partial<HandRecord>): HandRecord {
  return {
    id: Math.random().toString(36),
    handNum: 1,
    winners: [],
    category: 0,
    pot: 0,
    community: [],
    ts: 0,
    dealtIds: [],
    showdownIds: [],
    ...p,
  };
}

describe("aggregateHud", () => {
  it("counts hands played per dealt id", () => {
    const rows = aggregateHud([
      hand({ dealtIds: ["a", "b"] }),
      hand({ dealtIds: ["a"] }),
    ]);
    expect(rows.find((r) => r.id === "a")?.handsPlayed).toBe(2);
    expect(rows.find((r) => r.id === "b")?.handsPlayed).toBe(1);
  });

  it("computes win% and showdown stats", () => {
    const rows = aggregateHud([
      hand({ dealtIds: ["a", "b"], showdownIds: ["a", "b"], winners: [{ id: "a", name: "A", amount: 100 }] }),
      hand({ dealtIds: ["a", "b"], showdownIds: [], winners: [{ id: "b", name: "B", amount: 50 }] }),
    ]);
    const a = rows.find((r) => r.id === "a")!;
    expect(a.handsPlayed).toBe(2);
    expect(a.handsWon).toBe(1);
    expect(a.winPct).toBe(50);
    expect(a.wentToShowdown).toBe(1);
    expect(a.wonAtShowdown).toBe(1);
    expect(a.wsdPct).toBe(100); // won 1 of 1 showdowns reached
    expect(a.wtsdPct).toBe(50); // 1 showdown / 2 played
  });

  it("sorts by hands played desc", () => {
    const rows = aggregateHud([
      hand({ dealtIds: ["x"] }),
      hand({ dealtIds: ["y"] }),
      hand({ dealtIds: ["y"] }),
    ]);
    expect(rows[0].id).toBe("y");
  });

  it("ignores rows missing the new fields without crashing", () => {
    const legacy = { id: "z1", handNum: 1, winners: [], category: 0, pot: 0, community: [], ts: 0 } as HandRecord;
    expect(aggregateHud([legacy])).toEqual([]);
  });

  it("guards divide-by-zero (no showdowns reached)", () => {
    const rows = aggregateHud([hand({ dealtIds: ["a"], showdownIds: [] })]);
    expect(rows[0].wsdPct).toBe(0);
  });
});
