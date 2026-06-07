"use client";
import { DesktopOnlyGate } from "@/components/ui/DesktopOnlyGate";
// Server-backed online table (NEW mode). The game runs on the authoritative Go
// server (NEXT_PUBLIC_GAME_WS_URL); this page only renders state + sends
// actions. Voice + chat are mounted by room code, same as /play/normal. The
// legacy host-authoritative mode at /play/normal is untouched.
//
// Economy: buy-in is escrowed on join (coins held until cash-out on leave).
// Hand history: written to Firestore on each showdown for HUD/stats.
// Spectators: ?spectator=1 in the URL — they observe without being dealt in.
import { useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useServerGame } from "@/hooks/useServerGame";
import { ServerTable } from "@/components/online/ServerTable";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { useChat } from "@/hooks/useChat";
import { callEconomy } from "@/lib/economyClient";
import { writeOnlineHandRecord } from "@/lib/handHistory";
import { useOnlineHistory } from "@/hooks/useOnlineHistory";
import type { Category } from "@/lib/handEval";

const VoicePanel = dynamic(() => import("@/components/voice/VoicePanel"), {
  ssr: false,
});

export default function PlayOnlinePage() {
  const params = useParams<{ code: string }>();
  const code = params.code?.toUpperCase() ?? null;
  return (
    <DesktopOnlyGate roomCode={code ?? undefined}>
      <PlayOnlinePageInner />
    </DesktopOnlyGate>
  );
}

function PlayOnlinePageInner() {
  const params = useParams<{ code: string }>();
  const code = params.code?.toUpperCase() ?? null;
  const search = useSearchParams();
  const isSpectator = search.get("spectator") === "1";

  const { connected, status, state, hole, uid, name, seed, error, start, action, config, pause, resume, token } =
    useServerGame(code, isSpectator);
  const chat = useChat(code);
  const configSent = useRef(false);

  // History from Supabase — re-fetches when a new showdown completes.
  const showdownKey = state?.phase === "showdown" ? state.handNum : 0;
  const { records: history } = useOnlineHistory(code, showdownKey);

  // Apply room config (blinds/stack/run-it/blind-level) once on connect.
  // Only the creator's link carries these params; plain join links use defaults.
  useEffect(() => {
    if (!connected || configSent.current) return;
    const sb = Number(search.get("sb"));
    const bb = Number(search.get("bb"));
    const stack = Number(search.get("stack"));
    const runItN = Number(search.get("runItN")) || undefined;
    const blindLevelSecs = Number(search.get("blindLevelSecs")) || undefined;
    if (sb > 0 || bb > 0 || stack > 0 || runItN || blindLevelSecs) {
      config(sb || 0, bb || 0, stack || 0, runItN, blindLevelSecs);
      configSent.current = true;
    }
  }, [connected, search, config]);

  // Economy: escrow buy-in once when authenticated (non-spectators only).
  const escrowRef = useRef<{ code: string } | null>(null);
  const tokenRef = useRef(token);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    if (isSpectator || !code || !uid || !token || escrowRef.current) return;
    const amount = Number(search.get("stack")) || 1000;
    escrowRef.current = { code };
    // mode:"online" so reconcileEscrows never auto-refunds this while in play
    // (online rooms have no normalRooms lobby). Cash-out on unmount settles it.
    callEconomy(token, "buy-in", { code, amount, mode: "online" }).catch(() => {
      escrowRef.current = null;
    });
  }, [isSpectator, code, uid, token, search]);

  // Track latest chip count for cash-out on unmount.
  const chipsRef = useRef(0);
  useEffect(() => {
    if (!state || !uid) return;
    const seat = state.seats.find((s) => s.id === uid);
    if (seat) chipsRef.current = seat.chips + (seat.bet ?? 0);
  }, [state, uid]);

  // Cash-out on unmount.
  useEffect(() => {
    return () => {
      const esc = escrowRef.current;
      const tok = tokenRef.current;
      if (!esc || !tok) return;
      escrowRef.current = null;
      callEconomy(tok, "cash-out", { code: esc.code }).catch(() => {});
    };
  }, []);

  // P5: write hand record to Firestore on each showdown.
  const lastSavedHandRef = useRef(0);
  useEffect(() => {
    if (!state || state.phase !== "showdown" || !code) return;
    if (state.handNum === lastSavedHandRef.current) return;
    lastSavedHandRef.current = state.handNum;
    writeOnlineHandRecord(code, {
      handNum: state.handNum,
      winners: (state.winners ?? []).map((w) => ({
        id: w.id,
        name: state.seats.find((s) => s.id === w.id)?.name ?? w.id.slice(0, 6),
        amount: w.amount,
      })),
      category: "High Card" as unknown as Category, // server does not send hand category
      pot: state.pot,
      community: state.board,
      dealtIds: state.seats.map((s) => s.id),
      showdownIds: state.reveals ? Object.keys(state.reveals) : [],
    }).catch(() => {});
  }, [state, code]);

  return (
    <main className="min-h-screen p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest font-black text-zinc-500">
          Online · sala {code}
          {isSpectator && <span className="ml-2 text-accent-400">espectador</span>}
        </span>
        <span className="text-[10px] text-zinc-600">servidor autoritativo</span>
      </div>

      {error && (
        <div className="w-[min(720px,94vw)] mx-auto rounded-xl bg-warn-500/10 ring-1 ring-warn-400/25 text-warn-200 text-xs px-3 py-2">
          {error} — revisá NEXT_PUBLIC_GAME_WS_URL.
        </div>
      )}

      <ServerTable
        code={code}
        state={state}
        hole={hole}
        uid={uid}
        connected={connected}
        status={status}
        spectator={isSpectator}
        history={history}
        onStart={start}
        onAction={action}
        onPause={pause}
        onResume={resume}
      />

      <div className="fixed bottom-4 left-4 z-40 flex flex-col gap-2">
        <VoicePanel code={code ?? ""} uid={uid} displayName={name} seed={seed} canLeave={false} />
        <ChatPanel code={code} uid={uid} name={name} seed={seed} messages={chat} />
      </div>
    </main>
  );
}
