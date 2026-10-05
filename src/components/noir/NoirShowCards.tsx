"use client";
// After the hand, your two cards sit in the bottom-right corner as small paper
// cards: press one to turn only that one up for the table, or the brass plate
// for both. A card already shown carries a "vista" stamp. Keys: 1, 2, A.
// Pure presentation: the server checks that the hand is over and the cards
// are yours.
import { useEffect, useEffectEvent } from "react";
import { ActSeg } from "@/components/noir/Pickers";

const SUIT: Record<string, { glyph: string; red: boolean; name: string }> = {
  S: { glyph: "♠", red: false, name: "picas" },
  H: { glyph: "♥", red: true, name: "corazones" },
  D: { glyph: "♦", red: true, name: "diamantes" },
  C: { glyph: "♣", red: false, name: "tréboles" },
};
const rankOf = (id: string) => id.slice(0, -1).replace("T", "10");
const nameOf = (id: string) => `${rankOf(id)} de ${SUIT[id.slice(-1)]?.name ?? ""}`;

export function NoirShowCards({
  cards,
  shown,
  busy,
  lifted,
  onShow,
}: {
  cards: string[];
  /** Which ones the table already sees: [left, right]. */
  shown: [boolean, boolean];
  busy: boolean;
  /** Move up to clear the action rail. */
  lifted?: boolean;
  onShow: (which?: 0 | 1) => void;
}) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (busy || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"))) return;
    if (e.key === "1" && !shown[0]) onShow(0);
    else if (e.key === "2" && !shown[1]) onShow(1);
    else if (e.key.toLowerCase() === "a") onShow();
  });
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      role="group"
      aria-label="Enseñar tus cartas"
      className={`legible absolute right-4 z-20 grid justify-items-end gap-2 transition-[bottom] duration-500 ${lifted ? "bottom-[128px]" : "bottom-4"}`}
    >
      <div className="flex gap-2">
        {cards.slice(0, 2).map((id, k) => {
          const s = SUIT[id.slice(-1)];
          const up = shown[k];
          return (
            <button
              key={id}
              type="button"
              disabled={busy || up}
              onClick={() => onShow(k as 0 | 1)}
              aria-label={up ? `${nameOf(id)}, ya la ven` : `Enseñar ${k === 0 ? "la izquierda" : "la derecha"}: ${nameOf(id)}`}
              className={`group relative grid h-[84px] w-[60px] place-items-center bg-[linear-gradient(170deg,var(--color-paper),#d8c9a8)] shadow-[0_8px_16px_rgb(0_0_0/.55)] [clip-path:polygon(4px_0,calc(100%-4px)_0,100%_4px,100%_calc(100%-4px),calc(100%-4px)_100%,4px_100%,0_calc(100%-4px),0_4px)] transition-transform duration-200 ease-out enabled:hover:-translate-y-1.5 disabled:cursor-default ${
                k === 0 ? "-rotate-3" : "rotate-2"
              } ${s?.red ? "text-blood-500" : "text-card-ink"}`}
            >
              <span className="absolute top-1 left-1.5 text-[15px] leading-none font-bold">{rankOf(id)}</span>
              <span className="text-[30px] leading-none" aria-hidden>
                {s?.glyph}
              </span>
              {up && (
                <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 -rotate-6 border-2 border-current px-1 text-[10px] leading-tight font-bold text-blood-500 uppercase">
                  vista
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="w-[276px]">
        <ActSeg
          label="Qué enseñar"
          actions={[
            { key: "l", label: <>Izquierda <kbd className="opacity-60">1</kbd></>, onClick: () => onShow(0), disabled: busy || shown[0] },
            { key: "r", label: <>Derecha <kbd className="opacity-60">2</kbd></>, onClick: () => onShow(1), disabled: busy || shown[1] },
            { key: "a", label: <>Las dos <kbd className="opacity-60">A</kbd></>, onClick: () => onShow(), disabled: busy },
          ]}
        />
      </div>
    </div>
  );
}
