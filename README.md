# Poker Sim

Simulador multi-dispositivo de Texas Hold'em para partidas en persona. La pantalla grande corre la mesa; cada jugador conecta desde su teléfono para ver cartas privadas y actuar. Tres modos: **Presencial** (sim visual sin apuestas), **Normal** (apuestas completas) y **Torneo** (con niveles de ciegas).

> Stack: Next.js 16 (App Router) + TypeScript strict + Tailwind v4 + GSAP 3 + Firebase Firestore + Web Workers.

---

## Tabla de contenidos

1. [Visión general](#visión-general)
2. [Modos de juego](#modos-de-juego)
3. [Rutas](#rutas)
4. [Setup local](#setup-local)
5. [Configuración Firebase](#configuración-firebase)
6. [Arquitectura](#arquitectura)
7. [Modelo de datos](#modelo-de-datos-firestore)
8. [Estructura del proyecto](#estructura-del-proyecto)
9. [Convenciones de código](#convenciones-de-código)
10. [Guía de contribución](#guía-de-contribución)
11. [Checklist de estado](#checklist-de-estado)
12. [Roadmap](#roadmap)
13. [Bugs conocidos y pitfalls](#bugs-conocidos-y-pitfalls)
14. [Deployment](#deployment)

---

## Visión general

| Área           | Detalle                                                             |
| -------------- | ------------------------------------------------------------------- |
| Framework      | Next.js 16 (App Router, Turbopack)                                  |
| Lenguaje       | TypeScript strict, `import type` siempre que sea posible            |
| Estilos        | Tailwind CSS v4 con tokens en `globals.css` (`@theme inline`)       |
| Animación      | GSAP 3 + `@gsap/react`, transforms CSS 3D                           |
| Avatares       | Dicebear (estilo `lorelei`)                                         |
| Sync           | Firebase Firestore + Anonymous Auth                                 |
| Equity         | Web Worker (enumeración exacta + Monte Carlo)                       |
| Persistencia   | Firestore (rooms/lobby/holes) + localStorage (stats, history)       |
| Iconos         | Lucide únicamente — sin emojis en UI ni código                      |

---

## Modos de juego

### Presencial (`/host`)

Sim visual sin apuestas obligatorias. El host controla la mesa desde una pantalla grande.

- Sala auto-creada con código de 5 caracteres + QR
- 2 a 9 jugadores entran desde el teléfono, eligen nick y avatar
- Calles avanzan con animaciones de carta individuales (`key={dealId}` fuerza remount limpio)
- Click en cartas privadas para voltearlas — reveal por carta `[boolean, boolean]`
- **Peek privado**: el botón "Ver mis cartas" voltea localmente sin tocar la mesa
- **Reveal por carta**: botones "Carta 1" / "Carta 2" muestran cada carta independientemente al host
- Showdown evalúa la mejor mano de 7 cartas y anuncia ganador
- All-in: 1, 2, 3, 5 o N runs — playback dramático (500 ms / run, 550 ms / carta de flop, 950 ms turn/river)
- Botón Skip colapsa todos los delays
- Modal de resultados por run (board, ganador, categoría)
- Equity en vivo solo en panel lateral del host (privacidad)
- Descripciones de mano en español en tiempo real ("Trío de reyes", "Escalera al as")
- Temas de mesa, reversos y diseños de carta configurables
- Botón de salida que regresa al host sin romper la sala

### Normal (`/host/normal`)

Modo con apuestas completas: ciegas, raises, pots, side pots y timers.

- Mesa redonda estilo PokerNow: hasta 9 jugadores distribuidos uniformemente
- Self-seat siempre en slot 0 (centro inferior); los demás rotan alrededor
- Controles: Fold / Check / Call / Bet / Raise / All-in
- Presets de apuesta: 33%, ½, 75%, Bote, Max + slider exacto
- Timer con 3 fases de color: verde (>50%) → ámbar (25–50%) → rojo (<25%) → fase rojo-completo de timebank
- Timebank opcional por jugador (toggle "TB ON/OFF" en el dock)
- Toggle "sentarse fuera": auto-fold en el turno
- Joins en medio del juego: nuevos jugadores se integran al inicio de la siguiente mano
- Negociación de all-in: voto 1× / 2× / 3× / 5× — modal automático + chip flotante reabridor
- Side pots calculados automáticamente
- Config: SB, BB, ante, stack inicial, tiempo de turno, timebank
- Hand history en el HostDock (tab Historial)
- Chat panel + reactions bar
- Admin: ajustar fichas, set-all chips, kickear

### Torneo (`/host/torneo`)

Todo lo de Normal + progresión de ciegas.

- 20 niveles configurables (`TOURNAMENT_LEVELS`)
- HUD muestra nivel actual, ciegas, ante, tiempo restante
- Pause / resume del reloj
- Avance manual de nivel
- Stack inicial: 5000 chips (configurable)
- Duración de nivel: 15 min (configurable)

---

## Rutas

```
/                        Landing — crear sala o unirse
/host                    Host presencial (auto-crea sala)
/host/normal             Host modo normal
/host/torneo             Host modo torneo
/join                    Input de código (acepta ?code= query)
/play/[code]             Vista de teléfono — presencial
/play/normal/[code]      Vista de teléfono — normal/torneo
/players                 CRUD local de jugadores
```

---

## Setup local

### Prerrequisitos

- Node.js 20+
- Proyecto Firebase con Firestore + Anonymous Auth habilitados

### Instalación

```bash
npm install
cp .env.example .env.local  # (o crear manualmente, ver abajo)
npm run dev
```

Abrir `http://localhost:3000`.

### Variables de entorno

Crear `.env.local`:

```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=...
```

### Scripts

```bash
npm run dev       # dev server (turbopack)
npm run build     # build de producción (debe pasar sin errores TS)
npm run start     # sirve el build
npm run lint      # eslint
```

### Smoke test rápido

1. `npm run dev`
2. Abrir `/host` en laptop → aparece código + QR
3. Abrir `/play/CODE` en teléfono (o segunda pestaña)
4. Llenar form → host ve actualización del lobby
5. Repartir → cartas vuelan, equity se calcula

---

## Configuración Firebase

1. **Authentication** → **Sign-in method** → habilitar **Anonymous**.
2. **Firestore Database** → crear en modo test (abierto 30 días — suficiente para dev).
3. Para producción, deploy de `firestore.rules`:

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add <project-id>
   firebase deploy --only firestore:rules
   ```

   Las reglas:
   - Cualquier usuario autenticado lee metadata de sala
   - Writes de room state restringidos al host UID
   - Hole cards solo para el dueño del asiento y host
   - Cada teléfono maneja su propio lobby entry

---

## Arquitectura

### Flujo de estado (host mode)

```
useNormalGame (cliente host)
    └── escribe → normalRooms/{code}/state
                       ↓ onSnapshot
                  Otros clientes (read-only)
```

Solo el host corre la lógica del juego. Las acciones de los jugadores se publican a `pendingAction`; el host las procesa y actualiza el estado público.

```
Jugador → postPlayerAction(code, uid, action, amount)
       → normalRooms/{code}.pendingAction = { seatId, action, amount, ts }
       → host detecta pendingAction → aplica al gameState → escribe state
```

### Equity worker

`src/workers/equity.worker.ts` — Web Worker real. Hook `useEquity` debounce → postMessage → render en panel lateral del host.

- Mensajes: `equity` (odds en vivo + outs) y `run` (batch all-in)
- Preflop: 4000 trials Monte Carlo
- Flop/turn: enumeración exacta
- Reutiliza `bestHand` + `compareScore` de `handEval.ts`

### Animaciones

- `PlayingCard`: `perspective: 1200` + `transform-style: preserve-3d`. Dos `useGSAP`: deal-in al montar, flip on `faceUp` change. Reveal por carta usa tupla `[boolean, boolean]`.
- **Regla clave**: `Felt` recibe `key={state.dealId}` → nueva mano fuerza remount; calles nuevas solo montan cartas nuevas (no re-animan).
- Respetar `prefers-reduced-motion` vía `gsap.matchMedia()` al agregar tweens.

### Multi-run all-in

**Presencial**: función async imperativa `playRuns` en `PokerTable.tsx`. Loop con beats de 720 ms por carta, pulse de 1.5 s del seat ganador. Skip = `useRef`, no state (evita render cascades).

**Normal/Torneo**: loop en `useNormalGame` con `bestHand` + `compareScore` + `categoryFor`. Pot split: `floor(pot / N)` por run. Guards: `allInTriggeredHandRef` + `allInRanHandRef` keyed por `handNum` previenen loops de re-entry.

### Distribución de seats

`RoundPokerTable.tsx` distribuye N seats uniformemente sobre 9 slots fijos:

```ts
const slot = Math.round(i * MAX_SEATS / n) % MAX_SEATS;
```

Self siempre en slot 0 (centro inferior); rotación se calcula por offset.

### Timer

`SeatTimer` y `TurnTimer` usan `requestAnimationFrame`. Fases:
- Verde: >50% restante
- Ámbar: 25–50%
- Rojo: <25%
- Rojo lleno: fase de timebank tras agotar tiempo normal

### Privacidad

- Cartas privadas viven en `holes/{seatId}` (subcollection) — el teléfono solo se suscribe a su propio doc
- Equity, outs, fuerza de mano: **solo** panel lateral del host, nunca sobre la mesa
- Al agregar campo nuevo que pueda filtrar info: decidir explícitamente entre host-only o no-display

---

## Modelo de datos (Firestore)

### Modo presencial

```
rooms/{code}
  code, hostUid, createdAt
  state: { seats[], community[], burns[], deckCount, street, dealId } | null
  result: { scores, winners, category } | null
  playback: { idx, total, community } | null
  runHighlight: string[]
  theme, cardBack, cardFace

rooms/{code}/lobby/{uid}
  uid, name, seed, joinedAt

rooms/{code}/holes/{seatId}
  ownerUid, cards: [Card, Card]
```

### Modos normal y torneo

```
normalRooms/{code}
  code, hostUid, adminUid, createdAt, mode
  config: RoomConfig            // SB, BB, ante, startingStack, turnTime, timeBankInit, ...
  state: PublicNormalState | null
  pendingAction: { seatId, action, amount, ts } | null
  result: Showdown | null
  revealedHoles: Record<string, [Card, Card]> | null
  theme, cardBack, cardFace
  tournament: TournamentState | null
  locked: boolean
  pendingRebuys: Record<string, number>

normalRooms/{code}/lobby/{uid}
  uid, name, seed, joinedAt, chips, sittingOut, useTimeBank

normalRooms/{code}/holes/{seatId}
  ownerUid, cards: [Card, Card]

normalRooms/{code}/chat/{msgId}
  uid, name, seed, text, ts

normalRooms/{code}/reactions/{id}
  uid, emoji, ts

normalRooms/{code}/handHistory/{id}
  handNum, pot, winners[], category, ts

normalRooms/{code}/stackRequests/{id}
  uid, amount, status, ts
```

---

## Estructura del proyecto

```
src/
  app/
    layout.tsx
    page.tsx                  Landing
    host/
      page.tsx                Host presencial
      normal/page.tsx         Host normal
      torneo/page.tsx         Host torneo
    join/page.tsx
    play/
      [code]/page.tsx         Teléfono presencial
      normal/[code]/page.tsx  Teléfono normal/torneo
    players/page.tsx
  components/
    EquityPanel.tsx           Odds + label + outs (host-only)
    HistoryPanel.tsx
    Nav.tsx
    StatsPanel.tsx
    betting/
      AllInVoteChip.tsx       Chip flotante durante negociación
      AllInVoteModal.tsx
      BettingControls.tsx     Fold/Check/Call/Bet/Raise + presets + slider
      BettingDock.tsx         HUD compacto del jugador
      NormalConfigPanel.tsx
      TournamentConfigPanel.tsx
      TurnTimer.tsx
    cards/
      PlayingCard.tsx         3D flip, 4 face designs
    chat/
      ChatPanel.tsx
    host/
      HostDock.tsx            Tabs: Sala / Jugadores / Historial / Config / Tema
      HostNotifications.tsx
      TournamentHUD.tsx
    lobby/
      StackRequestPanel.tsx
    nav/
    players/
      Avatar.tsx, PlayerForm.tsx, PlayerList.tsx
    reactions/
      ReactionBar.tsx
    table/
      AllInModal.tsx
      CommunityRow.tsx
      DealControls.tsx
      HoleCards.tsx
      PlayerSeat.tsx
      PokerTable.tsx          Orquestador presencial
      RoundPokerTable.tsx     Mesa normal/torneo
      RunResults.tsx
      TableShell.tsx          Layout wrapper (topLeft/topCenter/bottomLeft/bottomRight/center)
    themes/
      CardBackPicker.tsx
      CardFacePicker.tsx
      TableThemePicker.tsx
    ui/
  hooks/
    useAuth.ts
    useCardBack.ts
    useChat.ts
    useEquity.ts
    useHandHistory.ts
    useHistory.ts
    useLocalStorage.ts
    useNormalGame.ts          Lógica core del modo normal/torneo
    useNormalRoom.ts
    usePlayers.ts
    useReactions.ts
    useRoom.ts
    useStats.ts
    useTimer.ts
  lib/
    betting.ts                BettingRound, getValidActions, formatChips, levels
    chat.ts
    dicebear.ts
    equity.ts
    firebase.ts               Singletons lazy de app/auth/firestore
    handEval.ts               Evaluador 7-card + categorías
    handHistory.ts
    handLabel.ts              Descripciones en español
    normalRooms.ts            Firestore helpers — normal/torneo
    poker.ts                  Deck, shuffle, deal, advance, types
    reactions.ts
    rooms.ts                  Firestore helpers — presencial
    stackRequests.ts
    storage.ts
    themes.ts                 TableThemeId, CardBackId, CardFaceId, CARD_FACES
    tournament.ts             TournamentState, TOURNAMENT_LEVELS
  workers/
    equity.worker.ts
firestore.rules
```

---

## Convenciones de código

### TypeScript

- `strict: true` siempre. No `any` salvo casos justificados con comentario `// reason: ...`
- Preferir `import type { ... }` para tipos
- Imports absolutos vía `@/` (configurado en `tsconfig.json`)

### React

- Todos los archivos UI con interactividad usan `"use client"`
- Componentes colocalizados por feature: `components/table/*`, `components/betting/*`, etc.
- Hooks en `src/hooks/`
- Actualizaciones de estado funcionales (`setX(prev => ...)`) cuando dependen del valor anterior dentro de async/effects

### Tailwind v4

- Tokens en `globals.css` con `@theme inline`
- **No hay** `tailwind.config.js`
- Sin librerías de utility extra — solo Tailwind base

### Firebase

- Helpers centralizados en `src/lib/rooms.ts` y `src/lib/normalRooms.ts`
- **No** llamar `getFirestore()` directo en componentes
- Singletons en `src/lib/firebase.ts` (lazy, client-only)
- Funnel writes: un solo `useEffect` en `PokerTable` escribe state — no escribir desde múltiples componentes

### Estilo

- **Sin emojis** en UI, código, comentarios ni commits
- Copy UI en español (intencional)
- Iconos: solo Lucide
- Bundle lean: revisar tamaño antes de agregar dep nueva

---

## Guía de contribución

### Antes de empezar

1. Fork + clone
2. `npm install`
3. Configurar `.env.local` con tu proyecto Firebase de pruebas (no usar prod)
4. `npm run dev` y verificar que el smoke test pasa

### Workflow

1. Crear branch desde `master`: `git checkout -b feat/mi-feature`
2. Hacer cambios, mantener commits atómicos
3. Verificar antes de PR:
   - `npm run build` debe pasar sin errores TS
   - `npm run lint` sin warnings nuevos
   - Smoke test manual del flujo afectado
4. Commit con formato:
   ```
   <tipo>: <descripción corta en imperativo>

   Cuerpo opcional con contexto y "por qué".
   ```
   Tipos: `feat` / `fix` / `refactor` / `docs` / `style` / `perf` / `chore`
5. Push + PR contra `master`

### Áreas amigables para primer PR

- Arreglar warnings de eslint
- Mejorar copy en español
- Agregar tests unitarios a `handEval.ts` o `betting.ts` (no hay framework configurado aún — Vitest sería ideal)
- Documentar funciones públicas en `lib/`
- Implementar un item del [roadmap](#roadmap) marcado como `easy`

### Cómo probar cambios multi-dispositivo

Sin segundo dispositivo físico:
1. Pestaña 1: `/host/normal` (logged in)
2. Pestaña 2 (incógnito): `/play/normal/CODE` con otro auth anónimo
3. Repetir para más jugadores

### CLAUDE.md

Si trabajas con asistentes AI (Cursor, Claude Code, etc.), `CLAUDE.md` en la raíz tiene reglas específicas del proyecto — invariantes de privacidad, no-dos aprendidos de bugs pasados, convenciones de animación. Leerlo antes de PRs grandes.

---

## Checklist de estado

### Modo Presencial — Completo ✓

- [x] Crear sala + QR
- [x] Lobby con avatares Dicebear
- [x] Repartir 2–9 jugadores
- [x] Avance de calles con animación
- [x] Reveal por carta independiente (`[boolean, boolean]`)
- [x] Peek privado en teléfono
- [x] Showdown con evaluación de 7 cartas
- [x] All-in run-it N times con playback dramático
- [x] Equity en vivo (host-only)
- [x] Descripciones de mano en español
- [x] Stats + historial local
- [x] Temas, reversos y faces de cartas
- [x] Botón de salida

### Modo Normal — Completo ✓

- [x] Apuestas completas (Fold/Check/Call/Bet/Raise/All-in)
- [x] Presets de apuesta (33%/½/75%/Bote/Max)
- [x] Slider de raise con `minRaise` step
- [x] Side pots
- [x] Mesa redonda con distribución uniforme
- [x] Timer con 3 fases + timebank
- [x] Toggle TB on/off por jugador
- [x] Toggle "sentarse fuera" + auto-fold
- [x] Mid-game joins
- [x] All-in voting (1/2/3/5×) con chip flotante
- [x] Hand history en HostDock
- [x] Chat + reactions
- [x] Admin: ajustar chips, set-all, kick

### Modo Torneo — Completo ✓

- [x] Todo lo de Normal
- [x] 20 niveles de ciegas
- [x] HUD con countdown
- [x] Pause/resume
- [x] Avance manual de nivel
- [x] Late registration (configurable)
- [x] Knockouts + ranking final (modelo de datos)

### Por hacer ⏳

- [ ] **Tests unitarios** — `handEval`, `betting`, `tournament` (no hay framework — sugerencia: Vitest)
- [ ] **Sonido + mute toggle** — opcional para fichas, all-in, ganador
- [ ] **Confetti en normal/torneo** — ya existe en presencial, falta wiring
- [ ] **Indicador de desconexión** por seat (presencia Firestore)
- [ ] **Stats por sala en Firestore** — actualmente solo localStorage del host
- [ ] **Spectator role** separado del host
- [ ] **Notas por seat** (host-only, localStorage)
- [ ] **Animación de chips → pot** con timeline GSAP
- [ ] **Replay de última mano** (snapshot history)
- [ ] **Rebuy flow** completo en torneo (modelo existe, UI parcial)
- [ ] **Payouts editables** en torneo
- [ ] **Pago de premios** al final del torneo
- [ ] **Auditoría de seguridad** de `firestore.rules` para modo normal/torneo
- [ ] **Manejo robusto de desconexión del host** (¿transferir host?)
- [ ] **Optimización bundle** — analizar con `next build --profile`
- [ ] **i18n** — actualmente todo hardcoded en español; framework sugerido: `next-intl`
- [ ] **PWA** — manifest + service worker para "instalar" en teléfono
- [ ] **Accesibilidad** — auditoría a11y completa (focus rings, ARIA labels)

---

## Roadmap

### Corto plazo

- Tests unitarios de lógica core (Vitest + handEval/betting)
- Wiring de confetti en normal/torneo
- Sonido con mute toggle
- Indicador de desconexión

### Medio plazo

- Stats/history por sala en Firestore
- Notas por seat (host-only)
- Animación chips → pot
- Spectator role
- Rebuy flow completo en torneo

### Largo plazo

- Replay de mano (snapshot Firestore con TTL)
- PWA instalable
- i18n
- Modo home-game persistente (sesiones recurrentes con stack tracking)
- Bot mode para llenar mesa en testing
- Estadísticas avanzadas tipo PokerTracker (VPIP, PFR, AF)

---

## Bugs conocidos y pitfalls

### No hacer

- **No** poner equity badges en seats — viola invariante de privacidad
- **No** guardar hole cards en doc público de sala
- **No** correr `gsap.from('.player-seat', ...)` con `state.community.length` como dependency — re-anima todos en cada calle
- **No** comparar `seat.status` con `'sit-out'` — el valor correcto es `'sitting-out'`
- **No** agregar campos `phase` o `allInNegotiation` a `RoomState` (presencial) — existen solo en `NormalGameState` de `betting.ts`
- **No** renderizar hole cards con `absolute -top-20 z-0` dentro de container `overflow-hidden` — quedan clipped por el felt. Renderizar como siblings con `z-40`
- **No** correr `next dev` desde dos terminales en el mismo puerto
- **No** introducir useEffect que escriba a Firestore desde múltiples componentes — single source en `PokerTable`/`useNormalGame`
- **No** crear useEffect que dependa de `playback` y llame `setPlayback` adentro — cascada de renders que crashea la tab

### Lecciones aprendidas (incidentes)

| Bug                                                | Causa                                                      | Fix                                      |
| -------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| All-in modal parpadea infinitamente                | Auto-advance re-disparaba `all-in-negotiation` tras clear  | Refs `allInTriggeredHandRef` por `handNum` |
| Seats clusterizados al fondo                       | Mapeo consecutivo de seats a slots                         | `Math.round(i * 9 / n) % 9`              |
| Run 2 invisible en RunResults                      | GSAP stagger dentro de container overflow → `opacity:0`    | CSS `animate-in` con `animationDelay` inline |
| Host page scroll inesperado                        | Nav (56px) + overflow-auto                                 | Hide Nav en `/host*` + `fixed inset-0`   |
| Cartas re-animan en cada calle                     | Tween global con `community.length` como dep               | Animación interna en `PlayingCard`       |

---

## Deployment

### Vercel (recomendado)

1. Push repo a GitHub
2. Importar en [vercel.com/new](https://vercel.com/new)
3. Settings → Environment Variables → agregar todas las `NEXT_PUBLIC_FIREBASE_*`
4. Deploy. Vercel detecta Next.js automáticamente

### Firebase Hosting (alternativa)

```bash
npm run build
firebase deploy --only hosting
```

### Reglas Firestore en producción

```bash
firebase deploy --only firestore:rules
```

---

## Recursos para contribuidores

- [Next.js App Router docs](https://nextjs.org/docs/app)
- [Tailwind v4 docs](https://tailwindcss.com/docs/v4-beta)
- [GSAP + React](https://gsap.com/resources/React)
- [Firebase Firestore](https://firebase.google.com/docs/firestore)
- [Texas Hold'em rules](https://en.wikipedia.org/wiki/Texas_hold_%27em)
- `CLAUDE.md` (raíz) — reglas específicas del proyecto para asistentes AI

---

## Licencia

Proyecto privado. Sin redistribución.
