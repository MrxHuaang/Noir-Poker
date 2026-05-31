# CLAUDE.md

Project-specific guidance for working in this codebase. Read alongside the global agent notes.

## Project snapshot

Multi-device Texas Hold'em simulator. Big screen runs the table, phones see private hole cards. No betting — visual sim with showdown, equity, all-in run-it-N-times, history, stats.

**Stack**: Next.js 16 (App Router, Turbopack), TS, Tailwind v4, GSAP 3, Firebase Firestore + Anonymous Auth, Web Worker for equity.

## Repo conventions

- TypeScript strict. Use type imports where possible (`import type { ... }`).
- All UI files are `"use client"` unless they have no client behaviour.
- Tailwind v4: tokens in `globals.css` via `@theme inline`. No `tailwind.config.js`.
- Lucide icons only. No emojis in UI or in source comments.
- File paths in code/edits should use absolute imports via `@/`.
- Components colocated by feature: `components/table/*`, `components/players/*`, `components/cards/*`.
- Hooks live under `src/hooks/`.
- Firestore helpers in `src/lib/rooms.ts`. Don't sprinkle direct `getFirestore()` calls in components.

## Critical files

| File                                          | What it owns                                                  |
| --------------------------------------------- | ------------------------------------------------------------- |
| `src/lib/poker.ts`                            | Deck, shuffle (Fisher-Yates + `crypto.getRandomValues`), deal, advance, types |
| `src/lib/handEval.ts`                         | 7-card best hand, category labels, ties                       |
| `src/lib/handLabel.ts`                        | Spanish hand descriptions (e.g. "Par de ases", "Escalera al rey") |
| `src/lib/rooms.ts`                            | Firestore room CRUD, lobby subcollection, hole subcollection  |
| `src/lib/firebase.ts`                         | Lazy app/auth/firestore singletons (client-only)              |
| `src/workers/equity.worker.ts`                | Exact + MC equity, multi-run dealer                           |
| `src/components/table/PokerTable.tsx`         | Orchestrator. Accepts `sync` + `playersOverride` for host mode |
| `src/components/table/RoundPokerTable.tsx`    | Betting-mode table. Seats use 10 fixed positions. Rotation via `rotationOffset` state. |
| `src/components/cards/PlayingCard.tsx`        | 3D flip card. Mount-only deal tween + flip tween on `faceUp`. |
| `src/app/host/page.tsx`                       | Auto-creates room, subscribes lobby, mounts host PokerTable   |
| `src/app/play/[code]/page.tsx`                | Phone: lobby form, then private game view                     |

## Animation rules

- `useGSAP` for any GSAP tween. Always pass `scope`. Use empty `dependencies: []` for mount-only.
- `PlayingCard` animates itself; do NOT add table-wide `gsap.from('.community-slot', ...)` again — caused the "everything re-animates on each street" bug.
- `Felt` receives `key={state.dealId}` so a new deal forces remount of every card. Changing `state.community` only mounts new cards.
- Respect `prefers-reduced-motion` via `gsap.matchMedia()` when adding new tweens.

## Privacy invariants

- Equity, hand strength, outs, and other derived info must NEVER render on a seat directly. Always in a sidebar panel labelled as host-only.
- Hole cards live in `rooms/{code}/holes/{seatId}`. The seat owner UID is set at deal time. Phones subscribe to their own hole doc only.
- When adding a new field that could leak information, decide explicitly: host-only sidebar, or no display.

## Firestore data model

```
rooms/{code}
  code, hostUid, createdAt
  state: RoomState | null
  result, playback, runHighlight

rooms/{code}/lobby/{uid}    public seat list with name + seed (before deal)
rooms/{code}/holes/{seatId} private hole cards, ownerUid scoped
```

`firestore.rules` in repo root holds the production policy. Test mode (open for 30 days) is fine for dev.

## State sync (host mode)

`PokerTable` runs the game locally for the host. A single `useEffect` watches `[state, result, playback, runHighlight]` and writes a snapshot to Firestore:

- If `state.dealId` changed → `writeDealedRoom` (batch: room state + hole subdocs).
- Else → `patchRoom` with public state projection.

Don't add ad-hoc writes elsewhere. Funnel through this effect.

## Equity worker

- One worker per `useEquity` lifetime.
- Two message types: `equity` and `run`. Both reuse `bestHand` + `compareScore` from `handEval.ts`.
- Preflop uses 4000 Monte Carlo trials. Tune the constant in `useEquity.ts` if needed.
- Disable computation by passing `null` to `useEquity` (e.g. during run playback) to avoid useless work.

## Multi-run all-in playback

Driver is an imperative async function `playRuns` in `PokerTable.tsx`. Do NOT replace with a `useEffect`-driven state machine — the earlier version caused page crashes from render cascades. Skip flag is a `useRef`, not state.

Timing (non-skip): 500 ms between runs, 550 ms per flop card, 950 ms for turn/river. These create a dramatic build-up — do not collapse them without checking that the experience still feels suspenseful.

## Local persistence

- `usePlayers` → `poker-sim:players`
- `useStats` → `poker-sim:stats`
- `useHistory` → `poker-sim:history` (capped at 50, drop oldest)

These are host-device-local. The roadmap item is to migrate per-room stats/history into Firestore subcollections.

## Build & verify

```bash
npm run build     # turbopack, must finish clean (no TS errors, no hydration warnings)
npm run dev       # http://localhost:3000
```

For live testing, the preview MCP tools work against `localhost:3000`. After edits, prefer:

1. `npm run build` to catch TS errors.
2. `preview_start` + `preview_eval` to walk a flow.

Firebase calls require a real network. The smoke test path: `/host` → room code appears → `/play/CODE` → fill form → host sees lobby update.

## Coding style

- Don't introduce a new dependency without checking package size; this codebase keeps bundle lean.
- Prefer functional state updates (`setX(prev => ...)`) when reading prior state inside an async or effect.
- Avoid useEffects that write to Firestore from multiple components — single source of truth lives in `PokerTable`.
- No emojis in code, comments, UI strings, or commit messages. The Spanish UI copy is intentional; keep it.

## Canal de voz

Voz P2P entre teléfonos en `/play/[code]`. WebRTC + señalización Supabase Realtime.
NO está en `/host`: la TV no se une al canal (evita feedback con micros cercanos).

- `src/hooks/useVoiceWebRTC.ts` — peer connections. **No tocar** la lógica de glare (uid mayor inicia oferta), el cleanup por `peerUidsKey`, ni el effect race-fix de móvil que agrega tracks tarde y renegocia. Están comentadas en el archivo.
- `src/hooks/useVoiceRoom.ts` — presence + broadcast `peer-state` vía Supabase. `callId` = `code` del cuarto Firestore.
- `src/components/voice/VoicePanel.tsx` — UI con opt-in (botón "Unirme a voz") + Wake Lock. **Importado en `play/[code]/page.tsx` con `next/dynamic({ ssr: false })`** porque usa `navigator.mediaDevices`/`RTCPeerConnection`/`AudioContext` que no existen en Node.
- `src/components/voice/RemoteAudio.tsx` — `<audio>` invisible por peer remoto.
- `src/hooks/useAudioLevel.ts` — analizador FFT throttled a ~12 fps (no 60) para no fundir batería con N peers.
- `src/lib/supabaseClient.ts` — cliente singleton. Supabase NO tiene tablas: solo Realtime Broadcast + Presence con anon key.

Bitrate de Opus capeado a 24 kbps via SDP munging + `sender.setParameters()` en `useVoiceWebRTC` — full-mesh con 6-10 peers saturaría redes móviles sin esto.

Setup completo: `docs/voice-setup.md`.

## Don'ts (learned from prior incidents)

- Don't write a `useEffect` that depends on a `playback` state and calls `setPlayback` from within — it cascades and crashes the tab.
- Don't run `gsap.from('.player-seat', ...)` with `state.community.length` as a dependency. It re-animates everyone on every street.
- Don't store hole cards in the public room doc.
- Don't put equity badges on the seat. Privacy invariant.
- Don't run `next dev` from two terminals at the same port. The second one will hang trying to scaffold.
- Don't render hole cards as `absolute -top-20 z-0` inside an `overflow-hidden` container — they will be clipped by the table surface. Render them outside the felt element as siblings in the `React.Fragment` and use `z-40`.
- Don't compare `seat.status` against `'sit-out'` — the correct value in `SeatStatus` is `'sitting-out'`.
- Don't add `phase` or `allInNegotiation` fields to `RoomState` (in `rooms.ts`) without also updating the `RoomDoc` type and Firestore rules. These fields exist only on `NormalGameState` in `betting.ts`.
- Don't add `Co-Authored-By: Claude` trailers to commit messages. Write commits as if the owner wrote them.
