# Login social (Google / GitHub)

El login enlaza la sesión de invitado (anónima) con Google o GitHub usando el
flujo de **redirect** de Firebase, y vuelve a la página que mandó al usuario a
`/login` (`?next=`).

## El problema del dominio de Auth

Con `authDomain = <proyecto>.firebaseapp.com`, el resultado del redirect se
guarda en un dominio distinto al de la app. Chrome, Safari y Firefox
particionan hoy el almacenamiento de terceros, así que la app puede volver de
Google sin recibir el resultado: el usuario sigue como invitado. La app ahora
lo detecta y muestra un aviso en `/login` en lugar de fallar en silencio.

## Solución recomendada (Firebase "opción 3": proxy)

`next.config.ts` ya proxya `/__/auth/*` y `/__/firebase/*` hacia
`https://<proyecto>.firebaseapp.com`. Para activarlo:

1. En Vercel: `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=self` y redeploy. La app usa su
   propio dominio como `authDomain`.
2. Firebase Console > Authentication > Settings > Authorized domains: agrega el
   dominio de producción (si no está).
3. Google Cloud Console > APIs & Services > Credentials > el cliente OAuth web
   de Firebase: agrega `https://TU-DOMINIO/__/auth/handler` a los redirect URIs
   autorizados.
4. GitHub > Settings > Developer settings > OAuth Apps > tu app: cambia el
   callback a `https://TU-DOMINIO/__/auth/handler`.

Sin estos pasos deja la variable con el valor `*.firebaseapp.com` de siempre.

## Local

`npm run dev:emu` usa el emulador de Auth: el botón de Google abre el widget del
emulador, donde se crean cuentas de prueba sin tocar producción.
