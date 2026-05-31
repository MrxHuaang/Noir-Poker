"use client";
import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { X, Tv, Smartphone, Zap, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

const STEPS = [
  {
    id: "host",
    icon: Tv,
    label: "Paso 1 de 3",
    title: "La mesa principal",
    subtitle: "En la pantalla grande",
    body: "Abre la sala en el dispositivo que todos puedan ver: TV, proyector o laptop. Esa pantalla es la mesa: muestra las cartas comunitarias, el pot, las fichas de cada jugador y el ganador al final de cada mano.",
    visual: "host",
  },
  {
    id: "phone",
    icon: Smartphone,
    label: "Paso 2 de 3",
    title: "Cada jugador en su móvil",
    subtitle: "Privado y personal",
    body: "Los jugadores escanean el QR o ingresan el código desde su teléfono. En su pantalla ven únicamente sus dos cartas privadas — nadie más las ve. Hasta 9 jugadores al mismo tiempo.",
    visual: "phone",
  },
  {
    id: "play",
    icon: Zap,
    label: "Paso 3 de 3",
    title: "El juego fluye solo",
    subtitle: "Sin fichas físicas necesarias",
    body: "El host reparte con un toque, avanza las calles y llega al showdown automáticamente. Ve equity en vivo, estadísticas y puede correr el all-in varias veces. Todo sincronizado en tiempo real entre la mesa y los móviles.",
    visual: "play",
  },
];

function HostVisual() {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Table */}
      <div className="relative w-56 h-32 rounded-[50%] bg-zinc-900 ring-2 ring-white/10 shadow-[inset_0_2px_20px_rgba(0,0,0,0.6)] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-2 rounded-[50%] bg-zinc-800/60" />
        {/* Community cards */}
        <div className="relative z-10 flex gap-1">
          {["A♠", "K♥", "Q♦", "J♣", "T♥"].map((c, i) => (
            <div
              key={i}
              className="w-7 h-9 rounded-md bg-white text-zinc-900 text-[8px] font-black flex items-center justify-center shadow-md card-deal"
              style={{ animationDelay: `${i * 0.12}s` }}
            >
              {c}
            </div>
          ))}
        </div>
        {/* Pot */}
        <div className="absolute bottom-3 text-[9px] text-zinc-400 font-bold tracking-widest">POT 2.4K</div>
      </div>
      {/* Screen bezel */}
      <div className="absolute inset-0 rounded-2xl ring-1 ring-white/5 pointer-events-none" />
      {/* Seats around */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const angle = (i / 6) * 360 - 90;
        const rad = (angle * Math.PI) / 180;
        const rx = 120, ry = 72;
        const x = 50 + (rx * Math.cos(rad)) / 2.2;
        const y = 50 + (ry * Math.sin(rad)) / 2.2;
        return (
          <div
            key={i}
            className="absolute w-6 h-6 rounded-full bg-zinc-800 ring-1 ring-white/15 flex items-center justify-center text-[8px] text-zinc-400 font-bold"
            style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-50%)" }}
          >
            {i + 1}
          </div>
        );
      })}
      {/* TV label */}
      <div className="absolute bottom-2 right-3 flex items-center gap-1 text-[9px] text-zinc-500 font-bold uppercase tracking-widest">
        <Tv className="w-3 h-3" /> Mesa principal
      </div>
    </div>
  );
}

function PhoneVisual() {
  return (
    <div className="relative w-full h-full flex items-center justify-center gap-4">
      {[
        { cards: ["A♠", "K♠"], name: "Carlos", active: true },
        { cards: ["?", "?"], name: "Ana", active: false },
        { cards: ["?", "?"], name: "Luis", active: false },
      ].map((p, pi) => (
        <div
          key={pi}
          className={`flex flex-col items-center gap-1.5 transition-all ${p.active ? "scale-110" : "opacity-40 scale-95"}`}
        >
          {/* Phone frame */}
          <div className="w-14 h-24 rounded-xl bg-zinc-900 ring-1 ring-white/15 flex flex-col items-center justify-center gap-1.5 shadow-xl relative overflow-hidden">
            <div className="absolute top-1 w-6 h-1 rounded-full bg-zinc-700" />
            <div className="flex gap-1 mt-2">
              {p.cards.map((c, ci) => (
                <div
                  key={ci}
                  className={`w-5 h-7 rounded text-[7px] font-black flex items-center justify-center shadow ${
                    p.active ? "bg-white text-zinc-900" : "bg-zinc-700 text-zinc-500"
                  }`}
                >
                  {c}
                </div>
              ))}
            </div>
            {p.active && (
              <div className="text-[6px] font-bold text-zinc-400 tracking-widest uppercase">Solo tú ves esto</div>
            )}
          </div>
          <span className="text-[9px] text-zinc-400 font-medium">{p.name}</span>
        </div>
      ))}
      {/* Lock icon on hidden cards */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[9px] text-zinc-500 font-bold tracking-widest uppercase flex items-center gap-1">
        <span>🔒</span> Cartas privadas
      </div>
    </div>
  );
}

function PlayVisual() {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 w-full px-4">
        {/* Flow steps */}
        {[
          { label: "Repartir", sub: "2 cartas privadas", done: true },
          { label: "Flop / Turn / River", sub: "Cartas comunitarias", done: true },
          { label: "Showdown", sub: "Equity + ganador auto", done: false, active: true },
        ].map((s, i) => (
          <div key={i} className="w-full flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${
              s.active ? "bg-zinc-100 text-zinc-900 ring-2 ring-zinc-100/40" :
              s.done ? "bg-zinc-700 text-zinc-400" : "bg-zinc-800 text-zinc-600"
            }`}>
              {s.done || s.active ? "✓" : i + 1}
            </div>
            <div className="flex-1">
              <div className={`text-xs font-bold ${s.active ? "text-zinc-100" : "text-zinc-400"}`}>{s.label}</div>
              <div className="text-[9px] text-zinc-600">{s.sub}</div>
            </div>
            {s.active && (
              <div className="text-[9px] font-bold text-zinc-300 px-2 py-0.5 rounded-full bg-zinc-800 ring-1 ring-white/10">
                En curso
              </div>
            )}
          </div>
        ))}
        {/* Equity bar */}
        <div className="w-full mt-1 p-2 rounded-xl bg-zinc-900/80 ring-1 ring-white/8">
          <div className="flex justify-between text-[8px] text-zinc-500 mb-1 font-bold uppercase tracking-widest">
            <span>Carlos</span><span>Equity en vivo</span><span>Ana</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden">
            <div className="bg-zinc-300 flex-[62]" />
            <div className="bg-zinc-700 flex-[38]" />
          </div>
          <div className="flex justify-between text-[8px] font-black mt-1">
            <span className="text-zinc-200">62%</span>
            <span className="text-zinc-500">38%</span>
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
      x: -30 * dir,
      opacity: 0,
      duration: 0.18,
      ease: "power2.in",
      onComplete: () => {
        setStep(next);
        gsap.fromTo(
          [contentRef.current, visualRef.current],
          { x: 30 * dir, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.28, ease: "power3.out" },
        );
      },
    });
  }

  const StepIcon = current.icon;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        ref={rootRef}
        className="relative w-full max-w-2xl bg-zinc-950 rounded-3xl ring-1 ring-white/10 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8)] overflow-hidden"
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
        <div className="grid sm:grid-cols-2 gap-0 min-h-[320px]">
          {/* Left: text */}
          <div ref={contentRef} className="flex flex-col justify-center gap-4 px-6 py-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-2xl bg-zinc-800 ring-1 ring-white/10 flex items-center justify-center">
                <StepIcon className="w-4 h-4 text-zinc-200" />
              </div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">{current.label}</span>
            </div>
            <div>
              <h2 className="text-2xl font-black text-zinc-50 tracking-tight leading-tight">{current.title}</h2>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-1">{current.subtitle}</p>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">{current.body}</p>
          </div>

          {/* Right: visual */}
          <div
            ref={visualRef}
            className="relative min-h-[200px] sm:min-h-0 bg-zinc-900/50 border-t sm:border-t-0 sm:border-l border-white/5 rounded-b-3xl sm:rounded-b-none sm:rounded-r-3xl overflow-hidden"
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
