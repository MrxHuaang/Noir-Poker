"use client";
import { useEffect, useRef, useState } from "react";
import { X, Lock, Check } from "lucide-react";
import { TITLES } from "@/lib/progression";
import type { Title } from "@/lib/progression";

// Warm neutrals for locked ranks and chrome (the per-rank colours below stay
// as the progression identity).
const NEUTRAL = {
  faint: "oklch(0.93 0.012 85 / 0.05)",
  fainter: "oklch(0.93 0.012 85 / 0.025)",
  hairline: "var(--line)",
  lockedName: "oklch(0.5 0.01 75)",
  lockedText: "oklch(0.44 0.008 70)",
  text: "var(--text-muted)",
  badge: "var(--ink-800)",
  badgeDone: "var(--background)",
};

const RANK_META: Record<string, {
  color: string;
  colorHex: string;
  glowHex: string;
  borderHex: string;
  bgGradient: string;
  flavor: string;
  initial: string;
}> = {
  Peon: {
    color: "text-zinc-400",
    colorHex: "#a1a1aa",
    glowHex: "rgba(161,161,170,0.4)",
    borderHex: "rgba(161,161,170,0.2)",
    bgGradient: "linear-gradient(135deg, rgba(39,39,42,0.9) 0%, rgba(24,24,27,0.7) 100%)",
    flavor: "Todo empieza aqui. La mesa te desconoce.",
    initial: "P",
  },
  Timador: {
    color: "text-amber-500",
    colorHex: "#f59e0b",
    glowHex: "rgba(245,158,11,0.45)",
    borderHex: "rgba(245,158,11,0.3)",
    bgGradient: "linear-gradient(135deg, rgba(41,27,8,0.95) 0%, rgba(28,18,5,0.8) 100%)",
    flavor: "Nadie sabe como lo haces. Las cartas mienten por ti.",
    initial: "T",
  },
  Sicario: {
    color: "text-slate-300",
    colorHex: "#cbd5e1",
    glowHex: "rgba(203,213,225,0.4)",
    borderHex: "rgba(203,213,225,0.2)",
    bgGradient: "linear-gradient(135deg, rgba(15,20,30,0.95) 0%, rgba(8,12,20,0.85) 100%)",
    flavor: "Frio. Preciso. No dejas huellas en la mesa.",
    initial: "S",
  },
  Capo: {
    color: "text-yellow-400",
    colorHex: "#facc15",
    glowHex: "rgba(250,204,21,0.45)",
    borderHex: "rgba(250,204,21,0.3)",
    bgGradient: "linear-gradient(135deg, rgba(28,22,0,0.95) 0%, rgba(20,15,0,0.85) 100%)",
    flavor: "Los demas te reconocen. Tienes una silla reservada.",
    initial: "C",
  },
  Verdugo: {
    color: "text-red-400",
    colorHex: "#f87171",
    glowHex: "rgba(248,113,113,0.45)",
    borderHex: "rgba(248,113,113,0.28)",
    bgGradient: "linear-gradient(135deg, rgba(30,5,5,0.97) 0%, rgba(20,3,3,0.9) 100%)",
    flavor: "Tu presencia cambia el juego. Todos lo saben.",
    initial: "V",
  },
  Espectro: {
    color: "text-violet-300",
    colorHex: "#c4b5fd",
    glowHex: "rgba(196,181,253,0.55)",
    borderHex: "rgba(196,181,253,0.35)",
    bgGradient: "linear-gradient(135deg, rgba(20,10,40,0.97) 0%, rgba(12,6,28,0.9) 100%)",
    flavor: "Pocos llegan aqui. Eres una leyenda que aun no termina.",
    initial: "E",
  },
  Noir: {
    color: "text-white",
    colorHex: "#ffffff",
    glowHex: "rgba(167,139,250,0.8)",
    borderHex: "rgba(167,139,250,0.55)",
    bgGradient: "linear-gradient(135deg, rgba(14,6,30,1) 0%, rgba(30,10,60,0.95) 50%, rgba(14,6,30,1) 100%)",
    flavor: "El apice. El nombre del juego mismo te pertenece.",
    initial: "N",
  },
};

function rankStatus(t: Title, currentLevel: number, allTitles: Title[]): "achieved" | "current" | "locked" {
  const idx = allTitles.indexOf(t);
  const next = allTitles[idx + 1];
  if (t.level <= currentLevel && (!next || next.level > currentLevel)) return "current";
  if (t.level <= currentLevel) return "achieved";
  return "locked";
}

function RankEmblem({
  src, alt, size, glow, locked, hovered, initial, color,
}: {
  src: string; alt: string; size: number;
  glow: string; locked: boolean; hovered: boolean; initial: string; color: string;
}) {
  const [broken, setBroken] = useState(false);
  const reveal = locked && hovered;
  const glowSize = hovered ? size * 0.28 : size * 0.18;

  return broken ? (
    <div
      className="rounded-full flex items-center justify-center font-display shrink-0 transition-all duration-300"
      style={{
        width: size, height: size,
        background: reveal || !locked
          ? `radial-gradient(circle, ${glow} 0%, transparent 70%)`
          : NEUTRAL.faint,
        border: `1.5px solid ${reveal || !locked ? glow : NEUTRAL.hairline}`,
        color: reveal || !locked ? color : NEUTRAL.lockedName,
        fontSize: size * 0.38,
        filter: reveal ? "none" : locked ? "grayscale(0.7)" : "none",
        opacity: reveal ? 1 : locked ? 0.65 : 1,
        boxShadow: hovered && !locked ? `0 0 ${glowSize * 2}px ${glow}` : "none",
      }}
    >
      {initial}
    </div>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onError={() => setBroken(true)}
      className="object-contain shrink-0 transition-all duration-300"
      style={{
        width: size, height: size,
        filter: reveal
          ? `drop-shadow(0 0 ${glowSize}px ${glow}) brightness(1.15)`
          : locked
            ? "grayscale(0.7) brightness(0.55)"
            : `drop-shadow(0 0 ${glowSize}px ${glow})`,
        opacity: reveal ? 1 : locked ? 0.65 : 1,
        transform: hovered ? "scale(1.08)" : "scale(1)",
      }}
    />
  );
}

export function RankTowerModal({
  currentLevel,
  onClose,
}: {
  currentLevel: number;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  const [hoveredRank, setHoveredRank] = useState<string | null>(null);
  const reversed = [...TITLES].reverse();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const t = setTimeout(() => {
      currentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rank-tower-title"
      className="fixed inset-0 z-[100] flex items-stretch justify-center bg-ink-950/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      {/* Panel full-height */}
      <div
        className="relative z-10 w-full max-w-md flex flex-col mt-[72px] mb-4 mx-4 overflow-hidden rounded-[1.25rem] border border-line bg-ink-850 shadow-[inset_0_1px_0_oklch(0.95_0.02_85/0.04),0_40px_100px_-30px_oklch(0.05_0.005_60/0.9)]"
      >
        {/* Header fijo */}
        <div className="shrink-0 flex items-start justify-between gap-4 border-b border-line px-6 pt-6 pb-5">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-2">
              <span className="suit text-sm" aria-hidden>♠</span>
              <span>
                Nivel <span className="numeric">{currentLevel}</span> · {TITLES.find((_, i) => {
                  const s = rankStatus(TITLES[i], currentLevel, TITLES);
                  return s === "current";
                })
                  ? reversed.find(t => rankStatus(t, currentLevel, TITLES) === "current")?.name
                  : ""}
              </span>
            </p>
            <h2 id="rank-tower-title" className="display mt-1 text-4xl text-primary">
              Torre de rangos
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-2 -mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[color:var(--text-muted)] transition-colors hover:bg-bone/[0.05] hover:text-bone"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Torre scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-0 scroll-smooth">
          {reversed.map((t, i) => {
            const status = rankStatus(t, currentLevel, TITLES);
            const meta = RANK_META[t.name] ?? RANK_META.Peon;
            const isCurrent = status === "current";
            const isLocked = status === "locked";
            const isLast = i === reversed.length - 1;

            const emblemSize = isCurrent ? 80 : isLocked ? 48 : 60;

            return (
              <div
                key={t.name}
                ref={isCurrent ? currentRef : undefined}
                className="flex gap-0"
              >
                {/* Beam + node column */}
                <div className="flex flex-col items-center w-10 shrink-0">
                  {/* Top beam segment */}
                  {i > 0 && (
                    <div
                      className="w-[2px] flex-1 min-h-[16px]"
                      style={{
                        background: isLocked
                          ? `linear-gradient(to bottom, ${NEUTRAL.faint}, ${NEUTRAL.fainter})`
                          : `linear-gradient(to bottom, ${meta.glowHex}, ${meta.glowHex}88)`,
                      }}
                    />
                  )}

                  {/* Node */}
                  <div
                    className="shrink-0 rounded-full z-10"
                    style={{
                      width: isCurrent ? 14 : 8,
                      height: isCurrent ? 14 : 8,
                      marginTop: i === 0 ? 24 : 0,
                      marginBottom: isLast ? 24 : 0,
                      background: isLocked ? NEUTRAL.hairline : meta.glowHex,
                      border: isCurrent ? `2px solid ${meta.colorHex}` : "none",
                    }}
                  />

                  {/* Bottom beam segment */}
                  {!isLast && (
                    <div
                      className="w-[2px] flex-1 min-h-[16px]"
                      style={{
                        background: status === "achieved"
                          ? `linear-gradient(to bottom, ${meta.glowHex}88, ${(RANK_META[reversed[i + 1]?.name] ?? meta).glowHex}66)`
                          : `linear-gradient(to bottom, ${NEUTRAL.faint}, ${NEUTRAL.fainter})`,
                      }}
                    />
                  )}
                </div>

                {/* Rank row */}
                <div
                  className="flex-1 mb-2 rounded-[14px] overflow-hidden transition-all duration-300 cursor-default"
                  onMouseEnter={() => setHoveredRank(t.name)}
                  onMouseLeave={() => setHoveredRank(null)}
                  style={{
                    background: hoveredRank === t.name && isLocked
                      ? meta.bgGradient
                      : isLocked ? NEUTRAL.fainter : meta.bgGradient,
                    border: `1px solid ${
                      hoveredRank === t.name
                        ? meta.borderHex
                        : isLocked ? NEUTRAL.hairline : meta.borderHex
                    }`,
                    opacity: isLocked && hoveredRank !== t.name ? 0.72 : 1,
                    transform: isCurrent ? "scale(1.02)" : hoveredRank === t.name ? "scale(1.01)" : "scale(1)",
                  }}
                >
                  {/* Rango actual: layout expandido */}
                  {isCurrent ? (
                    <div className="p-4">
                      <div className="flex items-center gap-4">
                        <RankEmblem
                          src={t.emblem} alt={t.name}
                          size={emblemSize}
                          glow={meta.glowHex}
                          locked={false}
                          hovered={hoveredRank === t.name}
                          initial={meta.initial}
                          color={meta.colorHex}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="display text-3xl" style={{ color: meta.colorHex }}>
                              {t.name}
                            </span>
                            <span
                              className="eyebrow rounded-[6px] px-1.5 py-px"
                              style={{
                                background: meta.glowHex,
                                color: "oklch(0.14 0.008 70 / 0.9)",
                              }}
                            >
                              Actual
                            </span>
                          </div>
                          <p className="text-[13px] leading-snug mt-1.5" style={{ color: `${meta.colorHex}99` }}>
                            {meta.flavor}
                          </p>
                          <p className="text-xs text-muted mt-2">
                            Nivel <span className="numeric">{t.level}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Rangos conseguidos y bloqueados: layout compacto */
                    <div className="flex items-center gap-3.5 px-3.5 py-3">
                      <div className="relative shrink-0">
                        <RankEmblem
                          src={t.emblem} alt={t.name}
                          size={emblemSize}
                          glow={meta.glowHex}
                          locked={isLocked}
                          hovered={hoveredRank === t.name}
                          initial={meta.initial}
                          color={meta.colorHex}
                        />
                        {/* Badge de estado */}
                        <div
                          className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                          style={{
                            background: isLocked ? NEUTRAL.badge : NEUTRAL.badgeDone,
                            border: `1.5px solid ${isLocked ? NEUTRAL.hairline : meta.borderHex}`,
                          }}
                        >
                          {isLocked
                            ? <Lock style={{ width: 8, height: 8, color: NEUTRAL.lockedName }} />
                            : <Check style={{ width: 8, height: 8, color: meta.colorHex }} />
                          }
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <span
                          className="font-display text-xl leading-tight transition-colors duration-300"
                          style={{
                            color: isLocked && hoveredRank !== t.name ? NEUTRAL.lockedName : meta.colorHex,
                          }}
                        >
                          {t.name}
                        </span>
                        <p
                          className="text-xs leading-snug mt-0.5 transition-colors duration-300"
                          style={{ color: isLocked && hoveredRank !== t.name ? NEUTRAL.lockedText : NEUTRAL.text }}
                        >
                          {isLocked ? `Requiere nivel ${t.level}` : meta.flavor}
                        </p>
                      </div>

                      <span
                        className="numeric text-[11px] shrink-0"
                        style={{ color: isLocked ? NEUTRAL.lockedText : `${meta.colorHex}88` }}
                      >
                        Nv.{t.level}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer fade */}
        <div className="shrink-0 h-8 pointer-events-none bg-gradient-to-t from-ink-850 to-transparent" />
      </div>
    </div>
  );
}
