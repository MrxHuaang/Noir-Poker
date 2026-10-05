"use client";
// Table talk, written on the club's notepad: a torn sheet with the last lines
// in ink and a ledger line to write on. It lives in the table's case
// (NoirCase), which keeps the count of unread lines on its lid.
import { useEffect, useRef, useState } from "react";
import { sendChatMessage, type ChatMessage } from "@/lib/chat";

export function NoirChat({
  code,
  uid,
  name,
  seed,
  messages,
  active,
}: {
  code: string | null;
  uid: string | null;
  name: string;
  seed: string;
  messages: ChatMessage[];
  /** The sheet is on view (scroll to the last line, focus the pen). */
  active: boolean;
}) {
  const [text, setText] = useState("");
  const list = useRef<HTMLOListElement>(null);
  const pen = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!active) return;
    const id = requestAnimationFrame(() => {
      if (list.current) list.current.scrollTop = list.current.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [active, messages.length]);
  useEffect(() => {
    if (active) pen.current?.focus({ preventScroll: true });
  }, [active]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!code || !uid || !text.trim()) return;
    const t = text;
    setText("");
    await sendChatMessage(code, uid, name || "Anon", seed || "", t).catch(() => {});
  }

  return (
    <div className="-rotate-1 bg-[linear-gradient(170deg,#efe6d3,#d8c9a8)] px-4 pt-4 pb-3 text-card-ink shadow-[0_12px_28px_rgb(0_0_0/.5)] [clip-path:polygon(0_2%,10%_0,30%_1.5%,55%_0,80%_1.2%,100%_0,99%_50%,100%_100%,0_100%,1%_50%)]">
      <ol ref={list} className="m-0 grid max-h-56 list-none gap-1.5 overflow-y-auto p-0 pr-1 text-[14px] leading-snug" aria-live="polite">
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
          ref={pen}
          id="noir-chat"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          disabled={!uid || !code}
          placeholder={uid ? "Escribe aquí…" : "Conectando…"}
          className="h-9 min-w-0 flex-1 border-b-2 border-dotted border-[#5a4d3e] bg-transparent text-[14px] text-card-ink outline-none placeholder:text-[#6e6150] focus-visible:border-blood-500"
        />
        <button type="submit" disabled={!text.trim() || !uid} className="tk tk-sm tk-red h-9 px-4 text-[15px] disabled:opacity-40">
          Decir
        </button>
      </form>
    </div>
  );
}
