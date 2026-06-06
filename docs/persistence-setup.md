# Persistence audit (F2) — finding: already durable

Goal was "move important state off host-device `localStorage` into a real backend".
On investigation, **the important state is already persisted in Firebase.** F2 as a
migration is largely unnecessary. Details below so this isn't re-litigated.

## What is already durable (Firestore)

| State | Where | How |
|-------|-------|-----|
| Per-player lifetime stats | `users/{uid}` (`gamesPlayed`, `handsPlayed`, `handsWon`, `biggestPot`, `xp`, `level`) | Server-authoritative via `recordSession` in `economyServer.ts`. Shown on `/perfil`. |
| Per-session career log | `users/{uid}/history` (capped 100) | Written by `recordSession`. |
| Per-hand history (online) | `normalRooms/{code}/hands` | `writeHandRecord` (client) at the showdown call site in `useNormalGame`; realtime via `subscribeHandHistory` → `useHandHistory`; shown in `host/normal` + `host/torneo`. |

## What is still on `localStorage` — and why that's fine

`usePlayers` / `useStats` / `useHistory` are **presencial-mode only** — the shared-screen
`/host` sim with local, account-less players. It's a local sandbox by design; there are no
accounts to tie that data to, so a backend adds no value there.

## What was done and then reverted

A Supabase Postgres slice (`player_stats`, `hand_history` tables + `supabaseAdmin` +
`handHistoryServer` + `/api/history` + `useRoomHistory`) was built before the above was
fully understood. It **duplicated** the existing Firestore systems, so it was reverted to
avoid a second source of truth. Both tables dropped (migrations
`drop_redundant_player_stats`, `drop_redundant_hand_history`).

**Kept** from that work: `verifyBearerUid` extracted into `firebaseAdmin.ts` (the economy
route now reuses it) — a genuine cleanup, not redundant. The Supabase project (`poker-sim`,
ref `fpbmrxfcrphrjwwegqsn`) stays — it backs the voice channel; env now wired.

## Write integrity — already covered

`writeHandRecord` is a **client** `addDoc` to `normalRooms/{code}/hands`, but
`firestore.rules` already gates it: `match /hands/{hId} { allow create, update, delete:
if isHost(code); }`. Only the room host can write hand rows. No hardening needed.

## If hand history is ever moved to Postgres (analytics/HUD, roadmap phase)

Do it as a **replacement** of the Firestore path (swap `writeHandRecord` /
`subscribeHandHistory` implementations), not a parallel copy. The dropped `hand_history`
schema in git history (`f2_durable_stats_and_hand_history`) is a starting point.
