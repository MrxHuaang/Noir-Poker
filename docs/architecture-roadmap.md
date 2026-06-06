# Architecture & feature roadmap

Strategic notes — persistence migration (F2), then the bigger question: is the
TS + Next + Firebase stack "enough", and what would make this a standout portfolio
piece. Written to be reviewed and argued with, not executed blindly.

## STATUS UPDATE (done since this was written)

- **Rust→WASM equity engine** (`engine/`): built in CI, wired into `useEquity`. DONE.
- **Authoritative Go game server** (`server/`): full hand server-side (deal →
  betting → streets → showdown + side pots + reveal), Firebase-token auth, WS hub,
  per-room config. **Deployed on Render (free).** DONE + live.
- **Server-backed online mode** (`/play/online/[code]`): trustless cash game on the
  Go server; web client + a terminal client (`cli/`) share the protocol. DONE (MVP).
- Legacy `/play/normal` (host-authoritative, full features) untouched and coexists.
- Pending on the server path: economy/escrow, tournaments, queue/spectators,
  run-it-twice (still legacy-only).

## 0. Where we are today (honest read)

The current architecture is more thoughtful than a "simple front + TS back":

- **Hole-card secrecy is already real.** `holeCrypto.ts` does owner-only RSA-OAEP:
  each device holds a private key, Firestore stores only ciphertext. The DB admin
  cannot read hole cards.
- **Economy/XP are already server-authoritative.** `/api/economy` verifies a Firebase
  ID token with the Admin SDK and ignores any client-sent uid. Coins/escrows/XP/stats
  mutate only there.
- **The table is host-authoritative.** `PokerTable` / `useNormalGame` run the game in
  the *host's browser*; the host holds the plaintext deck in memory and writes
  snapshots to Firestore. This is correct for the actual product — a shared-screen sim
  where the host device is the TV/dealer and phones are private viewers — but it is
  NOT a trustless online-poker model. A malicious host could see everyone's cards.

That last point is the fork that decides everything below.

## 1. F2 — get important state off localStorage (agreed, low-risk first step)

Today `useStats` / `useHistory` / `usePlayers` are host-device localStorage. Decision:
move durable state to a real backend. Two homes, by access pattern:

- **Per-player lifetime stats → player profile (durable, global).** Hands played, hands
  won, showdowns won, biggest pot, by-position win rate, net P/L. These belong on the
  *user account* (already server-authoritative via the economy service), NOT per room,
  so they show on `/perfil` and accumulate across rooms. Write them in the same
  server-authoritative path that already records sessions (`recordSession`).
- **Per-room hand history → room subcollection (shared, ephemeral-ish).** All seats can
  read it (agreed). `rooms/{code}/history/{handId}`. Cap + paginate.

Why split: stats are an identity/profile concern (relational, queryable, cross-room);
hand history is a room timeline (append-only, room-scoped). Forcing both into one place
is the mistake.

This is the safe first deliverable. Everything in §2–§3 is the bigger conversation.

## 2. The stack question — is TS + Next + Firebase "enough"?

Honest senior take, because this matters for the portfolio framing:

**Adding microservices or a second language for vanity is a NEGATIVE signal.** Senior
reviewers read "5 microservices + Kafka for a hobby poker app" as resume-driven
over-engineering. The impressive thing is not *that* you used Go/Rust — it's that you
reached for them exactly where the domain demands it, and left everything else simple.

Poker has two places where specialized tech is genuinely justified — and both happen to
be portfolio gold *because* they are real, not decorative:

### 2A. Authoritative real-time game server (the headline move)

Promote the game loop out of the host browser into a server the clients cannot cheat.
Server holds the deck, deals, enforces betting rules, and pushes each seat only its own
private state over WebSockets. This turns the project from "shared-screen sim" into
"trustless online poker" — the single most credible thing on a poker portfolio.

- Mirrors how real platforms work: PokerStars/GGPoker run authoritative C++ game servers,
  Redis, message brokers, on K8s/AWS; state is server-managed and pushed over WebSockets.
- It's a real security story (anti-cheat / card integrity), not a buzzword.
- Language is a real fork (see decisions). Candidates: **Go** (great realtime + concurrency
  story, new language to show range), **Elixir/Phoenix** (the canonical massively-concurrent
  realtime stack — channels/presence built in), or **Node+TS** (keep one language, ship
  fastest, least "wow").

### 2B. Equity / GTO engine in Rust → WASM (the depth move)

Replace the TS Monte-Carlo equity worker with a Rust engine compiled to WebAssembly.
Exact equity, range-vs-range, and a CFR-based GTO-lite solver. CPU-bound combinatorics is
the textbook justification for Rust, and open-source precedent exists (`wasm-postflop` is a
Rust GTO solver running in the browser via WASM). Runs client-side — no new infra — and
reads as serious systems depth. Solvers (PioSOLVER, GTO Wizard) are the hot topic in poker.

### What to deliberately NOT do

- Don't rewrite the UI/lobby/auth off Next.js — it is the right tool; replacing it is pure
  churn.
- Don't shard into many microservices. One authoritative game service + the WASM engine +
  the existing Next app is a clean, defensible topology.
- Don't add Kafka/event-sourcing for hobby scale. Mention it as "how I'd scale it", don't
  build it.

### Persistence implication

If we build the authoritative server, reconsider the DB: Firestore is great for the light
realtime lobby, but durable game data + analytics (a PokerCraft-style hand replayer & HUD)
is relational/analytical work that fits **Postgres** far better (queries, joins, aggregates).
Likely end state: Postgres for accounts/stats/hand-history + Redis for live table state +
Firestore (or drop it) for lobby presence. This is a real decision, not a default.

## 3. Feature gap vs PokerStars / GGPoker

What top platforms ship that we don't (roughly ordered by value/effort):

| Feature | Status | Notes |
|---------|--------|-------|
| Run it twice / N times | HAVE | Already a differentiator. |
| Hole-card privacy | HAVE | RSA-OAEP, strong. |
| Hand replayer | MISSING | GGPoker PokerCraft / PokerStars Replayer. High portfolio value; needs durable hand history (§1). |
| Player HUD / stats dashboard | PARTIAL | We have basic stats; no positional win-rate, VPIP/PFR, hole-card matrix. Pairs with §2B + §1. |
| Rabbit hunt | MISSING | Show the cards that *would* have come. Cheap, crowd-pleaser, and we already deal the full board internally. |
| All-in insurance | MISSING | Hedge an all-in. Fun, needs the equity engine (§2B) to price it. |
| Straddle / ante variants | MISSING | Betting-rule additions. |
| Certified RNG narrative | N/A for play-money | Real platforms certify shuffles (iTech Labs/GLI: chi-squared/diehard, billions of simulated deals). We can't certify, but a documented `crypto.getRandomValues` Fisher-Yates + a published fairness/methodology note is a strong portfolio talking point. |
| Anti-collusion / multi-account | MISSING | Only meaningful once the server is authoritative (§2A). |

Quick wins that need no new stack: **rabbit hunt**, **hand replayer** (once §1 lands),
richer **profile stats**.

## 4. Proposed phasing

1. **F2 persistence** (safe, now): profile stats server-side + room hand-history
   subcollection + Firestore rules, tested on the emulator before prod.
2. **Rabbit hunt + hand replayer + profile HUD** — features on top of F2, no new infra.
3. **Rust→WASM equity/solver** (§2B) — self-contained, high depth, no infra risk.
4. **Authoritative game server** (§2A) — the big rewrite; turns it into real online poker.
   Decide language + DB first.

Open decisions live in the chat thread (ambition level, game-server language, DB).

## Sources

- PokerStars/large-platform stack & realtime patterns — industry overviews
  (sdlccorp.com casino backend best-practices, creatiosoft multiplayer challenges).
- RNG certification — iTech Labs RNG testing; GLI/eCOGRA; chi-squared/diehard, billions of
  simulated deals.
- Rust GTO solver in WASM precedent — `wasm-postflop` (github b-inary/wasm-postflop).
- Features — GGPoker (run-it-twice/rabbit-hunt/all-in-insurance/PokerCraft), PokerStars
  rabbit-hunt rollout (pokerindustrypro).
