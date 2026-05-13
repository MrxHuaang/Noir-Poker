"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Trophy } from "lucide-react";
import { PlayingCard } from "@/components/cards/PlayingCard";
import { BettingControls } from "@/components/betting/BettingControls";
import { PotDisplay } from "@/components/betting/PotDisplay";
import { TurnTimer } from "@/components/betting/TurnTimer";
import { Avatar } from "@/components/players/Avatar";
import { useAuth } from "@/hooks/useAuth";
import { useNormalRoom, useNormalLobby, useNormalHole } from "@/hooks/useNormalRoom";
import { joinNormalLobby, postPlayerAction } from "@/lib/normalRooms";
import { formatChips } from "@/lib/betting";
import { getTableTheme } from "@/lib/themes";
import type { TableThemeId } from "@/lib/themes";
import type { BettingAction } from "@/lib/betting";
import { CATEGORY_LABEL } from "@/lib/handEval";

function NameEntry({ onJoin }: { onJoin: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onJoin(name.trim());
      }}
      className="flex flex-col items-center gap-4 p-6"
    >
      <h2 className="text-lg font-semibold text-zinc-100">Únete a la sala</h2>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tu nombre"
        maxLength={20}
        autoFocus
        className="px-4 py-2.5 rounded-xl bg-black/40 ring-1 ring-white/10 text-zinc-100 text-sm outline-none focus:ring-emerald-400/40 w-full max-w-xs"
      />
      <button
        type="submit"
        disabled={!name.trim()}
        className="px-6 py-2.5 rounded-full bg-emerald-500/90 hover:bg-emerald-400 disabled:opacity-30 text-emerald-950 font-medium text-sm btn-press transition"
      >
        Unirse
      </button>
    </form>
  );
}

export default function PlayNormalPage() {
  const params = useParams<{ code: string }>();
  const code = params.code?.toUpperCase() ?? null;
  const { uid, loading } = useAuth();
  const [joined, setJoined] = useState(false);
  const mySeed = useRef(Math.random().toString(36).slice(2));

  const room = useNormalRoom(code);
  const lobby = useNormalLobby(code);
  const hole = useNormalHole(code, uid);

  const gs = room?.state ?? null;
  const config = room?.config;
  const theme = (room?.theme as TableThemeId) ?? "emerald";
  const t = getTableTheme(theme);

  // Already in lobby
  useEffect(() => {
    if (!uid || !lobby.length) return;
    if (lobby.some((p) => p.uid === uid)) setJoined(true);
  }, [uid, lobby]);

  async function handleJoin(name: string) {
    if (!uid || !code) return;
    await joinNormalLobby(code, uid, name, mySeed.current);
    setJoined(true);
  }

  async function handleAction(action: BettingAction, amount?: number) {
    if (!uid || !code) return;
    await postPlayerAction(code, uid, action, amount);
  }

  if (loading || room === undefined) {
    return (
      <div className="p-8 text-center text-zinc-500 text-sm">Conectando…</div>
    );
  }

  if (!room) {
    return (
      <div className="p-8 text-center text-zinc-500 text-sm">
        Sala no encontrada.
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="w-full max-w-sm mx-auto py-16">
        <NameEntry onJoin={handleJoin} />
      </div>
    );
  }

  const mySeat = gs?.seats.find((s) => s.id === uid) ?? null;
  const isMyTurn = !!(gs && gs.betting.toActId === uid);
  const result = room.result;

  return (
    <div className="w-full max-w-lg mx-auto px-4 py-6 flex flex-col gap-4">
      {/* Community cards + pot */}
      {gs ? (
        <div
          className="rounded-3xl p-5 flex flex-col items-center gap-3"
          style={{ background: t.feltGradient }}
        >
          <PotDisplay
            pot={gs.betting.pot}
            sidePots={gs.betting.sidePots}
            currentBet={gs.betting.currentBet}
          />
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            {gs.community.map((c, i) => (
              <PlayingCard
                key={c.id + i}
                card={c}
                faceUp
                size="sm"
                dealIn={false}
              />
            ))}
            {Array.from({ length: 5 - gs.community.length }).map((_, i) => (
              <PlayingCard
                key={`e${i}`}
                faceUp={false}
                size="sm"
                dealIn={false}
              />
            ))}
          </div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
            {gs.street} · {gs.phase}
          </div>
        </div>
      ) : (
        <div className="py-10 text-center text-zinc-500 text-sm">
          Esperando que el host reparta…
        </div>
      )}

      {/* My hole cards */}
      <div className="flex flex-col items-center gap-3 p-4 rounded-2xl glass">
        <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          Tus cartas
        </span>
        <div className="flex items-center gap-4">
          {hole?.cards ? (
            hole.cards.map((c, i) => (
              <PlayingCard key={c.id + i} card={c} faceUp size="lg" dealIn />
            ))
          ) : (
            <>
              <PlayingCard faceUp={false} size="lg" dealIn={false} />
              <PlayingCard faceUp={false} size="lg" dealIn={false} />
            </>
          )}
        </div>
        {mySeat && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-zinc-400">{mySeat.name}</span>
            <span className="tabular-nums font-semibold text-emerald-300">
              {formatChips(mySeat.chips)}
            </span>
            {mySeat.bet > 0 && (
              <span className="tabular-nums text-zinc-500 text-xs">
                +{formatChips(mySeat.bet)} en bote
              </span>
            )}
          </div>
        )}
      </div>

      {/* Result banner */}
      {result && (
        <div
          className={`px-4 py-3 rounded-2xl ring-1 text-sm text-center flex items-center justify-center gap-2 ${
            result.winners.includes(uid ?? "")
              ? "bg-amber-300/15 ring-amber-300/40 text-amber-100"
              : "bg-white/5 ring-white/10 text-zinc-400"
          }`}
        >
          {result.winners.includes(uid ?? "") && (
            <Trophy className="w-4 h-4 text-amber-300" />
          )}
          {result.winners.includes(uid ?? "")
            ? "¡Ganaste!"
            : "Mano terminada"}{" "}
          — {CATEGORY_LABEL[result.category]}
        </div>
      )}

      {/* Turn: betting controls */}
      {gs && mySeat && isMyTurn && mySeat.status === "active" && (
        <div className="flex flex-col gap-3 p-4 rounded-2xl glass ring-1 ring-emerald-400/30">
          <span className="text-xs text-emerald-300 font-medium uppercase tracking-[0.15em]">
            Tu turno
          </span>
          {mySeat.turnDeadline !== null && config && (
            <TurnTimer
              deadline={mySeat.turnDeadline}
              turnTime={config.turnTime}
              timeBank={mySeat.timeBank}
            />
          )}
          <BettingControls
            seat={mySeat}
            betting={gs.betting}
            onAction={handleAction}
          />
        </div>
      )}

      {/* Other players */}
      {gs && gs.seats.filter((s) => s.id !== uid).length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            Mesa
          </span>
          <ul className="flex flex-col gap-1.5">
            {gs.seats
              .filter((s) => s.id !== uid)
              .map((seat) => (
                <li
                  key={seat.id}
                  className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl ring-1 transition ${
                    gs.betting.toActId === seat.id
                      ? "bg-emerald-500/10 ring-emerald-400/30"
                      : seat.status === "folded"
                        ? "glass ring-white/5 opacity-40"
                        : "glass ring-white/8"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Avatar seed={seat.seed} size={24} />
                    <span className="text-xs text-zinc-200">{seat.name}</span>
                    {gs.betting.toActId === seat.id && (
                      <span className="text-[9px] uppercase tracking-widest text-emerald-300 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">
                        Turno
                      </span>
                    )}
                    {seat.status === "all-in" && (
                      <span className="text-[9px] uppercase tracking-widest text-amber-300 bg-amber-400/10 px-1.5 py-0.5 rounded-full">
                        All-in
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs tabular-nums">
                    {seat.bet > 0 && (
                      <span className="text-zinc-500">
                        +{formatChips(seat.bet)}
                      </span>
                    )}
                    <span
                      className={
                        seat.status === "folded"
                          ? "text-zinc-500"
                          : seat.status === "all-in"
                            ? "text-amber-300 font-medium"
                            : "text-zinc-100 font-medium"
                      }
                    >
                      {formatChips(seat.chips)}
                    </span>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Waiting lobby */}
      {!gs && joined && (
        <div className="p-4 rounded-2xl glass text-center">
          <p className="text-xs text-zinc-400">
            En sala · {lobby.length} jugadores
          </p>
          <ul className="flex flex-wrap gap-2 justify-center mt-3">
            {lobby.map((p) => (
              <li
                key={p.uid}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 ring-1 ring-white/10 text-xs text-zinc-300"
              >
                <Avatar seed={p.seed} size={16} />
                {p.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
