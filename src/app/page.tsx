"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Tv,
  Coins,
  Trophy,
  ArrowRight,
  KeyRound,
  LayoutGrid,
  Sparkles,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { BorderGlow } from "@/components/ui/BorderGlow";
import { FaultyTerminal } from "@/components/ui/FaultyTerminal";

const HOME_TERMINAL_GRID: [number, number] = [2, 1];

export default function Home() {
  const [pauseTerminalBg, setPauseTerminalBg] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPauseTerminalBg(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <div className="relative isolate min-h-full w-full">
      <div
        className="pointer-events-none fixed inset-0 z-[1] overflow-hidden"
        aria-hidden
      >
        <div className="absolute inset-0 opacity-[0.42]">
          <FaultyTerminal
            className="h-full min-h-[100dvh] w-full"
            scale={1.35}
            gridMul={HOME_TERMINAL_GRID}
            digitSize={1.25}
            timeScale={0.46}
            pause={pauseTerminalBg}
            scanlineIntensity={0.4}
            glitchAmount={1}
            flickerAmount={0.8}
            noiseAmp={0.9}
            chromaticAberration={0}
            dither={0.35}
            curvature={0.1}
            tint="#b8b8c0"
            mouseReact={false}
            mouseStrength={0.3}
            pageLoadAnimation={false}
            brightness={pauseTerminalBg ? 0.5 : 0.56}
          />
        </div>
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 100% 72% at 50% 44%, rgba(7,7,8,0.18) 0%, rgba(7,7,8,0.6) 58%, rgba(7,7,8,0.85) 100%), linear-gradient(180deg, rgba(7,7,8,0.4) 0%, transparent 26%, transparent 74%, rgba(7,7,8,0.5) 100%)",
          }}
        />
      </div>

      <div className="relative z-[2] w-full max-w-5xl mx-auto px-4 py-12 sm:py-16 flex flex-col items-center gap-12">
        <header className="flex flex-col items-center gap-4 text-center">
          <Logo size={60} />
          <h1 className="text-4xl sm:text-6xl tracking-tight text-zinc-50 font-semibold">
            Noir
          </h1>
          <p className="text-sm sm:text-base text-zinc-400 max-w-xl">
            Texas Hold&apos;em multi-dispositivo. Mesas públicas y privadas,
            modo presencial, sala online con fichas o torneo administrado.
          </p>
        </header>

        <section className="w-full grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ModeCard
            href="/host"
            icon={<Tv className="w-5 h-5" />}
            tier="one"
            title="Presencial"
            subtitle="Sin apuestas · Para mesa real"
            description="Big screen muestra la mesa. Cada jugador ve sus cartas en su teléfono. Equity y stats para el host."
            features={["Hasta 9 jugadores", "All-in con run-out", "Equity en vivo (solo host)"]}
            cta="Abrir mesa"
          />
          <ModeCard
            href="/create"
            icon={<Coins className="w-5 h-5" />}
            tier="two"
            title="Online"
            subtitle="Apuestas virtuales · Lobby"
            description="Sala con fichas, ciegas y apuestas. Crea pública o privada y aparece en el lobby para que entren."
            features={["Lobby de mesas en vivo", "Pública o privada", "Side pots automáticos"]}
            cta="Crear sala"
          />
          <ModeCard
            href="/host/torneo"
            icon={<Trophy className="w-5 h-5" />}
            tier="three"
            title="Torneo"
            subtitle="Ciegas escalonadas · Admin"
            description="Estructura de torneo con niveles de ciegas, antes y timer. Panel de admin con estadísticas en vivo."
            features={["Niveles automáticos", "Knockouts + ranking final", "Panel admin con equity"]}
            cta="Crear torneo"
          />
        </section>

        <section className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
          <QuickLink
            href="/lobby"
            icon={<LayoutGrid className="w-4 h-4" />}
            title="Ver mesas abiertas"
            sub="Lobby de salas en vivo"
          />
          <QuickLink
            href="/join"
            icon={<KeyRound className="w-4 h-4" />}
            title="Unirme con código"
            sub="Tengo un código o QR"
          />
        </section>

        <footer className="text-[11px] uppercase tracking-[0.25em] text-zinc-600 flex items-center gap-2">
          <Sparkles className="w-3 h-3" />
          Noir · v1
        </footer>
      </div>
    </div>
  );
}

const TIERS: Record<
  "one" | "two" | "three",
  { glow: string; colors: string[]; bg: string }
> = {
  one: {
    glow: "0 0 90",
    colors: ["#ffffff", "#e4e4e7", "#a1a1aa"],
    bg: "rgba(14,14,16,0.8)",
  },
  two: {
    glow: "0 0 76",
    colors: ["#ededf2", "#c4c4cc", "#8a8a93"],
    bg: "rgba(11,11,13,0.8)",
  },
  three: {
    glow: "0 0 62",
    colors: ["#d4d4d8", "#a1a1aa", "#52525b"],
    bg: "rgba(9,9,11,0.8)",
  },
};

function ModeCard({
  href,
  icon,
  tier,
  title,
  subtitle,
  description,
  features,
  cta,
}: {
  href: string;
  icon: React.ReactNode;
  tier: "one" | "two" | "three";
  title: string;
  subtitle: string;
  description: string;
  features: string[];
  cta: string;
}) {
  const t = TIERS[tier];
  return (
    <Link href={href} className="group block h-full btn-press">
      <BorderGlow
        className="h-full w-full"
        edgeSensitivity={26}
        glowColor={t.glow}
        backgroundColor={t.bg}
        borderRadius={24}
        glowRadius={36}
        glowIntensity={1.05}
        coneSpread={22}
        animated={false}
        colors={t.colors}
        fillOpacity={0.4}
      >
        <div className="flex h-full flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl ring-1 bg-white/[0.06] text-zinc-200 ring-white/15">
              {icon}
            </div>
            <span className="text-[10px] uppercase tracking-[0.2em] px-2 py-1 rounded-full ring-1 bg-white/[0.05] text-zinc-300 ring-white/15">
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
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition bg-white text-black group-hover:bg-zinc-200">
              {cta}
              <ArrowRight className="w-4 h-4" />
            </span>
          </div>
        </div>
      </BorderGlow>
    </Link>
  );
}

function QuickLink({
  href,
  icon,
  title,
  sub,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 p-4 rounded-2xl glass hover:bg-white/[0.06] transition btn-press"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-zinc-300">
          {icon}
        </div>
        <div>
          <div className="text-sm text-zinc-100">{title}</div>
          <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>
        </div>
      </div>
      <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-zinc-200 transition" />
    </Link>
  );
}
