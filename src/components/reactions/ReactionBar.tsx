"use client";
import { useState } from "react";
import { Smile, X } from "lucide-react";
import { REACTIONS, sendReaction } from "@/lib/reactions";

type Props = {
  code: string | null;
  uid: string | null;
};

export function ReactionBar({ code, uid }: Props) {
  const [open, setOpen] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  async function emit(emoji: string) {
    if (!code || !uid || cooldown) return;
    setCooldown(true);
    setTimeout(() => setCooldown(false), 800);
    await sendReaction(code, uid, emoji).catch(() => {});
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass-icon-button btn-press rounded-2xl p-3 text-secondary shadow-xl"
        title="Reaccionar"
      >
        <Smile className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="glass-panel flex items-center gap-1 rounded-2xl px-2 py-1.5 animate-in slide-in-from-bottom-2 fade-in duration-150">
      {REACTIONS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => emit(e)}
          disabled={cooldown || !uid}
          className="glass-icon-button btn-press flex h-9 w-9 items-center justify-center rounded-xl text-xl disabled:opacity-40"
          title={e}
        >
          {e}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="glass-icon-button btn-press ml-1 rounded-xl p-1.5 text-secondary"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
