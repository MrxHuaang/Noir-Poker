"use client";
// One brass plate in the corner that unfolds into a list, so the room keeps
// almost no HUD. Items are plain lines with a spade on the active one,
// like a game pause menu. Plain sans type (legible), label over hint.
// Closes on Escape or a click outside.
import { useEffect, useRef, useState } from "react";
import { Spade } from "lucide-react";

export type NoirMenuItem = { label: string; onSelect: () => void; hint?: string; danger?: boolean };

export function NoirMenu({ items, label = "Menú" }: { items: NoirMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" className="btn-brass btn-sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {label}
      </button>
      {open && (
        <div role="menu" className="plate legible absolute right-0 top-12 z-40 grid w-[272px] gap-px px-3 pt-8 pb-3">
          {items.map((it, i) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={`grid min-h-11 grid-cols-[16px_1fr] items-center gap-x-2.5 px-2 py-2 text-left transition-[color,translate,background] duration-150 ${
                i === hover ? "translate-x-1 bg-[rgb(0_0_0/.22)] text-tungsten-400" : it.danger ? "text-blood-400" : "text-paper"
              }`}
            >
              <Spade className={`h-3.5 w-3.5 fill-current ${i === hover ? "opacity-100" : "opacity-0"}`} aria-hidden />
              <span className="text-[15px] font-semibold leading-tight">{it.label}</span>
              {it.hint && <span className="col-start-2 text-[12.5px] leading-tight text-paper-mute">{it.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
