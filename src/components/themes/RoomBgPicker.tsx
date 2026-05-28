"use client";
import { Check } from "lucide-react";
import { ROOM_BG_LIST, type RoomBgId } from "@/lib/themes";

type Props = {
  value: RoomBgId | string;
  onChange: (id: RoomBgId) => void;
};

export function RoomBgPicker({ value, onChange }: Props) {
  return (
    <ul className="grid grid-cols-7 gap-2">
      {ROOM_BG_LIST.map((bg) => {
        const selected = bg.id === value;
        return (
          <li key={bg.id}>
            <button
              type="button"
              onClick={() => onChange(bg.id)}
              className={`relative w-full aspect-square rounded-lg ring-1 transition ${
                selected ? "ring-emerald-400/70" : "ring-white/10 hover:ring-white/30"
              }`}
              style={{ background: bg.gradient }}
              title={bg.label}
              aria-label={bg.label}
            >
              {selected && (
                <div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 text-emerald-950 flex items-center justify-center">
                  <Check className="w-2 h-2" />
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
