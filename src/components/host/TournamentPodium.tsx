"use client";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Trophy, Home } from "lucide-react";

type PodiumEntry = { id: string; name: string; seed: string };

type Props = {
  ranking: PodiumEntry[];
  onClose: () => void;
};

const CONFETTI_COLORS = [
  "#ededf2", "#c2c2cb", "#8a8a93", "#ffffff",
  "#d4d4d8", "#a1a1aa", "#f4f4f5",
];

export function TournamentPodium({ ranking, onClose }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mq = gsap.matchMedia();
      mq.add("(prefers-reduced-motion: no-preference)", () => {
        const count = 80;
        const container = rootRef.current;
        if (!container) return;
        const particles: HTMLDivElement[] = [];

        for (let i = 0; i < count; i++) {
          const el = document.createElement("div");
          const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
          const size = 6 + Math.random() * 8;
          el.style.cssText = `
            position:absolute;
            width:${size}px;
            height:${size * (Math.random() > 0.5 ? 1 : 2.5)}px;
            background:${color};
            border-radius:${Math.random() > 0.5 ? "50%" : "2px"};
            top:0;
            left:${Math.random() * 100}%;
            opacity:0;
            pointer-events:none;
          `;
          container.appendChild(el);
          particles.push(el);

          gsap.to(el, {
            y: `${60 + Math.random() * 40}vh`,
            x: `${(Math.random() - 0.5) * 120}px`,
            rotation: Math.random() * 720 - 360,
            opacity: 1,
            duration: 1.4 + Math.random() * 1.2,
            delay: Math.random() * 0.8,
            ease: "power1.out",
            onComplete: () => {
              gsap.to(el, { opacity: 0, duration: 0.4 });
            },
          });
        }

        // Overlay fade in
        gsap.from(rootRef.current, { opacity: 0, duration: 0.5, ease: "power2.out" });

        return () => {
          particles.forEach((p) => p.remove());
        };
      });
    },
    { scope: rootRef, dependencies: [] },
  );

  const top3 = ranking.slice(0, 3);
  // Visual order: 2nd, 1st, 3rd
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
  const podiumHeights = [top3[1] ? "h-24" : "h-0", "h-36", top3[2] ? "h-16" : "h-0"];
  const podiumLabels = ["2", "1", "3"];
  const podiumPositions = [1, 0, 2];

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md overflow-hidden"
    >
      <div className="relative z-10 flex flex-col items-center gap-8 px-4 w-full max-w-lg">
        <div className="flex flex-col items-center gap-1">
          <Trophy className="w-8 h-8 text-zinc-300" />
          <h2 className="text-3xl font-black tracking-tight text-zinc-50">Torneo terminado</h2>
        </div>

        {/* Podium */}
        <div className="flex items-end justify-center gap-2 w-full">
          {podiumOrder.map((player, vi) => {
            if (!player) return null;
            const pos = podiumPositions[vi];
            const label = podiumLabels[vi];
            const heights = [podiumHeights[0], podiumHeights[1], podiumHeights[2]];
            const barH = heights[vi];
            const isFirst = label === "1";
            return (
              <div key={player.id} className="flex flex-col items-center gap-2 flex-1 min-w-0">
                <div className="flex flex-col items-center gap-1">
                  <span className={`text-sm font-bold truncate max-w-[80px] ${isFirst ? "text-zinc-100" : "text-zinc-400"}`}>
                    {player.name}
                  </span>
                  {isFirst && (
                    <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Campeón</span>
                  )}
                </div>
                <div
                  className={`${barH} w-full rounded-t-xl flex items-center justify-center ${
                    isFirst
                      ? "bg-zinc-200 text-zinc-900"
                      : "bg-zinc-800 text-zinc-400"
                  } ring-1 ring-white/10`}
                >
                  <span className="text-2xl font-black">{label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Full ranking */}
        {ranking.length > 3 && (
          <div className="w-full flex flex-col gap-1">
            {ranking.slice(3).map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/[0.03] ring-1 ring-white/5">
                <span className="text-xs font-bold text-zinc-600 w-5 text-right">{i + 4}</span>
                <span className="text-sm text-zinc-400">{p.name}</span>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-zinc-100 hover:bg-white text-zinc-900 font-bold text-sm transition btn-press"
        >
          <Home className="w-4 h-4" />
          Volver al inicio
        </button>
      </div>
    </div>
  );
}
