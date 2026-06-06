"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { Player } from "@/lib/poker";
import { usePlayers } from "@/hooks/usePlayers";
import { useStats } from "@/hooks/useStats";
import { useHistory } from "@/hooks/useHistory";
import { PlayerForm } from "@/components/players/PlayerForm";
import { PlayerList } from "@/components/players/PlayerList";
import { BorderGlow } from "@/components/ui/BorderGlow";
import { ACCENT_GLOW_COLORS, ACCENT_GLOW_HSL } from "@/lib/brand";

export default function PlayersPage() {
  const { players, add, update, remove, hydrated } = usePlayers();
  const { removePlayer: removeStats } = useStats();
  const { purgePlayer } = useHistory();
  const [editing, setEditing] = useState<Player | null>(null);

  function onSubmit(name: string, seed: string) {
    if (editing) {
      update(editing.id, { name, seed });
      setEditing(null);
    } else {
      add(name, seed);
    }
  }

  const canPlay = players.length >= 2;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-10 flex flex-col gap-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl tracking-tight text-zinc-100">Jugadores</h1>
          <p className="text-sm text-muted mt-1">
            Roster local. Persistido en este navegador.
          </p>
        </div>
        {hydrated && canPlay ? (
          <Link href="/host" className="group block">
            <BorderGlow
              edgeSensitivity={32}
              glowColor={ACCENT_GLOW_HSL}
              backgroundColor="rgba(9,7,16,0.85)"
              borderRadius={999}
              glowRadius={18}
              glowIntensity={1}
              coneSpread={28}
              animated={false}
              colors={ACCENT_GLOW_COLORS}
              fillOpacity={0.42}
            >
              <span className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-accent-200 transition group-hover:text-white">
                Ir a la mesa
                <ArrowRight className="w-4 h-4" />
              </span>
            </BorderGlow>
          </Link>
        ) : null}
      </header>
      <BorderGlow
        className="w-full lg-blur"
        edgeSensitivity={24}
        glowColor={ACCENT_GLOW_HSL}
        backgroundColor="var(--lg-bg)"
        borderRadius={18}
        glowRadius={26}
        glowIntensity={0.92}
        coneSpread={26}
        animated={false}
        colors={ACCENT_GLOW_COLORS}
        fillOpacity={0.38}
      >
        <PlayerForm
          editing={editing}
          onSubmit={onSubmit}
          onCancel={() => setEditing(null)}
          existingNames={players.map((p) => p.name)}
        />
      </BorderGlow>
      {hydrated ? (
        <>
          <PlayerList
            players={players}
            onEdit={(p) => setEditing(p)}
            onDelete={(id) => {
              if (editing?.id === id) setEditing(null);
              remove(id);
              removeStats(id);
              purgePlayer(id);
            }}
          />
          {canPlay ? (
            <div className="flex items-center justify-center pt-2">
              <Link href="/host" className="group block">
                <BorderGlow
                  edgeSensitivity={32}
                  glowColor={ACCENT_GLOW_HSL}
                  backgroundColor="rgba(9, 7, 16, 0.82)"
                  borderRadius={999}
                  glowRadius={18}
                  glowIntensity={1}
                  coneSpread={28}
                  animated={false}
                  colors={ACCENT_GLOW_COLORS}
                  fillOpacity={0.42}
                >
                  <span className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-accent-200 transition group-hover:text-white">
                    Ir a la mesa ({players.length} jugadores)
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </BorderGlow>
              </Link>
            </div>
          ) : players.length === 1 ? (
            <p className="text-center text-xs text-muted">
              Agrega 1 jugador más para poder jugar.
            </p>
          ) : null}
        </>
      ) : (
        <div className="text-sm text-muted py-8 text-center">Cargando…</div>
      )}
    </div>
  );
}
