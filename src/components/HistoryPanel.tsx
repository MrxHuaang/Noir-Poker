"use client";
import { useState } from "react";
import { ChevronDown, History, Trash2, Eye } from "lucide-react";
import { useHistory } from "@/hooks/useHistory";
import type { HistoryEntry } from "@/hooks/useHistory";
import { CATEGORY_LABEL } from "@/lib/handEval";
import { rankLabel, suitColor, suitGlyph } from "@/lib/poker";

function HandReplay({ entry }: { entry: HistoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const winners = entry.players.filter((p) => entry.winners.includes(p.id));

  return (
    <li className="flex flex-col gap-2 p-3 rounded-xl bg-black/30 ring-1 ring-white/5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-1">
          {entry.community.map((c, i) => (
            <span
              key={i}
              className={`inline-flex items-center justify-center w-7 h-9 rounded-md bg-white text-[11px] font-semibold leading-none ring-1 ring-zinc-300 ${
                suitColor(c.suit) === "red" ? "text-rose-600" : "text-zinc-900"
              }`}
            >
              <span className="flex flex-col items-center">
                <span>{rankLabel(c.rank)}</span>
                <span className="text-[10px]">{suitGlyph(c.suit)}</span>
              </span>
            </span>
          ))}
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <span className="text-sm text-zinc-100 truncate">
            {winners.length > 1 ? "Empate: " : "Gana "}
            <span className="font-medium">{winners.map((w) => w.name).join(" · ")}</span>
          </span>
          <span className="text-[11px] text-zinc-400">
            {CATEGORY_LABEL[entry.category]}
            {entry.runTotal ? ` · Run ${entry.runIndex! + 1}/${entry.runTotal}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <time className="text-[10px] text-zinc-500 tabular-nums">
            {new Date(entry.ts).toLocaleString()}
          </time>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-white/8 ring-1 ring-white/8 transition"
          >
            <Eye className="w-3 h-3" />
            {expanded ? "Ocultar" : "Ver"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="pt-1 border-t border-white/5 flex flex-col gap-2 animate-in slide-in-from-top-1 fade-in duration-200">
          <div className="flex flex-wrap gap-1">
            {entry.community.map((c, i) => (
              <span
                key={i}
                className={`inline-flex items-center justify-center w-9 h-12 rounded-lg bg-white text-sm font-bold leading-none ring-1 ring-zinc-300 shadow ${
                  suitColor(c.suit) === "red" ? "text-rose-600" : "text-zinc-900"
                }`}
              >
                <span className="flex flex-col items-center gap-px">
                  <span>{rankLabel(c.rank)}</span>
                  <span className="text-xs">{suitGlyph(c.suit)}</span>
                </span>
              </span>
            ))}
            {entry.community.length === 0 && (
              <span className="text-[11px] text-zinc-600 italic">Sin cartas comunitarias</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            {entry.players.map((p) => {
              const won = entry.winners.includes(p.id);
              return (
                <div key={p.id} className={`flex items-center gap-2 text-xs ${won ? "text-zinc-100" : "text-zinc-500"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${won ? "bg-zinc-200" : "bg-zinc-700"}`} />
                  <span className="font-medium">{p.name}</span>
                  {won && (
                    <span className="ml-auto text-[10px] uppercase tracking-widest text-zinc-400">
                      {CATEGORY_LABEL[entry.category]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </li>
  );
}

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
              {history.map((h) => (
                <HandReplay key={h.id} entry={h} />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
