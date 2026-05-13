"use client";
import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRoom, useLobby } from "@/hooks/useRoom";
import { createRoom } from "@/lib/rooms";
import { PokerTable } from "@/components/table/PokerTable";
import type { Player } from "@/lib/poker";

export default function HostPage() {
  const { uid, loading } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const room = useRoom(code);
  const lobby = useLobby(code);

  useEffect(() => {
    if (loading || !uid || code || creating) return;
    setCreating(true);
    createRoom(uid)
      .then((c) => setCode(c))
      .catch(() => {})
      .finally(() => setCreating(false));
  }, [loading, uid, code, creating]);

  const ownersMap = useMemo(() => {
    const out: Record<string, string | null> = {};
    if (room?.state) {
      for (const s of room.state.seats) out[s.id] = s.ownerUid ?? null;
    } else {
      for (const p of lobby) out[p.uid] = p.uid;
    }
    return out;
  }, [room, lobby]);

  const lobbyAsPlayers: Player[] = useMemo(
    () =>
      lobby.map((p) => ({
        id: p.uid,
        name: p.name,
        seed: p.seed,
        createdAt: p.joinedAt,
      })),
    [lobby],
  );

  const joinUrl =
    typeof window !== "undefined" && code
      ? `${window.location.origin}/join?code=${code}`
      : "";

  function copy() {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (loading || !code) {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 py-10 text-center text-zinc-500 text-sm">
        Creando sala…
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 flex flex-col gap-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/10">
        <div className="flex items-center gap-4">
          <div className="p-2 rounded-xl bg-white">
            {joinUrl ? <QRCodeSVG value={joinUrl} size={96} /> : null}
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
              Sala
            </span>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-2 text-3xl tracking-[0.25em] font-semibold text-zinc-100"
              title="Copiar"
            >
              {code}
              {copied ? (
                <Check className="w-5 h-5 text-emerald-300" />
              ) : (
                <Copy className="w-5 h-5 text-zinc-400" />
              )}
            </button>
            <span className="text-[11px] text-zinc-500 mt-1 truncate max-w-xs">
              {joinUrl.replace(/^https?:\/\//, "")}
            </span>
          </div>
        </div>
        <div className="text-xs text-zinc-400 max-w-xs">
          Comparte el código o el QR. Los jugadores entran desde su teléfono y
          eligen apodo + avatar.
        </div>
      </header>

      <PokerTable
        sync={{ roomCode: code, ownersMap }}
        playersOverride={lobbyAsPlayers}
      />
    </div>
  );
}
