"use client";
import type { ReactNode } from "react";
import type { NormalSeat, BettingRound } from "@/lib/betting";
import type { Card } from "@/lib/poker";
import type { TableThemeId } from "@/lib/themes";
import { RoundPokerTable } from "@/components/table/RoundPokerTable";
import { ReactionLayer } from "@/components/reactions/ReactionLayer";
import type { Reaction } from "@/lib/reactions";

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
  onSit?: () => void;
  onToggleAway?: () => void;
  amSittingOut?: boolean;

  topLeft?: ReactNode;
  topCenter?: ReactNode;
  topRight?: ReactNode;
  bottomLeft?: ReactNode;
  bottomRight?: ReactNode;
  centerOverlay?: ReactNode;
  reactions?: Reaction[];
};

export function TableShell({
  seats,
  community,
  betting,
  winners,
  theme = "emerald",
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
  topLeft,
  topCenter,
  topRight,
  bottomLeft,
  bottomRight,
  centerOverlay,
  reactions,
}: Props) {
  return (
    <div className="fixed inset-0 bg-[#0b0b0b] flex flex-col overflow-hidden select-none">
      {/* Mesa */}
      <main className="relative flex-1 flex items-center justify-center p-2 sm:p-4">
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
        <div className="fixed bottom-4 left-4 z-[60] flex items-end gap-2">
          {bottomLeft}
        </div>
      )}
      {bottomRight && (
        <div className="fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2 max-w-[min(420px,92vw)]">
          {bottomRight}
        </div>
      )}
    </div>
  );
}
