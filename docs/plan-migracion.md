# Plan de migración — modo online sobre el servidor Go

Documento de handoff para que otro agente (o dev) continúe el modo online
**server-backed**. Autosuficiente: asume cero contexto previo.

---

## 1. Qué es esto y por qué

El proyecto tiene **dos backends de juego en paralelo**:

- **Legacy** (`/play/normal`, `/host/normal`, `useNormalGame`): el navegador del
  host corre la lógica y sincroniza a Firestore. Tiene TODAS las features
  (economía/escrow, torneos, cola/espectadores, run-it-twice). **No se toca.**
- **Online server-backed** (`/play/online/[code]`, NUEVO): la lógica corre en un
  **servidor Go autoritativo** (`server/`), desplegado en Render. El cliente solo
  dibuja estado y manda acciones; el servidor reparte, valida y empuja a cada
  asiento solo sus cartas (trustless — mazo y cartas ajenas nunca salen).

La meta de la migración es llevar el modo online a paridad de features con el
legacy y luego deprecar el legacy. Hoy el online es **cash game básico** funcional.

---

## 2. Estado actual (qué YA funciona)

Servidor Go (`server/`), desplegado en `https://poker-sim-server.onrender.com`
(Render free, auto-deploy en cada merge a `master`):

- **Mano completa autoritativa**: post de ciegas, reparto, apuestas
  (fold/check/call/bet/raise/all-in con min-raise y short all-in), avance de calles
  (flop/turn/river), fold-a-uno, run-out de all-in, showdown con `Settle`
  (side pots, reparto a la mejor mano) + reveal de cartas, multi-mano con rotación
  de botón y arrastre de stacks.
- **Config por sala**: ciegas + stack inicial (mensaje `config`).
- **Auth**: verificación de idToken Firebase (RS256, sin Admin SDK) en el handshake
  WS — activa solo si `FIREBASE_PROJECT_ID` está seteado en Render (hoy OFF → las
  conexiones usan `?id=`/`?name=`).
- **Estado-al-conectar** (joiners/reconexión ven la mesa) y **fold-al-desconectar**.

Clientes que hablan el protocolo: la web (`/play/online`) y un **CLI** de terminal
(`cli/`, `npm run play -- CODE Nombre`).

### Arquitectura (capas)

```
server/
  cmd/server/main.go     HTTP: /health, /ws, /debug/deal; wire de todo
  internal/poker/        Card, NewDeck, Shuffle (crypto/rand), Eval5/Best7
  internal/game/         Betting (reglas), Settle (showdown), Room (orquesta mano)
                         protocol.go = tipos del wire (PublicState, etc.)
  internal/auth/         Verifier de idToken Firebase
  internal/hub/          Hub (rooms, Broadcast, SendTo), Handler WS, Client
  internal/session/      Manager: 1 Room por código, dispatch + fan-out
```

### Protocolo WebSocket  (`GET /ws?room=CODE&id=UID&name=NOMBRE[&token=ID_TOKEN]`)

- **Cliente → servidor**: `{"type":"start"}` (repartir),
  `{"type":"action","payload":{"action":"call","amount":0}}`,
  `{"type":"config","payload":{"sb":5,"bb":10,"stack":1000}}`.
- **Servidor → cliente**: `{"type":"state","payload":PublicState}` (broadcast: board,
  pot, phase, toAct, seats[name/chips/bet/status], winners, reveals — **sin holes**)
  y `{"type":"hole","payload":{"cards":["AS","KH"]}}` (solo al dueño).

Espejo del protocolo en el cliente: `src/hooks/useGameSocket.ts` (tipos) +
`useServerGame.ts` (identidad) + `src/components/online/ServerTable.tsx` (UI).
CLI: `cli/types.ts` + `cli/net.ts`.

---

## 3. Reglas para quien continúe (IMPORTANTE)

1. **La lógica de juego va al servidor** (`server/internal/game`) + el protocolo WS.
   El cliente SOLO renderiza estado y manda acciones. No metas reglas en el cliente.
2. **No rompas `/play/normal`** (legacy). Es independiente; sigue siendo el modo con
   todas las features hasta que el online tenga paridad.
3. **Flujo**: branch → PR → CI (`.github/workflows/server.yml` corre `go vet`/`test`/
   `build`) verde → merge. Cada merge a `master` redespliega Render.
4. **`go test` es solo CI** en esta máquina Windows: Smart App Control bloquea los
   binarios de test sin firmar (`os error 4551`). Local corre `go vet` + `go build`
   (y `go run` del binario). Verificá lógica vía CI o un cliente Node WS contra el
   binario corriendo.
5. **Mantené los 3 evaluadores en sync** (TS `src/lib/handEval.ts`, Rust `engine/`,
   Go `server/internal/poker`): si cambia el ranking de manos, cambialo en los tres.
6. Card ids son strings tipo `"AS"`, `"TD"` en todos lados (cliente, server, CLI).

---

## 4. Backlog priorizado

Cada item: objetivo · enfoque · archivos · verificación.

### P1 — Turn timer server-side
- **Objetivo**: si un jugador no actúa en N seg, auto-check (si puede) o auto-fold.
- **Enfoque**: `Betting`/`Room` ya saben de quién es el turno (`ToAct`). Agregar un
  deadline por turno en el estado público (`PublicState.deadline`), y en `session`
  un timer (goroutine/`time.AfterFunc`) por sala que aplique la acción al expirar y
  rebroadcast. Cancelar al recibir acción válida.
- **Archivos**: `server/internal/game/{room,protocol}.go`,
  `server/internal/session/manager.go`; cliente: countdown en `ServerTable`.
- **Verificación**: test de `Room` (avanzar reloj simulado), e2e: no actuar → auto-fold.

### P2 — Economía/escrow online (coins reales)
- **Objetivo**: que las mesas online usen el monedero (coins/XP) como el legacy.
- **Enfoque**: hoy `/api/economy` (Next, Admin SDK) maneja buy-in/cash-out con escrow
  en Firestore. El servidor Go NO conoce coins. Opciones: (a) el cliente hace buy-in
  vía `/api/economy` y manda el monto como stack al server; al salir, `cash-out`
  reporta el stack final del server. (b) el server llama a un endpoint Next para
  liquidar. Empezar por (a). Requiere auth ON (uid real, no nombre libre) → setear
  `FIREBASE_PROJECT_ID` en Render y que el cliente mande `?token=`.
- **Archivos**: `src/hooks/useServerGame.ts` (token), `server/internal/auth` (ya),
  `src/app/api/economy/*`, `server/internal/session` (stack inicial = buy-in).
- **Verificación**: buy-in descuenta coins; cash-out acredita el stack final; sin doble
  acuñado. Probar con el emulador o cuidado en prod.

### P3 — Lobby de salas online + reconexión robusta
- **Objetivo**: descubrir mesas online abiertas (hoy solo por compartir código);
  reconexión fluida tras dormir/cortes.
- **Enfoque**: el server expone `GET /rooms` (lista de salas con jugadores) o publica
  presencia. Lobby en la web (`/lobby` ya existe para legacy — agregar sección online
  o ruta nueva). Reconexión: el CLI ya tiene backoff (`cli/net.ts`); portar a
  `useGameSocket` (hoy reconecta solo por cambio de deps).
- **Archivos**: `server/cmd/server/main.go` + `internal/hub` (snapshot de salas),
  `src/hooks/useGameSocket.ts` (backoff), lobby UI.
- **Verificación**: abrir 2 salas, verlas listadas; matar wifi y volver → re-sync.

### P4 — Run-it-twice / negociación all-in (server)
- **Objetivo**: portar el run-it-N del legacy (`src/lib/runIt.ts`) al server.
- **Enfoque**: cuando todos están all-in, ofrecer N corridas; repartir N boards y
  dividir el pozo por corrida (ya hay `runIt.ts` como referencia de la matemática).
- **Archivos**: `server/internal/game/` (nueva lógica de run-out múltiple + Settle por
  board), protocolo (mensajes de voto/negociación), `ServerTable`.
- **Verificación**: all-in 2 jugadores → 2 corridas → pozos divididos correctamente.

### P5 — Persistir manos del server (historial/HUD)
- **Objetivo**: guardar manos jugadas online para historial + stats por jugador.
- **Enfoque**: al showdown, el server escribe la mano. Dos caminos: Firestore
  (vía un endpoint Next, reusar `normalRooms/{code}/hands` o uno nuevo) o Supabase
  Postgres (server escribe directo con service-role). Reusar `lib/handStats.aggregateHud`
  del cliente para el HUD.
- **Archivos**: `server/internal/session` (hook post-showdown), endpoint de escritura,
  UI de historial/HUD en `/play/online`.
- **Verificación**: jugar manos → aparecen en historial; stats agregadas correctas.

### P6 — Torneos + cola/espectadores (server)
- **Objetivo**: portar torneos (niveles de ciegas crecientes) y cola/espectadores.
- **Enfoque**: el más grande. `Room` con modo torneo (subir ciegas por tiempo,
  eliminar busted), `Hub` con rol espectador (recibe `state`, nunca `hole`, no puede
  `action`). Referencia legacy: `src/lib/tournament.ts`, `useQueue`, `spectators`.
- **Verificación**: torneo con blinds subiendo; espectador ve la mesa sin cartas
  ajenas ni poder actuar.

### P7 — Deprecar legacy `/play/normal`
- Cuando P2–P6 den paridad: redirigir `/play/normal` → `/play/online`, quitar
  `useNormalGame` + el sync host-authoritative a Firestore. Última etapa.

---

## 5. Verificación end-to-end (cómo probar el online hoy)

1. Server local: `cd server && go run ./cmd/server` (`:8080`).
2. `.env.local`: `NEXT_PUBLIC_GAME_WS_URL=http://localhost:8080`.
3. `npm run dev` → abrir `/play/online` en 2 pestañas (o usar el CLI:
   `npm run play -- TEST Ana` / `... Beto`). Se necesitan **2+ jugadores conectados**
   antes de repartir.
4. Repartir → cada cliente ve estado público + solo sus cartas; jugar la mano;
   showdown muestra ganador + reveals.
5. Contra prod: apuntar `NEXT_PUBLIC_GAME_WS_URL` a la URL de Render (primer hit
   puede tardar ~1 min: free tier duerme).

---

## 6. Gotchas

- **Render free duerme** ~15 min inactivo; despierta en ~1 min (cold start). OK para
  uso ocasional; no es un bug.
- **Nombres**: hoy el id WS es el uid (auth OFF → cualquier `?id=`); el nombre visible
  viaja en `?name=`. Con auth ON, el id es el uid de Firebase.
- **SAC (Windows)**: `go test` local bloqueado → CI. `go build`/`go run` del binario sí
  corren.
- **No dupliques lógica**: el evaluador de manos existe 3 veces (TS/Rust/Go) a
  propósito (cliente equity, motor WASM, server). Cambios de ranking → los tres.
- Voz/chat/reactions son **ortogonales** (por código de sala, Supabase/Firestore);
  funcionan igual en online y legacy, no dependen del servidor Go.
