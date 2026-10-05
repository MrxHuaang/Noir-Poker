"use client";
// How much you bring to the table: a chip on the brass rail, a ledger slot for
// the exact number and a brass switch for the minimum, the usual 100 big blinds
// and the maximum (always the same three slots, so the row never changes width). Your wallet is written next to it, so a short wallet reads before
// you press. Pure input: the server clamps and escrows again.
import { useId, useState } from "react";
import { Seg } from "@/components/noir/Pickers";

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** The amount to mark first: the suggested stack, inside the range and the wallet. */
export function defaultBuyIn(min: number, max: number, suggested: number, wallet?: number): number {
  const top = wallet === undefined ? max : Math.min(max, wallet);
  return Math.max(min, Math.min(top, suggested));
}

export function NoirBuyIn({
  min,
  max,
  bb,
  value,
  onChange,
  wallet,
}: {
  min: number;
  max: number;
  bb: number;
  value: number;
  onChange: (n: number) => void;
  /** Coins in the wallet; absent on tables without coins. */
  wallet?: number;
}) {
  const id = useId();
  // What is being typed; clamped into the range on blur or Enter.
  const [draft, setDraft] = useState<string | null>(null);
  const top = wallet === undefined ? max : Math.max(min, Math.min(max, wallet));
  const v = Math.max(min, Math.min(top, Math.round(value)));
  const short = wallet !== undefined && wallet < min;
  const presets = [
    { v: "min", label: "Mínimo", n: min },
    { v: "bb100", label: "100 grandes", n: Math.max(min, Math.min(top, bb * 100)) },
    { v: "max", label: wallet !== undefined && wallet < max ? "Todo lo que tengo" : "Máximo", n: top },
  ];
  const picked = presets.find((p) => p.n === v)?.v ?? "";

  return (
    <div className="grid w-full gap-2 text-left">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[14px] font-semibold text-brass-200">
          Traigo
        </label>
        <input
          id={id}
          inputMode="numeric"
          value={draft ?? String(v)}
          disabled={short}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 7))}
          onBlur={() => {
            if (draft !== null) onChange(Number(draft) || min);
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="slot-input h-9 w-28 px-2 text-right text-[16px] tabular-nums"
        />
      </div>
      {min < top && (
        <input
          type="range"
          className="chip-range w-full"
          min={min}
          max={top}
          step={Math.max(1, bb)}
          value={v}
          disabled={short}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Fichas que traes a la mesa"
        />
      )}
      <Seg
        label="Atajos de compra"
        value={picked}
        disabled={short}
        onChange={(k) => onChange(presets.find((p) => p.v === k)?.n ?? v)}
        options={presets.map((p) => ({ v: p.v, label: p.label }))}
      />
      <p className="m-0 text-[13px] text-paper-mute">
        Mesa de {fmt(min)} a {fmt(max)}
        {wallet !== undefined && (
          <>
            {" "}
            · en tu monedero <b className={short ? "text-blood-400" : "text-paper"}>{fmt(wallet)}</b>
          </>
        )}
      </p>
      {short && <p className="m-0 text-[13px] text-blood-400">Te faltan {fmt(min - wallet!)} fichas para el mínimo.</p>}
    </div>
  );
}
