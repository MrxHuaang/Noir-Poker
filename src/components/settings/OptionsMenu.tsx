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
        className="glass-icon-button btn-press relative rounded-xl p-3 text-secondary"
        aria-label="Opciones"
      >
        <Menu className="w-5 h-5" />
        {badge ? (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-md bg-bone text-ink-900 text-[10px] font-semibold numeric flex items-center justify-center">
            {badge}
          </span>
        ) : null}
      </button>

      {open && (
        <div className="glass-panel absolute left-0 top-full z-[80] mt-2 w-60 overflow-hidden rounded-2xl animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-2.5 px-3 py-3 border-b border-line">
            {seed ? (
              <Avatar seed={seed} size={32} />
            ) : (
              <div className="w-8 h-8 rounded-[10px] bg-bone/10" />
            )}
            <span className="text-sm font-semibold text-primary truncate">
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
      className={`btn-press flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
        danger
          ? "glass-button glass-button-danger"
          : "glass-button glass-button-ghost text-primary"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
