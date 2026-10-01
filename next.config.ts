import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root: a stray lockfile in a parent directory made
  // Turbopack pick the home folder as root (slow file watching, wrong root).
  turbopack: { root: process.cwd() },
  // Firebase Auth helper served from our own origin. Browsers that partition
  // third-party storage (Chrome, Safari, Firefox) break the OAuth redirect
  // when authDomain is <project>.firebaseapp.com: the result never reaches
  // the app. With NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=self the SDK uses this
  // origin as authDomain and these rewrites proxy the helper (Firebase's
  // "Option 3"). See docs/auth-setup.md for the provider console steps.
  async rewrites() {
    const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!project) return [];
    return [
      { source: "/__/auth/:path*", destination: `https://${project}.firebaseapp.com/__/auth/:path*` },
      { source: "/__/firebase/:path*", destination: `https://${project}.firebaseapp.com/__/firebase/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            // Necesario para los popups de OAuth (signInWithPopup).
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          // Evita sniffing de tipo MIME.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // No filtrar la URL completa como referer a terceros.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Desactiva APIs no usadas. microphone=(self): el canal de voz
          // (WebRTC en /play) necesita getUserMedia en el mismo origen.
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), browsing-topics=(), microphone=(self)",
          },
        ],
      },
      {
        // Anti-clickjacking: el sitio no puede embeberse en iframes...
        source: "/:path((?!noir/).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
      {
        // ...salvo la escena 3D (public/noir), que la landing embebe desde el
        // mismo origen. Nadie de fuera puede enmarcarla.
        source: "/noir/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
