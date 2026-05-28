"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, RotateCcw, Volume2, VolumeX, WifiOff, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { NormalSeat, BettingRound } from "@/lib/betting";
import { formatChips } from "@/lib/betting";
import { calculateEquity, getRemainingDeck } from "@/lib/equity";
import type { Card } from "@/lib/poker";
import { Avatar } from "@/components/players/Avatar";
import { PlayingCard } from "@/components/cards/PlayingCard";
import { getTableTheme, type TableThemeId } from "@/lib/themes";
import { fireConfetti } from "@/lib/confetti";
import { useSound } from "@/hooks/useSound";

interface RoundPokerTableProps {
  seats: NormalSeat[];
  community: Card[];
  betting: BettingRound;
  winners?: string[];
  theme?: TableThemeId;
  roomCode?: string;
  isTournament?: boolean;
  selfUid?: string | null;
  ownHole?: [Card, Card] | null;
  revealedHoles?: Record<string, [Card, Card]>;
  cardBack?: string;
  cardFace?: string;
  lastAction?: { seatId: string; action: string; amount?: number; ts: number };
  // New: per-seat timebank preference, keyed by uid. Defaults to true.
  timeBankByUid?: Record<string, boolean>;
  turnTimeMs?: number;
  // Optional callbacks for empty-seat Sit button and own-seat Away toggle.
  onSit?: () => void;
  onToggleAway?: () => void;
  amSittingOut?: boolean;
  presenceMap?: Record<string, boolean>;
}

const MAX_SEATS = 9;

// Seat timer with 3 color phases + separate timebank phase (fully red).
function SeatTimer({
  deadline,
  turnTime,
  timeBank,
  useBank,
}: {
  deadline: number;
  turnTime: number;
  timeBank: number;
  useBank: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    function tick() {
      setNow(Date.now());
      raf.current = requestAnimationFrame(tick);
    }
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);

  const remainingNormal = Math.max(0, deadline - now);
  const inBank = remainingNormal === 0 && useBank && timeBank > 0;
  const bankElapsed = inBank ? now - deadline : 0;
  const remainingBank = inBank ? Math.max(0, timeBank - bankElapsed) : timeBank;

  // Color phase based on percentage of NORMAL turn time remaining
  const normalPct = (remainingNormal / turnTime) * 100;
  let normalColor = "bg-emerald-400";
  if (normalPct < 25) normalColor = "bg-rose-400";
  else if (normalPct < 50) normalColor = "bg-amber-400";

  // Bank phase: always fully red bar, drains
  const bankPct = inBank && timeBank > 0 ? (remainingBank / timeBank) * 100 : 0;

  return (
    <div className="w-full h-1 bg-zinc-800 overflow-hidden">
      {inBank ? (
        <div className="h-full bg-rose-500" style={{ width: `${bankPct}%` }} />
      ) : (
        <div className={`h-full ${normalColor}`} style={{ width: `${normalPct}%` }} />
      )}
    </div>
  );
}

// Action label map for announcements
const ACTION_LABELS: Record<string, string> = {
  fold: "Fold",
  check: "Check",
  call: "Call",
  bet: "Bet",
  raise: "Raise",
  "all-in": "All-in",
};

// Community cards with proper deal-in animation (tracks new cards via prevLen)
function CommunityCards({ community, cardFace }: { community: Card[]; cardFace?: string }) {
  const prevLenRef = useRef(0);
  const prevLen = prevLenRef.current;
  useEffect(() => {
    prevLenRef.current = community.length;
  }, [community.length]);
  return (
    <div className="flex items-center gap-2">
      {community.map((c, i) => {
        const isNew = i >= prevLen;
        const dealDelay = isNew ? (i - prevLen) * 0.12 : 0;
        return (
          <div key={c.id + i}>
            <PlayingCard
              card={c}
              faceUp
              size="md"
              dealIn={isNew}
              dealDelay={dealDelay}
              flipDelay={isNew ? dealDelay : 0}
              cardFace={cardFace as never}
            />
          </div>
        );
      })}
      {Array.from({ length: 5 - community.length }).map((_, i) => (
        <div key={`empty-${i}`} className="opacity-10">
          <div className="w-12 h-[68px] sm:w-16 sm:h-[90px] rounded-lg border-2 border-dashed border-white/40" />
        </div>
      ))}
    </div>
  );
}

// Floating action toast on seat
function ActionToast({ action, amount }: { action: string; amount?: number }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  const label = ACTION_LABELS[action] ?? action;
  const isAggressive = action === "bet" || action === "raise" || action === "all-in";
  const isFold = action === "fold";
  return (
    <div className={`absolute -top-8 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl animate-in zoom-in fade-in duration-200 whitespace-nowrap ${
      isFold ? "bg-rose-500/90 text-white" :
      isAggressive ? "bg-amber-400 text-amber-950" :
      "bg-emerald-500 text-white"
    }`}>
      {label}{amount ? ` ${formatChips(amount)}` : ""}
    </div>
  );
}

// Transient chip that flies from a seat to the pot when chips move. Mount-only
// tween scoped to its own node; honors prefers-reduced-motion (skips straight to
// onDone so the element is removed without animating).
function FlyingChip({
  origin,
  onDone,
}: {
  origin: { x: number; y: number };
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: reduce)", () => {
        onDone();
      });
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.set(el, { xPercent: -50, yPercent: -50, left: `${origin.x}%`, top: `${origin.y}%` });
        gsap.to(el, {
          left: "50%",
          top: "50%",
          scale: 0.4,
          opacity: 0,
          duration: 0.7,
          ease: "power2.in",
          onComplete: onDone,
        });
      });
      return () => mm.revert();
    },
    { scope: ref, dependencies: [] },
  );
  return (
    <div
      ref={ref}
      className="absolute z-[45] pointer-events-none"
      style={{ left: `${origin.x}%`, top: `${origin.y}%` }}
    >
      <div className="w-5 h-5 rounded-full border-2 border-white/40 bg-amber-400 shadow-lg" />
    </div>
  );
}

export function RoundPokerTable({
  seats,
  community,
  betting,
  winners = [],
  theme = "emerald",
  roomCode,
  isTournament = false,
  selfUid,
  ownHole,
  revealedHoles,
  cardBack,
  cardFace,
  lastAction,
  timeBankByUid,
  turnTimeMs,
  onSit,
  onToggleAway,
  amSittingOut,
  presenceMap,
}: RoundPokerTableProps) {
  const [showQR, setShowQR] = useState(false);
  const [rotationOffset, setRotationOffset] = useState(0);
  // Track last action per seat for toasts
  const [seatToasts, setSeatToasts] = useState<Record<string, { action: string; amount?: number; key: number }>>({});
  const [equities, setEquities] = useState<Record<string, number>>({});
  const { muted, toggleMute, play } = useSound();
  const [flyingChips, setFlyingChips] = useState<{ id: number; x: number; y: number }[]>([]);
  const t = getTableTheme(theme);

  // Compute equities if multiple holes are revealed
  useEffect(() => {
    setTimeout(() => {
      if (!revealedHoles) {
        setEquities({});
        return;
      }
      const holes = Object.entries(revealedHoles).map(([id, cards]) => ({ id, cards }));
      if (holes.length < 2) {
        setEquities({});
        return;
      }
      
      const knownCards = [...community, ...holes.flatMap((h) => h.cards)];
      const deck = getRemainingDeck(knownCards);
      const result = calculateEquity(holes, community, deck, 1500); 
      
      const newEquities: Record<string, number> = {};
      result.forEach((r) => {
        newEquities[r.seatId] = r.equity;
      });
      setEquities(newEquities);
    }, 0);
  }, [community, revealedHoles]);

  const joinUrl =
    typeof window !== "undefined" && roomCode
      ? `${window.location.origin}/play/${isTournament ? "torneo" : "normal"}/${roomCode}`
      : "";

  // 9 positions evenly distributed around an ellipse, starting at bottom-center.
  // Empty slots render a "Sit" placeholder so the table looks balanced regardless of player count.
  const positions = useMemo(() => {
    const rx = 42; // horizontal radius (% of container width)
    const ry = 35; // vertical radius (% of container height)
    return Array.from({ length: MAX_SEATS }, (_, i) => {
      const angle = (i / MAX_SEATS) * Math.PI * 2 + Math.PI / 2; // start bottom
      return {
        x: 50 + Math.cos(angle) * rx,
        y: 50 + Math.sin(angle) * ry,
      };
    });
  }, []);

  // Distribute N players evenly around the 9 slots, then rotate so self lands at slot 0.
  // This is the key fix: previously with N=2 the seats clustered at slots 0+1 (both at bottom).
  const slots = useMemo(() => {
    const out: (NormalSeat | null)[] = Array(MAX_SEATS).fill(null);
    const n = seats.length;
    if (n === 0) return out;

    // Base slot for seats[i]: spread evenly across MAX_SEATS positions.
    const baseSlots = seats.map((_, i) => Math.round((i * MAX_SEATS) / n) % MAX_SEATS);

    // Find self's base slot so we can shift everyone so self lands at slot 0.
    const myIdx = selfUid ? seats.findIndex((s) => s.id === selfUid) : -1;
    const baseShift = (myIdx >= 0 ? baseSlots[myIdx] : -rotationOffset) % MAX_SEATS;

    for (let i = 0; i < n; i++) {
      const slotIdx = (((baseSlots[i] - baseShift) % MAX_SEATS) + MAX_SEATS) % MAX_SEATS;
      // Guard against rare collisions when round() lands two on the same slot.
      if (out[slotIdx] === null) out[slotIdx] = seats[i];
      else {
        // Fallback: next available slot
        for (let off = 1; off < MAX_SEATS; off++) {
          const alt = (slotIdx + off) % MAX_SEATS;
          if (out[alt] === null) { out[alt] = seats[i]; break; }
        }
      }
    }
    return out;
  }, [seats, selfUid, rotationOffset]);

  function rotateSelfToCenter() {
    // Manual rotation cycles through the seat array (useful when no selfUid yet).
    setRotationOffset((v) => (v + 1) % MAX_SEATS);
  }

  const selfInSeats = !!(selfUid && seats.some((s) => s.id === selfUid));

  // React to a new lastAction: show the seat toast, play a cue, and fly a chip
  // from the actor's seat to the pot on chip-moving actions. Guarded by ts so it
  // fires exactly once per action (slots/positions changing won't re-trigger).
  const prevActionRef = useRef<typeof lastAction>(undefined);
  useEffect(() => {
    if (!lastAction) return;
    if (prevActionRef.current?.ts === lastAction.ts) return;
    prevActionRef.current = lastAction;
    setSeatToasts((prev) => ({
      ...prev,
      [lastAction.seatId]: { action: lastAction.action, amount: lastAction.amount, key: lastAction.ts },
    }));
    const a = lastAction.action;
    if (a === "bet" || a === "call" || a === "raise" || a === "all-in") {
      play(a === "all-in" ? "allIn" : "chip");
      const slotIdx = slots.findIndex((s) => s?.id === lastAction.seatId);
      const pos = slotIdx >= 0 ? positions[slotIdx] : null;
      if (pos) {
        setFlyingChips((prev) => [...prev, { id: lastAction.ts, x: pos.x, y: pos.y }]);
      }
    }
  }, [lastAction, slots, positions, play]);

  // Fire confetti + winner chime once when winners transition from none to set.
  const prevWinnersRef = useRef("");
  useEffect(() => {
    const key = winners.join(",");
    if (key && key !== prevWinnersRef.current) {
      fireConfetti();
      play("winner");
    }
    prevWinnersRef.current = key;
  }, [winners, play]);

  return (
    <div className="relative w-full max-w-[1400px] aspect-[16/8] mx-auto select-none">
      {/* Table Surface — inset slightly so seats at edges don't clip */}
      <div
        className="absolute inset-x-[8%] inset-y-[16%] rounded-[180px] overflow-hidden"
        style={{
          background: t.feltGradient,
          boxShadow: `inset 0 0 100px rgba(0,0,0,0.55), 0 30px 80px -20px rgba(0,0,0,0.7), 0 0 0 10px #27272a, 0 0 0 12px #3f3f46`,
        }}
      >
        {/* Subtle dot texture */}
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

        {/* Central Area */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          {/* Pot */}
          <div className="flex flex-col items-center gap-1">
            <div className="px-5 py-1.5 rounded-xl bg-black/55 backdrop-blur-md ring-1 ring-white/10 flex flex-col items-center">
              <span className="text-[9px] uppercase tracking-[0.4em] text-zinc-500 font-bold">Total Pot</span>
              <span className="text-xl font-bold text-white tabular-nums">{formatChips(betting.pot)}</span>
            </div>
            {betting.sidePots.length > 1 && (
              <div className="flex gap-1.5 flex-wrap justify-center">
                {betting.sidePots.map((sp, i) => (
                  <div key={i} className="px-2 py-0.5 rounded bg-black/40 text-[9px] text-zinc-400 ring-1 ring-white/5 tabular-nums">
                    Side {i + 1}: {formatChips(sp.amount)}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Community Cards */}
          <CommunityCards community={community} cardFace={cardFace} />
          {/* dealer button etc rendered below */}
        </div>
      </div>

      {/* Seats — render MAX_SEATS slots; empty ones show a Sit placeholder. */}
      {slots.map((seat, i) => {
        const pos = positions[i];

        // Empty slot
        if (!seat) {
          const canSit = !!onSit && !selfInSeats;
          return (
            <div
              key={`empty-${i}`}
              className="absolute z-10 pointer-events-none"
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%, -50%)" }}
            >
              {canSit ? (
                <button
                  type="button"
                  onClick={onSit}
                  className="pointer-events-auto group flex flex-col items-center gap-1.5 cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-full bg-zinc-900/60 ring-2 ring-dashed ring-white/15 group-hover:ring-emerald-400/60 group-hover:bg-emerald-500/10 backdrop-blur-sm transition flex items-center justify-center">
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 group-hover:text-emerald-300">
                      Sit
                    </span>
                  </div>
                </button>
              ) : (
                <div className="w-12 h-12 rounded-full bg-zinc-900/40 ring-1 ring-white/5 backdrop-blur-sm opacity-50" />
              )}
            </div>
          );
        }

        const isToAct = betting.toActId === seat.id;
        const isWinner = winners.includes(seat.id);
        // Dealer button: map slot index back to original seat index for dealerIdx
        const originalIdx = seats.findIndex((s) => s.id === seat.id);
        const isDealer = betting.dealerIdx === originalIdx;
        const isSelf = !!selfUid && seat.id === selfUid;
        const useBank = timeBankByUid ? timeBankByUid[seat.id] !== false : true;

        // Bet chip position — towards center, nudged tangentially so it never
        // sits directly under the hole cards (which are centered on the seat).
        // Without the tangential push the bottom-center self seat had cards and
        // chips stacked on the same x, causing the overlap.
        const dx_center = 50 - pos.x;
        const dy_center = 50 - pos.y;
        const dist = Math.sqrt(dx_center * dx_center + dy_center * dy_center) || 1;
        const betDist = 13;
        const betTangential = 9;
        const bx = pos.x + (dx_center / dist) * betDist + (dy_center / dist) * betTangential;
        const by = pos.y + (dy_center / dist) * (betDist * 0.75) - (dx_center / dist) * betTangential;

        // Dealer button position — moved more tangentially so it doesn't overlap cards
        const dDist = 10;
        const tangential = 7;
        const dbx = pos.x + (dx_center / dist) * dDist + (dy_center / dist) * tangential;
        const dby = pos.y + (dy_center / dist) * dDist - (dx_center / dist) * tangential;

        const isDealt =
          (seat.status === "active" || seat.status === "all-in" || seat.status === "folded") &&
          betting.handNum > 0;
        const showFaceUp =
          isDealt &&
          ((isSelf && ownHole) || (seat.revealed && revealedHoles && revealedHoles[seat.id]));
        const faceUpCards: [Card, Card] | null = showFaceUp
          ? isSelf && ownHole
            ? ownHole
            : revealedHoles
              ? revealedHoles[seat.id] ?? null
              : null
          : null;

        const toast = seatToasts[seat.id];

        // Hole card placement depends on the seat's zone so cards never clip the
        // top edge nor collide with the seat's own chips/avatar:
        // - Top seats (small pos.y): cards drop BELOW the panel, toward center.
        // - Everyone else: cards float ABOVE the avatar (classic look).
        const cardsBelow = pos.y < 45;
        const cardTransform = cardsBelow
          ? "translate(-50%, 60px)"
          : "translate(-50%, calc(-100% - 54px))";

        return (
          <React.Fragment key={seat.id}>
            {/* Hole cards — rendered outside overflow:hidden, z-40 */}
            {isDealt && (
              <div
                className={`absolute flex gap-0.5 z-40 pointer-events-none ${seat.status === "folded" ? "opacity-30 grayscale" : ""}`}
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  transform: cardTransform,
                }}
              >
                {/* Equity Tag */}
                {equities[seat.id] !== undefined && (
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded text-xs font-bold text-emerald-400 ring-1 ring-emerald-500/30 whitespace-nowrap">
                    {equities[seat.id]}%
                  </div>
                )}
                
                {faceUpCards ? (
                  faceUpCards.map((c, ci) => (
                    <div key={c.id + ci} style={{ transform: `rotate(${ci === 0 ? -5 : 5}deg)` }}>
                      <PlayingCard card={c} faceUp size="sm" cardBack={cardBack as never} cardFace={cardFace as never} />
                    </div>
                  ))
                ) : (
                  [0, 1].map((ci) => (
                    <div key={ci} style={{ transform: `rotate(${ci === 0 ? -5 : 5}deg)` }}>
                      <PlayingCard
                        card={{ id: `back-${seat.id}-${ci}`, rank: "A", suit: "S" } as Card}
                        faceUp={false}
                        size="sm"
                        cardBack={cardBack as never} cardFace={cardFace as never}
                      />
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Action Toast — globally positioned so z-index works over cards */}
            {toast && (
              <div
                className="absolute z-50 pointer-events-none"
                style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%, -50%)" }}
              >
                <ActionToast key={toast.key} action={toast.action} amount={toast.action !== "fold" && toast.action !== "check" ? toast.amount : undefined} />
              </div>
            )}

            {/* Seat Box — horizontal: avatar left, name/chips card right */}
            <div
              className={`absolute flex flex-row items-center gap-1 transition-all duration-300 ${isToAct ? "z-30" : "z-20"}`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%, -50%)" }}
            >
              {/* Avatar — inline, left of card */}
              <div className={`relative flex-shrink-0 rounded-full ring-2 transition-all ${
                isToAct
                  ? "ring-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.5)]"
                  : isWinner
                    ? "ring-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.5)]"
                    : "ring-zinc-700"
              } ${seat.status === "folded" ? "opacity-40 grayscale" : ""} ${seat.status === "sitting-out" ? "opacity-50 grayscale" : ""}`}>
                <div className="rounded-full overflow-hidden bg-zinc-900">
                  <Avatar seed={seat.seed} size={32} />
                </div>
                {presenceMap && presenceMap[seat.id] === false && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-rose-600 ring-2 ring-zinc-950 flex items-center justify-center z-20"
                    title="Desconectado"
                  >
                    <WifiOff className="w-2 h-2 text-white" />
                  </span>
                )}
              </div>

              {/* Away toggle — right edge of whole seat */}
              {isSelf && onToggleAway && (
                <button
                  type="button"
                  onClick={onToggleAway}
                  className={`absolute -right-7 sm:-right-8 top-1/2 -translate-y-1/2 z-20 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest transition btn-press ${
                    amSittingOut
                      ? "bg-rose-500/80 text-white hover:bg-rose-400"
                      : "bg-white/5 text-zinc-400 hover:bg-white/15 hover:text-zinc-100 ring-1 ring-white/10"
                  }`}
                  title={amSittingOut ? "Volver a jugar" : "Ausentarme"}
                >
                  {amSittingOut ? "Back" : "Away"}
                </button>
              )}

              <div className={`relative min-w-[80px] sm:min-w-[96px] rounded-lg overflow-hidden transition-all duration-300 border-2 ${
                isToAct
                  ? "border-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.4)]"
                  : isWinner
                    ? "border-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.4)]"
                    : "border-zinc-700 shadow-xl"
              }`}>
                <div className={`flex flex-col bg-zinc-900/95 backdrop-blur-md ${seat.status === "folded" ? "opacity-40 grayscale" : ""}`}>
                  {/* Name */}
                  <div className={`px-2 pt-1.5 pb-1 border-b border-white/5 text-center ${isToAct ? "bg-emerald-500/10" : ""}`}>
                    <span className="text-[11px] font-bold text-zinc-100 truncate block">{seat.name}</span>
                  </div>
                  {/* Chips */}
                  <div className="px-2 py-1.5 text-center bg-black/40 flex items-center justify-center gap-1">
                    {seat.status === "all-in" && (
                      <span className="text-[8px] font-black uppercase text-amber-400 tracking-widest">AI</span>
                    )}
                    <span className="text-[10px] sm:text-[11px] text-white font-mono font-black tabular-nums">
                      {formatChips(seat.chips)}
                    </span>
                  </div>
                  {/* Timer bar — only when it's this seat's turn AND deadline exists */}
                  {isToAct && seat.turnDeadline ? (
                    <SeatTimer
                      deadline={seat.turnDeadline}
                      turnTime={turnTimeMs ?? 30000}
                      timeBank={seat.timeBank ?? 0}
                      useBank={useBank}
                    />
                  ) : isToAct ? (
                    <div className="w-full h-1 bg-zinc-800">
                      <div className="h-full bg-emerald-400 w-full" />
                    </div>
                  ) : null}
                </div>

                {/* Fold overlay */}
                {seat.status === "folded" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Fold</span>
                  </div>
                )}
                {/* Away overlay */}
                {seat.status === "sitting-out" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Away</span>
                  </div>
                )}
              </div>

              {/* Winner crown — over the avatar (left side of seat) */}
              {isWinner && (
                <div className="absolute -top-3 left-0 -translate-x-1/4 animate-bounce z-30">
                  <div className="bg-amber-400 text-amber-950 p-1 rounded-full shadow-lg">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  </div>
                </div>
              )}
            </div>

            {/* Bet chips on felt — PokerStars style stack */}
            {seat.bet > 0 && (
              <div
                className="absolute z-10 animate-in zoom-in fade-in duration-200"
                style={{ left: `${bx}%`, top: `${by}%`, transform: "translate(-50%, -50%)" }}
              >
                {/* Stacked chip visual */}
                <div className="relative flex flex-col items-center">
                  {/* Stack of 3 chips */}
                  {[2, 1, 0].map((offset) => (
                    <div
                      key={offset}
                      className="absolute w-6 h-6 rounded-full border-2 border-white/30 shadow-inner"
                      style={{
                        bottom: `${offset * 2}px`,
                        background: seat.bet > 200 ? "#f59e0b" : seat.bet > 50 ? "#6366f1" : "#10b981",
                        opacity: offset === 0 ? 1 : 0.6 + offset * 0.1,
                      }}
                    />
                  ))}
                  {/* Amount label */}
                  <div className="relative mt-7 px-2 py-0.5 rounded-full bg-black/70 ring-1 ring-white/15 shadow-xl">
                    <span className="text-[10px] font-black text-white tabular-nums leading-none">
                      {formatChips(seat.bet)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Dealer Button — z-50 */}
            {isDealer && (
              <div
                className="absolute z-50 animate-in fade-in duration-500"
                style={{ left: `${dbx}%`, top: `${dby}%`, transform: "translate(-50%, -50%)" }}
              >
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white shadow-lg ring-2 ring-zinc-400 flex items-center justify-center">
                  <span className="text-[11px] font-black text-black leading-none">D</span>
                </div>
              </div>
            )}
          </React.Fragment>
        );
      })}

      {/* Mute toggle */}
      <button
        onClick={toggleMute}
        className="absolute top-1 right-9 p-1.5 rounded-lg glass hover:bg-white/10 transition text-zinc-500 hover:text-white z-50"
        title={muted ? "Activar sonido" : "Silenciar"}
      >
        {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
      </button>

      {/* QR Button */}
      {roomCode && (
        <button
          onClick={() => setShowQR(true)}
          className="absolute top-1 right-1 p-1.5 rounded-lg glass hover:bg-white/10 transition text-zinc-500 hover:text-white z-50"
          title="Invitar"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Rotate-to-center */}
      {selfUid && seats.length > 0 && (
        <button
          onClick={rotateSelfToCenter}
          className="absolute top-1 left-1 p-1.5 rounded-lg glass hover:bg-white/10 transition text-zinc-500 hover:text-white z-50"
          title="Centrarme"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}

      {/* QR Modal */}
      {showQR && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-zinc-900 rounded-3xl p-8 ring-1 ring-white/10 relative max-w-sm w-full shadow-2xl">
            <button
              onClick={() => setShowQR(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/5 text-zinc-500 hover:text-white transition"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="flex flex-col items-center gap-6">
              <div className="text-center">
                <h3 className="text-xl font-bold text-zinc-100">Invitación a la mesa</h3>
                <p className="text-sm text-zinc-400 mt-1">Escanea para unirte a jugar</p>
              </div>
              <div className="p-4 bg-white rounded-2xl">
                <QRCodeSVG value={joinUrl} size={220} />
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-xs uppercase tracking-[0.3em] text-zinc-500 font-bold">Código de sala</span>
                <span className="text-4xl font-mono font-black text-emerald-400 tracking-[0.2em]">{roomCode}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Flying chips overlay — chips tween from a seat to the pot on chip moves. */}
      {flyingChips.map((c) => (
        <FlyingChip
          key={c.id}
          origin={{ x: c.x, y: c.y }}
          onDone={() => setFlyingChips((prev) => prev.filter((f) => f.id !== c.id))}
        />
      ))}
    </div>
  );
}
