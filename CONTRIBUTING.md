<div align="center">

[![General](https://img.shields.io/badge/General-ver-555?style=for-the-badge)](README.md)&nbsp;&nbsp;[![Actualizaciones](https://img.shields.io/badge/Actualizaciones_%26_Roadmap-activo-1a7f5a?style=for-the-badge)](CONTRIBUTING.md)

</div>

---

# Contribuir a Showdown

Gracias por el interés. Este documento cubre los lineamientos para contribuir al proyecto.

---

## Antes de empezar

1. Fork del repo + clone local
2. `npm install`
3. Crear `.env.local` con tu proyecto Firebase de pruebas (**nunca** usar producción para dev)
4. `npm run dev` y verificar que el smoke test pasa:
   - Abrir `/host/normal` → aparece sala con código
   - Abrir `/play/normal/CODE` en incógnito → unirse como jugador
   - Host reparte → jugador ve cartas

---

## Flujo de trabajo

```
master                   rama principal, siempre deployable
feat/<nombre>            nueva feature
fix/<nombre>             corrección de bug
refactor/<nombre>        refactor sin cambio de comportamiento
docs/<nombre>            solo documentación
```

1. Crear rama desde `master`
2. Hacer cambios con commits atómicos
3. Antes de PR, verificar:
   - `npm run build` pasa sin errores TypeScript
   - `npm test` (54 tests Vitest) sin regresiones
   - Smoke test manual del flujo afectado
4. Abrir PR contra `master` con descripción de qué y por qué

---

## Formato de commits

```
<tipo>(<scope opcional>): <descripción imperativa corta>

Cuerpo opcional con contexto.
```

| Tipo | Cuándo |
|------|--------|
| `feat` | Nueva funcionalidad |
| `fix` | Corrección de bug |
| `refactor` | Refactor sin cambio observable |
| `perf` | Mejora de rendimiento |
| `docs` | Solo documentación |
| `style` | Formato, sin cambio lógico |
| `test` | Tests nuevos o ajustados |
| `chore` | Dependencias, config, CI |

Ejemplos:
```
feat(betting): agregar preset de apuesta 2x pot
fix(firestore): retry con backoff en useNormalRoom
docs: actualizar CONTRIBUTING con guia de tests
```

---

## Convenciones del proyecto

### TypeScript
- `strict: true`. Sin `any` salvo justificación en comentario `// reason:`
- Usar `import type { ... }` para tipos
- Imports absolutos vía `@/`

### React
- Archivos con interactividad: `"use client"` al tope
- Hooks en `src/hooks/`, componentes colocalizados por feature
- Estado funcional: `setX(prev => ...)` cuando depende del valor anterior en async/effects
- **Regla crítica**: todos los hooks antes de cualquier `return` condicional (Rules of Hooks)

### Tailwind v4
- Tokens en `globals.css` con `@theme inline`; no hay `tailwind.config.js`
- Sin librerías de utility extra

### Firebase
- Helpers en `src/lib/rooms.ts` y `src/lib/normalRooms.ts` — no llamar `getFirestore()` en componentes
- Un solo punto de escritura a Firestore por feature (no dispersar writes en múltiples componentes)

### Estilo
- Sin emojis en UI, código, comentarios ni commits
- Copy en español (intencional)
- Iconos: solo Lucide
- Bundle lean: revisar tamaño antes de agregar dependencia nueva

---

## Invariantes de privacidad (no romper)

- Equity, fuerza de mano y outs: **solo** panel lateral del host. Nunca sobre la mesa ni en vista del jugador
- Hole cards: viven en `holes/{seatId}` (subcollection cifrada). No guardar en doc público de sala
- Al agregar campo que pueda filtrar información: decidir explícitamente entre host-only o no-display

---

## Áreas amigables para primer PR

- Ampliar tests en `src/lib/handEval.ts` y `src/lib/betting.ts` (Vitest ya configurado)
- Documentar funciones públicas en `src/lib/`
- Arreglar warnings de eslint
- Mejorar copy en español
- Implementar un item del roadmap marcado como baja complejidad (ver abajo)

---

## Probar cambios multi-dispositivo sin hardware

```
Pestaña 1:         /host/normal           (auth anónimo A)
Pestaña 2 incógnito: /play/normal/CODE    (auth anónimo B)
Pestaña 3 incógnito: /play/normal/CODE    (auth anónimo C)
```

Cada pestaña incógnita genera un UID anónimo distinto.

---

## CLAUDE.md

Si trabajas con asistentes AI (Claude Code, Cursor, etc.), leer `CLAUDE.md` en la raíz antes de PRs grandes. Contiene invariantes de privacidad, pitfalls aprendidos de bugs pasados y convenciones de animación específicas del proyecto.

---

---

# Actualizaciones & Roadmap

---

## Estado actual (Junio 2026)

El juego es **jugable de punta a punta** en modos Normal y Torneo:
- Jugadores se unen desde el teléfono, eligen asiento y avatar
- Apuestas completas (Fold / Check / Call / Bet / Raise / All-in)
- All-in run-it-N con votación, timeout automático, side pots y avance de mano
- Chat de texto + reacciones + canal de voz P2P
- Sala administrada por el host con controles completos

---

## Changelog

### v0.10 — Run-it-N normal (Junio 2026)

#### All-in run-it-N robusto
- All-in en modo Normal vuelve a abrir negociación 1x/2x/3x/5x, limitada por cartas disponibles en el mazo
- Los votos se escriben por jugador en `state.allInNegotiation.votes`; el host fusiona solo ese mapa para no perder el mazo local
- Timeout de 15 s evita bloqueo si alguien no vota; los votos faltantes caen a 1x
- El motor reparte cada run sin duplicar cartas, divide main/side pots por run y guarda `runResults` para el resumen visual

### v0.9 — Estabilización y jugabilidad (Mayo 2026)

#### Correcciones críticas (QA pass de 10 bugs)
- **BUG-001** Botón Repartir muestra "Faltan N jugadores" en rojo cuando < 2 jugadores
- **BUG-002** Config BB/SB: BB se clampea a >= SB+1; validación cruzada en `NormalConfigPanel`
- **BUG-003** Stack inicial no acepta 0; mínimo forzado a 1
- **BUG-004** "Igualar Stack a Todos" actualiza el lobby pre-partida además del gameState activo
- **BUG-005** Formulario de unión muestra errores inline (nombre, stack) con ring rojo
- **BUG-006** Página "Sala no encontrada" incluye enlace "Intentar con otro código"
- **BUG-007** PlayerForm muestra error cuando nombre está vacío
- **BUG-008** PlayerForm bloquea nombres duplicados (case-insensitive) en Roster Local
- **BUG-009** Botón "Ir a la mesa" en Roster Local redirigía a `/` — corregido a `/host`
- **BUG-010** Modal "Elige un modo" se cierra con tecla Escape (WCAG 2.1)

#### All-in simplificado
- En v0.9 el all-in se simplificó temporalmente a 1 run para quitar bloqueos de votación
- En v0.10 se reintrodujo run-it-N con timeout y resolución de side pots por run

#### Seguridad: cifrado de hole cards (RSA-OAEP)
- Par RSA-2048 por dispositivo generado con Web Crypto API
- Clave privada en `localStorage` únicamente; clave pública publicada en lobby
- Firestore solo almacena ciphertext — la consola de Firebase no expone cartas
- Fallback a texto plano si el jugador aún no publicó clave

#### Interfaz y UX
- Avatar inline a la izquierda del recuadro nombre/fichas (antes flotaba sobre la mesa)
- Cartas siempre sobre el recuadro de nombre, sin importar posición del asiento
- Botones de voz compactos (iconos del mismo tamaño que chat y reacciones)
- Pot compacto: una línea pequeña en lugar del bloque grande
- Tabla reducida: `max-w-[1400px]` → `max-w-[1100px]`
- 7 fondos de sala con gradientes oscuros (Onyx, Humo, Carbon, Ceniza, Pizarra, Tinta, Coque) — sincronizan via Firestore
- Pantalla de unión rediseñada: avatar picker + BorderGlow igual que modo Presencial
- Pantalla de espera rediseñada: avatar pulsante, badge de fichas, dots animados
- Botón "Salir de la sala" en el modal de opciones del jugador

#### Selección de asiento
- `SeatPicker`: mini-mesa oval en overlay de espera; tocar asiento libre lo reserva en Firestore
- Host: click en SIT de slot específico asigna `preferredSlot`
- Slot computation respeta preferencias; resta se distribuye equitativamente
- Botón de centrar calcula offset exacto para poner al jugador en centro-inferior

#### Estabilidad Firestore
- `useNormalRoom` ya no termina silenciosamente ante errores de Firestore
- Retry con backoff exponencial: 1 s / 2 s / 4 s / 8 s / 15 s / 30 s
- Estado conocido preservado durante reconexión

---

### v0.8 — Canal de voz y modo betting (Abril 2026)

- Canal de voz P2P (WebRTC full-mesh + señalización Supabase Realtime)
- Modo solo escuchar, mute tecla M, silenciar peer individual
- Indicador de nivel FFT throttled a ~12 fps
- Wake Lock para evitar suspensión en iOS
- Bitrate Opus capeado a 24 kbps
- Vibración en turno propio
- Confetti en showdown, sonido + mute, animación chips → pot (GSAP)
- Indicador de desconexión por seat (presencia Firestore)
- Suite de 54 tests unitarios (Vitest)

---

## Roadmap

### Alta prioridad

| Feature | Notas |
|---------|-------|
| **Stats por sala en Firestore** | Migrar `useStats`/`useHistory` de localStorage a `normalRooms/{code}/stats` |
| **Transferir host** | Botón en HostDock + listener de `hostUid` en Firestore para cuando el host cierra la pestaña |

### Juego / lógica

- [ ] Torneo: pantalla de podio — `finalRanking[]` y `knockouts[]` ya existen en modelo
- [ ] Torneo: payouts editables y botón "Distribuir premios"
- [ ] Rebuy flow completo en torneo con límite de re-entradas
- [ ] Spectator role: unirse sin seat, sin hole cards ni betting dock
- [ ] Notas por seat (host-only, para reads físicos)

### UX / movil

- [ ] Replay de ultima mano — snapshot en Firestore con TTL de 1 h
- [ ] Export historial → JSON/TXT desde tab Historial del HostDock
- [ ] Canal de voz en modo Presencial (`VoicePanel` en `/play/[code]`)
- [ ] Notificacion de turno más visible en telefono (banner sobre la mesa)

### Infraestructura / seguridad

- [ ] TURN server para voz en NAT simétrico (documentar Coturn en VPS)
- [ ] Auditoria de `firestore.rules` + rate limiting en `pendingAction`
- [ ] Optimización de bundle (`ANALYZE=true next build`)

### Calidad

- [ ] Tests e2e de showdown con side pots
- [ ] Integración Firestore con Firebase Emulator Suite en CI
- [ ] Monitoreo de errores (Sentry o similar)

### Plataforma

- [ ] PWA — `manifest.json` + service worker
- [ ] Accesibilidad — focus rings, `aria-live` en turno, contraste
- [ ] Modo home-game persistente con stack tracking entre sesiones
- [ ] Estadísticas avanzadas: VPIP, PFR, AF por jugador

---

## Bugs conocidos activos

| Severidad | Descripción | Workaround |
|-----------|-------------|------------|
| Media | SeatPicker no aparece en modo Torneo | Usar botón de centrar (rotacion visual) |
| Baja | Dealer button superpuesto con fichas de apuesta en mesa de 2 jugadores | Visual solo, no afecta logica |

---

## Lecciones aprendidas

| Bug | Causa | Fix |
|-----|-------|-----|
| All-in modal bloqueado | Fase `all-in-negotiation` esperaba votos de todos; si uno no votaba se colgaba | Timeout de 15 s + default 1x para votos faltantes |
| Pantalla negra Next.js | `useMemo` despues de `return` condicional — React error #310 | Mover hooks antes de early returns |
| Jugador no ve juego iniciado | `onSnapshot` error handler llamaba `cb(null)` terminando el listener | Retry con backoff en `useNormalRoom` |
| Seats clusterizados al fondo | Mapeo consecutivo de seats a slots | `Math.round(i * 9 / n) % 9` |
| Cartas re-animan en cada calle | Tween global con `community.length` como dep | Animacion interna en `PlayingCard` |
| Avatar no encajaba en circulo | `ring-1` del Avatar sumaba espacio fuera del clip | `overflow-hidden` en padre + `ring-0` en Avatar |
