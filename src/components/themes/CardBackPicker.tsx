"use client";
import { CARD_BACK_LIST, type CardBackId } from "@/lib/themes";
import { Check } from "lucide-react";

type Props = {
  value: CardBackId;
  onChange: (id: CardBackId) => void;
};

export function CardBackPicker({ value, onChange }: Props) {
  return (
    <ul className="grid grid-cols-5 gap-2">
      {CARD_BACK_LIST.map((back) => {
        const selected = back.id === value;
        return (
          <li key={back.id}>
            <button
              type="button"
              onClick={() => onChange(back.id)}
              className={`relative w-full aspect-[2/3] rounded-lg ring-1 transition overflow-hidden ${
                selected ? "ring-accent-400/70" : "ring-white/10 hover:ring-white/30"
              }`}
              style={{ background: back.background }}
              title={back.label}
              aria-label={back.label}
            >
              <div
                className="absolute inset-1 rounded-md opacity-60"
                style={{ backgroundImage: back.pattern }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className="w-3 h-3 rounded-full border"
                  style={{ borderColor: back.centerColor }}
                />
              </div>
              {selected ? (
                <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-accent-400 text-accent-950 flex items-center justify-center">
                  <Check className="w-2.5 h-2.5" />
                </div>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
