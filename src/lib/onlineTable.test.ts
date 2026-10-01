import { describe, expect, it } from "vitest";
import { adaptOnlineRuns } from "./onlineTable";

describe("adaptOnlineRuns", () => {
  it("returns null for single runs and adapts multi-run boards with winner category", () => {
    expect(adaptOnlineRuns(undefined, undefined)).toBeNull();
    expect(adaptOnlineRuns([{ board: [], pot: 0, winners: [] }], undefined)).toBeNull();

    const runs = adaptOnlineRuns(
      [
        {
          board: ["2C", "7D", "9S", "JH", "3C"],
          pot: 60,
          winners: [{ id: "p1", amount: 60 }],
        },
        {
          board: ["2C", "7D", "9S", "QD", "QS"],
          pot: 60,
          winners: [{ id: "p2", amount: 60 }],
        },
      ],
      { p1: ["AS", "AH"], p2: ["KS", "QH"] },
    );
    expect(runs).toHaveLength(2);
    expect(runs![0].winners).toEqual(["p1"]);
    expect(runs![0].category).toBe(1); // pair of aces
    expect(runs![1].category).toBe(3); // trips queens (QH + QD QS)
    expect(runs![1].community.map((c) => c.id)).toContain("QD");
  });
});
