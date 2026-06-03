"use client";
// Server-backed online table (NEW mode). The game runs on the authoritative Go
// server (NEXT_PUBLIC_GAME_WS_URL); this page only renders state + sends
// actions. Voice + chat are mounted by room code, same as /play/normal. The
// legacy host-authoritative mode at /play/normal is untouched.
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useServerGame } from "@/hooks/useServerGame";
import { ServerTable } from "@/components/online/ServerTable";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { useChat } from "@/hooks/useChat";

const VoicePanel = dynamic(() => import("@/components/voice/VoicePanel"), {
  ssr: false,
});

export default function PlayOnlinePage() {
  const params = useParams<{ code: string }>();
  const code = params.code?.toUpperCase() ?? null;
  const { connected, state, hole, uid, name, seed, error, start, action } =
    useServerGame(code);
  const chat = useChat(code);

  return (
    <main className="min-h-screen p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest font-black text-zinc-500">
          Online · sala {code}
        </span>
        <span className="text-[10px] text-zinc-600">
          servidor autoritativo
        </span>
      </div>

      {error && (
        <div className="w-[min(720px,94vw)] mx-auto rounded-xl bg-warn-500/10 ring-1 ring-warn-400/25 text-warn-200 text-xs px-3 py-2">
          {error} — revisá NEXT_PUBLIC_GAME_WS_URL.
        </div>
      )}

      <ServerTable
        state={state}
        hole={hole}
        uid={uid}
        connected={connected}
        onStart={start}
        onAction={action}
      />

      <div className="fixed bottom-4 left-4 z-40 flex flex-col gap-2">
        <VoicePanel code={code ?? ""} uid={uid} displayName={name} seed={seed} />
        <ChatPanel code={code} uid={uid} name={name} seed={seed} messages={chat} />
      </div>
    </main>
  );
}
