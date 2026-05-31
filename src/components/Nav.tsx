"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Coins, Trophy, Tv, X } from "lucide-react";
import { BorderGlow } from "@/components/ui/BorderGlow";
import { PillNav } from "@/components/nav/PillNav";

const ACCENTS = {
  emerald: {
    badge: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30",
    cta: "bg-emerald-500/90 text-emerald-950 hover:bg-emerald-400",
    iconBg: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
    glow: "152 72 48" as const,
    bg: "rgba(6, 24, 18, 0.78)",
  },
  amber: {
    badge: "bg-amber-500/15 text-amber-200 ring-amber-400/30",
    cta: "bg-amber-500/90 text-amber-950 hover:bg-amber-400",
    iconBg: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
    glow: "40 80 50" as const,
    bg: "rgba(28, 18, 6, 0.78)",
  },
  rose: {
    badge: "bg-rose-500/15 text-rose-200 ring-rose-400/30",
    cta: "bg-rose-500/90 text-rose-950 hover:bg-rose-400",
    iconBg: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
    glow: "350 80 55" as const,
    bg: "rgba(28, 8, 14, 0.78)",
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
  glowColors,
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
  glowColors: string[];
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
        colors={glowColors}
        fillOpacity={0.42}
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
            <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition ${a.cta}`}>
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

  // BUG-010: cerrar modal con Escape (estándar WCAG para dialogs)
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
            glowColor="38 70 60"
            backgroundColor="rgba(7, 7, 8, 0.86)"
            borderRadius={999}
            glowRadius={22}
            glowIntensity={0.85}
            coneSpread={28}
            animated={false}
            colors={["#e0b15e", "#f0c98a", "#c2415a", "#64748b"]}
            fillOpacity={0.32}
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
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
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
                accent="emerald"
                title="Presencial"
                subtitle="Sin apuestas · Para mesa real"
                description="Big screen muestra mesa. Cada jugador ve sus cartas en su teléfono. Equity y stats para el host."
                features={["Hasta 9 jugadores", "All-in con run-it-N", "Equity en vivo (solo host)"]}
                cta="Abrir mesa"
                glowColors={["#34d399", "#10b981", "#6ee7b7"]}
                onNavigate={() => setShowModal(false)}
              />
              <ModeCard
                href="/host/normal"
                icon={<Coins className="w-5 h-5" />}
                accent="amber"
                title="Normal"
                subtitle="Apuestas virtuales · Online"
                description="Sala online con fichas, ciegas y apuestas reales. Todo en cada teléfono. El dueño configura reglas."
                features={["Slider de apuestas + presets", "Time bank por jugador", "Side pots automáticos"]}
                cta="Crear sala"
                glowColors={["#fbbf24", "#f59e0b", "#fde68a"]}
                onNavigate={() => setShowModal(false)}
              />
              <ModeCard
                href="/host/torneo"
                icon={<Trophy className="w-5 h-5" />}
                accent="rose"
                title="Torneo"
                subtitle="Ciegas escalonadas · Admin"
                description="Estructura de torneo con niveles de ciegas, antes y timer. Panel de admin con estadísticas en vivo."
                features={["Niveles automáticos", "Knockouts + ranking final", "Panel admin con equity"]}
                cta="Crear torneo"
                glowColors={["#fb7185", "#f43f5e", "#fda4af"]}
                onNavigate={() => setShowModal(false)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
