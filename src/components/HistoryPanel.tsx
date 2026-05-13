"use client";
import { useState } from "react";
import { ChevronDown, History, Trash2 } from "lucide-react";
import { useHistory } from "@/hooks/useHistory";
import { CATEGORY_LABEL } from "@/lib/handEval";
import { rankLabel, suitColor, suitGlyph } from "@/lib/poker";

export function HistoryPanel() {
  const { history, clear, loaded } = useHistory();
  const [open, setOpen] = useState(false);

  if (!loaded) return null;

  return (
    <section className="w-full mt-6 rounded-2xl bg-white/[0.02] ring-1 ring-white/5">
      <header className="flex items-center justify-between p-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 text-zinc-100"
        >
          <History className="w-4 h-4 text-zinc-400" />
          <span className="text-sm tracking-tight">Historial de manos</span>
          <span className="text-[11px] text-zinc-500">
            ({history.length})
          </span>
          <ChevronDown
            className={`w-4 h-4 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {history.length > 0 ? (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] text-zinc-400 hover:text-rose-300 hover:bg-rose-500/10 ring-1 ring-white/5 transition"
          >
            <Trash2 className="w-3 h-3" />
            Limpiar
          </button>
        ) : null}
      </header>
      {open ? (
        <div className="p-4 pt-0">
          {history.length === 0 ? (
            <p className="text-xs text-zinc-500 py-4 text-center">
              Sin manos registradas aún.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {history.map((h) => {
                const winners = h.players.filter((p) =>
                  h.winners.includes(p.id),
                );
                return (
                  <li
                    key={h.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-black/30 ring-1 ring-white/5"
                  >
                    <div className="flex items-center gap-1">
                      {h.community.map((c, i) => (
                        <span
                          key={i}
                          className={`inline-flex items-center justify-center w-7 h-9 rounded-md bg-white text-[11px] font-semibold leading-none ring-1 ring-zinc-300 ${
                            suitColor(c.suit) === "red"
                              ? "text-rose-600"
                              : "text-zinc-900"
                          }`}
                        >
                          <span className="flex flex-col items-center">
                            <span>{rankLabel(c.rank)}</span>
                            <span className="text-[10px]">
                              {suitGlyph(c.suit)}
                            </span>
                          </span>
                        </span>
                      ))}
                    </div>
                    <div className="flex-1 flex flex-col min-w-0">
                      <span className="text-sm text-amber-100 truncate">
                        {winners.length > 1 ? "Empate: " : "Gana "}
                        <span className="font-medium">
                          {winners.map((w) => w.name).join(" · ")}
                        </span>
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        {CATEGORY_LABEL[h.category]}
                        {h.runTotal
                          ? ` · Run ${h.runIndex! + 1}/${h.runTotal}`
                          : ""}
                      </span>
                    </div>
                    <time className="text-[10px] text-zinc-500 tabular-nums shrink-0">
                      {new Date(h.ts).toLocaleString()}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
