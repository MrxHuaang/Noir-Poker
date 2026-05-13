"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Crown, Eye, EyeOff, Flame, RotateCcw, Shuffle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useHole, useRoom, useLobby } from "@/hooks/useRoom";
import { joinLobby, phoneSetSeatFlag } from "@/lib/rooms";
import { randomSeed } from "@/lib/dicebear";
import { Avatar } from "@/components/players/Avatar";
import { PlayingCard } from "@/components/cards/PlayingCard";

export default function PlayPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code || "").toUpperCase();
  const { uid, loading } = useAuth();
  const room = useRoom(code);
  const lobby = useLobby(code);

  const inLobby = useMemo(
    () => (uid ? lobby.find((p) => p.uid === uid) : null),
    [uid, lobby],
  );
  const mySeat = uid && room?.state
    ? room.state.seats.find((s) => s.id === uid)
    : null;
  const hole = useHole(code, mySeat?.id ?? null);

  if (loading || room === undefined) {
    return (
      <div className="w-full max-w-md mx-auto px-4 py-10 text-center text-zinc-500 text-sm">
        Conectando…
      </div>
    );
  }
  if (room === null) {
    return (
      <div className="w-full max-w-md mx-auto px-4 py-10 text-center">
        <p className="text-zinc-300">Sala no encontrada.</p>
        <p className="text-xs text-zinc-500 mt-2">Código: {code}</p>
      </div>
    );
  }

  if (!mySeat) {
    if (!inLobby) {
      return <LobbyForm code={code} uid={uid} />;
    }
    return (
      <div className="w-full max-w-md mx-auto px-4 py-10 flex flex-col items-center gap-4 text-center">
        <Avatar seed={inLobby.seed} size={72} />
        <h1 className="text-xl text-zinc-100">Hola, {inLobby.name}</h1>
        <p className="text-sm text-zinc-400">
          Estás en la sala <span className="font-mono">{code}</span>. Esperando
          que el host reparta.
        </p>
        <p className="text-[11px] text-zinc-500">
          {lobby.length} jugador{lobby.length === 1 ? "" : "es"} conectado
          {lobby.length === 1 ? "" : "s"}.
        </p>
      </div>
    );
  }

  return (
    <PhoneGameView
      code={code}
      mySeat={mySeat}
      room={room}
      hole={hole?.cards}
    />
  );
}

function LobbyForm({ code, uid }: { code: string; uid: string | null }) {
  const [name, setName] = useState("");
  const [seed, setSeed] = useState(() => randomSeed());
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!uid || !name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await joinLobby(code, uid, name.trim(), seed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-md mx-auto px-4 py-10 flex flex-col gap-6"
    >
      <header className="text-center">
        <h1 className="text-xl text-zinc-100">Sala {code}</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Elige tu apodo y avatar.
        </p>
      </header>

      <div className="flex flex-col items-center gap-3">
        <Avatar seed={seed} size={120} />
        <button
          type="button"
          onClick={() => setSeed(randomSeed())}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-xs text-zinc-200 transition"
        >
          <Shuffle className="w-3.5 h-3.5" />
          Otro avatar
        </button>
      </div>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tu apodo"
        maxLength={20}
        autoFocus
        className="px-5 py-4 rounded-2xl bg-black/40 ring-1 ring-white/10 text-zinc-100 text-lg text-center outline-none focus:ring-emerald-400/40"
      />

      <button
        type="submit"
        disabled={!name.trim() || submitting}
        className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-emerald-500/90 hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed text-emerald-950 font-medium transition"
      >
        Entrar a la mesa
      </button>
    </form>
  );
}

function PhoneGameView({
  code,
  mySeat,
  room,
  hole,
}: {
  code: string;
  mySeat: NonNullable<NonNullable<ReturnType<typeof useRoom>>["state"]>["seats"][number];
  room: NonNullable<ReturnType<typeof useRoom>>;
  hole?: [import("@/lib/poker").Card, import("@/lib/poker").Card];
}) {
  const winners = room.result?.winners ?? [];
  const isWinner = winners.includes(mySeat.id);
  const seats = room.state!.seats;
  const activeCount = seats.filter((s) => !s.folded).length;
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    if (room.result) setRevealing(true);
  }, [room.result]);

  return (
    <div className="w-full max-w-md mx-auto px-4 py-6 flex flex-col gap-5">
      <header className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] ring-1 ring-white/10">
        <div className="flex items-center gap-2">
          <Avatar seed={mySeat.seed} size={36} />
          <div className="flex flex-col">
            <span className="text-sm text-zinc-100">{mySeat.name}</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Sala {code}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Calle
          </div>
          <div className="text-sm text-zinc-100">{room.state!.street}</div>
        </div>
      </header>

      {room.result ? (
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-amber-300/10 ring-1 ring-amber-300/40 text-amber-100">
          <Crown className="w-4 h-4 text-amber-300" />
          <span className="text-sm">
            {isWinner
              ? "¡Ganas esta mano!"
              : `Gana: ${seats
                  .filter((s) => winners.includes(s.id))
                  .map((s) => s.name)
                  .join(" · ")}`}
          </span>
        </div>
      ) : null}

      <section>
        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Tus cartas
        </span>
        <div className="mt-2 flex items-center gap-3 justify-center p-4 rounded-2xl bg-white/[0.02] ring-1 ring-white/5">
          {hole ? (
            <>
              <PlayingCard
                card={hole[0]}
                faceUp={mySeat.revealed || revealing}
                size="lg"
                dealIn={false}
              />
              <PlayingCard
                card={hole[1]}
                faceUp={mySeat.revealed || revealing}
                size="lg"
                dealIn={false}
              />
            </>
          ) : (
            <div className="text-xs text-zinc-500 py-8">Sin cartas.</div>
          )}
        </div>
        <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() =>
              phoneSetSeatFlag(code, mySeat.id, "revealed", !mySeat.revealed).catch(() => {})
            }
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-zinc-100 text-sm transition"
          >
            {mySeat.revealed ? (
              <>
                <EyeOff className="w-4 h-4" /> Ocultar
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" /> Mostrar a la mesa
              </>
            )}
          </button>
          {!room.result ? (
            <button
              type="button"
              onClick={() =>
                phoneSetSeatFlag(code, mySeat.id, "folded", !mySeat.folded).catch(() => {})
              }
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ring-1 text-sm font-medium transition ${
                mySeat.folded
                  ? "bg-white/5 ring-white/10 text-zinc-200 hover:bg-white/10"
                  : "bg-rose-500/90 ring-rose-400/40 text-rose-950 hover:bg-rose-400"
              }`}
            >
              {mySeat.folded ? (
                <>
                  <RotateCcw className="w-4 h-4" /> Reactivar
                </>
              ) : (
                <>
                  <Flame className="w-4 h-4" /> Foldear
                </>
              )}
            </button>
          ) : null}
        </div>
      </section>

      <section>
        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Comunitarias ({room.state!.community.length}/5)
        </span>
        <div className="mt-2 flex items-center gap-2 overflow-x-auto p-3 rounded-2xl bg-white/[0.02] ring-1 ring-white/5">
          {room.state!.community.length === 0 ? (
            <span className="text-xs text-zinc-500 py-4 mx-auto">
              Pre-flop. Sin cartas comunitarias.
            </span>
          ) : (
            room.state!.community.map((c, i) => (
              <PlayingCard
                key={c.id + i}
                card={c}
                faceUp
                size="md"
                dealIn={false}
              />
            ))
          )}
        </div>
      </section>

      <section>
        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Otros jugadores ({activeCount} activos)
        </span>
        <ul className="mt-2 grid grid-cols-1 gap-2">
          {seats
            .filter((s) => s.id !== mySeat.id)
            .map((s) => (
              <li
                key={s.id}
                className={`flex items-center gap-3 p-2 rounded-xl ring-1 ${
                  winners.includes(s.id)
                    ? "bg-amber-300/10 ring-amber-300/40"
                    : s.folded
                      ? "bg-white/[0.01] ring-white/5 opacity-50"
                      : "bg-white/[0.02] ring-white/10"
                }`}
              >
                <Avatar seed={s.seed} size={32} />
                <span className="flex-1 text-sm text-zinc-100 truncate">
                  {s.name}
                </span>
                {s.folded ? (
                  <span className="text-[10px] uppercase tracking-[0.15em] text-rose-300">
                    Fold
                  </span>
                ) : winners.includes(s.id) ? (
                  <Crown className="w-4 h-4 text-amber-300" />
                ) : null}
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
