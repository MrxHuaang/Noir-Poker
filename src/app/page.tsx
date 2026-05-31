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
  Star,
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
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 40% at 50% -5%, rgba(180,130,40,0.07) 0%, transparent 70%)",
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

        <SiteFooter />
      </div>
    </div>
  );
}

const TIERS: Record<
  "one" | "two" | "three",
  { glow: string; colors: string[]; bg: string }
> = {
  one: {
    glow: "38 65 68",
    colors: ["#d4bf94", "#b8994e", "#7a6030"],
    bg: "rgba(14,12,8,0.85)",
  },
  two: {
    glow: "260 30 68",
    colors: ["#c4bdd8", "#9b93b8", "#6b6380"],
    bg: "rgba(11,10,14,0.85)",
  },
  three: {
    glow: "35 25 52",
    colors: ["#b0a88a", "#7a7260", "#52493a"],
    bg: "rgba(9,8,6,0.85)",
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
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition bg-amber-950/40 text-amber-200 ring-1 ring-amber-600/40 group-hover:bg-amber-900/55 group-hover:ring-amber-500/55 group-hover:shadow-[0_0_22px_rgba(180,130,40,0.18)]">
              {cta}
              <ArrowRight className="w-4 h-4" />
            </span>
          </div>
        </div>
      </BorderGlow>
    </Link>
  );
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function SiteFooter() {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    fetch("https://api.github.com/repos/MrxHuaang/poker-sim")
      .then((r) => r.json())
      .then((d) => typeof d.stargazers_count === "number" && setStars(d.stargazers_count))
      .catch(() => {});
  }, []);

  return (
    <footer className="w-full flex flex-col items-center gap-3 pb-2">
      <div className="w-full h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />
      <div className="flex items-center gap-6 flex-wrap justify-center">
        <a
          href="https://github.com/MrxHuaang/poker-sim"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 transition text-[11px] tracking-wide group"
        >
          <GithubIcon />
          poker-sim
        </a>
        {stars !== null && (
          <span className="flex items-center gap-1 text-[11px] text-zinc-600">
            <Star className="w-3 h-3 fill-zinc-700 text-zinc-700" />
            {stars}
          </span>
        )}
        <span className="text-zinc-700 text-[11px]">·</span>
        <a
          href="https://github.com/MrxHuaang"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-zinc-500 hover:text-zinc-300 transition tracking-wide"
        >
          @MrxHuaang
        </a>
        <span className="text-zinc-700 text-[11px]">·</span>
        <a
          href="https://github.com/poethy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-zinc-500 hover:text-zinc-300 transition tracking-wide"
        >
          @poethy
        </a>
        <span className="text-zinc-700 text-[11px]">·</span>
        <a
          href="https://github.com/JuanGaitanD"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-zinc-500 hover:text-zinc-300 transition tracking-wide"
        >
          @JuanGaitanD
        </a>
        <span className="text-zinc-700 text-[11px]">·</span>
        <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-700">
          Noir v1
        </span>
      </div>
    </footer>
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
