# poker_engine — Rust → WASM equity engine

Texas Hold'em hand evaluator + equity calculator, compiled to WebAssembly. The
portfolio "depth" piece: CPU-bound combinatorics in Rust instead of the TS
Monte-Carlo worker.

## What it does

- 7-card hand evaluator (best 5 of 7), a faithful Rust port of `src/lib/handEval.ts`.
- Equity calculator:
  - **Exact enumeration** when ≤ 2 board cards are missing (turn/river) — every
    runout, no sampling error.
  - **Monte-Carlo** otherwise (preflop/flop), with a deterministic xorshift PRNG
    (reproducible, no `getrandom`/`rand` dependency).
- One WASM export, JSON in / JSON out:
  ```
  equity_json('{"holes":[["AS","KS"],["7H","7D"]],"board":["2C","9D","JS"],"iters":100000,"seed":1}')
  // -> [{"equity":61.23},{"equity":38.77}]
  ```

## Status

- Logic verified: `cargo test` passes (category ordering, straight-flush > quads,
  exact equity sums to 100 with AA > KK, AA vs KK preflop ≈ 82%).
- WASM artifact: built in CI (`.github/workflows/engine.yml`, Linux) and uploaded
  as `poker-engine-wasm`. **Not yet wired into the Next app** — that step replaces
  the `useEquity` TS worker with this package.

## Building locally (Windows gotcha)

Two environment issues on the dev machine, both avoided by CI:

1. **OneDrive**: cargo cannot execute build-script binaries written under a
   OneDrive-synced folder (Windows App Control, `os error 4551`). Set the target
   dir outside OneDrive:
   ```powershell
   $env:CARGO_TARGET_DIR = "$env:LOCALAPPDATA\poker-engine-target"
   cargo test            # passes
   ```
2. **Smart App Control** may still block freshly-compiled build-script exes
   non-deterministically, which can break `wasm-pack build` locally. CI (Linux)
   has no such policy, so the canonical WASM build runs there. Disabling Smart App
   Control is irreversible and reduces protection — not recommended; use CI.

Build (where the toolchain is unrestricted):
```bash
cargo test
wasm-pack build --target web --out-dir pkg
```

## Next step — wiring into the app

Replace `src/workers/equity.worker.ts` math (or `useEquity`) with calls into the
WASM `equity_json`. Load the package from `engine/pkg` (or a CI artifact). Keep the
TS path as a fallback if WASM init fails.
