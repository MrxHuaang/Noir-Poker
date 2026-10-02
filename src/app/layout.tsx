import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Big_Shoulders_Stencil, Geist, Geist_Mono, Instrument_Serif, Pixelify_Sans } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { GlobalBackground } from "@/components/ui/GlobalBackground";
import { AuthProvider } from "@/hooks/useAuth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial display serif for titles (Noir card-room voice).
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

// Noir 1929 layer: crate stencil for display, condensed grotesk for labels,
// pixel type for printed tags (see src/app/noir.css).
const bigStencil = Big_Shoulders_Stencil({
  variable: "--font-big-stencil",
  subsets: ["latin"],
  axes: ["opsz"],
  // No metric overrides exist for this family; skip the fallback shim.
  adjustFontFallback: false,
});

const bigShoulders = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
  axes: ["opsz"],
  // No metric overrides exist for this family; skip the fallback shim.
  adjustFontFallback: false,
});

const pixelify = Pixelify_Sans({
  variable: "--font-pixelify",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Noir — Poker multi-dispositivo",
  description:
    "Club de póker de 1929 para jugar entre amigos. Mesas abiertas y torneos, desde cualquier dispositivo.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0e0c0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${bigStencil.variable} ${bigShoulders.variable} ${pixelify.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <GlobalBackground />
        <AuthProvider>
          <Nav />
          <main className="relative z-[2] flex-1 flex flex-col">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
