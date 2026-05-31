"use client";
import { useState } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";
import type { BlindLevel, RoomConfig } from "@/lib/betting";

type Props = {
  config: RoomConfig;
  onChange: (c: RoomConfig) => void;
};

function NumField({
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
      <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="px-2.5 py-1.5 rounded-lg bg-black/40 ring-1 ring-white/10 text-zinc-100 text-sm outline-none focus:ring-amber-500/40 tabular-nums"
      />
    </label>
  );
}

function generateLevels(opts: {
  count: number;
  sbStart: number;
  multiplier: number;
  anteStartLevel: number;
  anteRatio: number; // ante = bb * anteRatio
}): BlindLevel[] {
  const out: BlindLevel[] = [];
  let sb = opts.sbStart;
  for (let i = 0; i < opts.count; i++) {
    const bb = sb * 2;
    const ante =
      i + 1 >= opts.anteStartLevel ? Math.max(1, Math.round(bb * opts.anteRatio)) : 0;
    out.push({ sb, bb, ante });
    sb = Math.max(sb + 1, Math.round(sb * opts.multiplier));
  }
  return out;
}

export function TournamentConfigPanel({ config, onChange }: Props) {
  const levels = config.blindLevels ?? [];
  const [genOpen, setGenOpen] = useState(false);
  const [count, setCount] = useState(levels.length || 10);
  const [sbStart, setSbStart] = useState(levels[0]?.sb ?? 10);
  const [multiplier, setMultiplier] = useState(1.5);
  const [anteStartLevel, setAnteStartLevel] = useState(3);
  const [anteRatio, setAnteRatio] = useState(0.1);

  function set(partial: Partial<RoomConfig>) {
    onChange({ ...config, ...partial });
  }

  function setLevels(next: BlindLevel[]) {
    onChange({
      ...config,
      blindLevels: next,
      smallBlind: next[0]?.sb ?? config.smallBlind,
      bigBlind: next[0]?.bb ?? config.bigBlind,
      ante: next[0]?.ante ?? config.ante,
    });
  }

  function updateLevel(idx: number, patch: Partial<BlindLevel>) {
    const next = levels.map((lvl, i) => (i === idx ? { ...lvl, ...patch } : lvl));
    setLevels(next);
  }

  function removeLevel(idx: number) {
    if (levels.length <= 1) return;
    setLevels(levels.filter((_, i) => i !== idx));
  }

  function addLevel() {
    const last = levels[levels.length - 1] ?? { sb: 10, bb: 20, ante: 0 };
    setLevels([
      ...levels,
      { sb: last.sb * 2, bb: last.bb * 2, ante: last.ante },
    ]);
  }

  function regenerate() {
    setLevels(generateLevels({ count, sbStart, multiplier, anteStartLevel, anteRatio }));
    setGenOpen(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <NumField
          label="Stack inicial"
          value={config.startingStack}
          min={100}
          max={1000000}
          step={500}
          onChange={(v) => set({ startingStack: v })}
        />
        <NumField
          label="Duración nivel (min)"
          value={Math.round((config.blindLevelDuration ?? 15 * 60_000) / 60_000)}
          min={1}
          max={120}
          onChange={(v) => set({ blindLevelDuration: v * 60_000 })}
        />
        <NumField
          label="Tiempo turno (s)"
          value={Math.round(config.turnTime / 1000)}
          min={10}
          max={120}
          onChange={(v) => set({ turnTime: v * 1000 })}
        />
        <NumField
          label="Time bank (s)"
          value={Math.round(config.timeBankInit / 1000)}
          min={0}
          max={600}
          step={30}
          onChange={(v) => set({ timeBankInit: v * 1000 })}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">
          Estructura ciegas ({levels.length} niveles)
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setGenOpen((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 ring-1 ring-amber-400/25 text-amber-300 text-[10px] font-bold uppercase tracking-widest hover:bg-amber-500/18 transition btn-press"
          >
            <Wand2 className="w-3 h-3" /> Generar
          </button>
          <button
            type="button"
            onClick={addLevel}
            className="p-1 rounded-lg bg-white/5 ring-1 ring-white/10 text-zinc-300 hover:bg-white/10 transition"
            title="Agregar nivel"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {genOpen && (
        <div className="p-3 rounded-2xl bg-black/40 ring-1 ring-amber-400/18 flex flex-col gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Cantidad" value={count} min={1} max={50} onChange={setCount} />
            <NumField label="SB inicial" value={sbStart} min={1} max={100000} step={5} onChange={setSbStart} />
            <NumField
              label="Multiplicador (×)"
              value={Math.round(multiplier * 100)}
              min={110}
              max={300}
              step={10}
              onChange={(v) => setMultiplier(v / 100)}
            />
            <NumField
              label="Ante desde nivel"
              value={anteStartLevel}
              min={1}
              max={50}
              onChange={setAnteStartLevel}
            />
            <NumField
              label="Ratio ante (% BB)"
              value={Math.round(anteRatio * 100)}
              min={0}
              max={100}
              step={5}
              onChange={(v) => setAnteRatio(v / 100)}
            />
          </div>
          <button
            type="button"
            onClick={regenerate}
            className="px-3 py-2 rounded-xl bg-amber-700/70 hover:bg-amber-600/75 text-amber-100 text-[11px] font-black uppercase tracking-widest transition btn-press"
          >
            Aplicar estructura
          </button>
        </div>
      )}

      <ul className="flex flex-col gap-1 max-h-72 overflow-y-auto custom-scrollbar pr-1">
        <li className="grid grid-cols-[24px_1fr_1fr_1fr_24px] gap-1 text-[9px] uppercase tracking-widest text-zinc-600 font-black px-2 pb-1 border-b border-white/5">
          <span>#</span>
          <span>SB</span>
          <span>BB</span>
          <span>Ante</span>
          <span></span>
        </li>
        {levels.map((lvl, i) => (
          <li
            key={i}
            className="grid grid-cols-[24px_1fr_1fr_1fr_24px] gap-1 items-center text-xs"
          >
            <span className="text-zinc-600 font-mono">{i + 1}</span>
            <input
              type="number"
              value={lvl.sb}
              min={1}
              onChange={(e) => updateLevel(i, { sb: Math.max(1, Number(e.target.value) || 1) })}
              className="px-1.5 py-1 rounded-md bg-black/40 ring-1 ring-white/10 text-zinc-100 text-xs outline-none focus:ring-amber-500/40 tabular-nums min-w-0"
            />
            <input
              type="number"
              value={lvl.bb}
              min={1}
              onChange={(e) => updateLevel(i, { bb: Math.max(1, Number(e.target.value) || 1) })}
              className="px-1.5 py-1 rounded-md bg-black/40 ring-1 ring-white/10 text-zinc-100 text-xs outline-none focus:ring-amber-500/40 tabular-nums min-w-0"
            />
            <input
              type="number"
              value={lvl.ante}
              min={0}
              onChange={(e) => updateLevel(i, { ante: Math.max(0, Number(e.target.value) || 0) })}
              className="px-1.5 py-1 rounded-md bg-black/40 ring-1 ring-white/10 text-zinc-100 text-xs outline-none focus:ring-amber-500/40 tabular-nums min-w-0"
            />
            <button
              type="button"
              onClick={() => removeLevel(i)}
              className="p-1 rounded-md text-rose-400/60 hover:bg-rose-500/10 hover:text-rose-400 transition"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
