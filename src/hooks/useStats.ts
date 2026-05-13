"use client";
import { useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage";

const KEY = "poker-sim:stats";

export type Stats = Record<string, number>;

export function useStats() {
  const [stats, setStats, loaded] = useLocalStorage<Stats>(KEY, {});

  const addWins = useCallback(
    (ids: string[]) => {
      setStats((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = (next[id] || 0) + 1;
        return next;
      });
    },
    [setStats],
  );

  const reset = useCallback(() => setStats({}), [setStats]);
  const removePlayer = useCallback(
    (id: string) => {
      setStats((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [setStats],
  );

  return { stats, addWins, reset, removePlayer, loaded };
}
