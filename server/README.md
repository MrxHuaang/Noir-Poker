# server — authoritative poker game server (Go)

The portfolio "headline" piece: move the game loop out of the host browser into a
server clients cannot cheat. The server owns the deck, shuffles with `crypto/rand`,
deals, enforces betting rules, and pushes each seat **only its own** private hole
cards. This is how real platforms (PokerStars/GGPoker) work and is the real
anti-cheat story — today the host browser is the dealer and holds the deck.

## Status — foundation

Built this phase (stdlib only, no external deps → builds offline):

- `internal/poker`: card model (ids match the TS client, e.g. `"AS"`), `NewDeck`,
  authoritative `Shuffle` (cryptographic Fisher-Yates via `crypto/rand` with
  rejection sampling, no modulo bias), and a 7-card evaluator (`Eval5`/`Best7`)
  that mirrors `src/lib/handEval.ts` and the Rust engine so all three agree.
- `cmd/server`: minimal HTTP server (`/health`, `/debug/deal`) — placeholder for
  the WebSocket hub.
- Tests: category ordering, straight-flush > quads, parse round-trip, 52-unique
  deck, shuffle preserves the multiset, `Best7` picks the royal. Green in CI
  (`.github/workflows/server.yml`).

## Roadmap (next phases)

1. **WebSocket hub** — rooms, seats, presence; each connection authenticated with
   the Firebase ID token (same trust model as `/api/economy`).
2. **Authoritative game loop** — port `src/lib/betting.ts` server-side; the server
   advances streets, validates every action, computes side pots and showdown.
3. **Private state push** — a client receives the public table + only its own hole
   cards. No deck or opponent holes ever cross the wire (kills client-side cheats).
4. **Hosting** — containerize; run on Fly.io / Railway / a small VM. The Next app
   connects over `wss://`. Firestore/Supabase keep durable data; Redis optional for
   live table state at scale.

## Run locally

```bash
cd server
go test ./...
go run ./cmd/server   # listens on :8080 (PORT env to override)
# curl localhost:8080/health
# curl localhost:8080/debug/deal
```
