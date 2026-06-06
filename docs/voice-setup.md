# Canal de voz — setup y arquitectura

Guía para activar el canal de voz entre teléfonos en `/play/[code]`. El código ya está implementado; este documento cubre la configuración externa (Supabase + TURN) y cómo se comporta.

---

## 1. ¿Por qué hay dos backends (Firebase + Supabase)?

`poker-sim` ya usa **Firebase Firestore** para persistir cuartos, lobby y cartas. Esto se conserva intacto.

El canal de voz necesita una capa de **señalización WebRTC** (intercambio breve de SDP/ICE entre peers antes de establecer la conexión P2P). En lugar de reescribir esa capa sobre Firestore (Firestore tiene latencia alta y costos por mensaje), reutilizamos **Supabase Realtime Broadcast + Presence** del repo `Comunicaciones-web-app` original, que ya estaba battle-tested.

Cargas relativas:
- **Firebase Firestore:** estado del juego, cartas, lobby (lo que ya existía).
- **Supabase Realtime:** quién está conectado al canal de voz y mensajes efímeros de señalización WebRTC. Sin tablas SQL, sin migraciones.
- **WebRTC P2P (con STUN/TURN):** el audio en sí, directo entre teléfonos.

El `callId` del canal de voz es el mismo `code` del cuarto Firestore: si estás en sala `ABC23`, te unes al canal Supabase `voice:ABC23`.

---

## 2. Setup Supabase (5 minutos)

1. Crear cuenta gratis en https://supabase.com y un proyecto nuevo (cualquier región cerca de tus jugadores).
2. En el dashboard del proyecto: **Project Settings → API**.
3. Copiar:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Pegarlas en tu `.env.local`.
5. **Nada más.** No crear tablas, no correr migraciones, no configurar RLS. Realtime Broadcast acepta clientes anónimos con la anon key por defecto.

---

## 3. Setup TURN (Metered.ca free tier)

WebRTC necesita un servidor TURN cuando los peers están detrás de NAT simétrico (típico en redes móviles 4G/5G de LatAm, hoteles, WiFi corporativos). Sin TURN la llamada se queda en `connecting…` para siempre.

1. Crear cuenta gratis en https://www.metered.ca (50 GB/mes).
2. Dashboard → crear una app → copiar credenciales TURN.
3. Pegar en `.env.local`:

```
NEXT_PUBLIC_TURN_URL=turn:standard.relay.metered.ca:80
NEXT_PUBLIC_TURN_URL_TLS=turns:standard.relay.metered.ca:443
NEXT_PUBLIC_TURN_USERNAME=<tu username de Metered>
NEXT_PUBLIC_TURN_CREDENTIAL=<tu credential de Metered>
```

(Las URLs exactas pueden variar según tu cuenta; usa las que Metered te muestre.)

### Aviso de seguridad — TURN credentials expuestas al cliente

Las variables `NEXT_PUBLIC_*` se incluyen en el bundle de JavaScript del cliente. Cualquiera puede abrir DevTools y leerlas.

**Riesgo:** un tercero puede copiar tu `username` y `credential`, configurar su propio proyecto WebRTC contra tu servidor TURN, y consumir tu cuota gratuita (50 GB/mes) en pocos días.

**Para uso casero / con amigos:** el riesgo es bajo y la simplicidad compensa. Aceptado.

**Para deploy público:** implementar credenciales temporales antes de salir a producción. Bosquejo:

1. Guardar el **secret** de Metered (no la credential pública) en una variable `TURN_SECRET` *sin* el prefijo `NEXT_PUBLIC_` — así vive solo en el servidor.
2. Crear un Route Handler en `src/app/api/turn/route.ts` que llame a la REST API de Metered con `TURN_SECRET` para generar credenciales con TTL de minutos.
3. Modificar `useVoiceWebRTC.ts` para `fetch('/api/turn')` al construir `RTCConfiguration` en lugar de leer `NEXT_PUBLIC_TURN_*`.

Esto saca las credenciales del bundle. Mitigación adicional: rotar las credenciales en Metered mensualmente.

---

## 4. Smoke test

```bash
npm install
npm run build        # debe pasar sin errores TypeScript
npm run dev          # http://localhost:3000
```

1. **PC:** abrir `http://localhost:3000/host` → aparece código (ej. `ABC23`).
2. **Móvil 1** (en LAN con la IP del PC o via ngrok / Vercel preview con HTTPS): `https://<host>/play/ABC23` → llenar nombre → "Unirme al canal de voz" → aceptar permiso de micrófono.
3. **Móvil 2:** idem en otra pestaña o dispositivo.
4. Hablar en uno; el otro debe escuchar. Probar mute/unmute (botón o tecla `M`).
5. Verificar consola del navegador: ningún `error`. Un warning `TURN no configurado` significa que tus env vars no se cargaron.

**Verificación de bitrate (opcional pero recomendada):** abrir `chrome://webrtc-internals` mientras la llamada está activa. En el `outbound-rtp` del codec Opus debe verse `bitrate` ≈ 24 kbps (en lugar del default 40-64 kbps).

---

## 5. Troubleshooting

### No se escucha audio en iOS Safari
Safari requiere un gesto del usuario antes de reproducir audio. El botón "Unirme al canal de voz" cubre ese gesto. Si aún así no se escucha:
- Confirma que el `<audio>` remoto tiene `playsInline` (ya lo tiene en `RemoteAudio.tsx`).
- Bloquea ventanas emergentes desactivadas en Safari.
- Modo de bajo consumo en iOS reduce algunos APIs — desactivarlo temporalmente.

### Connection state se queda en `failed`
Falta TURN o las credenciales son inválidas. Verifica las 4 env vars `NEXT_PUBLIC_TURN_*` y que el `.env.local` esté en la raíz del proyecto.

### Funciona en localhost pero no en deploy
`getUserMedia` exige HTTPS en producción. Vercel/Netlify lo hacen por defecto. Si tienes un dominio custom, verifica que el certificado esté activo.

### Eco / feedback entre dispositivos cercanos
- El host (TV) **no se une al canal** por diseño. Si oyes audio saliendo de la TV, hay un bug.
- Si dos teléfonos están en la misma habitación sin audífonos, vas a tener eco. Usar audífonos o alejar los dispositivos.

### El audio se corta cuando bloqueo la pantalla o cambio de app (iOS y Android)
**Comportamiento esperado del SO**, no un bug. Cuando el navegador pasa a background, el sistema suspende los hilos de JavaScript y WebRTC para ahorrar batería. La web no tiene permisos de "background audio" como una app nativa.

Mitigaciones aplicadas:
- **Wake Lock API**: al unirse al canal, el código pide `navigator.wakeLock.request('screen')` automáticamente. Esto evita que la pantalla se apague por inactividad. Soporta iOS Safari 16.4+ y Android Chrome modernos; degrada silenciosamente en navegadores viejos.
- **Re-adquisición al volver al frente**: si el usuario minimiza y vuelve, el lock se vuelve a pedir.

Recomendaciones a los jugadores:
- **Mantener Safari/Chrome en primer plano** durante la partida. Al minimizar, el audio se corta. Al volver, la conexión se rebuilda en ~5-10s.
- **Para sesiones largas (torneos):** usar audífonos con cable o Bluetooth para liberar las manos.

### Audio entrecortado o de baja calidad
- **Cap de 24 kbps por diseño.** Es suficiente para voz humana pero podría sonar comprimido si la conexión también está mal. Si quieres más calidad, sube `OPUS_MAX_BITRATE` en `src/hooks/useVoiceWebRTC.ts` — pero ojo con el ancho de banda en full-mesh con muchos jugadores.
- En 4G con señal pobre, el delay puede subir a 1-2s. Es WebRTC, no hay magia.

### Permiso de micrófono denegado
El navegador recordó el "Block" anterior. Pasos:
- **Chrome/Edge:** candado en la barra de URL → Permisos del sitio → Micrófono → Allow → recargar.
- **Safari iOS:** Settings → Safari → Camera/Microphone → Allow.

---

## 6. Arquitectura de archivos

| Archivo | Rol |
|---|---|
| `src/lib/supabaseClient.ts` | Cliente Supabase singleton |
| `src/hooks/useVoiceWebRTC.ts` | Peer connections WebRTC + cap Opus 24 kbps |
| `src/hooks/useVoiceRoom.ts` | Presence + signaling channel orquestador |
| `src/hooks/useAudioLevel.ts` | Indicador "está hablando" (throttle 12 fps) |
| `src/components/voice/VoicePanel.tsx` | UI principal + Wake Lock |
| `src/components/voice/RemoteAudio.tsx` | `<audio>` invisible por peer remoto |

Importante: `VoicePanel` se importa con `next/dynamic({ ssr: false })` en `src/app/play/[code]/page.tsx` para evitar que Next.js intente pre-renderizar APIs del navegador (`navigator.mediaDevices`, `RTCPeerConnection`, `AudioContext`) en el servidor.

---

## 7. Escalabilidad y límites conocidos

- **Topología full-mesh.** Cada teléfono mantiene N-1 peer connections. Con 6 jugadores son 5 conexiones por dispositivo; con 10, son 9. CPU y batería escalan linealmente.
- **Mitigaciones aplicadas:** bitrate Opus capeado a 24 kbps (vs default 40-64), `useAudioLevel` throttled a 12 fps.
- **Si las pruebas reales con 10 jugadores calientan los teléfonos:** considerar evolución a SFU (selective forwarding unit) como mediasoup o LiveKit. Cambio mayor de arquitectura, fuera del scope actual.
- **Cuota Supabase Realtime free:** 2M mensajes/mes. Cada llamada usa ~50-100 mensajes de setup. Suficiente para miles de partidas.
- **Cuota TURN Metered free:** 50 GB/mes. Con cap 24 kbps ≈ 10-12 horas de relay por GB → ~400-500 horas/mes.

---

## 8. ¿Qué NO está incluido (a propósito)?

Lo siguiente vive en `Comunicaciones-web-app` pero NO se portó:
- **Chat de texto** durante la llamada (`useCallMessages`, `CallChatPanel`).
- **Compartir pantalla** con sistema de solicitud/aceptación.
- **Moods/emojis** por participante.
- **Sistema de amistades** y solicitudes.
- **Host (TV) como participante** del canal — evita feedback con micros cercanos.

Si necesitas alguno, vuelve al repo original para portarlo siguiendo el mismo patrón.
