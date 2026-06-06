"use client";
// Client loader for the Rust -> WASM equity engine (engine/, built in CI).
// The wasm-bindgen glue + the .wasm live beside this file under
// src/lib/engine/; Turbopack bundles the .wasm as an asset and the glue's
// init() resolves it via import.meta.url. Lazy + memoized: loads once per tab.
//
// NOTE: this engine returns equities only; outs stay on the TS worker.
import init, { equity_json } from "@/lib/engine/poker_engine.js";

let ready: Promise<unknown> | null = null;

function ensureReady(): Promise<unknown> {
  if (!ready) ready = init();
  return ready;
}

export type EquityInput = {
  holes: [string, string][]; // card ids, e.g. [["AS","KS"],["7H","7D"]]
  board?: string[]; // 0..5 card ids
  iters?: number; // Monte-Carlo trials when > 2 board cards missing
  seed?: number; // PRNG seed (deterministic)
};

// Returns win equity as a percentage per hole, aligned to `holes`.
export async function wasmEquity(input: EquityInput): Promise<number[]> {
  await ensureReady();
  const payload = JSON.stringify({
    holes: input.holes,
    board: input.board ?? [],
    iters: input.iters ?? 100_000,
    seed: input.seed ?? 1,
  });
  const raw = equity_json(payload);
  const parsed = JSON.parse(raw) as { equity: number }[] | { error: string };
  if (!Array.isArray(parsed)) {
    throw new Error(parsed.error ?? "equity engine error");
  }
  return parsed.map((e) => e.equity);
}
