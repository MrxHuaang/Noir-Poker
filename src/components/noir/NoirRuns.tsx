"use client";
// Run it twice (or three times): the boards written out on a paper slip beside
// the table, one line per run with its winner, like the dealer's notes.
import { Club, Diamond, Heart, Spade } from "lucide-react";
import type { Card } from "@/lib/poker";
import { CATEGORY_LABEL, type Category } from "@/lib/handEval";
import type { RunOne } from "@/lib/poker";

const SUIT = { S: Spade, H: Heart, D: Diamond, C: Club } as const;
const RANK: Record<string, string> = { T: "10" };

/** A small square paper card: rank in stencil, suit from the icon set. */
function InkCard({ card }: { card: Card }) {
  const Icon = SUIT[card.suit];
  const red = card.suit === "H" || card.suit === "D";
  return (
    <span
      className={`inline-flex h-12 w-9 flex-col items-center justify-center gap-0.5 bg-[#f6efdd] shadow-[inset_0_0_0_1px_#1a1612,0_2px_0_rgb(0_0_0/.25)] ${
        red ? "text-blood-500" : "text-card-ink"
      }`}
      aria-label={`${RANK[card.rank] ?? card.rank} de ${{ S: "picas", H: "corazones", D: "diamantes", C: "tréboles" }[card.suit]}`}
    >
      <b className="stencil text-lg leading-none">{RANK[card.rank] ?? card.rank}</b>
      <Icon className="h-3.5 w-3.5 fill-current" aria-hidden />
    </span>
  );
}

export function NoirRuns({
  runs,
  names,
  onClose,
}: {
  runs: RunOne[];
  names: Record<string, string>;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label={`Resultado de ${runs.length} tableros`}
      className="fixed right-4 top-16 z-40 w-[min(380px,92vw)] rotate-1 bg-[linear-gradient(170deg,#efe6d3,#d6c7a8)] px-5 pt-5 pb-4 text-card-ink shadow-[0_24px_50px_rgb(0_0_0/.55)] [clip-path:polygon(0_1%,12%_0,40%_1.2%,70%_0,100%_1%,99%_50%,100%_100%,0_100%,1%_50%)]"
    >
      <p className="m-0 font-pix text-[11px] uppercase tracking-[.14em] text-blood-500">Notas del crupier</p>
      <h2 className="stencil m-0 mb-3 text-3xl">Se repartió {runs.length === 2 ? "dos veces" : `${runs.length} veces`}</h2>
      <ol className="m-0 grid list-none gap-3 p-0">
        {runs.map((r, i) => (
          <li key={i} className="grid gap-1.5 border-t-2 border-dotted border-[#8a7f6d] pt-2">
            <div className="flex items-baseline justify-between gap-2 font-pix text-[12px] uppercase tracking-[.1em] text-[#5a4d3e]">
              <span>Tablero {i + 1}</span>
              <span>{CATEGORY_LABEL[r.category as Category]}</span>
            </div>
            <div className="flex gap-1.5">
              {r.community.map((c) => (
                <InkCard key={c.id} card={c} />
              ))}
            </div>
            <p className="m-0 text-[14px]">
              {r.winners.length > 1 ? "Empate: " : "Gana "}
              <b>{r.winners.map((id) => names[id] ?? "?").join(" y ")}</b>
            </p>
          </li>
        ))}
      </ol>
      <button type="button" onClick={onClose} className="btn-brass btn-sm mt-3">
        Guardar las notas
      </button>
    </div>
  );
}
