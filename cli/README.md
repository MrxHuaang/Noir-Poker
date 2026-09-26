# Poker Terminal

Cliente de póker para la terminal que se une a la **misma partida online** que la
web (`/play/online/[code]`). Un asiento en la terminal y un asiento en el navegador
con el **mismo código de sala** comparten una sola mesa y juegan entre sí.

No corre lógica de juego localmente: la API autoritativa de la app
(`/api/online`, una transacción de Firestore por jugada) reparte, valida apuestas
y resuelve el showdown. Este cliente lee el estado público de Firestore, sus
propias cartas, y envía sus acciones.

## Uso

```bash
npm run play -- ABCDE "Tu Nombre"
# contra otra URL de la app (por defecto http://localhost:3000):
npm run play -- ABCDE "Tu Nombre" --app https://tu-app.vercel.app
```

- Crea la sala desde la web (`/play/online`) y usa su código.
- El cliente entra con una **sesión anónima** de Firebase: solo puede sentarse en
  mesas **casuales** (sin fichas). Las mesas con monedas piden cuenta real.
- Lee la config de Firebase de `NEXT_PUBLIC_FIREBASE_*` (entorno o `.env.local`).
  Con `NEXT_PUBLIC_FIREBASE_EMULATORS=true` apunta a los emuladores locales.

### Teclas

| Tecla | Acción |
| ----- | ------ |
| `D` / `S` | Repartir (si eres el anfitrión) |
| `F` | Retirarse (fold) |
| `K` | Pasar (check) |
| `C` | Igualar (call) — o pasar si no hay apuesta |
| `R` | Subir / apostar (pide el monto total) |
| `A` | All-in |
| `Q` | Salir (te levanta de la mesa) |

### Configuración

| Variable / flag | Por defecto | Qué hace |
| --------------- | ----------- | -------- |
| `--app <url>` / `POKER_APP_URL` | `http://localhost:3000` | URL de la app Next.js |

El nombre visible se guarda como apodo del perfil anónimo al conectar.
