"use client";
import { TABLE_THEME_LIST, type TableThemeId } from "@/lib/themes";
import { Check } from "lucide-react";

type Props = {
  value: TableThemeId;
  onChange: (id: TableThemeId) => void;
};

export function TableThemePicker({ value, onChange }: Props) {
  return (
    <ul className="grid grid-cols-5 gap-2">
      {TABLE_THEME_LIST.map((theme) => {
        const selected = theme.id === value;
        return (
          <li key={theme.id}>
            <button
              type="button"
              onClick={() => onChange(theme.id)}
              className={`relative w-full aspect-square rounded-full ring-1 transition ${
                selected ? "ring-accent-400/70" : "ring-white/10 hover:ring-white/30"
              }`}
              style={{ background: theme.feltGradient }}
              title={theme.label}
              aria-label={theme.label}
            >
              {selected ? (
                <div className="absolute top-0 right-0 w-4 h-4 rounded-full bg-accent-400 text-accent-950 flex items-center justify-center">
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
