"use client";
import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { X, Tv, Smartphone, Play, ArrowRight, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import Link from "next/link";

const STEPS = [
  {
    id: "host",
    icon: Tv,
    label: "Paso 1 de 3",
    title: "La pantalla principal",
    subtitle: "TV, proyector o laptop",
    body: "Abre la sala en el dispositivo que todos puedan ver. Esa pantalla muestra la mesa: cartas comunitarias, fichas de cada jugador, el pot y el historial de manos. No muestra equity ni información privada.",
    visual: "host",
  },
  {
    id: "phone",
    icon: Smartphone,
    label: "Paso 2 de 3",
    title: "Cada jugador en su móvil",
    subtitle: "Cartas privadas y personales",
    body: "Cada jugador escanea el QR o escribe el código desde su propio teléfono. Solo ve sus dos cartas — nadie más puede verlas. Hasta 9 jugadores al mismo tiempo.",
    visual: "phone",
  },
  {
    id: "play",
    icon: Play,
    label: "Paso 3 de 3",
    title: "El host dirige la partida",
    subtitle: "Con un toque",
    body: "El host reparte, avanza calles y llega al showdown con un toque. Puede ver equity y stats en su panel lateral — información exclusiva para el host, invisible en la pantalla compartida.",
    visual: "play",
  },
];

function HostVisual() {
  const cards = ["A", "K", "Q", "J", "T"];
  const suits = ["♠", "♥", "♦", "♣", "♥"];
  const reds = [false, true, true, false, true];
  return (
    <div className="relative w-full h-full flex items-center justify-center p-4">
      {/* Monitor frame */}
      <div className="w-full max-w-[220px] flex flex-col items-center gap-2">
        <div className="w-full h-[130px] rounded-xl bg-zinc-950 ring-1 ring-white/15 flex flex-col items-center justify-center gap-2 relative overflow-hidden shadow-xl">
          {/* Felt */}
          <div className="absolute inset-2 rounded-lg bg-zinc-900/80" />
          {/* Seats row (top) */}
          <div className="relative z-10 flex gap-1.5 mb-0.5">
            {[1,2,3,4].map(i => (
              <div key={i} className="w-5 h-5 rounded-full bg-zinc-800 ring-1 ring-white/10 flex items-center justify-center text-[7px] text-zinc-500 font-bold">{i}</div>
            ))}
          </div>
          {/* Community cards */}
          <div className="relative z-10 flex gap-0.5">
            {cards.map((c, i) => (
              <div key={i} className={`w-6 h-8 rounded bg-white flex flex-col items-start justify-start p-px shadow ${reds[i] ? "text-red-500" : "text-zinc-900"}`}>
                <span className="text-[7px] font-black leading-none">{c}</span>
                <span className="text-[7px] leading-none">{suits[i]}</span>
              </div>
            ))}
          </div>
          {/* Pot */}
          <div className="relative z-10 text-[7px] font-bold text-zinc-500 tracking-widest">POT 2.4K</div>
        </div>
        {/* Stand */}
        <div className="w-4 h-2 bg-zinc-700 rounded" />
        <div className="w-10 h-1 bg-zinc-700 rounded" />
        <p className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">Pantalla compartida</p>
      </div>
      {/* No equity tag */}
      <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 ring-1 ring-white/10 text-[7px] font-bold text-zinc-400 uppercase tracking-widest">
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
    <div className="relative w-full h-full flex items-center justify-center gap-3 p-4">
      {players.map((p, pi) => (
        <div
          key={pi}
          className={`flex flex-col items-center gap-1.5 transition-all ${p.active ? "scale-105" : "opacity-35 scale-90"}`}
        >
          <div className={`w-[52px] h-[86px] rounded-2xl ring-1 flex flex-col items-center justify-center gap-2 shadow-lg relative overflow-hidden ${p.active ? "bg-zinc-900 ring-white/20" : "bg-zinc-900/60 ring-white/8"}`}>
            {/* Notch */}
            <div className="absolute top-1.5 w-8 h-1 rounded-full bg-zinc-700/80" />
            {/* Cards */}
            <div className="flex gap-1 mt-2">
              {p.cards.map((c, ci) => (
                <div
                  key={ci}
                  className={`w-[18px] h-[24px] rounded flex flex-col items-start justify-start p-px shadow ${
                    p.active ? (p.reds[ci] ? "bg-white text-red-500" : "bg-white text-zinc-900") : "bg-zinc-700"
                  }`}
                >
                  {p.active && <span className="text-[6px] font-black leading-none">{c}</span>}
                  {p.active && <span className="text-[6px] leading-none">{p.suits[ci]}</span>}
                </div>
              ))}
            </div>
            {p.active && (
              <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-zinc-800/80 ring-1 ring-white/8">
                <Lock className="w-2 h-2 text-zinc-500" />
                <span className="text-[5.5px] font-bold text-zinc-500 uppercase tracking-widest">Solo tú</span>
              </div>
            )}
          </div>
          <span className={`text-[8px] font-medium ${p.active ? "text-zinc-300" : "text-zinc-600"}`}>{p.name}</span>
        </div>
      ))}
    </div>
  );
}

function PlayVisual() {
  return (
    <div className="relative w-full h-full flex items-center justify-center p-4">
      <div className="flex flex-col gap-2 w-full max-w-[200px]">
        {/* Host panel label */}
        <div className="text-[7px] font-bold text-zinc-600 uppercase tracking-widest mb-0.5">Panel del host (privado)</div>
        {/* Steps */}
        {[
          { label: "Repartir", sub: "2 cartas por jugador", done: true },
          { label: "Flop · Turn · River", sub: "Cartas comunitarias", done: true },
          { label: "Showdown", sub: "Ganador automático", active: true },
        ].map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[7px] font-black ${
              s.active ? "bg-zinc-100 text-zinc-900" : s.done ? "bg-zinc-700 text-zinc-400" : "bg-zinc-800 text-zinc-600"
            }`}>
              {s.active || s.done ? "✓" : i + 1}
            </div>
            <div>
              <div className={`text-[9px] font-bold ${s.active ? "text-zinc-100" : "text-zinc-400"}`}>{s.label}</div>
              <div className="text-[7px] text-zinc-600">{s.sub}</div>
            </div>
          </div>
        ))}
        {/* Equity bar — host only */}
        <div className="mt-1 p-1.5 rounded-lg bg-zinc-900 ring-1 ring-white/8">
          <div className="flex justify-between text-[6px] text-zinc-600 mb-1 font-bold uppercase tracking-widest">
            <span>Carlos</span><span>Equity — host only</span><span>Ana</span>
          </div>
          <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
            <div className="bg-zinc-300 flex-[62] rounded-l-full" />
            <div className="bg-zinc-700 flex-[38] rounded-r-full" />
          </div>
          <div className="flex justify-between text-[7px] font-black mt-0.5">
            <span className="text-zinc-200">62%</span>
            <span className="text-zinc-600">38%</span>
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
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        ref={rootRef}
        className="relative w-full max-w-2xl bg-zinc-950 rounded-3xl ring-1 ring-white/10 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-zinc-800 ring-1 ring-white/10 flex items-center justify-center">
              <Tv className="w-3.5 h-3.5 text-zinc-300" />
            </div>
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Modo presencial</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition"
          >
            <X className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1.5 px-6 pt-4">
          {STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === step ? "bg-zinc-100 flex-[3]" : "bg-zinc-700 hover:bg-zinc-600 flex-1"
              }`}
            />
          ))}
        </div>

        {/* Main content */}
        <div className="grid sm:grid-cols-2 gap-0 min-h-[300px]">
          {/* Left: text */}
          <div ref={contentRef} className="flex flex-col justify-center gap-4 px-6 py-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-2xl bg-zinc-800 ring-1 ring-white/10 flex items-center justify-center">
                <StepIcon className="w-4 h-4 text-zinc-200" />
              </div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">{current.label}</span>
            </div>
            <div>
              <h2 className="text-xl font-black text-zinc-50 tracking-tight leading-tight">{current.title}</h2>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-1">{current.subtitle}</p>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">{current.body}</p>
          </div>

          {/* Right: visual */}
          <div
            ref={visualRef}
            className="relative min-h-[180px] sm:min-h-0 bg-zinc-900/40 border-t sm:border-t-0 sm:border-l border-white/5 rounded-b-3xl sm:rounded-b-none sm:rounded-r-3xl overflow-hidden"
          >
            <Visual />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
          <button
            type="button"
            onClick={() => goTo(step - 1)}
            disabled={step === 0}
            className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-300 transition disabled:opacity-0 disabled:pointer-events-none"
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => goTo(step + 1)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-black uppercase tracking-widest transition btn-press"
            >
              Siguiente <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <Link
              href="/host"
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-black uppercase tracking-widest transition btn-press"
              onClick={onClose}
            >
              Abrir mesa <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
