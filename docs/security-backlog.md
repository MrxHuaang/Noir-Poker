# Security backlog

Items surfaced by the security audit that are **not yet done** because each needs
a product/infrastructure decision or a verification environment not available in
the session that triaged them. The bounded, locally-verifiable findings were
already fixed (see git history: `bestHand` guard, min-bet, shuffle bias, economy
zero-sum cap, fail-closed WS auth, room-owner authz, seat dedupe, origin
allow-list, ledger refund clamp, numeric validation, `/rooms` CORS, footer cache,
session-XP from authoritative hands, escrow mode tagging, legacy state-write
participation gate, lint gate).

## Open items

### SEC 1 (partial) — per-player authoritative settlement
- **Now:** cash-out is capped to the room ledger (`totalIn - totalOut`), so a
  host cannot **mint** coins. A host can still favour one player *within* a room's
  real pot (collusion), because allocation still trusts host-controlled
  `lobby.chips`.
- **Full fix:** the game server owns per-player chip state and settles directly;
  the host no longer adjudicates allocation.
- **Blocked on:** durable, server-authoritative game state (see BUG 1).

### BUG 1 — online cash-out from authoritative Go chip counts
- **Now:** online cash-out is a capped **escrow refund** (no win/loss applied);
  escrows are mode-tagged so `reconcileEscrows` no longer wrongly refunds active
  online buy-ins (BUG-N1 fixed).
- **Full fix:** the Go server exposes the player's **signed** final stack
  (HMAC with a secret shared between Go and the Next API); the client relays it;
  `cashOut` verifies the signature and settles real P/L.
- **Blocked on:** the Go server has **durable** state. Today chips live in memory
  and the free Render tier sleeps on idle, wiping stacks — tying real currency to
  that would lose coins. Do this only after server persistence lands.

### SEC-N2 — creator-bound online room ownership
- **Now:** room owner = first non-spectator to connect (reassigned if they leave).
  Authority is inferred from connection order, not identity.
- **Full fix:** create online rooms through an authenticated API that stores
  `ownerUid`; the Go server verifies the owner from that record (or a signed room
  token) instead of connection order.
- **Blocked on:** an authenticated room-creation endpoint + a way for the Go
  server to read/verify it.

### SEC 5 (partial) — Firebase token in the WS URL
- **Now:** origin allow-list is supported; `InsecureSkipVerify` is dev-only. The
  Firebase ID token is still passed as a `?token=` query param. The socket is
  `wss://` (TLS), so the token is encrypted in transit; residual risk is
  server/proxy access logs and browser history capturing the query string.
- **Full fix:** move auth out of the URL — either first-frame auth (connect, then
  send `{type:"auth",token}` as the first frame before joining) or a short-lived
  WS ticket exchanged over HTTPS. Restrict accepted origins in production.
- **Blocked on:** a Go handshake change that needs integration testing (a live WS
  auth round-trip), not just a compile check.

## Verification environment notes

- **Go tests can't run on this Windows host.** Smart App Control blocks execution
  of the freshly built test binaries (`os error 4551`) — the same block that
  stops `cargo test`. `go build ./...` **does** work, so server changes can be
  **compile-checked** locally; functional tests run in CI
  (`.github/workflows/server.yml`). To run Go tests locally you'd have to disable
  Smart App Control (a system security tradeoff — not recommended for this host).
- **Firestore rules** changes (`firestore.rules`) take effect only after
  `firebase deploy --only firestore:rules`; verify against the emulator first.
