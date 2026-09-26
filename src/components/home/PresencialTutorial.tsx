"use client";
import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { X, Tv, Smartphone, Play, ArrowRight, ChevronLeft, Check, Lock } from "lucide-react";
import Link from "next/link";

const STEPS = [
  {
    id: "host",
    icon: Tv,
    label: "Paso 1 de 3",
    title: "La pantalla principal",
    subtitle: "TV, proyector o laptop",
    body: "Abre la sala en el dispositivo que todos puedan ver. Esa pantalla muestra la mesa: cartas comunitarias, fichas de cada jugador, el bote y el historial de manos. No muestra equity ni información privada.",
    visual: "host",
  },
  {
    id: "phone",
    icon: Smartphone,
    label: "Paso 2 de 3",
    title: "Cada jugador en su móvil",
    subtitle: "Cartas privadas y personales",
    body: "Cada jugador escanea el QR o escribe el código desde su propio teléfono. Solo ve sus dos cartas: nadie más puede verlas. Hasta 9 jugadores al mismo tiempo.",
    visual: "phone",
  },
  {
    id: "play",
    icon: Play,
    label: "Paso 3 de 3",
    title: "El host dirige la partida",
    subtitle: "Con un toque",
    body: "El host reparte, avanza calles y llega al showdown con un toque. En su panel lateral ve equity y estadísticas: información exclusiva del host, invisible en la pantalla compartida.",
    visual: "play",
  },
];

// Tiny small-caps label for the miniature illustrations (the .eyebrow size is
// too large at this scale).
const MINI_CAPS = "[font-variant-caps:all-small-caps] tracking-[0.06em]";

function MiniCard({ rank, suit, red }: { rank: string; suit: string; red: boolean }) {
  return (
    <div
      className={`flex h-8 w-6 flex-col items-start justify-start rounded-[3px] bg-bone p-px ${
        red ? "suit-red" : "text-ink-900"
      }`}
    >
      <span className="text-[7px] leading-none font-semibold">{rank}</span>
      <span className="font-display text-[8px] leading-none">{suit}</span>
    </div>
  );
}

function HostVisual() {
  const cards = ["A", "K", "Q", "J", "T"];
  const suits = ["♠", "♥", "♦", "♣", "♥"];
  const reds = [false, true, true, false, true];
  return (
    <div className="relative flex h-full w-full items-center justify-center p-6">
      {/* Monitor frame */}
      <div className="flex w-full max-w-[230px] flex-col items-center gap-2">
        <div className="relative flex h-[136px] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-[12px] border border-line-strong bg-ink-950">
          {/* Felt */}
          <div className="absolute inset-2 rounded-[8px] bg-ink-800/80" />
          {/* Seats row (top) */}
          <div className="relative z-10 mb-0.5 flex gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="numeric flex h-5 w-5 items-center justify-center rounded-[5px] border border-line bg-ink-700 text-[8px] text-muted"
              >
                {i}
              </div>
            ))}
          </div>
          {/* Community cards */}
          <div className="relative z-10 flex gap-0.5">
            {cards.map((c, i) => (
              <MiniCard key={i} rank={c} suit={suits[i]} red={reds[i]} />
            ))}
          </div>
          {/* Pot */}
          <div className={`relative z-10 text-[9px] text-muted ${MINI_CAPS}`}>
            Bote <span className="numeric">2.4K</span>
          </div>
        </div>
        {/* Stand */}
        <div className="h-2 w-4 rounded-sm bg-ink-600" />
        <div className="h-1 w-10 rounded-sm bg-ink-600" />
        <p className={`mt-1 text-[11px] text-muted ${MINI_CAPS}`}>Pantalla compartida</p>
      </div>
      {/* No equity tag */}
      <div
        className={`absolute top-3 right-3 flex items-center gap-1 rounded-[6px] border border-line px-2 py-0.5 text-[10px] text-muted ${MINI_CAPS}`}
      >
        Sin equity visible
      </div>
    </div>
  );
}

function PhoneVisual() {
  const players = [
    { cards: ["A", "K"], suits: ["♠", "♠"], reds: [false, false], name: "Carlos", active: true },
    { cards: ["?", "?"], suits: ["", ""], reds: [false, false], name: "Ana", active: false },
    { cards: ["?", "?"], suits: ["", ""], reds: [false, false], name: "Luis", active: false },
  ];
  return (
    <div className="relative flex h-full w-full items-center justify-center gap-3 p-6">
      {players.map((p, pi) => (
        <div
          key={pi}
          className={`flex flex-col items-center gap-1.5 transition-all ${p.active ? "scale-105" : "scale-90 opacity-35"}`}
        >
          <div
            className={`relative flex h-[86px] w-[52px] flex-col items-center justify-center gap-2 overflow-hidden rounded-[14px] border ${
              p.active ? "border-line-strong bg-ink-850" : "border-line bg-ink-850/60"
            }`}
          >
            {/* Notch */}
            <div className="absolute top-1.5 h-1 w-8 rounded-full bg-ink-600" />
            {/* Cards */}
            <div className="mt-2 flex gap-1">
              {p.cards.map((c, ci) => (
                <div
                  key={ci}
                  className={`flex h-[24px] w-[18px] flex-col items-start justify-start rounded-[3px] p-px ${
                    p.active ? (p.reds[ci] ? "bg-bone suit-red" : "bg-bone text-ink-900") : "bg-ink-600"
                  }`}
                >
                  {p.active && <span className="text-[6px] leading-none font-semibold">{c}</span>}
                  {p.active && <span className="font-display text-[7px] leading-none">{p.suits[ci]}</span>}
                </div>
              ))}
            </div>
            {p.active && (
              <div className="flex items-center gap-0.5 rounded-[4px] border border-line px-1 py-px">
                <Lock className="h-2 w-2 text-muted" aria-hidden />
                <span className={`text-[7px] text-muted ${MINI_CAPS}`}>Solo tú</span>
              </div>
            )}
          </div>
          <span className={`text-[10px] ${p.active ? "text-secondary" : "text-muted"}`}>{p.name}</span>
        </div>
      ))}
    </div>
  );
}

function PlayVisual() {
  return (
    <div className="relative flex h-full w-full items-center justify-center p-6">
      <div className="flex w-full max-w-[210px] flex-col gap-2.5">
        {/* Host panel label */}
        <div className={`mb-0.5 text-[11px] text-muted ${MINI_CAPS}`}>Panel del host, privado</div>
        {/* Steps */}
        {[
          { label: "Repartir", sub: "2 cartas por jugador", done: true },
          { label: "Flop · Turn · River", sub: "Cartas comunitarias", done: true },
          { label: "Showdown", sub: "Ganador automático", active: true },
        ].map((s, i) => (
          <div key={i} className="flex items-center gap-2.5 border-b border-line pb-2 last:border-b-0">
            <div
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] ${
                s.active ? "bg-bone text-ink-900" : s.done ? "bg-ink-700 text-bone-dim" : "bg-ink-800 text-muted"
              }`}
            >
              {s.active || s.done ? (
                <Check className="h-2.5 w-2.5" aria-hidden />
              ) : (
                <span className="numeric text-[8px]">{i + 1}</span>
              )}
            </div>
            <div>
              <div className={`text-[11px] font-medium ${s.active ? "text-primary" : "text-secondary"}`}>
                {s.label}
              </div>
              <div className="text-[9px] text-muted">{s.sub}</div>
            </div>
          </div>
        ))}
        {/* Equity bar, host only */}
        <div className="mt-1 rounded-[8px] border border-line bg-ink-950/60 p-2">
          <div className={`mb-1 flex justify-between text-[8px] text-muted ${MINI_CAPS}`}>
            <span>Carlos</span>
            <span>Equity, solo host</span>
            <span>Ana</span>
          </div>
          <div className="flex h-[3px] gap-px overflow-hidden">
            <div className="flex-[62] bg-bone" />
            <div className="flex-[38] bg-ink-600" />
          </div>
          <div className="numeric mt-1 flex justify-between text-[9px]">
            <span className="text-primary">62%</span>
            <span className="text-muted">38%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const VISUALS = { host: HostVisual, phone: PhoneVisual, play: PlayVisual };

type Props = { onClose: () => void };

export function PresencialTutorial({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);
  const current = STEPS[step];
  const Visual = VISUALS[current.visual as keyof typeof VISUALS];

  useGSAP(
    () => {
      gsap.from(rootRef.current, { opacity: 0, scale: 0.96, duration: 0.35, ease: "power3.out" });
    },
    { scope: rootRef, dependencies: [] },
  );

  // Escape cierra el tutorial (estandar de dialogos).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function goTo(next: number) {
    if (!contentRef.current || !visualRef.current) return;
    const dir = next > step ? 1 : -1;
    gsap.to([contentRef.current, visualRef.current], {
      x: -28 * dir, opacity: 0, duration: 0.16, ease: "power2.in",
      onComplete: () => {
        setStep(next);
        gsap.fromTo(
          [contentRef.current, visualRef.current],
          { x: 28 * dir, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.26, ease: "power3.out" },
        );
      },
    });
  }

  const StepIcon = current.icon;

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto bg-ink-950/80 p-4 backdrop-blur-sm sm:items-center">
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-label="Cómo funciona el modo presencial"
        className="sheet relative w-full max-w-2xl overflow-hidden shadow-[0_40px_120px_-30px_oklch(0.05_0.005_60/0.9)]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 sm:px-8">
          <p className="eyebrow flex items-center gap-2">
            <span className="suit text-sm" aria-hidden>
              ♠
            </span>
            Modo presencial · cómo funciona
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mt-2 -mr-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[color:var(--text-muted)] transition-colors hover:bg-bone/[0.05] hover:text-bone"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicators */}
        <ol className="grid grid-cols-3 gap-3 px-6 pt-5 sm:px-8">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Paso ${i + 1}: ${s.title}`}
                aria-current={i === step ? "step" : undefined}
                className="group flex w-full flex-col gap-2 py-1 text-left"
              >
                <span
                  className={`h-px w-full transition-colors duration-300 ${
                    i === step ? "bg-accent-400" : i < step ? "bg-bone/40" : "bg-line-strong group-hover:bg-bone/30"
                  }`}
                />
                <span
                  className={`numeric text-xs transition-colors duration-300 ${
                    i === step ? "text-bone" : "text-[color:var(--text-muted)] group-hover:text-bone-dim"
                  }`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
              </button>
            </li>
          ))}
        </ol>

        {/* Main content */}
        <div className="grid min-h-[320px] gap-0 sm:grid-cols-2">
          {/* Left: text */}
          <div ref={contentRef} className="flex flex-col justify-center gap-4 px-6 py-8 sm:px-8">
            <p className="eyebrow flex items-center gap-2">
              <StepIcon className="h-3.5 w-3.5" aria-hidden />
              {current.label}
            </p>
            <div>
              <h2 className="display text-4xl text-primary">{current.title}</h2>
              <p className="mt-2 font-display text-lg text-secondary italic">{current.subtitle}</p>
            </div>
            <p className="max-w-[44ch] text-sm leading-relaxed text-secondary">{current.body}</p>
          </div>

          {/* Right: visual */}
          <div
            ref={visualRef}
            className="relative min-h-[200px] overflow-hidden border-t border-line bg-ink-950/40 sm:min-h-0 sm:border-t-0 sm:border-l"
          >
            <Visual />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 border-t border-line px-6 py-4 sm:px-8">
          <button
            type="button"
            onClick={() => goTo(step - 1)}
            disabled={step === 0}
            className="btn-link inline-flex items-center gap-1.5 text-sm disabled:pointer-events-none disabled:opacity-0"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
          </button>

          {step < STEPS.length - 1 ? (
            <button type="button" onClick={() => goTo(step + 1)} className="btn-primary">
              Siguiente <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <Link href="/host" className="btn-primary" onClick={onClose}>
              Abrir mesa <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
