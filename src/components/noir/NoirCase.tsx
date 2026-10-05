"use client";
// The table's case: everything you do with the people at the table in one
// object in the bottom-left corner. Closed it is a brass lid with an on-air
// lamp (your mic is open) and a stamp with the unread lines; open it is a
// riveted plate with index tabs: voice, talk, quick lines, gestures and the
// room's sound and look. Keys: T talk, G gestures, Esc closes.
//
// Voice stays mounted while the lid is shut or another tab is open: closing
// the case never hangs up the line.
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import type { ChatMessage } from "@/lib/chat";
import { NoirChat } from "@/components/noir/NoirChat";

export type CaseTab = "voz" | "charla" | "frases" | "gestos" | "ajustes";

export function NoirCase({
  seated,
  voice,
  onAir,
  chat,
  phrases,
  onPhrase,
  gestures,
  onGesture,
  settings,
  shut,
  lifted,
}: {
  seated: boolean;
  /** The voice panel, drawn bare (mounted always, shown in its tab). */
  voice: ReactNode;
  onAir: boolean;
  chat: { code: string | null; uid: string | null; name: string; seed: string; messages: ChatMessage[] };
  phrases: readonly string[];
  onPhrase: (p: string) => void;
  gestures: { kind: string; label: string }[];
  onGesture: (kind: string) => void;
  settings: ReactNode;
  /** Your turn: the case closes so the rail has the table edge. */
  shut: boolean;
  lifted: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<CaseTab>("charla");
  const [lastSeen, setLastSeen] = useState(() => Date.now());
  const [cooling, setCooling] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const tabs: { key: CaseTab; label: string }[] = [
    ...(seated ? [{ key: "voz" as const, label: "Voz" }] : []),
    { key: "charla", label: "Charla" },
    ...(seated ? [{ key: "frases" as const, label: "Frases" }, { key: "gestos" as const, label: "Gestos" }] : []),
    { key: "ajustes", label: "Ajustes" },
  ];
  const current = tabs.some((t) => t.key === tab) ? tab : "charla";
  const isOpen = open && !shut;
  const reading = isOpen && current === "charla";
  const unread = reading ? 0 : chat.messages.filter((m) => m.ts > lastSeen && m.uid !== chat.uid).length;

  // Lines read while the sheet is open never count as unread afterwards.
  const newest = chat.messages.reduce((m, c) => Math.max(m, c.ts), 0);
  if (reading && newest > lastSeen) setLastSeen(newest);

  const show = (t: CaseTab) => {
    setTab(t);
    setOpen(true);
  };

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (e.key === "Escape" && open) {
      setOpen(false);
      return;
    }
    if (shut || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) return;
    const k = e.key.toLowerCase();
    if (k === "t") {
      e.preventDefault();
      show("charla");
    } else if (k === "g" && seated) show("gestos");
  });
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);

  const gesture = (kind: string) => {
    if (cooling) return;
    onGesture(kind);
    setCooling(true);
    setTimeout(() => setCooling(false), 2500);
  };

  return (
    <div ref={box} className={`absolute left-4 z-20 transition-[bottom] duration-500 ${lifted ? "bottom-[128px]" : "bottom-4"}`}>
      <div
        hidden={!isOpen}
        className="plate legible absolute bottom-full left-0 mb-2 max-h-[min(440px,calc(100vh-180px))] w-[min(380px,calc(100vw-2rem))] overflow-y-auto px-4 pt-7 pb-4 text-paper"
      >
        <div role="tablist" aria-label="Con la mesa" className="mb-3 flex flex-wrap gap-1 border-b-2 border-brass-700/70">
          {tabs.map((t) => {
            const on = t.key === current;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`case-tab-${t.key}`}
                aria-selected={on}
                aria-controls={`case-panel-${t.key}`}
                onClick={() => setTab(t.key)}
                className={`-mb-0.5 border-2 border-b-0 px-2.5 py-1 text-[13.5px] font-semibold transition-colors [clip-path:polygon(5px_0,calc(100%-5px)_0,100%_100%,0_100%)] ${
                  on ? "border-brass-700/70 bg-[rgb(0_0_0/.28)] text-tungsten-400" : "border-transparent text-paper-dim hover:text-paper"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {seated && (
          <div role="tabpanel" id="case-panel-voz" aria-labelledby="case-tab-voz" hidden={current !== "voz"}>
            {voice}
          </div>
        )}
        <div role="tabpanel" id="case-panel-charla" aria-labelledby="case-tab-charla" hidden={current !== "charla"}>
          <NoirChat {...chat} active={reading} />
        </div>
        {seated && (
          <div role="tabpanel" id="case-panel-frases" aria-labelledby="case-tab-frases" hidden={current !== "frases"} className="grid justify-items-start gap-1.5">
            {phrases.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onPhrase(p);
                  setOpen(false);
                }}
                className="scrap px-3 py-1 text-left text-sm hover:brightness-110"
              >
                {p}
              </button>
            ))}
          </div>
        )}
        {seated && (
          <div role="tabpanel" id="case-panel-gestos" aria-labelledby="case-tab-gestos" hidden={current !== "gestos"} className="grid gap-2">
            <div className="grid grid-cols-2 gap-1.5">
              {gestures.map((g) => (
                <button key={g.kind} type="button" disabled={cooling} onClick={() => gesture(g.kind)} className="btn-brass btn-sm w-full justify-start disabled:opacity-40">
                  {g.label}
                </button>
              ))}
            </div>
            <p className="m-0 text-[12.5px] text-paper-mute">{cooling ? "Un momento antes del siguiente." : "Tu personaje lo hace en la mesa."}</p>
          </div>
        )}
        <div role="tabpanel" id="case-panel-ajustes" aria-labelledby="case-tab-ajustes" hidden={current !== "ajustes"} className="grid gap-2.5">
          {settings}
        </div>
      </div>

      <button
        type="button"
        onClick={() => (isOpen ? setOpen(false) : setOpen(true))}
        aria-expanded={isOpen}
        disabled={shut}
        className="btn-brass btn-sm disabled:opacity-60"
      >
        {onAir && (
          <span className="flex items-center gap-1.5 text-[12px] text-blood-400" aria-label="Tu micrófono está abierto">
            <span className="onair-dot h-2 w-2 bg-blood-500" aria-hidden />
            En el aire
          </span>
        )}
        Charla y voz
        {unread > 0 && (
          <span className="stamp h-5 px-1.5 text-[11px] text-tungsten-400" aria-label={`${unread} sin leer`}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </div>
  );
}
