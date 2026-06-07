"use client";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  Tv,
  Coins,
  Trophy,
  ArrowRight,
  KeyRound,
  LayoutGrid,
  Play,
} from "lucide-react";
import { BorderGlow } from "@/components/ui/BorderGlow";
import { PresencialTutorial } from "@/components/home/PresencialTutorial";
import { SiteFooter } from "@/components/home/SiteFooter";

export default function Home() {
  const [showTutorial, setShowTutorial] = useState(false);
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    // Hero: fade+slide up
    gsap.from(".home-hero", {
      opacity: 0,
      y: 20,
      duration: 0.55,
      ease: "power3.out",
      clearProps: "all",
    });
    // Quick links: fade in
    gsap.from(".quick-link", {
      opacity: 0,
      y: 16,
      duration: 0.4,
      ease: "power3.out",
      stagger: 0.06,
      delay: 0.15,
      clearProps: "all",
    });
  }, { scope, dependencies: [] });

  return (
    <div ref={scope} className="relative isolate min-h-full w-full">
      <div className="relative z-[2] w-full max-w-5xl mx-auto px-4 py-12 sm:py-16 flex flex-col items-center gap-12">
        <header className="home-hero flex flex-col items-center gap-4 text-center">
          <Image
            src="/logo.png"
            alt="Noir Poker"
            width={760}
            height={180}
            priority
            draggable={false}
            className="object-contain select-none pointer-events-none"
            style={{ height: "180px", width: "auto", mixBlendMode: "screen" }}
          />
          <p className="text-sm sm:text-base text-secondary max-w-xl">
            Texas Hold&apos;em multi-dispositivo. Mesas públicas y privadas,
            modo presencial, sala online con fichas o torneo administrado.
          </p>
          <Link
            href="/jugar"
            className="inline-flex items-center gap-2 rounded-full bg-accent-600 px-5 py-3 text-sm font-semibold text-white ring-1 ring-accent-400/35 transition hover:bg-accent-500 btn-press"
          >
            <Play className="h-4 w-4 fill-current" />
            Jugar ahora
          </Link>
          <div className="h-px w-full max-w-2xl bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </header>

        <section className="w-full flex flex-col gap-5">
          <div className="max-w-2xl text-center lg:text-left">
            <h2 className="text-2xl font-semibold tracking-tight text-primary">
              Elige tu modo de juego
            </h2>
            <p className="mt-2 text-sm text-secondary sm:text-base">
              Presencial para mesa real, online con fichas o torneo
              administrado con control completo del host.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ModeCard
              href="/host"
              icon={<Tv className="w-5 h-5" />}
              tier="one"
              className="mode-card"
              title="Presencial"
              subtitle="Sin apuestas · Para mesa real"
              description="Host abre la mesa en pantalla grande. Cada jugador ve sus cartas privadas en su teléfono. La mesa reparte, avanza calles y resuelve el showdown automáticamente."
              features={["Hasta 9 jugadores", "All-in con run-out múltiple", "Historial de manos"]}
              cta="Abrir mesa"
              onInfo={() => setShowTutorial(true)}
            />
            <ModeCard
              href="/create"
              icon={<Coins className="w-5 h-5" />}
              tier="two"
              className="mode-card"
              title="Online"
              subtitle="Apuestas virtuales · Lobby"
              description="Sala con fichas virtuales, ciegas y apuestas reales. Crea pública o privada, configura las reglas dentro de la sala y el lobby la lista en tiempo real."
              features={["Fichas, ciegas y apuestas", "Pública o privada con lobby", "Side pots automáticos"]}
              cta="Crear sala"
            />
            <ModeCard
              href="/host/torneo"
              icon={<Trophy className="w-5 h-5" />}
              tier="three"
              className="mode-card"
              title="Torneo"
              subtitle="Ciegas escalonadas · Admin"
              description="Estructura con niveles de ciegas, antes y timer automático. El admin controla el torneo: pausa, avanza niveles y ve el ranking de eliminados en vivo."
              features={["Niveles y timer automáticos", "Knockouts + ranking final", "Panel admin exclusivo"]}
              cta="Crear torneo"
            />
          </div>
        </section>

        <section className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
          <QuickLink
            href="/lobby"
            icon={<LayoutGrid className="w-4 h-4" />}
            title="Ver mesas abiertas"
            sub="Lobby de salas en vivo"
            className="quick-link"
          />
          <QuickLink
            href="/join"
            icon={<KeyRound className="w-4 h-4" />}
            title="Unirme con código"
            sub="Tengo un código o QR"
            className="quick-link"
          />
        </section>

        <SiteFooter />
      </div>

      {showTutorial && (
        <PresencialTutorial onClose={() => setShowTutorial(false)} />
      )}
    </div>
  );
}

const TIERS: Record<
  "one" | "two" | "three",
  { glow: string; colors: string[]; bg: string }
> = {
  one: {
    glow: "0 0 82",
    colors: ["#a78bfa", "#7c5cbf", "#3d2a6b"],
    bg: "rgba(10,8,18,0.9)",
  },
  two: {
    glow: "0 0 75",
    colors: ["#9b7ff5", "#7356af", "#2e1f55"],
    bg: "rgba(9,7,16,0.9)",
  },
  three: {
    glow: "0 0 60",
    colors: ["#8b6fe8", "#6548a0", "#261747"],
    bg: "rgba(8,6,14,0.9)",
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
  onInfo,
  className = "",
}: {
  href: string;
  icon: React.ReactNode;
  tier: "one" | "two" | "three";
  title: string;
  subtitle: string;
  description: string;
  features: string[];
  cta: string;
  onInfo?: () => void;
  className?: string;
}) {
  const t = TIERS[tier];
  return (
    <Link href={href} className={`group block h-full btn-press ${className}`}>
      <BorderGlow
        className="h-full w-full lg-blur"
        edgeSensitivity={26}
        glowColor={t.glow}
        backgroundColor="var(--lg-bg)"
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
            <span className="text-[10px] uppercase tracking-[0.2em] px-2 py-1 rounded-full ring-1 bg-white/[0.05] text-secondary ring-white/12">
              Disponible
            </span>
          </div>
          <div>
            <h3 className="text-xl text-primary font-semibold tracking-tight">{title}</h3>
            <p className="text-xs uppercase tracking-[0.2em] text-muted mt-1">{subtitle}</p>
          </div>
          <p className="text-sm text-secondary">{description}</p>
          <ul className="flex flex-col gap-1.5">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="w-1 h-1 rounded-full bg-zinc-500" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-1 flex items-center gap-2">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition bg-white/[0.07] text-zinc-100 ring-1 ring-white/15 group-hover:bg-white/[0.12] group-hover:ring-white/25 group-hover:shadow-[0_0_22px_rgba(255,255,255,0.08)]">
              {cta}
              <ArrowRight className="w-4 h-4" />
            </span>
            {onInfo && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onInfo(); }}
                className="px-3 py-2 rounded-full text-xs font-semibold text-zinc-400 hover:text-zinc-200 ring-1 ring-white/10 hover:ring-white/20 transition bg-white/[0.03] hover:bg-white/[0.07]"
              >
                ¿Cómo funciona?
              </button>
            )}
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
  className = "",
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-950/80 ring-1 ring-white/[0.1] hover:ring-white/[0.18] hover:bg-zinc-900/80 lg-blur transition-all btn-press shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${className}`}
      style={{ transitionDuration: "var(--duration-standard)" }}
    >
      <div className="flex items-center gap-4">
        <div className="p-2.5 rounded-xl bg-white/[0.07] ring-1 ring-white/[0.1] text-zinc-200 group-hover:bg-white/[0.1] transition">
          {icon}
        </div>
        <div>
          <div className="text-sm font-semibold text-primary">{title}</div>
          <p className="text-xs text-muted mt-0.5">{sub}</p>
        </div>
      </div>
      <div className="w-7 h-7 rounded-full bg-white/5 ring-1 ring-white/10 flex items-center justify-center group-hover:bg-white/[0.1] group-hover:ring-white/20 transition">
        <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 transition" />
      </div>
    </Link>
  );
}
