"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { RoomConfig } from "@/lib/betting";
import { clamp } from "@/lib/num";

type Props = {
  config: RoomConfig;
  onChange: (c: RoomConfig) => void;
  onClose: () => void;
  // Room identity (top-level room doc fields, not part of RoomConfig).
  maxPlayers?: number;
  onMaxPlayersChange?: (n: number) => void;
};

type Feedback = { message: string; tone: "ok" | "warn" };

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  onFeedback,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onFeedback: (message: string, tone: Feedback["tone"]) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  function handleBlur() {
    const v = Number(draft);
    if (Number.isNaN(v)) {
      setDraft(String(value));
      onFeedback(`${label}: ingresa un numero valido.`, "warn");
      return;
    }
    const clamped = clamp(v, min, max);
    setDraft(String(clamped));
    onChange(clamped);
    if (clamped !== v) {
      onFeedback(`${label}: ajustado al rango permitido (${min}-${max}).`, "warn");
    } else {
      onFeedback("Cambios aplicados automaticamente.", "ok");
    }
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-[0.15em] text-zinc-500">
        {label}
      </span>
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        className="px-3 py-2 rounded-xl bg-black/40 ring-1 ring-white/10 text-zinc-100 text-sm outline-none focus:ring-white/40"
      />
    </label>
  );
}

export function NormalConfigPanel({
  config,
  onChange,
  onClose,
  maxPlayers,
  onMaxPlayersChange,
}: Props) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  function notify(message: string, tone: Feedback["tone"]) {
    setFeedback({ message, tone });
  }

  useEffect(() => {
    if (!feedback) return;
    const id = window.setTimeout(() => setFeedback(null), 3000);
    return () => window.clearTimeout(id);
  }, [feedback]);

  function set(partial: Partial<RoomConfig>) {
    const next = { ...config, ...partial };
    if ("bigBlind" in partial) {
      next.bigBlind = Math.max(next.smallBlind + 1, next.bigBlind);
    }
    if ("smallBlind" in partial) {
      next.smallBlind = Math.min(next.bigBlind - 1, next.smallBlind);
    }
    next.startingStack = Math.max(1, next.startingStack);
    onChange(next);
  }

  function setMaxPlayers(v: number) {
    onMaxPlayersChange?.(v);
  }

  return (
    <div className="p-4 rounded-2xl glass flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm text-zinc-100">Configuracion de sala</h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-white/10 transition"
          aria-label="Cerrar configuracion"
        >
          <X className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {onMaxPlayersChange && (
        <div className="flex flex-col gap-3 pb-4 border-b border-white/5">
          <NumberField
            key={`max-${maxPlayers ?? 9}`}
            label="Jugadores maximos"
            value={maxPlayers ?? 9}
            min={2}
            max={9}
            onChange={setMaxPlayers}
            onFeedback={notify}
          />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <NumberField
          key={`stack-${config.startingStack}`}
          label="Stack inicial"
          value={config.startingStack}
          min={100}
          max={100000}
          step={100}
          onChange={(v) => set({ startingStack: v })}
          onFeedback={notify}
        />
        <NumberField
          key={`sb-${config.smallBlind}-${config.bigBlind}`}
          label="Small blind"
          value={config.smallBlind}
          min={1}
          max={config.bigBlind - 1}
          onChange={(v) => set({ smallBlind: v })}
          onFeedback={notify}
        />
        <NumberField
          key={`bb-${config.bigBlind}-${config.smallBlind}`}
          label="Big blind"
          value={config.bigBlind}
          min={config.smallBlind + 1}
          max={10000}
          onChange={(v) => set({ bigBlind: v })}
          onFeedback={notify}
        />
        <NumberField
          key={`ante-${config.ante}-${config.bigBlind}`}
          label="Ante"
          value={config.ante}
          min={0}
          max={config.bigBlind}
          onChange={(v) => set({ ante: v })}
          onFeedback={notify}
        />
        <NumberField
          key={`turn-${config.turnTime}`}
          label="Tiempo turno (s)"
          value={Math.round(config.turnTime / 1000)}
          min={10}
          max={120}
          onChange={(v) => set({ turnTime: v * 1000 })}
          onFeedback={notify}
        />
        <NumberField
          key={`bank-${config.timeBankInit}`}
          label="Banco de tiempo (s)"
          value={Math.round(config.timeBankInit / 1000)}
          min={0}
          max={600}
          step={30}
          onChange={(v) => set({ timeBankInit: v * 1000 })}
          onFeedback={notify}
        />
      </div>

      {feedback ? (
        <p
          className={`rounded-xl px-3 py-2 text-xs ring-1 ${
            feedback.tone === "warn"
              ? "bg-warn-500/10 text-warn-200 ring-warn-400/25"
              : "bg-success-500/10 text-success-200 ring-success-400/25"
          }`}
          aria-live="polite"
        >
          {feedback.message}
        </p>
      ) : (
        <p className="text-[11px] text-zinc-500" aria-live="polite">
          Los cambios se guardan automaticamente al salir de cada campo.
        </p>
      )}
    </div>
  );
}
