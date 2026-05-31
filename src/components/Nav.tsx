"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Coins, Trophy, Tv, X } from "lucide-react";
import { BorderGlow } from "@/components/ui/BorderGlow";
import { PillNav } from "@/components/nav/PillNav";

// Monochrome tiers — Noir. Differentiated only by glow brightness, not hue.
const ACCENTS = {
  one: {
    badge: "bg-white/[0.06] text-zinc-200 ring-white/15",
    cta: "bg-white text-black hover:bg-zinc-200",
    iconBg: "bg-white/[0.06] text-zinc-200 ring-white/15",
    glow: "0 0 90",
    glowColors: ["#ffffff", "#e4e4e7", "#a1a1aa"],
    bg: "rgba(14, 14, 16, 0.8)",
  },
  two: {
    badge: "bg-white/[0.06] text-zinc-200 ring-white/15",
    cta: "bg-white text-black hover:bg-zinc-200",
    iconBg: "bg-white/[0.06] text-zinc-200 ring-white/15",
    glow: "0 0 76",
    glowColors: ["#ededf2", "#c4c4cc", "#8a8a93"],
    bg: "rgba(11, 11, 13, 0.8)",
  },
  three: {
    badge: "bg-white/[0.06] text-zinc-200 ring-white/15",
    cta: "bg-white text-black hover:bg-zinc-200",
    iconBg: "bg-white/[0.06] text-zinc-200 ring-white/15",
    glow: "0 0 62",
    glowColors: ["#d4d4d8", "#a1a1aa", "#52525b"],
    bg: "rgba(9, 9, 11, 0.8)",
  },
} as const;

type AccentKey = keyof typeof ACCENTS;

function ModeCard({
  href,
  icon,
  accent,
  title,
  subtitle,
  description,
  features,
  cta,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  accent: AccentKey;
  title: string;
  subtitle: string;
  description: string;
  features: string[];
  cta: string;
  onNavigate: () => void;
}) {
  const a = ACCENTS[accent];
  return (
    <Link href={href} className="group block h-full btn-press" onClick={onNavigate}>
      <BorderGlow
        className="h-full w-full"
        edgeSensitivity={26}
        glowColor={a.glow}
        backgroundColor={a.bg}
        borderRadius={24}
        glowRadius={36}
        glowIntensity={1.05}
        coneSpread={22}
        animated={false}
        colors={a.glowColors as unknown as string[]}
        fillOpacity={0.4}
      >
        <div className="flex h-full flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <div className={`p-2.5 rounded-xl ring-1 ${a.iconBg}`}>{icon}</div>
            <span className={`text-[10px] uppercase tracking-[0.2em] px-2 py-1 rounded-full ring-1 ${a.badge}`}>
              Disponible
            </span>
          </div>
          <div>
            <h3 className="text-xl text-zinc-50 font-semibold tracking-tight">{title}</h3>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mt-1">{subtitle}</p>
          </div>
          <p className="text-sm text-zinc-300/90">{description}</p>
          <ul className="flex flex-col gap-1.5">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="w-1 h-1 rounded-full bg-zinc-500" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-1">
            <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition ${a.cta}`}>
              {cta}
              <ArrowRight className="w-4 h-4" />
            </span>
          </div>
        </div>
      </BorderGlow>
    </Link>
  );
}

export function Nav() {
  const path = usePathname();
  const [showModal, setShowModal] = useState(false);

  // Close the create modal with Escape (WCAG dialog standard).
  useEffect(() => {
    if (!showModal) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowModal(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [showModal]);

  if (
    path?.startsWith("/host") ||
    path?.startsWith("/play/normal") ||
    path?.startsWith("/play/torneo")
  ) {
    return null;
  }

  const navItems = [
    { href: "/lobby", label: "Lobby" },
    { href: "#", label: "Crear sala", onClick: () => setShowModal(true) },
    { href: "/join", label: "Unirse" },
  ];

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-white/[0.06] backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-3 py-2.5 sm:px-4">
          <BorderGlow
            className="w-full !border-white/10"
            edgeSensitivity={20}
            glowColor="0 0 82"
            backgroundColor="rgba(7, 7, 8, 0.88)"
            borderRadius={999}
            glowRadius={22}
            glowIntensity={0.85}
            coneSpread={28}
            animated={false}
            colors={["#ededf2", "#c4c4cc", "#8a8a93", "#52525b"]}
            fillOpacity={0.3}
          >
            <div className="min-h-0 overflow-hidden rounded-[inherit] px-2 py-1.5 sm:px-3 sm:py-2">
              <PillNav
                logo="/logo.svg"
                logoAlt="Noir"
                logoHref="/"
                brandTitle="Noir"
                items={navItems}
                activePath={path}
              />
            </div>
          </BorderGlow>
        </div>
      </header>

      {showModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Crear sala"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <div className="w-full max-w-4xl flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xl font-semibold tracking-tight text-zinc-100">
                Elige un modo
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-zinc-200 transition"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <ModeCard
                href="/host"
                icon={<Tv className="w-5 h-5" />}
                accent="one"
                title="Presencial"
                subtitle="Sin apuestas · Para mesa real"
                description="Big screen muestra la mesa. Cada jugador ve sus cartas en su teléfono. Equity y stats para el host."
                features={["Hasta 9 jugadores", "All-in con run-out", "Equity en vivo (solo host)"]}
                cta="Abrir mesa"
                onNavigate={() => setShowModal(false)}
              />
              <ModeCard
                href="/create"
                icon={<Coins className="w-5 h-5" />}
                accent="two"
                title="Online"
                subtitle="Apuestas virtuales · Lobby"
                description="Sala con fichas y apuestas. Crea pública o privada; las reglas se ajustan dentro de la mesa."
                features={["Lobby de mesas en vivo", "Pública o privada", "Side pots automáticos"]}
                cta="Crear sala"
                onNavigate={() => setShowModal(false)}
              />
              <ModeCard
                href="/host/torneo"
                icon={<Trophy className="w-5 h-5" />}
                accent="three"
                title="Torneo"
                subtitle="Ciegas escalonadas · Admin"
                description="Estructura de torneo con niveles de ciegas, antes y timer. Panel de admin con estadísticas en vivo."
                features={["Niveles automáticos", "Knockouts + ranking final", "Panel admin con equity"]}
                cta="Crear torneo"
                onNavigate={() => setShowModal(false)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
