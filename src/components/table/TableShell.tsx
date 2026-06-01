"use client";
import type { ReactNode } from "react";
import type { NormalSeat, BettingRound } from "@/lib/betting";
import type { Card } from "@/lib/poker";
import type { TableThemeId } from "@/lib/themes";
import { RoundPokerTable } from "@/components/table/RoundPokerTable";
import { ReactionLayer } from "@/components/reactions/ReactionLayer";
import type { Reaction } from "@/lib/reactions";
import { getRoomBg } from "@/lib/themes";

type Props = {
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
  timeBankByUid?: Record<string, boolean>;
  turnTimeMs?: number;
  onSit?: (slotIndex: number) => void;
  onToggleAway?: () => void;
  amSittingOut?: boolean;
  presenceMap?: Record<string, boolean>;

  topLeft?: ReactNode;
  topCenter?: ReactNode;
  topRight?: ReactNode;
  bottomLeft?: ReactNode;
  bottomRight?: ReactNode;
  centerOverlay?: ReactNode;
  reactions?: Reaction[];
  roomBg?: string;
  isSpectator?: boolean;
};

export function TableShell({
  seats,
  community,
  betting,
  winners,
  theme = "noir",
  roomCode,
  isTournament,
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
  topLeft,
  topCenter,
  topRight,
  bottomLeft,
  bottomRight,
  centerOverlay,
  reactions,
  roomBg,
  isSpectator,
}: Props) {
  const bg = getRoomBg(roomBg);
  const hasTopChrome = Boolean(topLeft || topCenter || topRight || isSpectator);
  const hasBottomChrome = Boolean(bottomLeft || bottomRight);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden select-none" style={{ background: bg.gradient }}>
      {isSpectator && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] px-3 py-1.5 rounded-full bg-white/[0.08] ring-1 ring-white/15 backdrop-blur-md text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-300 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse" />
          Modo espectador
        </div>
      )}
      {/* Mesa */}
      <main
        className={`relative flex-1 flex items-center justify-center p-2 sm:p-4 ${
          hasTopChrome ? "pt-[calc(env(safe-area-inset-top)+3.75rem)] sm:pt-4" : ""
        } ${
          hasBottomChrome ? "pb-[calc(env(safe-area-inset-bottom)+9rem)] sm:pb-4" : ""
        }`}
      >
        <div className="w-full h-full max-h-[88vh] flex items-center justify-center">
          <RoundPokerTable
            seats={seats}
            community={community}
            betting={betting}
            winners={winners}
            theme={theme}
            roomCode={roomCode}
            isTournament={isTournament}
            selfUid={selfUid}
            ownHole={ownHole}
            revealedHoles={revealedHoles}
            cardBack={cardBack}
            cardFace={cardFace}
            lastAction={lastAction}
            timeBankByUid={timeBankByUid}
            turnTimeMs={turnTimeMs}
            onSit={onSit}
            onToggleAway={onToggleAway}
            amSittingOut={amSittingOut}
            presenceMap={presenceMap}
          />
        </div>

        {reactions && reactions.length > 0 && <ReactionLayer reactions={reactions} />}

        {centerOverlay && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto">{centerOverlay}</div>
          </div>
        )}
      </main>

      {topLeft && (
        <div className="fixed top-4 left-4 z-[60] flex items-start gap-2">
          {topLeft}
        </div>
      )}
      {topCenter && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60]">
          {topCenter}
        </div>
      )}
      {topRight && (
        <div className="fixed top-4 right-4 z-[60] flex items-start gap-2">
          {topRight}
        </div>
      )}
      {bottomLeft && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-3 z-[60] flex max-w-[calc(100vw-1.5rem)] flex-wrap items-end gap-2 sm:bottom-4 sm:left-4">
          {bottomLeft}
        </div>
      )}
      {bottomRight && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-3 z-[60] flex max-w-[min(420px,92vw)] flex-col items-end gap-2 sm:bottom-4 sm:right-4">
          {bottomRight}
        </div>
      )}
    </div>
  );
}
