"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, RotateCcw, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { NormalSeat, BettingRound } from "@/lib/betting";
import { formatChips } from "@/lib/betting";
import { calculateEquity, getRemainingDeck } from "@/lib/equity";
import type { Card } from "@/lib/poker";
import { Avatar } from "@/components/players/Avatar";
import { PlayingCard } from "@/components/cards/PlayingCard";
import { getTableTheme, type TableThemeId } from "@/lib/themes";

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
}

// A simple countdown progress bar for on-seat timer
function SeatTimer({ deadline, turnTime }: { deadline: number; turnTime?: number }) {
  const [pct, setPct] = useState(100);
  const raf = useRef<number | undefined>(undefined);
  const total = turnTime ?? 30_000;

  useEffect(() => {
    function tick() {
      const remaining = Math.max(0, deadline - Date.now());
      setPct((remaining / total) * 100);
      if (remaining > 0) raf.current = requestAnimationFrame(tick);
    }
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [deadline, total]);

  const urgent = pct < 25;
  return (
    <div className="w-full h-1 bg-zinc-800 overflow-hidden">
      <div
        className={`h-full transition-none ${urgent ? "bg-rose-400" : "bg-emerald-400"}`}
        style={{ width: `${pct}%` }}
      />
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
}: RoundPokerTableProps) {
  const [showQR, setShowQR] = useState(false);
  const [rotationOffset, setRotationOffset] = useState(0);
  // Track last action per seat for toasts
  const [seatToasts, setSeatToasts] = useState<Record<string, { action: string; amount?: number; key: number }>>({});
  const [equities, setEquities] = useState<Record<string, number>>({});
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

  // Show action toast when lastAction changes
  const prevActionRef = useRef<typeof lastAction>(undefined);
  useEffect(() => {
    if (!lastAction) return;
    if (prevActionRef.current?.ts === lastAction.ts) return;
    prevActionRef.current = lastAction;
    setSeatToasts(prev => ({
      ...prev,
      [lastAction.seatId]: { action: lastAction.action, amount: lastAction.amount, key: lastAction.ts },
    }));
  }, [lastAction]);

  const joinUrl =
    typeof window !== "undefined" && roomCode
      ? `${window.location.origin}/play/${isTournament ? "torneo" : "normal"}/${roomCode}`
      : "";

  // 10 positions — adjusted to stay within viewport (y max 88%)
  const positions = useMemo(() => [
    { x: 50, y: 88 },  // 0: Bottom center
    { x: 20, y: 80 },  // 1: Bottom left
    { x: 7,  y: 60 },  // 2: Middle left bottom
    { x: 7,  y: 38 },  // 3: Middle left top
    { x: 20, y: 15 },  // 4: Top left
    { x: 50, y: 8  },  // 5: Top center
    { x: 80, y: 15 },  // 6: Top right
    { x: 93, y: 38 },  // 7: Middle right top
    { x: 93, y: 60 },  // 8: Middle right bottom
    { x: 80, y: 80 },  // 9: Bottom right
  ], []);

  function rotateSelfToCenter() {
    if (!selfUid) return;
    const idx = seats.findIndex((s) => s.id === selfUid);
    if (idx < 0) return;
    setRotationOffset((10 - idx) % seats.length);
  }

  const rotatedSeats = useMemo(() => {
    if (rotationOffset === 0) return seats;
    const n = seats.length;
    return seats.map((_, i) => seats[(i - rotationOffset + n) % n]);
  }, [seats, rotationOffset]);

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

      {/* Seats */}
      {rotatedSeats.map((seat, i) => {
        const pos = positions[i] || positions[0];
        const isToAct = betting.toActId === seat.id;
        const isWinner = winners.includes(seat.id);
        // Dealer button: map seat index back to original for dealerIdx
        const originalIdx = rotationOffset === 0 ? i : (i + rotationOffset) % seats.length;
        const isDealer = betting.dealerIdx === originalIdx;
        const isSelf = !!selfUid && seat.id === selfUid;

        // Bet chip position — towards center
        const dx_center = 50 - pos.x;
        const dy_center = 50 - pos.y;
        const dist = Math.sqrt(dx_center * dx_center + dy_center * dy_center) || 1;
        const betDist = 13;
        const bx = pos.x + (dx_center / dist) * betDist;
        const by = pos.y + (dy_center / dist) * (betDist * 0.75);

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

        return (
          <React.Fragment key={seat.id}>
            {/* Hole cards — rendered outside overflow:hidden, z-40 */}
            {isDealt && (
              <div
                className={`absolute flex gap-0.5 z-40 pointer-events-none ${seat.status === "folded" ? "opacity-30 grayscale" : ""}`}
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  transform: "translate(-50%, calc(-100% - 54px))",
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

            {/* Seat Box */}
            <div
              className={`absolute flex flex-col items-center transition-all duration-300 ${isToAct ? "z-30" : "z-20"}`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%, -50%)" }}
            >
              {/* Avatar */}
              <div className={`absolute -top-7 left-1/2 -translate-x-1/2 z-10 rounded-full ring-2 transition-all ${
                isToAct
                  ? "ring-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.5)]"
                  : isWinner
                    ? "ring-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.5)]"
                    : "ring-zinc-700"
              } ${seat.status === "folded" ? "opacity-40 grayscale" : ""}`}>
                <div className="rounded-full overflow-hidden bg-zinc-900">
                  <Avatar seed={seat.seed} size={40} />
                </div>
              </div>

              <div className={`relative min-w-[96px] sm:min-w-[112px] rounded-lg overflow-hidden transition-all duration-300 border-2 mt-3 ${
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
                    <SeatTimer deadline={seat.turnDeadline} />
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

              {/* Winner crown */}
              {isWinner && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 animate-bounce">
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
    </div>
  );
}
