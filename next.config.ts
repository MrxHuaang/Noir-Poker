import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
          // Anti-clickjacking: el sitio no puede embeberse en iframes.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
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
    ];
  },
};

export default nextConfig;
