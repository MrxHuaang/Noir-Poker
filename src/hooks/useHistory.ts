"use client";
import { useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage";
import type { Card } from "@/lib/poker";
import type { Category } from "@/lib/handEval";

export type HistoryEntry = {
  id: string;
  ts: number;
  players: { id: string; name: string; seed: string }[];
  community: Card[];
  winners: string[];
  category: Category;
  runIndex?: number;
  runTotal?: number;
};

const KEY = "poker-sim:history";
const CAP = 50;

export function useHistory() {
  const [history, setHistory, loaded] = useLocalStorage<HistoryEntry[]>(KEY, []);

  const record = useCallback(
    (entry: Omit<HistoryEntry, "id" | "ts">) => {
      const full: HistoryEntry = {
        ...entry,
        id: crypto.randomUUID(),
        ts: Date.now(),
      };
      setHistory((prev) => [full, ...prev].slice(0, CAP));
    },
    [setHistory],
  );

  const recordMany = useCallback(
    (entries: Omit<HistoryEntry, "id" | "ts">[]) => {
      setHistory((prev) => {
        const now = Date.now();
        const made: HistoryEntry[] = entries.map((e, i) => ({
          ...e,
          id: crypto.randomUUID(),
          ts: now + i,
        }));
        return [...made.reverse(), ...prev].slice(0, CAP);
      });
    },
    [setHistory],
  );

  const clear = useCallback(() => setHistory([]), [setHistory]);

  const purgePlayer = useCallback(
    (id: string) => {
      setHistory((prev) =>
        prev
          .map((e) => ({
            ...e,
            winners: e.winners.filter((w) => w !== id),
            players: e.players.filter((p) => p.id !== id),
          }))
          .filter((e) => e.players.length > 0),
      );
    },
    [setHistory],
  );

  return { history, record, recordMany, clear, purgePlayer, loaded };
}
