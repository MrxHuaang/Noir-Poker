"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Smartphone,
  Tv,
  Coins,
  Trophy,
  ArrowRight,
  Users,
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
        <div className="absolute inset-0 opacity-[0.48]">
          <FaultyTerminal
            className="h-full min-h-[100dvh] w-full"
            scale={1.35}
            gridMul={HOME_TERMINAL_GRID}
            digitSize={1.25}
            timeScale={0.48}
            pause={pauseTerminalBg}
            scanlineIntensity={0.42}
            glitchAmount={1}
            flickerAmount={0.85}
            noiseAmp={0.92}
            chromaticAberration={0}
            dither={0.35}
            curvature={0.1}
            tint="#8fb5a3"
            mouseReact={false}
            mouseStrength={0.35}
            pageLoadAnimation={false}
            brightness={pauseTerminalBg ? 0.52 : 0.58}
          />
        </div>
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 100% 72% at 50% 44%, rgba(6,7,10,0.18) 0%, rgba(6,7,10,0.58) 58%, rgba(6,7,10,0.82) 100%), linear-gradient(180deg, rgba(6,7,10,0.38) 0%, transparent 26%, transparent 74%, rgba(6,7,10,0.48) 100%)",
          }}
        />
      </div>

      <div className="relative z-[2] w-full max-w-5xl mx-auto px-4 py-12 sm:py-16 flex flex-col items-center gap-12">
      <header className="flex flex-col items-center gap-4 text-center">
        <Logo size={56} />
        <h1 className="text-4xl sm:text-5xl tracking-tight text-zinc-50 font-semibold">
          Showdown
        </h1>
        <p className="text-sm sm:text-base text-zinc-400 max-w-xl">
          Texas Hold&apos;em multi-dispositivo. Tres modos: presencial sin
          apuestas, sala normal con fichas o torneo administrado con ciegas
          escalonadas.
        </p>
      </header>

      <section className="w-full grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ModeCard
          href="/host"
          status="active"
          icon={<Tv className="w-5 h-5" />}
          accent="emerald"
          title="Presencial"
          subtitle="Sin apuestas · Para mesa real"
          description="Big screen muestra mesa. Cada jugador ve sus cartas en su teléfono. Equity y stats para el host."
          features={[
            "Hasta 9 jugadores",
            "All-in con run-it-N",
            "Equity en vivo (solo host)",
          ]}
          cta="Abrir mesa"
          glowColors={["#34d399", "#10b981", "#6ee7b7"]}
        />
        <ModeCard
          href="/host/normal"
          status="active"
          icon={<Coins className="w-5 h-5" />}
          accent="amber"
          title="Normal"
          subtitle="Apuestas virtuales · Online"
          description="Sala online con fichas, ciegas y apuestas reales. Todo en cada teléfono. El dueño configura reglas."
          features={[
            "Slider de apuestas + presets",
            "Time bank por jugador",
            "Side pots automáticos",
          ]}
          cta="Crear sala"
          glowColors={["#fbbf24", "#f59e0b", "#fde68a"]}
        />
        <ModeCard
          href="/host/torneo"
          status="active"
          icon={<Trophy className="w-5 h-5" />}
          accent="rose"
          title="Torneo"
          subtitle="Ciegas escalonadas · Admin"
          description="Estructura de torneo con niveles de ciegas, antes y timer. Panel de admin con estadísticas en vivo."
          features={[
            "Niveles automáticos",
            "Knockouts + ranking final",
            "Panel admin con equity",
          ]}
          cta="Crear torneo"
          glowColors={["#fb7185", "#f43f5e", "#fda4af"]}
        />
      </section>

      <section className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/join"
          className="group flex items-center justify-between gap-3 p-4 rounded-2xl glass hover:bg-white/[0.06] transition btn-press"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-400/30">
              <Smartphone className="w-4 h-4 text-emerald-300" />
            </div>
            <div>
              <div className="text-sm text-zinc-100">Unirme a una sala</div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Tengo un código o QR
              </p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-zinc-200 transition" />
        </Link>
        <Link
          href="/players"
          className="group flex items-center justify-between gap-3 p-4 rounded-2xl glass hover:bg-white/[0.06] transition btn-press"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/5 ring-1 ring-white/10">
              <Users className="w-4 h-4 text-zinc-300" />
            </div>
            <div>
              <div className="text-sm text-zinc-100">Roster local</div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Atajo para modo presencial sin sala
              </p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-zinc-200 transition" />
        </Link>
      </section>

      <footer className="text-[11px] uppercase tracking-[0.25em] text-zinc-600 flex items-center gap-2">
        <Sparkles className="w-3 h-3" />
        Showdown · v1
      </footer>
      </div>
    </div>
  );
}

const ACCENTS: Record<
  string,
  { badge: string; cta: string; ctaHover: string; iconBg: string; glow: string; bg: string }
> = {
  emerald: {
    badge: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30",
    cta: "bg-emerald-500/90 text-emerald-950",
    ctaHover: "hover:bg-emerald-400",
    iconBg: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
    glow: "152 72 48",
    bg: "rgba(6, 24, 18, 0.78)",
  },
  amber: {
    badge: "bg-amber-500/15 text-amber-200 ring-amber-400/30",
    cta: "bg-amber-500/90 text-amber-950",
    ctaHover: "hover:bg-amber-400",
    iconBg: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
    glow: "40 80 50",
    bg: "rgba(28, 18, 6, 0.78)",
  },
  rose: {
    badge: "bg-rose-500/15 text-rose-200 ring-rose-400/30",
    cta: "bg-rose-500/90 text-rose-950",
    ctaHover: "hover:bg-rose-400",
    iconBg: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
    glow: "350 80 55",
    bg: "rgba(28, 8, 14, 0.78)",
  },
};

function ModeCard({
  href,
  status,
  icon,
  accent,
  title,
  subtitle,
  description,
  features,
  cta,
  glowColors,
}: {
  href: string;
  status: "active" | "soon";
  icon: React.ReactNode;
  accent: "emerald" | "amber" | "rose";
  title: string;
  subtitle: string;
  description: string;
  features: string[];
  cta: string;
  glowColors: string[];
}) {
  const a = ACCENTS[accent];
  const disabled = status === "soon";

  const body = (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className={`p-2.5 rounded-xl ring-1 ${a.iconBg}`}>{icon}</div>
        <span
          className={`text-[10px] uppercase tracking-[0.2em] px-2 py-1 rounded-full ring-1 ${a.badge}`}
        >
          {disabled ? "Próximamente" : "Disponible"}
        </span>
      </div>
      <div>
        <h3 className="text-xl text-zinc-50 font-semibold tracking-tight">
          {title}
        </h3>
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mt-1">
          {subtitle}
        </p>
      </div>
      <p className="text-sm text-zinc-300/90">{description}</p>
      <ul className="flex flex-col gap-1.5">
        {features.map((f) => (
          <li
            key={f}
            className="flex items-center gap-2 text-xs text-zinc-400"
          >
            <span className="w-1 h-1 rounded-full bg-zinc-500" />
            {f}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-1">
        <span
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition ${
            disabled
              ? "bg-white/5 ring-1 ring-white/10 text-zinc-400"
              : `${a.cta} ${a.ctaHover}`
          }`}
        >
          {cta}
          {!disabled ? <ArrowRight className="w-4 h-4" /> : null}
        </span>
      </div>
    </div>
  );

  const glow = (
    <BorderGlow
      className="h-full w-full"
      edgeSensitivity={26}
      glowColor={a.glow}
      backgroundColor={a.bg}
      borderRadius={24}
      glowRadius={36}
      glowIntensity={disabled ? 0.6 : 1.05}
      coneSpread={22}
      animated={false}
      colors={glowColors}
      fillOpacity={0.42}
    >
      {body}
    </BorderGlow>
  );

  if (disabled) {
    return (
      <div aria-disabled className="block h-full opacity-90">
        {glow}
      </div>
    );
  }
  return (
    <Link href={href} className="group block h-full btn-press">
      {glow}
    </Link>
  );
}
