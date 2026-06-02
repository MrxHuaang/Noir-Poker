"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Menu, Settings, LogOut, UserMinus, UserCheck } from "lucide-react";
import { Avatar } from "@/components/players/Avatar";

// PokerNow-style compact options popover opened from a hamburger button. Hosts
// the entry points: Configuraciones, ausentarse and leaving the seat. Mounts in
// TableShell's topLeft slot.
export function OptionsMenu({
  name,
  seed,
  onOpenSettings,
  away,
  onToggleAway,
  onLeave,
  leaveLabel = "Salir",
  badge,
}: {
  name: string;
  seed?: string;
  onOpenSettings: () => void;
  away?: boolean;
  onToggleAway?: () => void;
  onLeave: () => void;
  leaveLabel?: string;
  badge?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-3 rounded-2xl glass hover:bg-white/10 ring-1 ring-white/10 text-zinc-300 transition btn-press shadow-xl"
        aria-label="Opciones"
      >
        <Menu className="w-5 h-5" />
        {badge ? (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-zinc-200 text-zinc-950 text-[10px] font-black flex items-center justify-center">
            {badge}
          </span>
        ) : null}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 w-60 rounded-2xl bg-zinc-900/97 backdrop-blur-xl ring-1 ring-white/10 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150 z-[80]">
          <div className="flex items-center gap-2.5 px-3 py-3 border-b border-white/5">
            {seed ? (
              <Avatar seed={seed} size={32} />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/10" />
            )}
            <span className="text-sm font-semibold text-zinc-100 truncate">
              {name || "Invitado"}
            </span>
          </div>
          <div className="p-1.5 flex flex-col gap-0.5">
            <Item
              icon={<Settings className="w-4 h-4" />}
              label="Configuraciones"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
            />
            {onToggleAway && (
              <Item
                icon={
                  away ? (
                    <UserCheck className="w-4 h-4" />
                  ) : (
                    <UserMinus className="w-4 h-4" />
                  )
                }
                label={away ? "Volver a jugar" : "Ausentarme"}
                onClick={onToggleAway}
              />
            )}
            <Item
              icon={<LogOut className="w-4 h-4" />}
              label={leaveLabel}
              danger
              onClick={() => {
                setOpen(false);
                onLeave();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Item({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition text-left ${
        danger
          ? "text-rose-300 hover:bg-rose-500/10"
          : "text-zinc-200 hover:bg-white/5"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
