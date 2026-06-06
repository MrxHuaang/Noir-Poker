"use client";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Volume2, QrCode, Users, Copy, Check, Link2, Share2 } from "lucide-react";
import { Avatar } from "@/components/players/Avatar";
import type { NormalLobbyPlayer } from "@/lib/normalRooms";
import { SettingsOverlay, type SettingsTab } from "./SettingsOverlay";
import { AudioVideoSettings } from "./AudioVideoSettings";

type Props = {
  code: string | null;
  joinUrl: string;
  lobby: NormalLobbyPlayer[];
  selfUid: string | null;
  onClose: () => void;
};

export function PlayerSettings({ code, joinUrl, lobby, selfUid, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  function copy(text: string, mark: (v: boolean) => void) {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => {
      mark(true);
      setTimeout(() => mark(false), 1500);
    });
  }

  const tabs: SettingsTab[] = [
    {
      id: "audio",
      label: "Audio/Video",
      icon: <Volume2 className="w-3.5 h-3.5" />,
      content: <AudioVideoSettings showMic />,
    },
    {
      id: "sala",
      label: "Sala",
      icon: <QrCode className="w-3.5 h-3.5" />,
      content: (
        <div className="flex flex-col items-center gap-5 text-center">
          {joinUrl && (
            <div className="p-3 bg-white rounded-2xl">
              <QRCodeSVG value={joinUrl} size={170} />
            </div>
          )}
          <span className="text-4xl font-mono font-black tracking-[0.25em] text-zinc-50">
            {code ?? "—"}
          </span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => copy(code ?? "", setCopied)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/[0.05] hover:bg-white/10 ring-1 ring-white/10 text-zinc-200 text-[11px] font-bold uppercase tracking-widest transition btn-press"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              Código
            </button>
            <button
              type="button"
              onClick={() => copy(joinUrl, setCopiedLink)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/[0.05] hover:bg-white/10 ring-1 ring-white/10 text-zinc-200 text-[11px] font-bold uppercase tracking-widest transition btn-press"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
              Enlace
            </button>
            {canShare && (
              <button
                type="button"
                onClick={() =>
                  navigator
                    .share({ title: "Noir", text: `Únete (${code})`, url: joinUrl })
                    .catch(() => {})
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/[0.05] hover:bg-white/10 ring-1 ring-white/10 text-zinc-200 text-[11px] font-bold uppercase tracking-widest transition btn-press"
              >
                <Share2 className="w-3.5 h-3.5" />
                Compartir
              </button>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "jugadores",
      label: "Jugadores",
      icon: <Users className="w-3.5 h-3.5" />,
      content: (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
            En la mesa ({lobby.length})
          </span>
          <ul className="flex flex-col gap-1.5">
            {lobby.map((p) => (
              <li
                key={p.uid}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.03] ring-1 ring-white/[0.08]"
              >
                <Avatar seed={p.seed} size={26} />
                <span className="text-sm text-zinc-200 truncate">
                  {p.name}
                  {p.uid === selfUid ? " (Tú)" : ""}
                </span>
                {p.sittingOut && (
                  <span className="ml-auto text-[9px] uppercase tracking-widest text-zinc-500 font-bold">
                    Ausente
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ),
    },
  ];

  return (
    <SettingsOverlay
      title={`Mesa ${code ?? "—"}`}
      tabs={tabs}
      initialTab="audio"
      onClose={onClose}
    />
  );
}
