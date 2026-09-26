"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Crown, Eye, EyeOff, Flame, LogOut, RotateCcw, Shuffle, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useHole, useRoom, useLobby } from "@/hooks/useRoom";
import { useCardBack } from "@/hooks/useCardBack";
import { joinLobby, leaveLobby, phoneSetSeatFlag, phoneSetCardReveal } from "@/lib/rooms";
import { randomSeed } from "@/lib/dicebear";
import { Avatar } from "@/components/players/Avatar";
import { PlayingCard } from "@/components/cards/PlayingCard";
import { CardBackPicker } from "@/components/themes/CardBackPicker";
import { describeHand } from "@/lib/handLabel";
import type { Card } from "@/lib/poker";

// Pre-game screens (join form, waiting lobby) use the app-shell container.
const SHELL = "mx-auto w-full max-w-6xl px-5 sm:px-8";

export default function PlayPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code || "").toUpperCase();
  const { uid, loading } = useAuth();
  const room = useRoom(code);
  const lobby = useLobby(code);
  const [participantUid, setParticipantUid] = useState<string | null>(null);

  useEffect(() => {
    if (!uid || !code) return;
    const key = `noir:presencial:${code}:participantUid`;
    const existing = window.sessionStorage.getItem(key);
    if (existing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setParticipantUid(existing);
      return;
    }
    const random =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    const next = `tab-${uid.slice(0, 8)}-${random}`;
    window.sessionStorage.setItem(key, next);
    setParticipantUid(next);
  }, [code, uid]);

  const inLobby = useMemo(
    () => (participantUid ? lobby.find((p) => p.uid === participantUid) : null),
    [participantUid, lobby],
  );
  const mySeat = participantUid && room?.state
    ? room.state.seats.find((s) => s.id === participantUid)
    : null;
  const hole = useHole(code, mySeat?.id ?? null);

  if (loading || room === undefined || !participantUid) {
    return (
      <div className={`${SHELL} pt-14 pb-24 sm:pt-20`}>
        <p role="status" className="text-sm text-muted">
          Conectando…
        </p>
      </div>
    );
  }
  if (room === null) {
    return (
      <div className={`${SHELL} pt-14 pb-24 sm:pt-20`}>
        <p className="eyebrow mb-5">
          Código <span className="numeric text-primary">{code}</span>
        </p>
        <h1 className="display text-5xl text-primary sm:text-6xl">Sala no encontrada.</h1>
        <p className="mt-5 max-w-[42ch] text-base leading-relaxed text-secondary">
          Revisa el código con quien abrió la mesa.
        </p>
        <a href="/join" className="btn-quiet mt-8">
          Intentar con otro código
        </a>
      </div>
    );
  }

  if (!mySeat) {
    if (!inLobby) {
      return <LobbyForm code={code} participantUid={participantUid} ownerUid={uid} />;
    }
    return (
      <div className={`${SHELL} pt-14 pb-24 sm:pt-20`}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-8">
          <Avatar seed={inLobby.seed} size={88} className="rounded-[10px]!" />
          <div className="min-w-0">
            <p className="eyebrow mb-3 flex items-center gap-2">
              <span className="suit text-sm" aria-hidden>
                ♠
              </span>
              <span>
                Sala <span className="numeric text-primary">{code}</span>
              </span>
            </p>
            <h1 className="display text-5xl text-primary [overflow-wrap:anywhere] sm:text-6xl">
              Hola, <em className="text-accent-200">{inLobby.name}</em>
            </h1>
          </div>
        </div>
        <p role="status" className="mt-8 flex items-center gap-3 text-base text-secondary">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent-400" aria-hidden />
          Esperando que el host reparta.
        </p>
        <p className="mt-8 max-w-md border-t border-line pt-4 text-sm text-muted">
          <span className="numeric text-primary">{lobby.length}</span> jugador
          {lobby.length === 1 ? "" : "es"} conectado{lobby.length === 1 ? "" : "s"}.
        </p>
      </div>
    );
  }

  return (
    <PhoneGameView
      code={code}
      uid={uid}
      mySeat={mySeat}
      room={room}
      hole={hole?.cards}
    />
  );
}

function LobbyForm({
  code,
  participantUid,
  ownerUid,
}: {
  code: string;
  participantUid: string | null;
  ownerUid: string | null;
}) {
  const [name, setName] = useState("");
  const [seed, setSeed] = useState(() => randomSeed());
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!participantUid || !name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await joinLobby(code, participantUid, name.trim(), seed, ownerUid);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className={`${SHELL} pt-14 pb-24 sm:pt-20`}>
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-8">
        <header className="lg:col-span-6">
          <p className="eyebrow mb-5 flex items-center gap-2">
            <span className="suit text-sm" aria-hidden>
              ♠
            </span>
            <span>
              Sala <span className="numeric text-primary">{code}</span>
            </span>
          </p>
          <h1 className="display text-5xl text-primary sm:text-6xl">
            Elige tu apodo <em className="text-accent-200">y tu avatar.</em>
          </h1>
          <p className="mt-5 max-w-[40ch] text-base leading-relaxed text-secondary">
            Así te verá la mesa. Tus cartas solo aparecen en este teléfono.
          </p>
        </header>

        <div className="flex max-w-md flex-col gap-6 border-t border-line pt-8 lg:col-span-5 lg:col-start-8 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
          <div className="flex items-center gap-5">
            <Avatar seed={seed} size={96} className="rounded-[10px]!" />
            <button type="button" onClick={() => setSeed(randomSeed())} className="btn-quiet">
              <Shuffle className="h-4 w-4" aria-hidden />
              Otro avatar
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="lobby-name" className="eyebrow">
              Apodo
            </label>
            <input
              id="lobby-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu apodo"
              maxLength={20}
              autoFocus
              autoComplete="nickname"
              className="field h-14! text-lg!"
            />
          </div>

          <button
            type="submit"
            disabled={!name.trim() || submitting}
            aria-busy={submitting}
            className="btn-primary w-full"
          >
            Entrar a la mesa
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </form>
  );
}

function handLabel(hole: [Card, Card], community: Card[]): string | null {
  const all: Card[] = [...hole, ...community];
  return describeHand(all);
}

function PhoneGameView({
  code,
  uid,
  mySeat,
  room,
  hole,
}: {
  code: string;
  uid: string | null;
  mySeat: NonNullable<NonNullable<ReturnType<typeof useRoom>>["state"]>["seats"][number];
  room: NonNullable<ReturnType<typeof useRoom>>;
  hole?: [Card, Card];
}) {
  const router = useRouter();
  const winners = room.result?.winners ?? [];
  const isWinner = winners.includes(mySeat.id);
  const seats = room.state!.seats;
  const activeCount = seats.filter((s) => !s.folded).length;
  const revealing = !!room.result;
  const { cardBack, setCardBack } = useCardBack();
  const [folding, setFolding] = useState(false);
  const [showCardBackPicker, setShowCardBackPicker] = useState(false);
  const [peeking, setPeeking] = useState(false);

  const label = hole ? handLabel(hole, room.state!.community) : null;

  async function onFoldToggle() {
    if (folding) return;
    setFolding(true);
    try {
      await phoneSetSeatFlag(code, mySeat.id, "folded", !mySeat.folded);
    } catch {
      /* ignore */
    } finally {
      setFolding(false);
    }
  }

  async function onRevealCard(cardIndex: 0 | 1) {
    try {
      await phoneSetCardReveal(code, mySeat.id, cardIndex, !mySeat.revealedCards[cardIndex]);
    } catch {
      /* ignore */
    }
  }

  async function onLeave() {
    if (!uid) return;
    try {
      await leaveLobby(code, mySeat.id);
    } catch {
      /* ignore */
    }
    router.push("/");
  }

  return (
    <div className="w-full max-w-md mx-auto px-4 py-6 flex flex-col gap-5">
      <header className="flex items-center justify-between p-3 rounded-2xl glass elevate">
        <div className="flex items-center gap-2">
          <Avatar seed={mySeat.seed} size={36} />
          <div className="flex flex-col">
            <span className="text-sm text-zinc-100">{mySeat.name}</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Sala {code}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Calle
            </div>
            <div className="text-sm text-zinc-100">{room.state!.street}</div>
          </div>
          <button
            type="button"
            onClick={onLeave}
            className="p-2 rounded-full bg-white/5 hover:bg-rose-500/20 ring-1 ring-white/10 hover:ring-rose-400/30 text-zinc-400 hover:text-rose-300 transition"
            title="Salir de la sala"
            aria-label="Salir de la sala"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {room.result ? (
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-accent-300/10 ring-1 ring-accent-300/40 text-accent-100">
          <Crown className="w-4 h-4 text-accent-300" />
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

      {/* Hand strength label — PokerStars style */}
      {label && hole && !mySeat.folded && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-400 flex items-center justify-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-gradient-to-r from-accent-500/12 to-accent-700/8 ring-1 ring-accent-400/25 shadow-[0_0_20px_-4px_rgba(167,139,250,0.2)]">
            <span className="text-[11px] uppercase tracking-[0.25em] text-accent-400/60 font-bold">Tu mano</span>
            <span className="text-sm font-semibold text-accent-100">{label}</span>
          </div>
        </div>
      )}

      <section>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Tus cartas
          </span>
          <button
            type="button"
            onClick={() => setShowCardBackPicker((v) => !v)}
            className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-200 transition inline-flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3" />
            Dorso
          </button>
        </div>
        {showCardBackPicker ? (
          <div className="mt-2">
            <CardBackPicker value={cardBack} onChange={setCardBack} />
          </div>
        ) : null}
        <div className="mt-2 flex items-center gap-3 justify-center p-4 rounded-2xl glass">
          {hole ? (
            <>
              <PlayingCard
                card={hole[0]}
                faceUp={peeking || mySeat.revealedCards[0] || revealing}
                squeezable={!peeking && !mySeat.revealedCards[0] && !revealing}
                size="lg"
                dealIn={false}
                cardBack={cardBack}
              />
              <PlayingCard
                card={hole[1]}
                faceUp={peeking || mySeat.revealedCards[1] || revealing}
                squeezable={!peeking && !mySeat.revealedCards[1] && !revealing}
                size="lg"
                dealIn={false}
                cardBack={cardBack}
              />
            </>
          ) : (
            <div className="text-xs text-zinc-500 py-8">Sin cartas.</div>
          )}
        </div>

        <div className="mt-3 flex flex-col items-center gap-2">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setPeeking((v) => !v)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-zinc-100 text-sm transition btn-press"
            >
              {peeking ? (
                <>
                  <EyeOff className="w-4 h-4" /> Ocultar
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4" /> Ver mis cartas
                </>
              )}
            </button>
            {!room.result ? (
              <button
                type="button"
                onClick={onFoldToggle}
                disabled={folding}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ring-1 text-sm font-medium transition btn-press ${
                  mySeat.folded
                    ? "bg-white/5 ring-white/10 text-zinc-200 hover:bg-white/10"
                    : "bg-rose-500/90 ring-rose-400/40 text-rose-950 hover:bg-rose-400"
                } ${folding ? "opacity-60" : ""}`}
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
          <div className="flex items-center justify-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Mostrar en mesa:
            </span>
            <button
              type="button"
              onClick={() => onRevealCard(0)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ring-1 text-xs font-medium transition btn-press ${
                mySeat.revealedCards[0]
                  ? "bg-accent-500/15 ring-accent-400/40 text-accent-200"
                  : "bg-white/5 ring-white/10 text-zinc-300 hover:bg-white/10"
              }`}
            >
              Carta 1
            </button>
            <button
              type="button"
              onClick={() => onRevealCard(1)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ring-1 text-xs font-medium transition btn-press ${
                mySeat.revealedCards[1]
                  ? "bg-accent-500/15 ring-accent-400/40 text-accent-200"
                  : "bg-white/5 ring-white/10 text-zinc-300 hover:bg-white/10"
              }`}
            >
              Carta 2
            </button>
          </div>
        </div>
      </section>

      <section>
        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Comunitarias ({room.state!.community.length}/5)
        </span>
        <div className="mt-2 flex items-center gap-2 overflow-x-auto p-3 rounded-2xl glass">
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
                cardBack={cardBack}
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
                    ? "bg-accent-300/10 ring-accent-300/40"
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
                  <Crown className="w-4 h-4 text-accent-300" />
                ) : null}
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
