"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Card, GameState } from "@/lib/poker";
import { wasmEquity } from "@/lib/equityWasm";

type SeatLite = {
  id: string;
  hole: [Card, Card];
  folded: boolean;
};

export type RunOne = {
  community: Card[];
  winners: string[];
  category: number;
};

type EquityState = {
  equity: Record<string, number>;
  outs: Record<string, number>;
  computing: boolean;
};

function toSeatsLite(state: GameState): SeatLite[] {
  return state.seats.map((s) => ({
    id: s.player.id,
    hole: s.hole,
    folded: s.folded,
  }));
}

function hashKey(state: GameState): string {
  const seats = state.seats
    .map(
      (s) =>
        `${s.player.id}:${s.hole[0].id}${s.hole[1].id}${s.folded ? "f" : ""}`,
    )
    .join("|");
  const com = state.community.map((c) => c.id).join(",");
  return seats + "//" + com;
}

export function useEquity(state: GameState | null) {
  const [res, setRes] = useState<EquityState>({
    equity: {},
    outs: {},
    computing: false,
  });
  const workerRef = useRef<Worker | null>(null);
  const runResolverRef = useRef<((runs: RunOne[]) => void) | null>(null);
  const lastKeyRef = useRef<string>("");

  useEffect(() => {
    const w = new Worker(
      new URL("../workers/equity.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = w;
    w.onmessage = (e: MessageEvent) => {
      const data = e.data as
        | { type: "equity"; equity: Record<string, number>; outs: Record<string, number> }
        | { type: "run"; runs: RunOne[] };
      if (data.type === "equity") {
        // Equity now comes from the Rust/WASM engine; the worker supplies outs.
        setRes((p) => ({ ...p, outs: data.outs }));
      } else if (data.type === "run") {
        const r = runResolverRef.current;
        runResolverRef.current = null;
        if (r) r(data.runs);
      }
    };
    return () => {
      w.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!state || !workerRef.current) {
      setRes({ equity: {}, outs: {}, computing: false });
      return;
    }
    const key = hashKey(state);
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    let aborted = false;
    const t = setTimeout(() => {
      setRes((p) => ({ ...p, computing: true }));
      // Outs come from the TS worker (off the main thread).
      workerRef.current?.postMessage({
        type: "equity",
        seats: toSeatsLite(state),
        community: state.community,
        trials: 4000,
      });
      // Equity comes from the Rust/WASM engine: exact enumeration on
      // flop/turn/river, Monte-Carlo preflop. wasmEquity returns percentages;
      // the panel contract is 0..1, so divide.
      const live = state.seats.filter((s) => !s.folded);
      if (live.length >= 2) {
        wasmEquity({
          holes: live.map((s) => [s.hole[0].id, s.hole[1].id]),
          board: state.community.map((c) => c.id),
          iters: 30_000,
        })
          .then((eq) => {
            if (aborted) return;
            const equity: Record<string, number> = {};
            live.forEach((s, i) => {
              equity[s.player.id] = (eq[i] ?? 0) / 100;
            });
            setRes((p) => ({ ...p, equity, computing: false }));
          })
          .catch(() => {
            if (!aborted) setRes((p) => ({ ...p, computing: false }));
          });
      } else {
        setRes((p) => ({ ...p, equity: {}, computing: false }));
      }
    }, 80);
    return () => {
      aborted = true;
      clearTimeout(t);
    };
  }, [state]);

  const runMany = useCallback(
    (N: number, s: GameState): Promise<RunOne[]> => {
      return new Promise((resolve) => {
        if (!workerRef.current) {
          resolve([]);
          return;
        }
        runResolverRef.current = resolve;
        workerRef.current.postMessage({
          type: "run",
          seats: toSeatsLite(s),
          community: s.community,
          N,
        });
      });
    },
    [],
  );

  return { ...res, runMany };
}
