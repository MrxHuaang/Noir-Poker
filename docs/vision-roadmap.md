# Noir Poker — Brief de producto y plan de trabajo para Claude Code

> **Qué es este documento.** Un brief de trabajo escrito para que un agente de
> código (Claude Code) tenga contexto completo y pueda **mejorar la UX e implementar
> features** sin supervisión constante. No es un documento de reflexión: es una
> especificación exigente. Define la visión, las reglas que no se rompen, el estado
> real del proyecto, un benchmark contra PokerStars y GGPoker, la estrategia de
> backend, y un roadmap de épicas con criterios de aceptación concretos.
>
> **Cómo usarlo, Claude Code.** Lee las secciones 1–5 completas antes de tocar nada
> (visión, reglas de oro, modos, política de dispositivos, estrategia de backend).
> Luego trabaja por épicas en el orden de la sección 7. Cada épica trae objetivo, por
> qué, alcance, archivos probables, criterios de aceptación y un "fuera de alcance"
> explícito. No mezcles épicas. Abre una rama por épica, corre el gate de calidad de
> la sección 10 antes de dar nada por hecho, y actualiza la bitácora (sección 12)
> cuando tomes una decisión de diseño.

Última revisión: 2026-06-06.
Documentos hermanos: `CLAUDE.md` (reglas del repo, fuente de verdad técnica),
`README.md`, `CONTRIBUTING.md`, `docs/plan-migracion.md` (backlog del servidor Go),
`docs/architecture-roadmap.md`, `docs/security-backlog.md`, `docs/qa-audit-2026-06-03.md`.

---

## 1. La visión, en una frase

**Noir Poker existe para que la noche de póker entre amigos sea memorable, sin
fricción y con identidad propia** — y para construir, en el camino, un backend de
juego de verdad, no un juguete. No competimos con PokerStars por dinero real;
competimos con "abramos algo rápido y juguemos". El éxito se mide en dos cosas: que el
grupo pida volver a jugar, y que la arquitectura sea sólida e interesante de mantener.

Consecuencias que guían cada decisión de diseño:

- **Es un juego de fichas de fantasía, no de dinero.** No hay que proteger un activo.
  La certificación de RNG, anti-colusión y liquidación firmada que justifica a las
  plataformas comerciales es, para nosotros, ruido. No invertir ahí.
- **Lo divertido vive en lo social y en los momentos**, no en la corrección del
  motor. El motor ya está resuelto y probado. El margen está en el chinche, la mano
  épica compartida en el chat, el ranking de la temporada, el bad beat de la noche.
- **Queremos un sistema serio.** El servidor Go autoritativo es la columna vertebral
  del proyecto y el lugar donde vive la ingeniería interesante (concurrencia, estado
  autoritativo, protocolo WebSocket, reconexión). No lo simplificamos a un backend
  trivial en el cliente. (Ver sección 5.)

---

## 2. Reglas de oro (invariantes que NO se rompen)

Estas reglas vienen de `CLAUDE.md` y de incidentes reales. Romper una es un fallo, no
una decisión de diseño. Se repiten aquí para tenerlas a mano.

**Arquitectura de juego (la regla central de este roadmap)**
- **La lógica de juego vive en el servidor Go** (`server/internal/game`) + el protocolo
  WS. El cliente web SOLO renderiza estado y manda acciones. No metas reglas de juego
  nuevas en el cliente; van al servidor.
- Mantén los evaluadores de manos en sync mientras coexistan (TS `src/lib/handEval.ts`,
  Rust `engine/`, Go `server/internal/poker`). Si cambia el ranking de manos, cámbialo
  en los tres. El destino es reducir esto a uno (ver EPIC 9), pero hasta entonces, sync.
- Card ids son strings tipo `"AS"`, `"TD"` en cliente, servidor y CLI.

**Privacidad**
- Las hole cards nunca salen del servidor hacia quien no las posee. En el modo
  server-backed el mazo y las cartas ajenas nunca abandonan el Go. En el legacy viven
  en `rooms/{code}/holes/{seatId}`, scoped por `ownerUid`.
- Equity, outs y fuerza de mano **nunca** se renderizan sobre un asiento; solo en panel
  lateral host-only. Cualquier campo nuevo que pueda filtrar info se clasifica
  explícitamente: público, host-only, owner-only o no-display.

**Estado**
- Una sola fuente de verdad por flujo. En el legacy host mode, todo embudo a través del
  `useEffect` de sync en `PokerTable`; no dispersar writes a Firestore.

**Sistema de color (marca violeta, hue ~290)**
- Chrome → solo utilidades `accent-*`. Nunca `amber-*`, `emerald-*`, `yellow-*` ni hues
  crudos para chrome.
- JS / canvas / inline → importa de `src/lib/brand.ts`. Nunca un literal de acento.
- Estados semánticos → escalas `warn-*` / `success-*`, no `accent-*` ni amber/emerald.
- Exentos: caras de carta por palo, felts seleccionables, profit/loss (emerald/rose) y
  el palette por rango de `RankTowerModal`.

**Animación**
- `useGSAP` con `scope`; `dependencies: []` para mount-only. `PlayingCard` se anima a sí
  misma. No tweens table-wide keyed a `state.community.length`. Respeta
  `prefers-reduced-motion` vía `gsap.matchMedia()`.

**Estilo y código**
- Copy visible **en español**. Iconos **solo de Lucide**. **Sin emojis** en código,
  comentarios, strings de UI ni commits. TS strict, `import type`, imports `@/`,
  componentes interactivos `"use client"`, hooks antes de cualquier `return` condicional.
- No metas dependencias pesadas sin justificar el bundle. No agregues trailer
  `Co-Authored-By: Claude` a los commits.

Lee la sección "Don'ts" de `CLAUDE.md` antes de tocar `PokerTable`, voz o el sync de
Firestore: hay trampas documentadas (cascadas de `setPlayback`, clipping de hole cards,
`'sitting-out'` vs `'sit-out'`, etc.).

---

## 3. Los tres modos de juego

| Modo | Rutas | Dónde corre | Dispositivo objetivo |
| --- | --- | --- | --- |
| **Presencial** | `/host` (pantalla grande) + `/play/[code]` (teléfonos) | Navegador del host (Firestore) | Host: PC/TV. Jugadores: **teléfono (es el punto)** |
| **Online (cash)** | `/play/online`, `/play/online/[code]` (objetivo) | **Servidor Go autoritativo** | **Solo PC** (ver sección 4) |
| **Torneo** | `/host/torneo`, `/admin/[code]` (legacy hoy; objetivo: Go) | Migrando a Go | **Solo PC** (ver sección 4) |

**El modo presencial es el corazón del producto** y se queda en el legacy
host-authoritative sobre Firestore: funciona bien, es simple, no necesita servidor, y
vive en el teléfono (tus cartas privadas en la mano, la mesa en pantalla grande). No lo
migramos a Go salvo que aparezca una razón fuerte. Debe seguir impecable en teléfono
vertical.

**Online y torneo son el dominio del servidor Go.** Es la experiencia "no estamos en la
misma sala": cada quien en su computadora, el servidor reparte y valida. Por eso aplican
la política de dispositivos de la sección 4 y la estrategia de backend de la sección 5.

> Nota: hoy existe un modo **online legacy** (`/host/normal`, `/play/normal/[code]`,
> `useNormalGame`, Firestore) con todas las features. Es el que vamos a **retirar** a
> medida que el servidor Go alcance paridad (EPIC 9). No construyas features nuevas ahí.

---

## 4. Política de dispositivos (implementar primero — EPIC 0)

### La decisión

**Los modos online y torneo solo se juegan desde computadora.** La vista vertical de
teléfono no da espacio para los controles de apuesta (slider de bet, fold/check/call/
raise, pot odds, dock de acción). Forzarlos en portrait degrada la experiencia. Si
alguien intenta entrar a un modo online/torneo desde el teléfono, le mostramos una
pantalla amable que le pide abrir el enlace en una computadora.

**El modo presencial NO se toca.** `/host` es pantalla grande por naturaleza y
`/play/[code]` es la vista de teléfono y debe seguir siendo mobile-first.

### Comportamiento esperado

Al cargar una ruta online/torneo en móvil (o viewport muy angosto), en vez de la mesa se
muestra una pantalla `DesktopOnlyGate` con:

- Mensaje cálido en español. Sugerido: *"Este modo se juega mejor en computadora. Los
  controles de apuesta no caben cómodos en la pantalla del teléfono. Abre este enlace en
  tu compu para entrar a la mesa."*
- **Código de sala** visible + botón "Copiar enlace" + un **QR del enlace** (hay
  `qrcode.react`) para pasarse el link a la compu (invirtiendo el flujo habitual).
- Puntero al presencial: *"¿Están todos en el mismo lugar? Prueben el modo presencial,
  pensado para el teléfono."* con enlace a `/host` / `/play/[code]`.
- Salida de escape discreta "Continuar de todos modos" **solo** en tablets grandes en
  horizontal; en teléfono vertical no se ofrece.

### Cómo detectar

No te bases en user-agent (frágil). Combina:
- **Viewport + orientación**: ancho `< 1024px`, o portrait con ancho `< 768px` → no apto.
- **Pointer**: `matchMedia('(pointer: coarse)')` y `(hover: none)` para confirmar táctil
  sin mouse fino.
- La salida de escape se habilita solo con `(min-width:1024px) and (orientation:landscape)`
  o pointer fino.

Implementa un hook `useDeviceClass()` (en `src/hooks/`) que devuelva
`{ isPhone, isTablet, isDesktop, coarsePointer, portrait }`, y un componente
`DesktopOnlyGate` que envuelva las rutas online/torneo. SSR-safe:
`navigator`/`matchMedia` solo en cliente, fallback que no parpadee (renderiza neutro
hasta hidratar).

### Dónde aplicar el gate

Envolver con `DesktopOnlyGate`: `/play/online`, `/play/online/[code]`, `/server-demo`,
y mientras existan en legacy: `/create`, `/lobby`, `/host/normal`, `/host/torneo`,
`/admin/[code]`, `/play/normal/[code]`.

**Caso especial `/join`:** resuelve por código el tipo de sala. En móvil, si es
**presencial** deja pasar (redirige a `/play/[code]`); si es **online/torneo** muestra el
gate. Engánchate a la lógica de tipo de sala, no al user-agent.

**No gatear:** `/`, `/host`, `/play/[code]`, `/perfil`, `/login`.

### Criterios de aceptación

- Teléfono vertical en `/play/online/CODE` → muestra el gate, no la mesa; ofrece copiar
  enlace y QR; **no** ofrece "continuar de todos modos".
- Desktop → todas las rutas online/torneo cargan normal, sin gate ni parpadeo.
- Tablet grande horizontal → aparece "continuar de todos modos".
- `/play/[code]` (presencial) sigue funcionando en teléfono vertical sin gate.
- `npm run build` limpio, sin warnings de hidratación.

### Fuera de alcance

Rediseñar los controles para vertical (descartado a propósito) o una app nativa.

---

## 5. Estrategia de backend: el servidor Go es el objetivo

### La decisión

**El servidor Go autoritativo (`server/`) es el backend estratégico de online y torneo.
Llevamos Go a paridad con el legacy y luego retiramos el legacy.** No portamos lógica de
juego al cliente; no construimos features de online/torneo en el camino legacy.

Por qué Go y no "todo simple en el cliente":
- Es la columna vertebral interesante del proyecto: estado autoritativo, concurrencia,
  protocolo WS. Es donde está la ingeniería que vale la pena.
- Da **continuidad** que el legacy no tiene: el servidor es dueño del estado, así el host
  puede cerrar la pestaña sin matar la mesa, y la reconexión es limpia.
- Trustless es un bonus (no el objetivo entre amigos), pero "el servidor reparte y
  valida" es, simplemente, mejor arquitectura que "el navegador del host es el dealer".

Mantener **dos** backends en paralelo a medias es el verdadero costo (tres evaluadores
en sync, doble superficie). La solución no es congelar Go: es **converger en Go** y
retirar el legacy de online/torneo. El presencial se queda en su camino simple (Firestore)
porque ahí el modelo host-authoritative es correcto y no necesita servidor.

El backlog técnico de la migración ya existe en `docs/plan-migracion.md` (P1–P7):
economía/escrow como fichas de fantasía, lobby + reconexión robusta, run-it-twice
negociado, persistencia de manos, torneos, cola/espectadores, y finalmente deprecar el
legacy. Ese documento es la referencia de implementación del servidor; este brief lo
prioriza y le añade contexto de producto.

### Hosting: gratis, sin dormir, sin cambiar de lenguaje

**Aclaración importante: el lenguaje no determina el costo del hosting. Go se despliega
gratis. No hay que cambiar de lenguaje.** Render no cobra (su plan free es gratis); su
problema es que **duerme tras 15 min** y arranca en frío en 30–60s — malo para una noche
casual. Quitar el sleep en Render cuesta ~US$7/mes. En 2026 la era del PaaS gratis
siempre-encendido se acabó (Fly.io quitó su free tier, Railway es trial, Koyeb quitó el
compute gratis).

Para correr el binario de Go **gratis, 24/7 y sin cold start**, en orden de preferencia:

1. **Oracle Cloud Always Free (recomendado).** VM ARM de hasta 4 vCPU / 24GB RAM gratis
   para siempre; corre el binario Go las 24h. Contras: administras la Linux box (systemd
   + TLS con Caddy/nginx), la capacidad ARM escasea en regiones populares, y Oracle puede
   cerrar cuentas free inactivas/abusivas (mitiga con infra-as-code + backups). Es la
   pieza de ops "no trivial" que encaja con la ambición del proyecto.
2. **Stopgap cero-esfuerzo:** Render free + keep-alive ping cada ~10 min a `/health`. Un
   servicio encendido todo el mes cabe en las 750 horas gratis (~744h/mes). Hacky pero
   inmediato.
3. **Auto-hospedar en casa** (Raspberry Pi / laptop vieja) + **Cloudflare Tunnel** gratis:
   sin sleep, control total, sin abrir puertos.
4. **Pagar poco** (~US$7/mes Render/Railway) si no quieres ops.

**Decisión de hosting (actual):** quedarse en **Render free + keep-alive ping** (opción
2). Es cero esfuerzo y resuelve el cold start ya: un cron externo pega a `/health` cada
~10 min para que el servicio nunca duerma; un solo servicio encendido todo el mes cabe en
las 750 horas gratis (~744h). Matiz clave: una partida activa ya mantiene el server
despierto por sí sola; el cold start solo lo sufriría el primero en abrir mesa tras 15
min de silencio total, y el ping lo elimina. **Oracle Cloud Always Free queda como ruta
de upgrade** si más adelante quieres dejar el truco y tener una VM dedicada 24/7.
Tarea concreta en EPIC 1.

---

## 6. Benchmark: qué tienen PokerStars y GGPoker que nosotros no

Inventario investigado (fuentes al final). "Veredicto" filtra por nuestra visión: amigos,
fichas de fantasía, sin adversarios. **HACER** = encaja y aporta; **QUIZÁ** = bueno si
sobra tiempo; **NO** = solo tiene sentido en póker comercial.

### Features sociales y de mesa

| Feature (origen) | Qué es | Tenemos | Veredicto |
| --- | --- | --- | --- |
| **Squeeze / Card Squeeze** (GG) | Revelar tus hole cards con un gesto lento y satisfactorio | No | **HACER** — gesto táctil perfecto para el teléfono en presencial |
| **Throwables** (PS/GG) | Lanzar objetos a otro jugador con animación | Parcial (reactions) | **HACER** — extiende `reactions.ts` |
| **Emojis sobre el avatar** (PS) | Reacciones estáticas unos segundos sobre tu seat | Parcial | **HACER** |
| **Canned chat** (PS) | Frases prehechas: "Nice hand", "Good call", "GG" | Parcial (chat) | **HACER** — chinche sin teclear |
| **SnapCam** (GG) | Clip corto de cámara (~15s) compartido en la mesa | No | **HACER** — ya hay WebRTC/voz; reusar pipeline |
| **Dance emotes / animaciones** (GG) | Celebraciones animadas | No | **QUIZÁ** |
| **Player notes / motes** (GG) | Notas y colores por jugador | No | **QUIZÁ** — versión "motes del grupo" |

### Momentos y análisis

| Feature (origen) | Qué es | Tenemos | Veredicto |
| --- | --- | --- | --- |
| **Rabbit Hunt** (PS/GG) | Ver las cartas que habrían salido tras un fold | No | **HACER** — quick win, ya repartimos el board completo |
| **Hand Replayer** (PS/GG PokerCraft) | Revivir cualquier mano paso a paso | No | **HACER** — necesita historial durable |
| **Stats dashboard** (GG PokerCraft) | P/L, matriz de hole cards, win-rate por posición | Parcial | **HACER** — versión amistosa en perfil |
| **Smart HUD (VPIP/PFR)** (GG) | Stats del rival en la mesa | Parcial | **NO en mesa** — viola privacidad; solo en perfil/post-sesión |
| **Awards / Bad Beat** | Reconocer manos notables | No | **HACER** — "premios de la noche" |

### Profundidad de juego

| Feature (origen) | Qué es | Tenemos | Veredicto |
| --- | --- | --- | --- |
| **Run it twice / N times** (RIMT) | Repartir el board N veces en all-in | **Sí** (legacy) | Portar a Go + voto/negociación por mano |
| **All-In Insurance / EV Cashout** (GG) | Cobrar el EV de un all-in | No | **HACER** — usa el motor de equity existente |
| **Straddle** | Ciega adicional opcional UTG | No | **HACER** — regla pequeña |
| **Bomb pot** | Todos ponen ante, directo al flop | No | **HACER** — caos divertido |
| **Mystery Bounty / PKO** (GG) | Recompensas por knockout, montos aleatorios | No | **HACER (torneo)** |
| **Variantes: PLO, Short Deck** (GG) | Otros juegos | No | **QUIZÁ** — esfuerzo alto (evaluadores) |
| **Spin & Gold / Flip & Go** (GG) | Lotería / dos etapas | No | **QUIZÁ** — Flip & Go arranca rápido |
| **Rush & Cash** (GG) | Fast-fold, te mueve de mesa | No | **NO** — necesita pool grande |
| **Staking, satélites, jackpots, casino** | Escala comercial | No | **NO** |
| **Certified RNG, anti-colusión, RTA ban** | Integridad comercial | N/A | **NO** — confiamos entre amigos |

### La pieza que copiar de cabeza: Home Games (clubs)

PokerStars **Home Games** y los clubs de GGPoker permiten crear un **club privado** con
código de invitación, programar partidas recurrentes, mostrar nombres reales, y llevar un
**leaderboard del club** (puntual y acumulado). **Es exactamente nuestro caso de uso** y
el concepto organizador que falta: tenemos salas por código, pero no una identidad de
grupo persistente que ate las noches. Es la EPIC 6.

---

## 7. Roadmap de épicas (orden de ejecución)

Trabaja en orden. Cada épica es autónoma y termina en verde (sección 10) antes de pasar a
la siguiente. Criterio: primero arreglar la experiencia y la infraestructura del backend
estratégico, luego paridad, luego lo divertido. Durante toda la migración, el presencial
(legacy/Firestore) sigue jugable, así que el grupo nunca se queda sin jugar.

### EPIC 0 — Política de dispositivos (gate desktop-only)
- **Objetivo:** implementar la sección 4.
- **Por qué primero:** define dónde vive cada modo; barato y arregla UX ya.
- **Archivos:** nuevo `src/hooks/useDeviceClass.ts`, nuevo
  `src/components/ui/DesktopOnlyGate.tsx`, pages de rutas online/torneo, `app/join/page.tsx`.
- **Aceptación / fuera de alcance:** ver sección 4.

### EPIC 1 — Infra del servidor Go (matar el cold start + robustez)
- **Objetivo:** que el servidor Go esté **siempre encendido y sin cold start**, con
  reconexión robusta y un test de paridad de evaluadores.
- **Por qué:** el camino online/torneo es inusable para una noche casual mientras el
  server duerma ~1 min. Es prerequisito de todo lo demás en Go.
- **Alcance:**
  - Hosting sin sleep: **Render free + keep-alive ping** a `/health` cada ~10 min (un
    cron externo gratis: cron-job.org, GitHub Actions schedule, o UptimeRobot). Verifica
    que un solo servicio encendido cabe en las 750h/mes. Documentar el setup. Ruta de
    upgrade documentada: VM en Oracle Cloud Always Free (systemd + TLS con Caddy).
  - Reconexión robusta en el cliente: portar el backoff del CLI (`cli/net.ts`) a
    `src/hooks/useGameSocket.ts` (hoy solo reconecta por cambio de deps). Estado-al-
    reconectar ya existe en el server.
  - Test de paridad de los tres evaluadores (TS/Rust/Go): un fixture compartido de manos
    con su ranking esperado, verificado en CI, para que no diverjan.
- **Archivos:** `server/cmd/server/`, infra/deploy docs, `src/hooks/useGameSocket.ts`,
  `cli/net.ts`, un test de paridad (CI).
- **Aceptación:** abrir una mesa online tras horas de inactividad responde en <2s; matar
  el wifi del cliente y volver re-sincroniza la mesa; el test de paridad pasa en CI.

### EPIC 2 — Llevar el servidor Go a paridad con el legacy
- **Objetivo:** que online/torneo en Go tengan las features del legacy. Sigue el backlog
  P1–P7 de `docs/plan-migracion.md`, reinterpretado para fichas de fantasía (no dinero).
- **Por qué:** es la migración real y el grueso de la ingeniería del proyecto.
- **Alcance (en este orden):**
  1. **Economía de fichas de fantasía en el server:** buy-in/stack/cash-out como puntos
     divertidos, no dinero. El Go es dueño del stack por jugador. (Simplifica
     `security-backlog` SEC 1 / BUG 1: sin liquidación firmada ni zero-sum a prueba de
     colusión — son amigos.)
  2. **Run-it-twice / negociación all-in en el server** (la matemática está en
     `src/lib/runIt.ts`; el flujo de voto, en `AllInVoteModal`).
  3. **Torneos en el server:** niveles de ciegas, knockouts, ranking, pausa/reanudar.
  4. **Cola y espectadores** en el hub (espectador recibe `state`, nunca `hole`, no
     puede `action`).
- **Archivos:** `server/internal/game/*`, `server/internal/session/*`,
  `server/internal/hub/*`, protocolo (`protocol.go` + espejo en `useGameSocket.ts`),
  `components/online/ServerTable.tsx`.
- **Aceptación:** cada feature funciona contra el binario corriendo (o CI); los tests Go
  pasan en CI; el cliente solo renderiza estado y manda acciones.
- **Nota Windows:** `go test` local lo bloquea Smart App Control; verifica vía CI o un
  cliente WS contra el binario. `go vet` + `go build` sí corren local.

### EPIC 3 — Rediseño de la mesa de escritorio (UX/UI online y torneo)
- **Objetivo:** aprovechar el landscape ahora que online/torneo son solo-desktop:
  dock de apuestas claro, jerarquía pot/board/turno, lectura de stacks, estados de espera
  dignos.
- **Alcance:** dock con tamaños rápidos (1/2 pot, 2/3, pot, all-in — "Smart Betting");
  slider de raise con input numérico, min-raise y all-in claros; turno inequívoco +
  countdown (el server ya publica `deadline`); pot y side pots legibles; chips animadas;
  estados "esperando jugadores"/"reconectando".
- **Archivos:** `components/online/ServerTable.tsx`, `components/betting/*`
  (`BettingDock`, `BettingControls`, `PotDisplay`, `TurnTimer`),
  `components/table/PlayerSeat.tsx`.
- **Aceptación:** mesa cómoda a 1280px y 1920px; tamaños rápidos funcionan; turno y timer
  inequívocos; sin regresión de lógica; `prefers-reduced-motion` respetado.

### EPIC 4 — Persistencia server-authoritative (manos + stats)
- **Objetivo:** que el **servidor Go** persista las manos jugadas, para historial, stats
  y replayer. Memoria durable del juego.
- **Por qué:** desbloquea replayer, leaderboards, premios y recap. Al ser el server quien
  escribe, es autoritativo y consistente.
- **Alcance:** al showdown, el server escribe la mano a un store durable. Dado que tendrás
  una VM (EPIC 1), **Postgres** es buena opción para datos relacionales/analíticos (lo
  sugiere `architecture-roadmap.md`); alternativa: endpoint Next que escriba a Firestore.
  Reusa `lib/handStats.aggregateHud` para el HUD del cliente. Stats de por vida → perfil.
- **Archivos:** `server/internal/session` (hook post-showdown), capa de persistencia en
  Go, endpoint o store, UI de historial/HUD en `/play/online`.
- **Aceptación:** jugar manos → aparecen en historial con categoría real; stats agregadas
  correctas; persisten entre reinicios del server.

### EPIC 5 — Banter en mesa (social, alto valor / bajo esfuerzo)
- **Alcance (en orden):** (1) **Squeeze** de cartas en `/play/[code]` y en la mesa
  desktop (reusa `PlayingCard`); (2) **canned chat** en español sobre el seat; (3)
  **throwables** (extiende `reactions.ts`/`ReactionLayer`); (4) **emojis sobre avatar**;
  (5) **SnapCam (stretch)** reusando `useVoiceWebRTC`.
- **Archivos:** `src/lib/reactions.ts`, `components/reactions/*`, `src/lib/chat.ts`,
  `components/chat/ChatPanel.tsx`, `components/cards/PlayingCard.tsx`.
- **Aceptación:** funciona en presencial (móvil) y online (desktop); respeta reglas de
  animación; sin filtrar info de juego; sin caracteres emoji en source (usa assets/iconos).

### EPIC 6 — Clubs / grupos persistentes (equivalente a Home Games)
- **Objetivo:** un **club** persistente: lo creas con nombre y código de invitación, tus
  amigos se unen una vez, y todas las noches quedan atadas a un **leaderboard** acumulado
  y por temporada.
- **Por qué:** es nuestro caso de uso y el organizador que falta. Convierte "salas de una
  noche" en "la liga del grupo".
- **Alcance:** modelo `clubs/{clubId}` (nombre, miembros, código, settings); unir sesiones
  al club; leaderboard acumulado y por temporada; roster con motes/avatares (DiceBear);
  apóyate en rangos/XP (`progression.ts`, `RankTowerModal`).
- **Archivos:** nuevo `src/lib/clubs.ts`, rutas (`/club/[id]`), hooks, store durable.
- **Aceptación:** crear club, invitar por código, jugar una noche, ver leaderboard
  actualizado; el acumulado persiste entre noches.
- **Depende de:** EPIC 4.

### EPIC 7 — Momentos memorables
- **Alcance:** (1) **Rabbit Hunt** (independiente, empezar aquí — quick win): tras un fold
  que cierra la mano, ofrecer ver las cartas que habrían salido (post-mano, no filtra en
  vivo); (2) **Hand Replayer + enlace compartible** (depende de EPIC 4); (3) **premios de
  la noche** automáticos (mano más grande, peor bad beat, el más farolero, rey del
  all-in); (4) **"wrapped"/recap de temporada** (depende de EPIC 4 y 6).
- **Archivos:** `src/lib/handHistory.ts`, `components/history/*`, módulo de awards, perfil.
- **Aceptación:** rabbit hunt opt-in; replayer reproduce una mano real y el enlace la abre;
  premios calculados de datos reales.

### EPIC 8 — Profundidad de juego (en el server Go)
- **Alcance (independientes; arriba primero):** **straddle**; **bomb pot**; **all-in
  insurance / EV cashout** (usa `useEquity`/WASM); **mystery bounty / PKO** en torneos
  (sobre el motor de torneos de EPIC 2); **stretch:** variantes PLO / Short Deck (toca
  evaluadores) y formato **Flip & Go**.
- **Archivos:** `server/internal/game/*`, y reflejo en cliente. Reglas opcionales se
  configuran al crear la sala.
- **Aceptación:** cada regla tiene tests en Go; no rompe los existentes.

### EPIC 9 — Retirar el legacy + calidad transversal
- **Objetivo:** cuando online/torneo en Go tengan paridad, **deprecar el legacy**:
  redirigir `/play/normal` → `/play/online`, quitar `useNormalGame` y el sync host-auth a
  Firestore de esos modos. El presencial se queda. Reduce a un evaluador donde se pueda.
- **Calidad:** accesibilidad (`aria-live` en turno, foco visible, contraste), estados
  vacíos/de error, `prefers-reduced-motion` auditado, bundle audit
  (`ANALYZE=true next build`), y **transferir host** del presencial (continuidad).
- **Aceptación:** sin regresiones; el legacy de online/torneo queda fuera; el presencial
  intacto.

---

## 8. Dirección de UX/UI

**Identidad visual.** Estética "noir" con acento violeta (hue ~290). Una sola perilla de
color por capa (sección 2). Oscuro, elegante, glow sutil; nada de ruido. Lucide para
iconos. GSAP con propósito, nunca gratuito.

**Dos pantallas, dos lenguajes:**
- **Teléfono (presencial, `/play/[code]`)**: mobile-first, vertical, íntimo. Pocos
  elementos, grandes, tappables. Las cartas privadas son el héroe; el squeeze es el
  momento. Acciones simples. Nada de tablas densas ni HUDs.
- **Escritorio (online/torneo)**: landscape, la mesa es el espectáculo. Seats alrededor
  del felt, dock de apuestas abajo, paneles laterales (historial, chat, equity host-only)
  sin tapar la mesa. Jerarquía: pot > turno > board > stacks > resto.

**Principios:** feedback inmediato a cada acción (visual o sonoro — hay `useSound`); los
estados de espera nunca son pantalla muerta (muestran qué se espera y de quién); el turno
activo inequívoco; el dinero/fichas siempre legible; experiencia completa sin animación
(`prefers-reduced-motion`); cero fricción de entrada (código + QR, sin instalar).

---

## 9. Bugs conocidos (de CONTRIBUTING.md)

| Severidad | Descripción | Notas |
| --- | --- | --- |
| Media | SeatPicker no aparece en modo Torneo | Falta la selección visual de asiento |
| Baja | Botón dealer se superpone con fichas en heads-up | Visual |
| Media | Cash-out server-backed no usa el stack final del Go | Se resuelve en EPIC 2 (economía de fichas en el server) |
| Baja | Historial online guarda categoría placeholder | Se resuelve en EPIC 4 (persistencia con categoría real) |
| Media | Render free duerme por inactividad | Se resuelve en EPIC 1 (hosting sin sleep) |

---

## 10. Definición de "hecho" y gate de calidad

Antes de dar por terminada una épica o rama:

```bash
npm run lint     # ESLint 9, debe pasar
npm test         # Vitest, los 78 tests (o más) en verde
npm run build    # Turbopack, sin errores TS ni warnings de hidratación
```

Para cambios en `server/`:

```bash
cd server && go vet ./... && go build ./cmd/server
# go test corre en CI; en Windows local lo bloquea Smart App Control
```

**Smoke tests:**
- Presencial: `/host` → unir 2 jugadores desde `/play/CODE` → repartir, avanzar, revelar,
  showdown.
- Online (Go): server corriendo + `NEXT_PUBLIC_GAME_WS_URL` → `/play/online` en 2 pestañas
  (o CLI `npm run play -- MESA Ana`) → repartir, jugar la mano, showdown con reveals.
- Torneo: niveles, pausa, avance, knockouts (legacy hoy; Go tras EPIC 2).
- Device gate (EPIC 0): teléfono vertical, desktop y tablet horizontal.

Para UI, usa preview contra `localhost:3000` (`preview_start` + `preview_eval`) y toma
screenshots en ambos anchos. Firebase requiere red real; prueba reglas en el emulador
antes de prod. **Incluye siempre un paso de verificación final** (tests, diff,
screenshots, auditoría de color: `grep -rn "amber-\|emerald-\|#fbbf24\|#34d399" src` solo
debe devolver los exentos de `CLAUDE.md`).

---

## 11. Qué NO hacer (para no perder el foco)

- No construir features de online/torneo en el cliente ni en el camino legacy: van al
  **servidor Go** (`server/internal/game`). El cliente solo renderiza y manda acciones.
- No migrar el presencial a Go: su modelo host-authoritative sobre Firestore es correcto.
- No cambiar de lenguaje para "ahorrar hosting": Go se despliega gratis (sección 5). El
  lenguaje no es el costo.
- No implementar dinero real, staking, certificación de RNG, anti-colusión, jackpots
  comerciales, casino, Rush & Cash, satélites ni multi-flight.
- No poner HUD de stats del rival (VPIP/PFR) sobre los seats. Viola privacidad. Solo
  stats propias en perfil / post-sesión.
- No rediseñar los controles de online/torneo para vertical: son desktop.
- No romper el presencial en teléfono: es el corazón del producto.
- No deps pesadas sin justificar. No emojis en código/UI/commits. No trailer
  Co-Authored-By.

---

## 12. Bitácora de decisiones

Añade entradas con fecha cuando tomes una decisión de diseño relevante.

| Fecha | Decisión | Razón |
| --- | --- | --- |
| 2026-06-06 | Objetivo: "mejor noche de póker con amigos" + un backend serio. Fichas de fantasía, sin dinero. | Proyecto personal, sin monetización, pero con ambición de ingeniería. |
| 2026-06-06 | Online y torneo son **solo escritorio**; en móvil, gate que invita a entrar desde PC. Presencial sigue mobile-first. | La vista vertical no acomoda los controles de apuesta. |
| 2026-06-06 | **El servidor Go es el backend estratégico de online/torneo. Llevarlo a paridad y retirar el legacy.** El presencial se queda en Firestore. | El server es la ingeniería que vale la pena y da continuidad/mejor arquitectura; mantener dos backends a medias es el costo real. |
| 2026-06-06 | No cambiar de lenguaje por hosting. Go se despliega gratis. | El costo es el modelo de hosting, no el lenguaje. |
| 2026-06-06 | Hosting actual: **Render free + keep-alive ping** a `/health` cada ~10 min. Oracle Always Free como upgrade futuro. | Cero esfuerzo y elimina el cold start ya; cabe en las 750h/mes gratis. Una partida activa ya mantiene el server despierto. |
| 2026-06-06 | Copiar el concepto de **Home Games (clubs)** como organizador del producto. | Es nuestro caso de uso: grupo persistente con leaderboard entre noches. |
| 2026-06-06 | **EPIC 0 — Detección de dispositivo por media query, no user-agent.** `useDeviceClass` combina `(pointer: coarse)` y `(hover: none)` para detectar táctil, más viewport (`window.innerWidth`) para distinguir teléfono de tablet. | User-agent es frágil y falseable; las media queries de puntero son el estándar W3C para "dispositivo táctil sin mouse fino". |
| 2026-06-06 | **EPIC 0 — Umbral del gate: `coarsePointer` (táctil sin mouse) es la condición principal.** Teléfono = coarsePointer + ancho < 768px. Tablet = coarsePointer + ancho ≥ 768px. Desktop = pointer fino (no coarsePointer). El ancho solo afina dentro del grupo táctil. | Evitar falsos positivos: un laptop táctil con trackpad es desktop; un iPad en landscape con teclado sigue siendo tablet. |
| 2026-06-06 | **EPIC 0 — Escape hatch en tablets grandes landscape:** `isTablet && !portrait && innerWidth >= 1024`. Teléfonos (< 768px) nunca ven "Continuar de todos modos". Tablets pequeñas o en portrait tampoco. | La frase del brief era "solo en tablets grandes en horizontal". Umbral 1024px resuelve la pregunta abierta. |
| 2026-06-06 | **EPIC 0 — SSR-safe con default `isDesktop: true`.** En servidor (o antes de hidratar) el hook devuelve `isDesktop: true`, por lo que el contenido de la ruta se prerenderiza normalmente. Tras hidratar, si el dispositivo es táctil, se muestra el gate. | Sin este default, SSR renderizaría el gate y el cliente podría mostrar el contenido → mismatch de hidratación. El default seguro es el que renderiza contenido, no el gate. |
| 2026-06-06 | **EPIC 0 — Patrón de componente interno (`PageInner`).** Cada ruta gateada divide en un wrapper delgado (`DesktopOnlyGate`) + una función interna (`PageInner`) con todos los hooks/lógica. El componente interno solo se monta cuando el gate lo deja pasar. | Cumple las reglas de React (hooks antes de cualquier `return` condicional) e impide que subscripciones de Firestore o WebSocket se inicien en dispositivos móviles. |
| 2026-06-06 | **EPIC 0 — `/join` no tiene gate propio.** El flujo ya redirige salas online a `/play/normal/[code]`, que está gateado. El dispositivo móvil recibe el gate con el código correcto en los params de la URL. | Añadir detección doble en `/join` sería duplicación de lógica; la redirección existente hace el trabajo. |
| 2026-06-06 | **EPIC 1 — Keep-alive vía GitHub Actions cron, no código de servidor nuevo.** El endpoint `/health` ya existía. El workflow `keepalive.yml` corre `*/10 * * * *`, usa el secreto `GAME_SERVER_URL`; si está vacío, hace skip sin fallar. | Cero cambios al servidor Go; el cron externo gratuito mantiene el Render free siempre encendido (cold start: ~60s → <2s con ping activo). |
| 2026-06-06 | **EPIC 1 — `useGameSocket`: se añadió `status: ConnStatus` y try/catch en el constructor.** El backoff ya existía. `status` distingue "connecting" / "reconnecting" / "connected" / "error"; `connected: boolean` se deriva de `status === "connected"` para retro-compat. `ServerTable` muestra "reconectando…" con ícono giratorio durante el backoff. | Granularidad de estado mejora UX cuando el cliente pierde red sin romper ningún caller existente. |
| 2026-06-06 | **EPIC 1 — Paridad de evaluadores con fixture JSON compartida (`testdata/eval-parity.json`).** 10 manos cubren las 9 categorías (0–8). TS: Vitest en `node.yml` CI. Go: `go test ./...` en `server.yml` CI. Ambos CI se re-disparan al cambiar `testdata/`. El WASM/Rust se cubre vía `cargo test` en `engine.yml`. | Un solo fixture = fuente de verdad; divergencia futura da fallo explícito en CI en lugar de silenciosa. |
| 2026-06-06 | **EPIC 2 — `SB`/`BB` en `PublicState` (Go + TS).** Ambos lados del protocolo ahora llevan los niveles de ciegas actuales en cada broadcast. El cliente muestra "Ciegas {sb}/{bb}" en la cabecera de `ServerTable`. | El cliente necesita las ciegas para mostrar pot-odds y tamaños rápidos de apuesta; era el único campo de `Room` que faltaba en el estado público. |
| 2026-06-06 | **EPIC 2 — Pause/resume en el servidor Go.** `Room.Pause()`/`Resume()` + flag `paused` + guard en `Action()`. `session.Manager` maneja `{"type":"pause"}` y `{"type":"resume"}`; solo el dueño de la sala puede invocarlos (igual que `start`/`config`). El timer de turno se cancela al pausar y se re-arma al reanudar. | Permite breaks de torneo sin que el auto-fold expulse a nadie mientras toman un descanso. El servidor ya tenía `EscalateBlinds`; pause/resume completa el ciclo de torneo. |
| 2026-06-06 | **EPIC 2 — Bust-out tracking (`BustedOrder`) en el servidor Go.** `applyWinnings()` detecta fichas=0 después de cada mano y agrega el seat ID a `room.bustedOrder` si no estaba ya. Se copia y envía en cada `PublicMsg()`. | El orden de eliminación es la base del ranking de torneo; registrarlo en el servidor evita que el cliente tenga que reconstruirlo a partir de cambios de chips a lo largo de varias manos. |
| 2026-06-06 | **EPIC 2 — `ServerTable` muestra ciegas, banner de pausa y ranking de eliminados.** Las tres secciones son renderizado puro de `PublicState`; no añaden estado local. El botón Pausar/Reanudar va en `Controls` (no-spectators), el servidor rechaza si no eres dueño. | Mantiene la invariante: el cliente solo renderiza estado; la autoridad de la acción vive en el Go server. |

### Preguntas abiertas para el dueño (no para Claude Code)
- Hosting decidido: Render free + keep-alive. ¿Migrar a Oracle Always Free en algún punto?
- ¿"Temporada" formal con reset, o acumulado perpetuo del club?
- ¿Las fichas son puro marcador, o apuestas simbólicas (no dinero)?
- Umbral del gate resuelto: `coarsePointer` + 1024px en landscape para el escape hatch (ver bitácora 2026-06-06).

---

## Fuentes

**Benchmark PokerStars / GGPoker**
- GGPoker, "Games & Features Guide": https://ggpoker.com/blog/games-features-guide/
- GGPoker, "Understanding Rabbit Hunt": https://help.ggpoker.com/article/Understanding-Rabbit-Hunt
- Poker Industry PRO, "PokerStars adds Rabbit Hunt": https://pokerindustrypro.com/news/article/220749-pokerstars-software-upgrade-rabbit-hunt
- Rakerace, "PokerStars Emojis & Canned Chat": https://rakerace.com/news/poker-rooms/2025/09/22/pokerstars-expands-table-features-with-emojis-canned-chat-and-new-tools
- MyPokerCoaching / PokerStars Live, "Home Games": https://www.mypokercoaching.com/pokerstars-home-games/

**Hosting (estrategia de backend)**
- Render, free tier 2026 (spin-down 15 min, cold start, $7/mes paid): https://render.com/pricing , https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026
- Oracle Cloud Always Free (VM ARM 4 OCPU / 24GB, 24/7): https://www.oracle.com/cloud/free/ , https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Fly.io free tier 2026 (eliminado para cuentas nuevas): https://www.saaspricepulse.com/tools/flyio
