"use client";
import { X } from "lucide-react";
import type { RoomConfig } from "@/lib/betting";

type Props = {
  config: RoomConfig;
  onChange: (c: RoomConfig) => void;
  onClose: () => void;
};

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-[0.15em] text-zinc-500">
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => onChange(Number(e.target.value))}
        className="px-3 py-2 rounded-xl bg-black/40 ring-1 ring-white/10 text-zinc-100 text-sm outline-none focus:ring-emerald-400/40"
      />
    </label>
  );
}

export function NormalConfigPanel({ config, onChange, onClose }: Props) {
  function set(partial: Partial<RoomConfig>) {
    onChange({ ...config, ...partial });
  }

  return (
    <div className="p-4 rounded-2xl glass flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm text-zinc-100">Configuración de sala</h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-white/10 transition"
        >
          <X className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <NumberField
          label="Stack inicial"
          value={config.startingStack}
          min={100}
          max={100000}
          step={100}
          onChange={(v) => set({ startingStack: v })}
        />
        <NumberField
          label="Small blind"
          value={config.smallBlind}
          min={1}
          max={config.bigBlind - 1}
          onChange={(v) => set({ smallBlind: v })}
        />
        <NumberField
          label="Big blind"
          value={config.bigBlind}
          min={config.smallBlind + 1}
          max={10000}
          onChange={(v) => set({ bigBlind: v })}
        />
        <NumberField
          label="Ante"
          value={config.ante}
          min={0}
          max={config.bigBlind}
          onChange={(v) => set({ ante: v })}
        />
        <NumberField
          label="Tiempo turno (s)"
          value={Math.round(config.turnTime / 1000)}
          min={10}
          max={120}
          onChange={(v) => set({ turnTime: v * 1000 })}
        />
        <NumberField
          label="Time bank (s)"
          value={Math.round(config.timeBankInit / 1000)}
          min={0}
          max={600}
          step={30}
          onChange={(v) => set({ timeBankInit: v * 1000 })}
        />
      </div>
    </div>
  );
}
