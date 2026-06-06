# server — authoritative poker game server (Go)

The portfolio "headline" piece: move the game loop out of the host browser into a
server clients cannot cheat. The server owns the deck, shuffles with `crypto/rand`,
deals, enforces betting rules, and pushes each seat **only its own** private hole
cards. This is how real platforms (PokerStars/GGPoker) work and is the real
anti-cheat story — today the host browser is the dealer and holds the deck.

## Status — runs a full hand, live

A complete authoritative hand runs server-side and is **deployed on Render**.
Layers:

- `internal/poker`: card model (ids match the TS client, e.g. `"AS"`), `NewDeck`,
  cryptographic `Shuffle` (`crypto/rand` Fisher-Yates, rejection sampling), and a
  7-card evaluator (`Eval5`/`Best7`) that mirrors `src/lib/handEval.ts` and the Rust
  engine so all three agree.
- `internal/game`: the authoritative engine — `Betting` (port of `betting.ts`:
  fold/check/call/bet/raise/all-in, min-raise, side pots), `Settle` (showdown payout
  by best hand), and `Room` (blinds, deal, street advance, fold-to-one, all-in
  run-out, showdown + reveal, multi-hand button rotation, per-room config).
- `internal/auth`: verifies Firebase ID tokens (RS256 vs Google certs) without the
  Admin SDK — used to gate the WS handshake when `FIREBASE_PROJECT_ID` is set.
- `internal/hub`: thread-safe rooms + `coder/websocket` handler; `SendTo` for
  private frames; `onJoin`/`onLeave` for state-on-connect and fold-on-disconnect.
- `internal/session`: wires hub ↔ game — one `Room` per code, dispatches messages,
  fans out public state to all + private holes to each owner.
- `cmd/server`: HTTP (`/health`, `/debug/deal`, `/ws`).

Tests green in CI (`.github/workflows/server.yml`); `go test` is CI-only on Windows
(Smart App Control blocks unsigned local test binaries).

## Message protocol

Client → server (JSON): `{"type":"start"}` (deal next hand), `{"type":"action",
"payload":{"action":"call","amount":0}}`, `{"type":"config","payload":{"sb":5,
"bb":10,"stack":1000}}`.

Server → client: `{"type":"state","payload":PublicState}` broadcast (board, pot,
phase, toAct, seats with name/chips/bet/status, winners, reveals — **never holes**)
and `{"type":"hole","payload":{"cards":["AS","KH"]}}` sent only to its owner.

Clients: the web app (`src/hooks/useGameSocket.ts` → `/play/online`) and the
terminal client (`cli/`) speak this same protocol against one server.

## Run locally

```bash
cd server
go test ./...
go run ./cmd/server   # listens on :8080 (PORT env to override)
# curl localhost:8080/health
```

Then point the web app at it and open the demo:
```
# .env.local
NEXT_PUBLIC_GAME_WS_URL=http://localhost:8080
```
Open `/server-demo` in two browser tabs (same room code, different names) →
"Repartir mano" → each tab sees the public state + only its own hole cards.

## Deploy (free, no credit card) — Render

`render.yaml` (repo root) is a Render Blueprint. On render.com: New → Blueprint →
pick this repo → it builds `server/Dockerfile` on the free plan. Free web services
sleep after ~15 min idle and wake on the next request (~1 min cold start) — fine
for occasional games; WebSockets are supported. Then set in Vercel:
`NEXT_PUBLIC_GAME_WS_URL = https://<your-service>.onrender.com` and redeploy.

Optional auth: set `FIREBASE_PROJECT_ID` in the Render dashboard to require a
Firebase ID token on the WS handshake (else it's dev-open).
