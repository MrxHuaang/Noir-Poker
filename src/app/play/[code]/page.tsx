"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Crown, Eye, EyeOff, Flame, LogOut, RotateCcw, Shuffle, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useHole, useRoom, useLobby } from "@/hooks/useRoom";
import { useCardBack } from "@/hooks/useCardBack";
import { joinLobby, leaveLobby, phoneSetSeatFlag, phoneSetCardReveal } from "@/lib/rooms";
import { randomSeed } from "@/lib/dicebear";
import { Avatar } from "@/components/players/Avatar";
import { PlayingCard } from "@/components/cards/PlayingCard";
import { CardBackPicker } from "@/components/themes/CardBackPicker";
import { BorderGlow } from "@/components/ui/BorderGlow";
import { ACCENT_GLOW_COLORS, ACCENT_GLOW_HSL } from "@/lib/brand";
import { describeHand } from "@/lib/handLabel";
import type { Card } from "@/lib/poker";

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
      <div className="w-full max-w-md mx-auto px-4 py-10 text-center text-zinc-500 text-sm">
        Conectando…
      </div>
    );
  }
  if (room === null) {
    return (
      <div className="w-full max-w-md mx-auto px-4 py-10 text-center flex flex-col items-center gap-4">
        <p className="text-zinc-300">Sala no encontrada.</p>
        <p className="text-xs text-zinc-500">Código: {code}</p>
        <a
          href="/join"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-zinc-200 text-sm transition"
        >
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

      <BorderGlow
        className="w-full lg-blur"
        edgeSensitivity={26}
        glowColor={ACCENT_GLOW_HSL}
        backgroundColor="var(--lg-bg)"
        borderRadius={20}
        glowRadius={30}
        glowIntensity={1}
        coneSpread={24}
        animated={false}
        colors={ACCENT_GLOW_COLORS}
        fillOpacity={0.45}
      >
        <div className="flex flex-col gap-6 p-5">
          <div className="flex flex-col items-center gap-3">
            <Avatar seed={seed} size={120} />
            <button
              type="button"
              onClick={() => setSeed(randomSeed())}
              className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-xs text-zinc-200 ring-1 ring-white/10 transition hover:bg-white/10 btn-press"
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
            className="rounded-2xl bg-black/40 px-5 py-4 text-center text-lg text-zinc-100 outline-none ring-1 ring-white/10 focus:ring-accent-500/40"
          />

          <button
            type="submit"
            disabled={!name.trim() || submitting}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-accent-700/70 px-5 py-3 font-medium text-accent-100 transition hover:bg-accent-600/75 disabled:cursor-not-allowed disabled:opacity-30 btn-press"
          >
            Entrar a la mesa
          </button>
        </div>
      </BorderGlow>
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
                size="lg"
                dealIn={false}
                cardBack={cardBack}
              />
              <PlayingCard
                card={hole[1]}
                faceUp={peeking || mySeat.revealedCards[1] || revealing}
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
