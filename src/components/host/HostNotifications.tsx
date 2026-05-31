"use client";
import { useEffect, useRef, useState } from "react";
import { Coins, RefreshCw, Trophy, Zap, UserX, X } from "lucide-react";
import type { StackRequest } from "@/lib/stackRequests";
import type { NormalGameState, NormalSeat } from "@/lib/betting";
import { formatChips } from "@/lib/betting";
import type { Showdown } from "@/lib/handEval";
import { CATEGORY_LABEL } from "@/lib/handEval";

type Toast = {
  id: string;
  kind: "join" | "rebuy" | "all-in" | "out" | "winner";
  title: string;
  body: string;
  ts: number;
};

type Props = {
  requests: StackRequest[];
  gameState: NormalGameState | null;
  result: (Showdown & { chips: Record<string, number> }) | null;
  onClickRequest: () => void;
};

const KIND_STYLE: Record<Toast["kind"], { icon: typeof Coins; color: string; ring: string }> = {
  join: { icon: Coins, color: "text-amber-300", ring: "ring-amber-400/30" },
  rebuy: { icon: RefreshCw, color: "text-sky-300", ring: "ring-sky-400/30" },
  "all-in": { icon: Zap, color: "text-amber-300", ring: "ring-amber-400/30" },
  out: { icon: UserX, color: "text-rose-300", ring: "ring-rose-400/30" },
  winner: { icon: Trophy, color: "text-amber-300", ring: "ring-amber-400/40" },
};

export function HostNotifications({
  requests,
  gameState,
  result,
  onClickRequest,
}: Props) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenReqsRef = useRef<Set<string>>(new Set());
  const seenAllInRef = useRef<Set<string>>(new Set());
  const seenOutRef = useRef<Set<string>>(new Set());
  const lastResultRef = useRef<string | null>(null);

  function push(t: Omit<Toast, "id" | "ts">) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { ...t, id, ts: Date.now() }]);
    const ttl = t.kind === "winner" ? 4000 : 7000;
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, ttl);
  }

  // Stack requests
  useEffect(() => {
    const pending = requests.filter((r) => r.status === "pending");
    for (const r of pending) {
      const key = `${r.uid}-${r.ts}-${r.type}`;
      if (seenReqsRef.current.has(key)) continue;
      seenReqsRef.current.add(key);
      push({
        kind: r.type === "rebuy" ? "rebuy" : "join",
        title: r.type === "rebuy" ? "Rebuy solicitado" : "Nueva solicitud",
        body: `${r.name} pide ${formatChips(r.requestedStack)}`,
      });
    }
    // Clear seen for resolved so future rebuys can re-notify
    const stillPending = new Set(pending.map((p) => `${p.uid}-${p.ts}-${p.type}`));
    for (const k of seenReqsRef.current) {
      if (!stillPending.has(k)) {
        // keep — avoids re-notify if request flips back to pending unlikely
      }
    }
  }, [requests]);

  // Game events: all-in + eliminated
  useEffect(() => {
    if (!gameState) return;
    for (const s of gameState.seats) {
      const allInKey = `${s.id}-allin`;
      if (s.status === "all-in" && !seenAllInRef.current.has(allInKey)) {
        seenAllInRef.current.add(allInKey);
        push({
          kind: "all-in",
          title: "All-in",
          body: `${s.name} se va all-in (${formatChips(s.totalBet)})`,
        });
      }
      if (s.status !== "all-in" && seenAllInRef.current.has(allInKey)) {
        seenAllInRef.current.delete(allInKey);
      }
      const outKey = `${s.id}-out`;
      if (s.status === "out" && !seenOutRef.current.has(outKey)) {
        seenOutRef.current.add(outKey);
        push({
          kind: "out",
          title: "Eliminado",
          body: `${s.name} sale de la mesa`,
        });
      }
    }
  }, [gameState]);

  // Winner
  useEffect(() => {
    if (!result || !gameState) return;
    const key = result.winners.join(",") + "-" + gameState.betting.handNum;
    if (lastResultRef.current === key) return;
    lastResultRef.current = key;
    const names = result.winners
      .map((id) => gameState.seats.find((s: NormalSeat) => s.id === id)?.name ?? id)
      .join(" & ");
    push({
      kind: "winner",
      title: "Ganador",
      body: `${names} · ${CATEGORY_LABEL[result.category]}`,
    });
  }, [result, gameState]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[80] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const s = KIND_STYLE[t.kind];
        const isReq = t.kind === "join" || t.kind === "rebuy";
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              if (isReq) onClickRequest();
              setToasts((prev) => prev.filter((x) => x.id !== t.id));
            }}
            className={`pointer-events-auto w-[300px] flex items-start gap-3 px-3 py-2.5 rounded-2xl bg-zinc-900/95 backdrop-blur-xl ring-1 ${s.ring} shadow-2xl text-left hover:bg-zinc-800/95 transition animate-in slide-in-from-right-4 fade-in duration-300`}
          >
            <div className={`p-1.5 rounded-xl bg-white/5 ${s.color} flex-shrink-0`}>
              <s.icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-widest font-black text-zinc-400">
                {t.title}
              </div>
              <div className="text-xs text-zinc-100 font-medium truncate">{t.body}</div>
            </div>
            <X className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0 mt-1" />
          </button>
        );
      })}
    </div>
  );
}
