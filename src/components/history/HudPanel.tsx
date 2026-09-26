"use client";
// Per-player stats table (HUD) for a room, aggregated from stored hands.
// Names resolved by id from the caller (lobby + game seats). Stats limited to
// what HandRecord carries: played / win% / went-to-showdown% / won-at-showdown%.
import { useMemo } from "react";
import { aggregateHud } from "@/lib/handStats";
import type { HandRecord } from "@/lib/handHistory";

export function HudPanel({
  hands,
  nameById,
}: {
  hands: HandRecord[];
  nameById: Record<string, string>;
}) {
  const rows = useMemo(() => aggregateHud(hands), [hands]);

  if (rows.length === 0) {
    return (
      <div className="text-center py-10 text-muted text-sm">
        Sin datos de manos todavia
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="eyebrow text-[11px] grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-1">
        <span>Jugador</span>
        <span className="text-right tabular-nums" title="Manos jugadas">Manos</span>
        <span className="text-right tabular-nums" title="% de manos ganadas">%Vict</span>
        <span className="text-right tabular-nums" title="% de veces que llego al showdown">WTSD</span>
        <span className="text-right tabular-nums" title="% de showdowns ganados">WSD</span>
      </div>
      {rows.map((r) => (
        <div
          key={r.id}
          className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center p-3 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.08]"
        >
          <span className="text-xs text-primary font-bold truncate">
            {nameById[r.id] ?? `${r.id.slice(0, 6)}…`}
          </span>
          <span className="text-right text-xs tabular-nums text-secondary font-bold">
            {r.handsPlayed}
          </span>
          <span className="text-right text-xs tabular-nums text-accent-200 font-bold">
            {r.winPct}%
          </span>
          <span className="text-right text-xs tabular-nums text-secondary">
            {r.wtsdPct}%
          </span>
          <span className="text-right text-xs tabular-nums text-secondary">
            {r.wsdPct}%
          </span>
        </div>
      ))}
    </div>
  );
}
