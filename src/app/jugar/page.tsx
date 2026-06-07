"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  ArrowLeft,
  ArrowRight,
  Coins,
  KeyRound,
  Plus,
  Trophy,
  Tv,
} from "lucide-react";
import { BorderGlow } from "@/components/ui/BorderGlow";
import { ACCENT, ACCENT_GLOW_COLORS, ACCENT_GLOW_HSL } from "@/lib/brand";

type Step = 1 | 2;
type Tier = "one" | "two" | "three";

const TIERS: Record<Tier, { glow: string; colors: string[] }> = {
  one: {
    glow: ACCENT_GLOW_HSL,
    colors: ACCENT_GLOW_COLORS,
  },
  two: {
    glow: ACCENT_GLOW_HSL,
    colors: [ACCENT[300], ACCENT[500], ACCENT[800]],
  },
  three: {
    glow: ACCENT_GLOW_HSL,
    colors: [ACCENT[500], ACCENT[700], ACCENT[950]],
  },
};

export default function JugarPage() {
  const scope = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>(1);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".step-shell", {
          opacity: 0,
          y: 18,
          duration: 0.5,
          ease: "power3.out",
          clearProps: "all",
        });
        gsap.from(".step-card", {
          opacity: 0,
          y: 24,
          duration: 0.42,
          ease: "power3.out",
          stagger: 0.07,
          delay: 0.08,
          clearProps: "all",
        });
      });
      return () => mm.revert();
    },
    { scope, dependencies: [step], revertOnUpdate: true },
  );

  return (
    <div ref={scope} className="relative isolate min-h-full w-full">
      <div className="relative z-[2] mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-12 sm:gap-10 sm:py-16">
        <header className="step-shell flex flex-col items-center gap-4 text-center">
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-300">
            Acceso rápido
          </span>
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
              Jugar ahora
            </h1>
            <p className="mx-auto max-w-2xl text-sm text-secondary sm:text-base">
              Entra directo al flujo correcto según quieras crear una mesa nueva
              o unirte con código.
            </p>
          </div>
        </header>

        <section className="step-shell">
          <BorderGlow
            className="w-full lg-blur"
            edgeSensitivity={26}
            glowColor={ACCENT_GLOW_HSL}
            backgroundColor="rgba(9, 7, 16, 0.9)"
            borderRadius={28}
            glowRadius={36}
            glowIntensity={1.02}
            coneSpread={22}
            animated={false}
            colors={ACCENT_GLOW_COLORS}
            fillOpacity={0.34}
          >
            <div className="flex flex-col gap-6 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted">
                    Paso {step} de 2
                  </div>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-primary">
                    {step === 1
                      ? "¿Qué quieres hacer?"
                      : "Elige el tipo de sala"}
                  </h2>
                  <p className="mt-1 text-sm text-secondary">
                    {step === 1
                      ? "Empieza un flujo nuevo o usa tu código existente."
                      : "Reutiliza los modos que ya existen en la aplicación."}
                  </p>
                </div>
                {step === 2 ? (
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-4 py-2 text-sm font-semibold text-zinc-200 ring-1 ring-white/12 transition hover:bg-white/[0.1] hover:ring-white/20 btn-press"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Volver
                  </button>
                ) : null}
              </div>

              {step === 1 ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <ActionCardButton
                    icon={<Plus className="h-5 w-5" />}
                    title="Crear una sala nueva"
                    description="Te llevo al selector de modo para abrir una mesa presencial, online o torneo."
                    cta="Seguir"
                    onClick={() => setStep(2)}
                  />
                  <ActionCardLink
                    href="/join"
                    icon={<KeyRound className="h-5 w-5" />}
                    title="Unirme con código"
                    description="Usa el flujo existente para entrar rápido a una sala con código o QR."
                    cta="Ir a unirme"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <ModeCard
                    href="/host"
                    icon={<Tv className="h-5 w-5" />}
                    tier="one"
                    title="Presencial"
                    subtitle="Sin apuestas · Para mesa real"
                    description="Host abre la mesa en pantalla grande y cada jugador ve sus cartas privadas en su teléfono."
                    features={[
                      "Hasta 9 jugadores",
                      "Run-out múltiple",
                      "Historial de manos",
                    ]}
                    cta="Abrir mesa"
                  />
                  <ModeCard
                    href="/create"
                    icon={<Coins className="h-5 w-5" />}
                    tier="two"
                    title="Online"
                    subtitle="Apuestas virtuales · Lobby"
                    description="Sala con fichas virtuales, ciegas y reglas configurables dentro del flujo online."
                    features={[
                      "Pública o privada",
                      "Side pots automáticos",
                      "Lobby en tiempo real",
                    ]}
                    cta="Crear sala"
                  />
                  <ModeCard
                    href="/host/torneo"
                    icon={<Trophy className="h-5 w-5" />}
                    tier="three"
                    title="Torneo"
                    subtitle="Ciegas escalonadas · Admin"
                    description="El admin controla niveles, antes, ranking y el avance completo del torneo."
                    features={[
                      "Timer automático",
                      "Knockouts y ranking",
                      "Panel admin exclusivo",
                    ]}
                    cta="Crear torneo"
                  />
                </div>
              )}
            </div>
          </BorderGlow>
        </section>
      </div>
    </div>
  );
}

function ActionCardButton({
  icon,
  title,
  description,
  cta,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="step-card text-left btn-press group"
    >
      <ActionCardFrame
        icon={icon}
        title={title}
        description={description}
        cta={cta}
      />
    </button>
  );
}

function ActionCardLink({
  href,
  icon,
  title,
  description,
  cta,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="step-card btn-press group"
    >
      <ActionCardFrame
        icon={icon}
        title={title}
        description={description}
        cta={cta}
      />
    </Link>
  );
}

function ActionCardFrame({
  icon,
  title,
  description,
  cta,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  cta: string;
}) {
  return (
    <BorderGlow
      className="h-full w-full lg-blur"
      edgeSensitivity={26}
      glowColor={ACCENT_GLOW_HSL}
      backgroundColor="rgba(10, 8, 18, 0.88)"
      borderRadius={24}
      glowRadius={34}
      glowIntensity={1}
      coneSpread={22}
      animated={false}
      colors={ACCENT_GLOW_COLORS}
      fillOpacity={0.28}
    >
      <div className="flex h-full flex-col gap-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="rounded-xl bg-white/[0.06] p-2.5 text-zinc-200 ring-1 ring-white/15">
            {icon}
          </div>
          <span className="rounded-full bg-accent-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-300 ring-1 ring-accent-400/25">
            Disponible
          </span>
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-semibold tracking-tight text-primary">
            {title}
          </h3>
          <p className="text-sm text-secondary">{description}</p>
        </div>
        <div className="mt-auto inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-4 py-2 text-sm font-semibold text-zinc-100 ring-1 ring-white/15 transition group-hover:bg-white/[0.12] group-hover:ring-white/25">
          {cta}
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </BorderGlow>
  );
}

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
  icon: ReactNode;
  tier: Tier;
  title: string;
  subtitle: string;
  description: string;
  features: string[];
  cta: string;
}) {
  const style = TIERS[tier];

  return (
    <Link
      href={href}
      className="step-card group block h-full btn-press"
    >
      <BorderGlow
        className="h-full w-full lg-blur"
        edgeSensitivity={26}
        glowColor={style.glow}
        backgroundColor="var(--lg-bg)"
        borderRadius={24}
        glowRadius={36}
        glowIntensity={1.05}
        coneSpread={22}
        animated={false}
        colors={style.colors}
        fillOpacity={0.4}
      >
        <div className="flex h-full flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-white/[0.06] p-2.5 text-zinc-200 ring-1 ring-white/15">
              {icon}
            </div>
            <span className="rounded-full bg-white/[0.05] px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-secondary ring-1 ring-white/12">
              Disponible
            </span>
          </div>
          <div>
            <h3 className="text-xl font-semibold tracking-tight text-primary">
              {title}
            </h3>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">
              {subtitle}
            </p>
          </div>
          <p className="text-sm text-secondary">{description}</p>
          <ul className="flex flex-col gap-1.5">
            {features.map((feature) => (
              <li
                key={feature}
                className="flex items-center gap-2 text-xs text-zinc-400"
              >
                <span className="h-1 w-1 rounded-full bg-zinc-500" />
                {feature}
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-1">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-4 py-2 text-sm font-semibold text-zinc-100 ring-1 ring-white/15 transition group-hover:bg-white/[0.12] group-hover:ring-white/25 group-hover:shadow-[0_0_22px_rgba(255,255,255,0.08)]">
              {cta}
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </BorderGlow>
    </Link>
  );
}
