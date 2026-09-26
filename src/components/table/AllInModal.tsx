"use client";
import { useState } from "react";
import { Flame, X } from "lucide-react";

const PRESETS = [1, 2, 3, 5];

export function AllInModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (N: number) => void;
}) {
  const [N, setN] = useState(2);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-3xl bg-ink-900/95 ring-1 ring-line shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] p-6 flex flex-col gap-5">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-rose-400" />
            <h2 className="text-lg tracking-tight text-primary">All-in</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-full hover:bg-bone/[0.04] text-secondary transition"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </header>
        <p className="text-sm text-secondary leading-relaxed">
          Repartir las calles pendientes varias veces (run it N times). Cada
          run cuenta como una mano completa en el historial.
        </p>
        <div className="flex flex-col gap-3">
          <span className="eyebrow">
            Cantidad de runs
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {PRESETS.map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setN(p)}
                className={`min-w-[2.6rem] px-3 py-1.5 rounded-full ring-1 text-sm transition ${
                  N === p
                    ? "bg-accent ring-accent text-accent-contrast"
                    : "bg-bone/[0.04] ring-line text-primary hover:bg-bone/[0.07]"
                }`}
              >
                {p}×
              </button>
            ))}
            <label className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.02] ring-1 ring-line">
              <span className="text-xs text-muted">Personalizado</span>
              <input
                type="number"
                min={1}
                max={20}
                value={N}
                onChange={(e) =>
                  setN(
                    Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                  )
                }
                className="w-12 bg-transparent text-sm text-primary outline-none text-right tabular-nums"
              />
            </label>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-full bg-transparent hover:bg-bone/[0.04] ring-1 ring-line text-secondary text-sm transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(N)}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-rose-500 hover:bg-rose-400 text-rose-950 font-medium text-sm transition"
          >
            <Flame className="w-4 h-4" />
            Correr {N}×
          </button>
        </div>
      </div>
    </div>
  );
}
