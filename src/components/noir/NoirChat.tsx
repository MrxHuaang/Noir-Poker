"use client";
// Table talk, written on the club's notepad: a torn sheet with the last lines
// in ink and a ledger line to write on. Closed it is a brass plate with a
// stamped count of unread lines.
import { useEffect, useRef, useState } from "react";
import { sendChatMessage, type ChatMessage } from "@/lib/chat";

export function NoirChat({
  code,
  uid,
  name,
  seed,
  messages,
}: {
  code: string | null;
  uid: string | null;
  name: string;
  seed: string;
  messages: ChatMessage[];
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [lastSeen, setLastSeen] = useState(() => Date.now());
  const list = useRef<HTMLOListElement>(null);
  const unread = open ? 0 : messages.filter((m) => m.ts > lastSeen && m.uid !== uid).length;

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      if (list.current) list.current.scrollTop = list.current.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [open, messages.length]);

  const toggle = () => {
    setOpen((v) => !v);
    setLastSeen(Date.now());
  };

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!code || !uid || !text.trim()) return;
    const t = text;
    setText("");
    await sendChatMessage(code, uid, name || "Anon", seed || "", t).catch(() => {});
  }

  return (
    <div className="relative">
      <button type="button" onClick={toggle} className="btn-brass btn-sm" aria-expanded={open}>
        Charla
        {unread > 0 && (
          <span className="stamp h-5 px-1.5 text-[11px] text-tungsten-400" aria-label={`${unread} sin leer`}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute bottom-12 left-0 z-30 w-[min(320px,86vw)] -rotate-1 bg-[linear-gradient(170deg,#efe6d3,#d8c9a8)] px-4 pt-4 pb-3 text-card-ink shadow-[0_18px_40px_rgb(0_0_0/.55)] [clip-path:polygon(0_2%,10%_0,30%_1.5%,55%_0,80%_1.2%,100%_0,99%_50%,100%_100%,0_100%,1%_50%)]">
          <p className="m-0 mb-2 font-pix text-[11px] uppercase tracking-[.14em] text-blood-500">La charla de la mesa</p>
          <ol ref={list} className="m-0 grid max-h-56 list-none gap-1.5 overflow-y-auto p-0 pr-1 text-[14px] leading-snug">
            {messages.length === 0 && <li className="text-[#5a4d3e]">Nadie ha dicho nada todavía.</li>}
            {messages.map((m) => (
              <li key={m.id} className="break-words">
                <b className={m.uid === uid ? "text-blood-500" : ""}>{m.uid === uid ? "Tú" : m.name}:</b> {m.text}
              </li>
            ))}
          </ol>
          <form onSubmit={send} className="mt-3 flex items-end gap-2 border-t border-dashed border-[#8a7f6d] pt-2">
            <label htmlFor="noir-chat" className="sr-only">
              Escribir en la charla
            </label>
            <input
              id="noir-chat"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={200}
              disabled={!uid || !code}
              placeholder={uid ? "Escribe aquí…" : "Conectando…"}
              className="h-9 min-w-0 flex-1 border-b-2 border-dotted border-[#5a4d3e] bg-transparent text-[14px] text-card-ink outline-none placeholder:text-[#8a7f6d] focus-visible:border-blood-500"
            />
            <button type="submit" disabled={!text.trim() || !uid} className="tk tk-sm tk-red h-9 px-4 text-[15px] disabled:opacity-40">
              Decir
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
