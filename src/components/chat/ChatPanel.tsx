"use client";
import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send, X } from "lucide-react";
import { Avatar } from "@/components/players/Avatar";
import type { ChatMessage } from "@/lib/chat";
import { sendChatMessage } from "@/lib/chat";

type Props = {
  code: string | null;
  uid: string | null;
  name: string;
  seed: string;
  messages: ChatMessage[];
};

export function ChatPanel({ code, uid, name, seed, messages }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [lastSeen, setLastSeen] = useState<number>(() => Date.now());
  const listRef = useRef<HTMLDivElement>(null);

  const unread = messages.filter(
    (m) => m.ts > lastSeen && m.uid !== uid,
  ).length;

  useEffect(() => {
    if (open) {
      setLastSeen(Date.now());
      requestAnimationFrame(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight;
        }
      });
    }
  }, [open, messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!code || !uid || !text.trim()) return;
    const t = text;
    setText("");
    await sendChatMessage(code, uid, name || "Anon", seed || "", t).catch(() => {});
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass-icon-button btn-press relative rounded-2xl p-3 text-secondary shadow-xl"
      >
        <MessageSquare className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-zinc-200 text-zinc-950 text-[10px] font-semibold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="glass-panel h-72 w-[min(20rem,calc(100vw-1.5rem))] animate-in slide-in-from-bottom-2 fade-in duration-200 flex flex-col overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between px-3 py-2 border-b border-line">
        <div className="eyebrow flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-secondary" /> Chat
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="glass-icon-button btn-press rounded-lg p-1 text-secondary"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 custom-scrollbar">
        {messages.length === 0 && (
          <div className="m-auto text-[11px] text-muted">Sin mensajes</div>
        )}
        {messages.map((m) => {
          const mine = m.uid === uid;
          return (
            <div key={m.id} className={`flex items-start gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              <Avatar seed={m.seed} size={20} />
              <div className={`max-w-[75%] flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <span className="eyebrow text-[11px]">
                  {mine ? "Tú" : m.name}
                </span>
                <div
                  className={`px-2.5 py-1.5 rounded-xl text-xs leading-snug break-words ${
                    mine
                      ? "bg-white/[0.10] text-primary ring-1 ring-line-strong"
                      : "bg-bone/[0.04] text-primary ring-1 ring-line"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-2 px-2 py-2 border-t border-line">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={uid ? "Mensaje…" : "Conectando…"}
          maxLength={200}
          disabled={!uid || !code}
          className="flex-1 px-3 py-1.5 rounded-xl bg-black/40 ring-1 ring-line text-primary text-xs outline-none focus:ring-white/30 disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={!text.trim() || !uid}
          className="glass-icon-button glass-button-accent btn-press rounded-xl p-2 text-primary disabled:opacity-30"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
