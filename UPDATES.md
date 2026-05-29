<div align="center">

[![General](https://img.shields.io/badge/📖_General-ver-555?style=for-the-badge)](README.md)&nbsp;&nbsp;[![Actualizaciones](https://img.shields.io/badge/📋_Actualizaciones_&_Roadmap-activo-1a7f5a?style=for-the-badge)](UPDATES.md)

</div>

---

# Actualizaciones & Roadmap — Showdown Poker Sim

Registro cronológico de cambios, estado actual del proyecto y próximas mejoras planeadas.

---

## Estado actual (Mayo 2026)

El juego es **jugable de punta a punta** en modo Normal y Torneo:
- Jugadores se unen desde el teléfono, eligen asiento y avatar
- Apuestas completas (Fold / Check / Call / Bet / Raise / All-in)
- All-in resuelto automáticamente (deal restante + ganador)
- Chat de texto + reacciones + canal de voz P2P
- Sala administrada por el host con controles completos

---

## Changelog

### v0.9 — Estabilización y jugabilidad (Mayo 2026)

#### Correcciones críticas (QA pass de 10 bugs)
- **BUG-001** Botón Repartir ahora muestra texto dinámico "Faltan N jugadores" en rojo cuando < 2 jugadores
- **BUG-002** Config BB/SB: BB siempre se clampea a ≥ SB+1 al guardar; validación cruzada en `NormalConfigPanel`
- **BUG-003** Stack inicial no acepta 0; mínimo forzado a 1 en el setter
- **BUG-004** "Igualar Stack a Todos" ahora actualiza el lobby (pre-partida) además del gameState activo
- **BUG-005** Formulario de unión muestra errores inline (nombre requerido, stack > 0) con icono y ring rojo
- **BUG-006** Página "Sala no encontrada" incluye enlace "Intentar con otro código" → `/join`
- **BUG-007** PlayerForm muestra error visible cuando nombre está vacío
- **BUG-008** PlayerForm bloquea nombres duplicados (case-insensitive) en Roster Local
- **BUG-009** Botón "Ir a la mesa" en Roster Local redirigía a `/` — corregido a `/host`
- **BUG-010** Modal "Elige un modo" ahora se cierra con tecla Escape (WCAG 2.1)

#### All-in: remoción de run-it-N (bloqueaba la partida)
- Eliminada la fase `all-in-negotiation` y el sistema de votación 1×/2×/3×
- All-in ahora resuelve **automáticamente en 1 run**: revela cartas, deal streets pendientes con animación (1.2 s/calle), calcula ganador, escribe resultado y continúa
- `AllInVoteModal` y `AllInVoteChip` removidos de todos los consumers
- Run-it-N queda como **feature pendiente** de reimplementación robusta (ver roadmap)

#### Seguridad: cifrado de hole cards (RSA-OAEP)
- Nuevo módulo `holeCrypto.ts`: par RSA-2048 por dispositivo generado con Web Crypto API
- Clave privada vive solo en `localStorage`; clave pública se publica en el lobby
- Host cifra las cartas de cada jugador a su clave pública antes de escribir a Firestore
- La consola de Firebase/admin solo ve ciphertext, no cartas en texto plano
- Fallback a texto plano para jugadores sin clave publicada (recién unidos, IA)

#### Interfaz y UX
- **Avatares en asientos**: avatar ahora está a la izquierda del recuadro nombre/fichas (antes flotaba encima de la mesa)
- **Cartas por asiento**: siempre encima del recuadro nombre, sin importar la posición del asiento en la mesa
- **Botones de voz compactos**: "Con mic" y "Solo escuchar" son ahora iconos discretos del mismo tamaño que chat y reacciones
- **Pot compacto**: `Total Pot` reducido a una línea pequeña `POT 15`
- **Tabla más pequeña**: `max-w-[1400px]` → `max-w-[1100px]`
- **Fondos de sala**: 7 gradientes oscuros seleccionables (Onyx, Humo, Carbón, Ceniza, Pizarra, Tinta, Coque) — persisten en Firestore, se sincronizan a todos los dispositivos
- **Pantalla de unión**: igual que modo Presencial — avatar picker grande, BorderGlow, código de sala en header
- **Pantalla de espera (pendiente)**: rediseñada con avatar grande pulsante, badge de fichas, dots animados; ya no es pantalla negra vacía
- **Botón Salir de la sala**: jugadores pueden salir desde el modal de opciones (☰), elimina su entrada del lobby y redirige a `/join`

#### Selección de asiento
- Cada jugador puede elegir su asiento antes de que empiece la mano
- `SeatPicker`: mini-mesa oval en el overlay de espera; tocar un asiento libre lo reserva via Firestore
- Host: al hacer click en un slot SIT específico, queda asignado a ese slot (`preferredSlot`)
- Slot computation respeta `preferredSlot`; el resto se distribuye equitativamente en huecos
- Botón ↺ (centrar) ahora calcula el offset exacto para poner al propio jugador en centro-inferior

#### Estabilidad Firestore
- `useNormalRoom` ya no termina silenciosamente en error de Firestore
- Retry con backoff exponencial: 1s → 2s → 4s → 8s → 15s → 30s
- Se conserva el último estado conocido durante reconexión (no se muestra null)
- Botón discreto "¿Sin actualizaciones? Refrescar" en la pantalla de espera

---

### v0.8 — Canal de voz y modo betting (Abril 2026)

- Canal de voz P2P (WebRTC full-mesh + señalización Supabase Realtime)
- Modo solo escuchar (sin micrófono)
- Mute tecla M, silenciar peer individual, indicador de nivel FFT ~12 fps
- Wake Lock para evitar suspensión en iOS durante voz
- Bitrate Opus capeado a 24 kbps (full-mesh con 6-10 peers)
- Vibración en turno propio (`navigator.vibrate([180])`)
- Confetti en showdown, sonido + mute toggle, animación chips → pot (GSAP)
- Indicador de desconexión por seat (presencia Firestore)
- Suite de 54 tests unitarios (Vitest): `handEval`, `betting`, `tournament`

---

## Roadmap

### Alta prioridad — próxima iteración

| # | Feature | Notas |
|---|---------|-------|
| 1 | **Run-it-N times** | Reimplementar sin bloquear: acuerdo automático (si todos all-in, correr N configurado en sala) o negociación simplificada. Sin modal de votación que pueda colgarse. |
| 2 | **Stats por sala en Firestore** | `useStats` y `useHistory` actualmente solo en `localStorage` del host. Migrar a subcolecci `normalRooms/{code}/stats` y `hands` para persistencia multi-sesión. |
| 3 | **Transferir host** | Si el host cierra la pestaña, el juego se congela. Botón "Transferir host" en HostDock + listener en Firestore de `hostUid`. |

### Juego / lógica

- [ ] **Torneo: pantalla de podio** — `finalRanking[]` y `knockouts[]` ya existen en `TournamentState`; falta UI de ranking final
- [ ] **Torneo: payouts editables** — campo `payouts` en modelo; falta configurador en HostDock
- [ ] **Torneo: pago de premios** — botón "Distribuir premios" al terminar que ajuste stacks según `payouts`
- [ ] **Rebuy flow completo en torneo** — `stackRequests` + `reentries` existe; falta límite de re-entradas y UI de historial
- [ ] **Spectator role** — unirse sin seat; recibe estado público sin hole cards ni betting dock
- [ ] **Notas por seat** — campo de texto por seat visible solo al host; útil para reads físicos

### UX / móvil

- [ ] **Replay de última mano** — snapshot de la mano (calles + acciones) guardado en Firestore con TTL de 1h; viewer prev/next
- [ ] **Export historial** — botón en tab Historial → descarga JSON/TXT de las manos de la sesión
- [ ] **Canal de voz en modo Presencial** — `VoicePanel` solo está en `/play/normal/[code]`; llevarlo también a `/play/[code]`
- [ ] **Notificación de turno más visible** — banner/overlay breve en el teléfono cuando es tu turno (además de vibración)

### Infraestructura / seguridad

- [ ] **TURN server** — sin TURN las llamadas de voz fallan en NAT simétrico (redes corporativas, algunos ISP). Documentar cómo levantar Coturn en VPS en `docs/voice-setup.md`
- [ ] **Auditoría `firestore.rules`** — rate limiting en writes de `pendingAction`; verificar que jugadores no puedan sobreescribir datos de otros
- [ ] **Optimización de bundle** — `ANALYZE=true next build`; candidatos a lazy-load: `canvas-confetti`, DiceBear

### Calidad

- [ ] **Tests e2e de showdown** — mano completa desde `startHand` hasta ganador con side pots
- [ ] **Test de integración Firestore** — Firebase Emulator Suite en CI para `rooms.ts` y `normalRooms.ts`
- [ ] **Monitoreo de errores** — integrar Sentry para capturar excepciones en producción

### Plataforma

- [ ] **PWA** — `manifest.json` + service worker; permite instalar en pantalla de inicio iOS/Android
- [ ] **Accesibilidad** — focus rings en botones custom, `aria-live` para turno activo, contraste en textos tenues
- [ ] **Modo home-game persistente** — sesiones recurrentes con stack tracking entre noches de juego
- [ ] **Estadísticas avanzadas** — VPIP, PFR, AF por jugador (estilo PokerTracker)

---

## Bugs conocidos activos

| Severidad | Descripción | Workaround |
|-----------|-------------|------------|
| Media | Selector de asiento no se muestra en modo Torneo (solo Normal) | Usar botón ↺ para rotar vista |
| Baja | En mesas de 2 jugadores, el botón dealer aparece superpuesto con las fichas de apuesta en algunos ángulos | Visual solo, no afecta lógica |

---

## Lecciones aprendidas (incidentes resueltos)

| Bug | Causa | Fix aplicado |
|-----|-------|--------------|
| All-in modal pegado sin resolver | Fase `all-in-negotiation` requería votos de todos; si un jugador no votaba, se colgaba | Eliminada la fase; runout automático 1× |
| Pantalla negra Next.js en jugadores | `useMemo` llamado después de `return` condicional → React error #310 | Mover hooks antes de todos los early returns |
| Jugador no ve juego iniciado | `onSnapshot` error handler llamaba `cb(null)` terminando el listener sin retry | Retry con backoff exponencial en `useNormalRoom` |
| All-in modal parpadeaba infinitamente | Auto-advance re-disparaba `all-in-negotiation` tras clear | Refs `allInTriggeredHandRef` + `allInRanHandRef` por `handNum` _(legacy, feature removida)_ |
| Seats clusterizados al fondo | Mapeo consecutivo de seats a slots | `Math.round(i * 9 / n) % 9` |
| Cartas re-animan en cada calle | Tween global con `community.length` como dep | Animación interna en `PlayingCard` |
| Avatar no encajaba en círculo | `ring-1` del Avatar componente sumaba espacio fuera del clip | `overflow-hidden` en contenedor padre + `ring-0` en Avatar |
