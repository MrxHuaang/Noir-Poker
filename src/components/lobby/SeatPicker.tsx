"use client";
// Shows a mini oval table with 9 seat positions. Players tap a free slot to
// reserve it before the hand starts. Uses the same ellipse formula as
// RoundPokerTable so visual positions match what appears on the big screen.
import { Avatar } from "@/components/players/Avatar";

const MAX_SEATS = 9;
const RX = 40; // horizontal radius (% of mini-table width)
const RY = 36; // vertical radius (% of mini-table height)

function slotPosition(i: number) {
  const angle = (i / MAX_SEATS) * Math.PI * 2 + Math.PI / 2;
  return {
    x: 50 + Math.cos(angle) * RX,
    y: 50 + Math.sin(angle) * RY,
  };
}

type SlotOccupant = { uid: string; name: string; seed: string };

type Props = {
  myUid: string;
  myPreferredSlot?: number;
  occupants: Record<number, SlotOccupant>; // slot → occupant
  onPick: (slot: number) => void;
};

export function SeatPicker({ myUid, myPreferredSlot, occupants, onPick }: Props) {
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">
        Elige tu asiento
      </span>

      {/* Mini table */}
      <div className="relative w-64 aspect-[16/9]">
        {/* Felt oval */}
        <div
          className="absolute inset-x-[6%] inset-y-[12%] rounded-[999px] opacity-60"
          style={{
            background: "radial-gradient(ellipse at center, #0f3d2e 0%, #0a2a20 60%, #06140f 100%)",
            boxShadow: "0 0 0 4px #27272a, 0 0 0 5px #3f3f46",
          }}
        />

        {/* Seat positions */}
        {Array.from({ length: MAX_SEATS }, (_, i) => {
          const pos = slotPosition(i);
          const occupant = occupants[i];
          const isMine = myPreferredSlot === i;
          const isFree = !occupant;

          return (
            <button
              key={i}
              type="button"
              disabled={!isFree && !isMine}
              onClick={() => onPick(i)}
              className="absolute flex flex-col items-center gap-0.5 -translate-x-1/2 -translate-y-1/2 transition"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              {occupant ? (
                // Occupied slot — show avatar + name
                <div className={`flex flex-col items-center gap-0.5 ${isMine ? "opacity-100" : "opacity-70"}`}>
                  <div className={`w-7 h-7 rounded-full overflow-hidden ring-2 ${isMine ? "ring-amber-400" : "ring-zinc-600"}`}>
                    <Avatar seed={occupant.seed} size={28} className="ring-0 rounded-none" />
                  </div>
                  <span className="text-[8px] text-zinc-400 font-bold max-w-[40px] truncate leading-none">
                    {isMine ? "Tú" : occupant.name}
                  </span>
                </div>
              ) : (
                // Free slot
                <div className={`w-7 h-7 rounded-full flex items-center justify-center ring-2 transition ${
                  isMine
                    ? "bg-amber-500/12 ring-amber-400 shadow-[0_0_10px_rgba(180,130,40,0.35)]"
                    : "bg-zinc-900/70 ring-dashed ring-white/20 hover:ring-amber-400/50 hover:bg-amber-500/8"
                }`}>
                  <span className="text-[8px] font-black uppercase text-zinc-500">
                    {isMine ? "✓" : i + 1}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {myPreferredSlot !== undefined ? (
        <p className="text-[11px] text-amber-400">
          Asiento {myPreferredSlot + 1} reservado · toca otro para cambiar
        </p>
      ) : (
        <p className="text-[11px] text-zinc-500">
          Toca un asiento libre para reservarlo
        </p>
      )}
    </div>
  );
}
