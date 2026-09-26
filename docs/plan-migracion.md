# Modo online: arquitectura serverless

El modo online (`/play/online/[code]`) es **autoritativo y trustless sin un
servidor aparte**. Antes corría sobre un servidor Go con WebSockets desplegado
en Render (dormía en el plan gratis y quedaba desactualizado); ahora el mismo
motor vive en TypeScript y se ejecuta dentro de las funciones serverless de
Next.js, con Firestore como estado compartido.

## Piezas

| Pieza | Archivo | Qué hace |
| --- | --- | --- |
| Motor | `src/lib/online/engine.ts` | Puro y serializable: ciegas, reparto, apuestas (min-raise, short all-in), calles, fold-a-uno, run-out, run-it-N, side pots, showdown, fila de espera, dueño de la mesa. Sin red. |
| Contrato | `src/lib/online/protocol.ts` | `PublicState`, documentos de Firestore, constantes (turno 30 s, heartbeat). |
| Servidor | `src/lib/online/server.ts` | Una transacción de Firestore por jugada: carga el motor, aplica, liquida monedas, escribe estado público + cartas privadas + registro de mano. |
| API | `src/app/api/online/route.ts` | `POST /api/online` con el idToken de Firebase (`create`, `sit`, `leave`, `start`, `act`, `tick`, `config`, `pause`, `resume`, `rebuy`). |
| Cliente | `src/lib/online/client.ts`, `src/hooks/useOnlineGame.ts` | Suscripciones Firestore + llamadas a la API + heartbeat + reloj de turno. |
| Vista | `src/lib/onlineTable.ts`, `src/app/play/online/**` | Adaptador puro a la mesa rica (`TableShell` + `BettingDock`). |
| CLI | `cli/` | Mismo contrato desde la terminal (sesión anónima: mesas casuales). |

## Documentos en Firestore

```
onlineRooms/{code}                  estado público (lectura: cualquier usuario autenticado)
onlineRooms/{code}/private/engine   motor completo con mazo y cartas (cerrado a clientes)
onlineRooms/{code}/holes/{uid}      cartas del jugador (solo su dueño)
onlineRooms/{code}/presence/{uid}   heartbeat que escribe cada cliente
onlineRooms/{code}/hands/{n}        registro autoritativo por showdown (fuente del XP)
roomLedgers/online-{code}           libro de suma cero de la sala
```

Ningún cliente escribe el estado del juego: todas las escrituras pasan por la
API (Admin SDK). Ver `firestore.rules`.

## Sin servidor persistente: cómo se resuelve

- **Reloj de turno**: el estado público trae `deadline`. Cuando vence, los
  clientes llaman `tick` (el jugador en turno primero, los demás con jitter);
  el servidor valida la hora y aplica auto-check o auto-fold. Es idempotente.
- **Desconexiones**: cada cliente sentado escribe un heartbeat cada 25 s. Un
  jugador sin heartbeat por 75 s se levanta (y se liquida) al repartir la
  siguiente mano o cuando vence su turno. Recargar la página no pierde el
  asiento; cerrar la pestaña sí, pasado ese margen.
- **Subida de ciegas**: se calcula al repartir desde `blindsSince` (no hay timer).
- **Dueño**: el creador mientras esté sentado; si no, el que llegó primero. Si
  el anfitrión se va, cualquiera sentado puede repartir (el servidor lo poda y
  reasigna).

## Economía

- Sentarse en una mesa con fichas descuenta el buy-in (`startStack`) del
  monedero **en la misma transacción** que da el asiento.
- Levantarse, ser podado por heartbeat o una recompra liquidan también dentro
  de la transacción del juego. El crédito se recorta al libro de la sala: la
  mesa nunca acuña monedas.
- Quien se levanta estando all-in cobra al terminar la mano.
- El XP se cuenta en servidor desde `onlineRooms/{code}/hands`. Las mesas
  casuales no mueven monedas ni dan XP.

## Desarrollo y pruebas

```bash
npm test          # incluye src/lib/online/engine.test.ts (fuzz de conservación de fichas)
npm run dev:emu   # Next + Firebase Emulator Suite (Auth + Firestore), nada toca producción
```

Con los emuladores se pueden crear cuentas de prueba libremente (el widget de
Auth del emulador), sin riesgo para los datos reales.

## Despliegue

Nada extra: se despliega con la app en Vercel. Solo hay que publicar las
reglas nuevas de `onlineRooms`:

```bash
firebase deploy --only firestore:rules
```
