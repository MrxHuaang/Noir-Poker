# Poker Terminal

Cliente de póker para la terminal que se une a la **misma partida online** que la
web (`/play/online/[code]`). Un asiento en la terminal y un asiento en el navegador
con el **mismo código de sala** comparten una sola mesa en el servidor y juegan
entre sí.

No corre lógica de juego localmente: el **servidor Go autoritativo** (el mismo que
usa `/play/online`) reparte, valida apuestas y resuelve el showdown. Este cliente
solo dibuja el estado que recibe y envía tus acciones.

## Uso

```bash
npm run play -- ABCDE "Tu Nombre"
# o sin argumentos (pregunta el código):
npm run play
```

- El código de sala es el mismo que aparece en la web al crear/entrar a una mesa
  online. En la web: `/play/online/ABCDE`.
- Conéctate **antes** de que alguien reparta para entrar en la mano (el servidor
  sienta a quien esté conectado al momento de repartir; se necesitan 2+ jugadores).

### Teclas

| Tecla | Acción |
| ----- | ------ |
| `D` / `S` | Repartir / reiniciar mano |
| `F` | Retirarse (fold) |
| `K` | Pasar (check) |
| `C` | Igualar (call) — o pasar si no hay apuesta |
| `R` | Subir / apostar (pide el monto total) |
| `A` | All-in |
| `Q` | Salir |

### Configuración

| Variable / flag | Por defecto | Qué hace |
| --------------- | ----------- | -------- |
| `--server <url>` / `GAME_WS_URL` / `NEXT_PUBLIC_GAME_WS_URL` | `https://poker-sim-server.onrender.com` | URL del servidor de juego |
| `--name <nombre>` | `Terminal` | Nombre que verán los demás |
| `--id <id>` | id persistido en `~/.poker-sim-cli-id` | Identidad del asiento |

## Detalles técnicos

- **Sin dependencias de runtime nuevas.** Usa el `WebSocket` global de Node (21+).
  `tsx` (devDependency) corre el TypeScript y permite reutilizar `src/lib/poker.ts`,
  `handEval.ts` y `handLabel.ts` (descripciones de mano en español).
- **Protocolo** (idéntico a `src/hooks/useGameSocket.ts`):
  - Conexión: `wss://HOST/ws?room=CODE&id=UID&name=NAME`
  - Recibe: `{type:"state", payload}` (público) y `{type:"hole", payload:{cards}}` (privado, solo tuyo)
  - Envía: `{type:"start"}` y `{type:"action", payload:{action, amount}}`
  - Acciones: `fold | check | call | bet | raise | all-in`. Para `raise`/`bet`,
    `amount` es el **total** al que subes.
- **Cartas privadas**: el servidor manda tus dos cartas solo por tu propio socket;
  la privacidad es por transporte (no hay cifrado en este modo).
- **Acciones legales**: el servidor no envía la lista de acciones válidas ni avisa de
  acciones ilegales (las descarta en silencio), así que el cliente las deriva del
  estado (`cli/logic.ts`). El `min` de subida es aproximado (ciega grande = 10); una
  subida por debajo del mínimo real se rechaza en silencio y verás "sin cambios".
- **Reconexión**: backoff exponencial para sobrevivir el arranque en frío de Render
  (~1 min tras 15 min inactivo). Al reconectar, el servidor reenvía el estado actual.
  Si te caes a mitad de mano, el servidor te retira (fold) automáticamente.

## Limitaciones conocidas

- Sin economía/XP: el servidor asigna stack fijo de 1000 (ciegas 5/10); las fichas no
  se sincronizan con el monedero de la web.
- Estado del servidor en memoria: un redeploy reinicia las mesas.
- Cualquiera conectado puede repartir (`start`); úsalo solo cuando la mesa esté
  inactiva para no interrumpir una mano en curso.
