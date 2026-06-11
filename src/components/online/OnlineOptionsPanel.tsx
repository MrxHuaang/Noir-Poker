"use client";
// Options drawer for the server-backed online table: share the room (code, QR,
// copy link), table config (owner only — applied by the Go server), and the
// hand history persisted by the server in Supabase. Presentational: every
// mutation goes out as a WS message; nothing is decided client-side.
import { useState } from "react";
import { Check, Copy, History, LogOut, Settings, Share2, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { formatChips } from "@/lib/betting";
import { categoryLabel, type OnlineHandRecord } from "@/hooks/useOnlineHistory";

export function OnlineOptionsPanel({
  code,
  joinUrl,
  isOwner,
  sb,
  bb,
  startStack,
  history,
  onConfig,
  onStandUp,
  onClose,
}: {
  code: string;
  joinUrl: string;
  isOwner: boolean;
  sb: number;
  bb: number;
  startStack: number;
  history: OnlineHandRecord[];
  onConfig: (sb: number, bb: number, stack: number, runItN?: number, blindLevelSecs?: number) => void;
  onStandUp?: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [draftSb, setDraftSb] = useState(sb);
  const [draftBb, setDraftBb] = useState(bb);
  const [draftStack, setDraftStack] = useState(startStack);
  const [draftRunItN, setDraftRunItN] = useState(1);
  const [applied, setApplied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  function applyConfig() {
    onConfig(draftSb, draftBb, draftStack, draftRunItN);
    setApplied(true);
    setTimeout(() => setApplied(false), 1500);
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-stretch justify-end bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Opciones de la sala"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="custom-scrollbar w-[min(380px,92vw)] h-full overflow-y-auto bg-zinc-950/95 ring-1 ring-white/10 p-5 flex flex-col gap-6 animate-in slide-in-from-right duration-200">
        <header className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-200 flex items-center gap-2">
            <Settings className="w-4 h-4" /> Sala {code}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/5 text-zinc-400 transition"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Compartir */}
        <section className="flex flex-col gap-3">
          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 flex items-center gap-1.5">
            <Share2 className="w-3 h-3" /> Invitar
          </span>
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-xl bg-white">
              <QRCodeSVG value={joinUrl} size={96} />
            </div>
            <div className="flex flex-col gap-2 min-w-0">
              <span className="font-mono text-lg font-black tracking-[0.3em] text-accent-300">
                {code}
              </span>
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-zinc-200 text-[11px] font-bold transition btn-press"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-success-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copiado" : "Copiar enlace"}
              </button>
              <p className="text-[10px] text-zinc-600">
                Se juega desde computadora.
              </p>
            </div>
          </div>
        </section>

        {/* Config (solo el anfitrión; el servidor valida igualmente) */}
        {isOwner && (
          <section className="flex flex-col gap-3">
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
              Mesa (para próximas manos)
            </span>
            <div className="grid grid-cols-3 gap-2">
              {([
                ["Ciega chica", draftSb, setDraftSb],
                ["Ciega grande", draftBb, setDraftBb],
                ["Stack", draftStack, setDraftStack],
              ] as const).map(([label, val, set]) => (
                <label key={label} className="flex flex-col gap-1">
                  <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">{label}</span>
                  <input
                    type="number"
                    value={val}
                    onChange={(e) => set(Math.max(0, Number(e.target.value) || 0))}
                    className="px-2 py-1.5 rounded-lg bg-black/40 ring-1 ring-white/10 text-zinc-100 text-sm tabular-nums outline-none focus:ring-accent-500/40"
                  />
                </label>
              ))}
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Run it</span>
              <select
                value={draftRunItN}
                onChange={(e) => setDraftRunItN(Number(e.target.value))}
                className="px-2 py-1.5 rounded-lg bg-black/40 ring-1 ring-white/10 text-zinc-100 text-sm outline-none focus:ring-accent-500/40"
              >
                <option value={1}>1× (normal)</option>
                <option value={2}>2× (run-it-twice)</option>
                <option value={3}>3× (run-it-three)</option>
              </select>
            </label>
            <button
              type="button"
              onClick={applyConfig}
              className="px-4 py-2 rounded-xl bg-accent-500/20 ring-1 ring-accent-400/40 text-accent-100 font-bold text-xs btn-press"
            >
              {applied ? "Aplicado" : "Aplicar"}
            </button>
          </section>
        )}

        {/* Levantarse: liquida el stack y sigue mirando */}
        {onStandUp && (
          <section className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onStandUp}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-zinc-200 font-bold text-xs btn-press"
            >
              <LogOut className="w-3.5 h-3.5" />
              Levantarme (seguir mirando)
            </button>
            <p className="text-[10px] text-zinc-600">
              Tu stack se convierte en monedas al levantarte.
            </p>
          </section>
        )}

        {/* Historial (autoritativo: lo escribe el servidor Go) */}
        <section className="flex flex-col gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 flex items-center gap-1.5">
            <History className="w-3 h-3" /> Historial ({history.length})
          </span>
          {history.length === 0 ? (
            <p className="text-xs text-zinc-600">
              Aún no hay manos registradas en esta sala.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {history.slice(0, 25).map((r) => {
                const winnerNames = (r.winners ?? [])
                  .map((w) => `${r.seat_names?.[w.id] ?? w.id.slice(0, 6)} +${formatChips(w.amount)}`)
                  .join(" · ");
                const cats = r.categories
                  ? Object.values(r.categories)
                      .map((c) => categoryLabel(c))
                      .filter((v, i, a) => a.indexOf(v) === i)
                      .join(", ")
                  : null;
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-2 text-[11px] px-2.5 py-1.5 rounded-xl bg-white/[0.03] ring-1 ring-white/[0.05]"
                  >
                    <span className="text-zinc-500 tabular-nums shrink-0">#{r.hand_num}</span>
                    <span className="text-zinc-300 truncate flex-1">{winnerNames || "—"}</span>
                    {cats && <span className="text-zinc-600 shrink-0">{cats}</span>}
                    <span className="text-zinc-600 tabular-nums shrink-0">{formatChips(r.pot)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
