# CLAUDE.md

Project-specific guidance for working in this codebase. Read alongside the global agent notes.

## Project snapshot

Texas Hold'em club to play with friends, each from their own device: open tables (cash game, with or without coins) and sit-and-go tournaments, on a pixel-art 3D table. The old presencial mode (TV table + phones, no betting) was removed; the legacy host-run normal/tournament rooms still exist.

**Stack**: Next.js 16 (App Router, Turbopack), TS, Tailwind v4, GSAP 3, Firebase Firestore + Anonymous Auth, Web Worker for equity. **Rust→WASM** equity engine (`engine/`, powers the host equity panel). **Serverless authoritative online backend in TypeScript** (`src/lib/online/` + `/api/online`, Firestore transactions). There is no separate game server: the old Go/Render server was removed.

## Noir 1929 redesign (the direction for every new screen)

The app is being redesigned as a **game, not a website**: a 1929 speakeasy
card room in pixel-art 3D (mood: Mouse P.I. for Hire). Screens migrate one at
a time. Done: the landing (`/`), the club panel (`/jugar`) and the online table
(`/play/online/[code]`). Next: profile (`/perfil`), chat/voice/options panels at the table.

- **Everything is custom, like in a videogame.** No generic web chrome: no
  rounded pills, no rounded boxes or cards, no default rounded buttons or
  inputs, no glass panels, no `rounded-* border bg-*/10` controls. Every control
  is an object from the room. Use the material components in
  `src/app/noir.css`:
  - `.tk` ticket stub (primary action), `.tk-red`, `.tk-sm`
  - `.btn-brass` bevelled brass plate (secondary action)
  - `.plate` riveted plate (dialogs)
  - `.scrap` torn paper (speech lines, notes)
  - `.slot-input` sunk ledger slot (fields)
  - `.stencil` display type, `.kick` pixel labels

  A new control is designed as a thing (ticket, chip, stamp, matchbook, brass,
  paper), never as a rounded rectangle with a border.
- **One font per surface.** A menu, modal, plate or settings panel uses ONE
  family throughout: never mix pixel (`font-pix`) and plain text in the same
  place. Anything that is read rather than admired (menus, house rules,
  ledgers, table plates) goes in the plain sans: wrap it in `.legible`
  (`noir.css`, unlayered so it beats the component classes and `font-*`
  utilities inside it). Stencil/pixel stay for display and printed tags.
- **Decorative characters never cover information.** Landing cameos
  (`Cameo`, `Walker` in `components/landing/Cameo.tsx`) have no speech
  scraps and sit at `z-[1]` behind the sections (`relative z-[2]`); give them
  their own gap (section padding) instead of overlapping content. Scene acts:
  `cameo&act=walk` (crosses a strip, legs swing from hip pivots) and
  `act=fall`.
- **Rank emblems are pixel art painted in code** (`src/lib/pixelEmblem.ts`,
  pure, 8 animated frames per tier; `RankEmblem` flips frames on one shared
  ticker). Ornament grows with the rank (iron, bronze, steel, gold with rays,
  wings, fire, crown). The rank ladder (`RankLadder.tsx`) is a pinned scene:
  Landing.tsx sets `--p` and `data-state` on every `[data-i]` from the scroll.
- **Landing entries lead somewhere real**: every entry goes through the login
  door to the club panel on the right pane, `/jugar?p=open|tourney|code|list`.
- **Almost no HUD.** Information lives in the world, so the player feels
  seated there:
  - seat cards are worn paper cards with bullet holes
  - bets and pot are bare numbers chalked on the felt
  - the dealer (Horacio) speaks on torn scraps
  - the turn clock is a cigarette on the ashtray

  No floating panels over the table. The privacy invariants below still apply:
  derived info stays in a host-only sidebar.
- **Tokens:** `src/app/noir.css` `@theme` holds these, mirrored in
  `src/lib/brand.ts` (`NOIR`). Keep them in sync.
  - Colours: `soot-*`, `paper*`, `card`, `tungsten-*` (light, turn, emphasis), `blood-*` (pressure, primary), `brass-*` (secondary).
  - Fonts: `font-stencil`, `font-shoulders`, `font-pix`.

  Redesigned screens use these tokens. The violet `accent-*` system below
  only serves screens not migrated yet.
- **3D scene:** `public/noir/scene.html`, using three.js from a CDN importmap.
  It is embedded in iframes through `sceneUrl()` in `src/lib/noirCast.ts`.
  - Modes: `door`, `embed`, `cameo&id=&turn=`, `lineup`, `select`, `table`, `remote`. Optional `pan` shifts the table sideways, `lift` raises it (room for the action rail).
  - **`remote` is the real table**: a dumb renderer. `NoirTable` (`src/components/noir/`) posts `{snap}` messages built by the pure adapter `src/lib/noirScene.ts` (tested) from the public state + own hole cards; the scene diffs consecutive snapshots and animates (deal, chips, board, all-in in the dark, winners). No rules in the scene, no rules in the adapter.
  - Messages: `{knock}`, `{snap}`, `{cam}`, `{sound}` go to the scene; `{sceneReady: mode}`, `{chosen: castId}` (select mode) come back. Always post and check `location.origin`.
  - The player's character is stored in the profile `avatarSeed` as `cast:<id>` (`seedForCast` / `castFromSeed` in `noirCast.ts`); old seeds map to a stable character.
  - Same-origin framing is allowed only for `/noir/*` (`next.config.ts` headers). Everything else stays `frame-ancestors 'none'`.
  - `prototypes/` is the archived prototype source; edit `public/noir/` now.
  - Cast ids in `noirCast.ts` are stable (stored in profiles); names may change.
- **Motion:**
  - Entrances are CSS transitions (`[data-group]` + `[data-reveal]`, armed by an IntersectionObserver).
  - GSAP is only for scroll-scrubbed work.
  - In `useGSAP`, always `return () => mm.revert()` for a `gsap.matchMedia()`. Under StrictMode the double mount otherwise leaves `from()` tweens ending at opacity 0.
  - Reduced motion **calms, never freezes**: fades instead of slides, parallax at about a third. Many Windows users have animations off without knowing, and a frozen page reads as broken.

## Two backends — pick the right one

- **Legacy host-authoritative mode** (`/play/normal`, `/host/normal`, `useNormalGame`): the host browser runs the game and syncs to Firestore. Has the full feature set (economy/escrow, tournaments, queue/spectators, run-it-twice). UNCHANGED — keep it working.
- **Server-backed online mode** (`/play/online/[code]`): authoritative and trustless WITHOUT a long-lived server. Every move is `POST /api/online` (verified Firebase ID token), which runs ONE Firestore transaction: load the pure engine state (`onlineRooms/{code}/private/engine`, closed to clients), apply the move with `src/lib/online/engine.ts`, settle coins, write the public state (`onlineRooms/{code}`), private holes (`holes/{uid}`, owner-only) and a hand record per showdown (`hands/{n}`). Clients subscribe with `useOnlineGame` and render on the Noir table (`NoirTable` + `NoirActionRail`) through the pure adapter `src/lib/noirScene.ts`. Full design: `docs/plan-migracion.md`.
  - **The table deals by itself**: the owner deals the first hand, then every showdown arms a public `deadline` (`nextHandDelay`, longer after an all-in runout) and the next `tick` deals again (`autoNext`), standing up stale players first. It stops when fewer than two players have chips; the owner deals again.
  - **House rules** (`TableRules` in `protocol.ts`, `config.rules`, clamped by `normalizeRules`), set like a PokerNow room from `TableRulesForm`: ante, blind schedule (`levels`: sb/bb/ante/mins, 0 = forever; empty = fixed blinds), decision time (0 = no clock), time bank (`bankSecs`, refilled every `bankHands`), auto next hand, showdown pace, all-in runout (`runItMode`: once / **ask** / twice), reveal hands when no action is left, rabbit hunting, max seats, owner approval (`requests` + `approve`/`deny`, the buy-in is escrowed on approval), stepping away (`away`, `dealAway`), `kick`, and the session book (`ledger`). Engine defaults (`DEFAULT_RULES`) keep old rooms behaving as before; the club panel sends `CLUB_RULES` (ask on all-in, 30 s bank). Tests in `rules.test.ts`.
  - **All-in vote**: with `runItMode: "ask"` the runout pauses in `runVote` (public, 12 s clock driven by `tick`); two boards only if every player involved votes 2.
  - **All-in runout is slow on purpose** (flop turned card by card, the river squeezed open, hand labels while every hand is face up) and winners get an overhead follow spot; `nextHandDelay` budgets that time, keep both in step when changing either.
  - **Invitations are links**: `/m/{code}` redirects to the table (observer-first); the code still works as a password.
  - **Tournaments** (`config.tournament`, fixed at creation): sit-and-go. Nobody sits after the first deal, no rebuys, blinds climb from the first deal (`blindLevelSecs`, `nextBlindsAt` in the public state), the busted stand up before the next deal (`bustedOrder`), and the last player with chips wins (`tFinished`, `ranking`). With coins the chips ARE the escrowed coins, so the winner cashes out everything: winner takes all, no extra settlement. Tests in `tournament.test.ts` / `autodeal.test.ts`.
  - **No background process**: the turn clock is driven by clients calling `tick` after the public `deadline` (the server re-checks the time); disconnects are detected by presence heartbeats (`presence/{uid}`, 25 s, stale after 75 s) and pruned at the next deal / turn timeout; blind escalation is computed at deal time.
  - **Economy is atomic**: sitting down escrows the buy-in (= `startStack`) in the same transaction as the seat; standing up, being pruned or all-in settlement credits the stack in the game transaction, capped by `roomLedgers/online-{code}`. Online escrow keys are `online-{code}`. XP counts `hands` records server-side. Coin tables require a non-anonymous account.
  - **Casual mode** ("Sin fichas"): fixed at creation (`config.casual`), no coins, free rebuys, guests can sit, no XP.
  - Observer-first entry: "Sentarme" seats you or queues you when the 9-seat table is full (arrival order, auto-promotion).
- When adding online-mode features, put the rules in `src/lib/online/engine.ts` (pure, unit-tested) and the persistence in `src/lib/online/server.ts` — do NOT add game logic to the client. The web client only renders state + sends actions.

## Repo conventions

- TypeScript strict. Use type imports where possible (`import type { ... }`).
- All UI files are `"use client"` unless they have no client behaviour.
- Tailwind v4: tokens in `globals.css` via `@theme inline`. No `tailwind.config.js`.
- Lucide icons only. No emojis in UI or in source comments.
- File paths in code/edits should use absolute imports via `@/`.
- Components colocated by feature: `components/table/*`, `components/players/*`, `components/cards/*`.
- Hooks live under `src/hooks/`.
- Firestore helpers in `src/lib/rooms.ts`. Don't sprinkle direct `getFirestore()` calls in components.

## Color system (brand accent)

The visual language is **"Noir card room"** (see `DESIGN.md`): warm ink
neutrals (`ink-*`, `bone`, `line`) with a muted **violet ink accent (hue ~300)**
used sparingly for state and emphasis. There is ONE knob per layer — never
hardcode amber/gold/green/blue chrome again, and never bring back glowing
borders, gradient washes or `uppercase tracking-[...]` micro-labels.

- **Tailwind classes** → use `accent-*` utilities ONLY: `text-accent-300`,
  `bg-accent-500/10`, `ring-accent-400/40`, `shadow-accent-700/20`, etc. The
  full `--color-accent-50…950` scale lives in `globals.css` (`@theme inline`).
  Do NOT use `amber-*`, `emerald-*` (for chrome), `yellow-*`, or raw hue values.
- **JS / canvas / inline styles** (confetti, card-back gradients, chip colours)
  → import from `src/lib/brand.ts` (`ACCENT`, `accentAlpha()`). Never inline a
  hex/rgba/HSL accent literal in a component.
- **Component classes** (`.btn-primary`, `.eyebrow`, `.display`, `.field`,
  `.sheet`, `glass-*`) live in `@layer components` in `globals.css`, so Tailwind
  utilities on the same element still win (`btn-primary h-9 px-4` works).
- **To re-skin the whole app**: change the oklch hue in `globals.css` `@theme`
  AND the hex ramp in `src/lib/brand.ts`. Those two files are the single source
  of truth and MUST stay in sync.
- **Deliberately exempt** (do not force to violet): per-suit card faces
  (`neon`/`noir`/`balatro` are opt-in cosmetic styles), selectable table felt
  themes (`emerald`/`amber`/`ruby`/`sapphire` in `themes.ts`), profit/loss
  semantics (`text-emerald-400` gain / `text-rose-400` loss; on Noir screens
  gain is brass/tungsten ink and loss is `blood-*`).
- **Semantic state colors** (warnings, success/confirmation feedback): use the
  `warn-*` / `success-*` Tailwind scales (defined in `globals.css` `@theme`), NOT
  `amber-*` / `emerald-*` directly and NOT `accent-*`. They keep warn vs success
  distinguishable without borrowing felt-theme hues. Chrome is still always `accent-*`.
- **Audit before shipping a color change**: `grep -rn "amber-\|emerald-\|#fbbf24\|#34d399\|rgba(251,191,36\|rgba(180,130,40" src` should return only the exempt cases above.

## Critical files

| File                                          | What it owns                                                  |
| --------------------------------------------- | ------------------------------------------------------------- |
| `src/lib/poker.ts`                            | Deck, shuffle (Fisher-Yates + `crypto.getRandomValues`), deal, advance, types |
| `src/lib/handEval.ts`                         | 7-card best hand, category labels, ties                       |
| `src/lib/handLabel.ts`                        | Spanish hand descriptions (e.g. "Par de ases", "Escalera al rey") |
| `src/lib/rooms.ts`                            | Firestore room CRUD, lobby subcollection, hole subcollection  |
| `src/lib/firebase.ts`                         | Lazy app/auth/firestore singletons (client-only)              |
| `src/lib/brand.ts`                            | Canonical accent palette for JS/canvas/inline styles. Mirrors the `accent-*` scale in `globals.css`. |
| `src/workers/equity.worker.ts`                | Exact + MC equity, multi-run dealer                           |
| `src/components/table/RoundPokerTable.tsx`    | Betting-mode table. Seats use 10 fixed positions. Rotation via `rotationOffset` state. |
| `src/components/cards/PlayingCard.tsx`        | 3D flip card. Mount-only deal tween + flip tween on `faceUp`. |
| `src/lib/online/engine.ts`                    | Pure authoritative online engine (betting, streets, side pots, run-it-N, queue, owner). Serializable JSON state. Tests in `engine.test.ts` (incl. chip-conservation fuzz). |
| `src/lib/online/server.ts` + `/api/online`    | One Firestore transaction per move: engine + wallet settlement + public/hole/hand writes. `server-only`. |
| `src/hooks/useOnlineGame.ts` / `src/lib/online/client.ts` | Client: Firestore subscriptions, API calls, presence heartbeat, turn-clock `tick`. |
| `src/lib/noirScene.ts`                        | Pure adapter PublicState + own hole → 3D scene snapshot (chairs, positions, cards, bets, winners, all-in flag). NO game rules here. Tested. |
| `src/components/noir/`                        | `NoirTable` (scene in remote mode), `NoirActionRail` (your move), `NoirMenu` (the one dropdown), `CharacterPicker`. |
| `src/app/jugar/page.tsx`                      | The club panel: character, quick table, open a table, tournament, join by code, open tables. |
| `src/lib/onlineTable.ts`                      | Legacy adapter for the rich table (still used by run-it-N results). NO game rules here. |
| `src/app/play/online/`                        | Observer-first online table page (`[code]`); the bare route redirects to `/jugar`. |
| `src/lib/economyServer.ts` + `/api/economy`   | Server-authoritative wallet/XP. Normal-mode cash-out reads the host's stack (live seat or `lobby.chips`) and removes the player from the lobby; buy-in can create the stack request atomically; refunds only unapproved requests. |
| `src/lib/showdownPayout.ts` / `src/lib/normalSeats.ts` | Pure normal-mode pot distribution and seat lifecycle (who is dealt in, detached players, voided hand after host refresh). |
| `src/hooks/useAuth.tsx`                       | Single app-wide `AuthProvider` (mounted in the root layout); `useAuth()` reads context. |
| `src/components/landing/` + `src/app/noir.css` | Noir 1929 landing (title stage over the live scene, CSS entrances) and the redesign material components/tokens. |
| `public/noir/scene.html`                      | Pixel-art three.js scene (door, live table, cameos, character select). Embedded via `sceneUrl()`. |
| `engine/`                                     | Rust→WASM equity engine; built in CI, bundled in `src/lib/engine/`, used by `useEquity`. |

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

## Equity worker

- One worker per `useEquity` lifetime.
- Two message types: `equity` and `run`. Both reuse `bestHand` + `compareScore` from `handEval.ts`.
- Preflop uses 4000 Monte Carlo trials. Tune the constant in `useEquity.ts` if needed.
- Disable computation by passing `null` to `useEquity` (e.g. during run playback) to avoid useless work.

## Build & verify

```bash
npm run build     # turbopack, must finish clean (no TS errors, no hydration warnings)
npm run dev       # http://localhost:3000 (real Firebase project)
npm run dev:emu   # Next + Firebase Emulator Suite (Auth + Firestore); `-- --port 3100` for another port
```

`dev:emu` loads this repo's `firestore.rules` into the emulator and points both
the browser SDK and the Admin SDK at it: test accounts (Auth emulator widget)
and full multi-player flows can be exercised without touching production.
If Turbopack ever spawns hundreds of `postcss.js` workers (corrupted dev
cache), kill them and delete `.next/dev`.

For live testing, the preview MCP tools work against `localhost:3000`. After edits, prefer:

1. `npm run build` to catch TS errors.
2. `preview_start` + `preview_eval` to walk a flow.

Firebase calls require a real network (or `npm run dev:emu`). The smoke test path: `/` → Entrar al club → `/jugar` → pick a character → Abrir una mesa (sin fichas) → the table opens; a second player joins by code and the hand deals and continues on its own.

## Coding style

- Don't introduce a new dependency without checking package size; this codebase keeps bundle lean.
- Prefer functional state updates (`setX(prev => ...)`) when reading prior state inside an async or effect.
- Avoid useEffects that write to Firestore from multiple components — single source of truth lives in `PokerTable`.
- No emojis in code, comments, UI strings, or commit messages. The Spanish UI copy is intentional; keep it.

## Canal de voz

Voz P2P entre jugadores sentados en la mesa online (`/play/online/[code]`). WebRTC + señalización Supabase Realtime.

- `src/hooks/useVoiceWebRTC.ts` — peer connections. **No tocar** la lógica de glare (uid mayor inicia oferta), el cleanup por `peerUidsKey`, ni el effect race-fix de móvil que agrega tracks tarde y renegocia. Están comentadas en el archivo.
- `src/hooks/useVoiceRoom.ts` — presence + broadcast `peer-state` vía Supabase. `callId` = `code` del cuarto Firestore.
- `src/components/voice/VoicePanel.tsx` — UI con opt-in (botón "Unirme a voz") + Wake Lock. **Importado en `play/online/[code]/page.tsx` con `next/dynamic({ ssr: false })`** porque usa `navigator.mediaDevices`/`RTCPeerConnection`/`AudioContext` que no existen en Node.
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
- Don't pass an inline object literal (`{ roomCode, ownersMap }`) as a `useEffect` dependency — it creates a new reference on every render and re-fires the effect continuously. Memoize the object at the call site or depend only on the primitive fields (e.g. `sync?.roomCode`).
- Don't use `el.volume = 0` to mute a remote audio element — the pipeline stays active. Use `el.muted = true` so the browser can suspend decoding and save battery.
- Don't use `dangerouslySetInnerHTML` for SVG output from third-party libraries (e.g. DiceBear). Render via `<img src={\`data:image/svg+xml,${encodeURIComponent(svg)}\`} alt="" />` instead to eliminate the XSS surface.
- Don't write CSS values in inline `style` objects with underscores instead of spaces (e.g. `"0 12px_32px"` is invalid — shadows will be silently ignored).
- Don't default boolean UI flags like `allInVoteOpen` to `true` when the safe/closed state is `false` — an inverted default causes modals to flash open on every page load.
- Don't put rounded web chrome (`rounded-*` pills, bordered rounded cards, round buttons) on Noir 1929 screens. Use the room's materials (see "Noir 1929 redesign").
- Don't gate entrance animations on JS tweens that start from `opacity: 0` (`gsap.from`) on the landing. A ScrollTrigger refresh or remount can leave content invisible. Use the CSS `[data-reveal]` system.
