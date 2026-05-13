"use client";
import { useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage";
import type { Player } from "@/lib/poker";
import { randomSeed } from "@/lib/dicebear";

const KEY = "poker-sim:players";

export function usePlayers() {
  const [players, setPlayers, hydrated] = useLocalStorage<Player[]>(KEY, []);

  const add = useCallback(
    (name: string, seed?: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const p: Player = {
        id: crypto.randomUUID(),
        name: trimmed,
        seed: seed?.trim() || randomSeed(),
        createdAt: Date.now(),
      };
      setPlayers((prev) => [...prev, p]);
    },
    [setPlayers],
  );

  const update = useCallback(
    (id: string, patch: Partial<Pick<Player, "name" | "seed">>) => {
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
                ...(patch.seed !== undefined ? { seed: patch.seed.trim() } : {}),
              }
            : p,
        ),
      );
    },
    [setPlayers],
  );

  const remove = useCallback(
    (id: string) => {
      setPlayers((prev) => prev.filter((p) => p.id !== id));
    },
    [setPlayers],
  );

  return { players, add, update, remove, hydrated };
}
