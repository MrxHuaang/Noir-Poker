"use client";
import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, Palette } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRoom, useLobby } from "@/hooks/useRoom";
import { createRoom, setRoomTheme } from "@/lib/rooms";
import { PokerTable } from "@/components/table/PokerTable";
import { TableThemePicker } from "@/components/themes/TableThemePicker";
import { BorderGlow } from "@/components/ui/BorderGlow";
import type { TableThemeId } from "@/lib/themes";
import type { Player } from "@/lib/poker";

export default function HostPage() {
  const { uid, loading } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const room = useRoom(code);
  const lobby = useLobby(code);

  useEffect(() => {
    if (loading || !uid || code || creating) return;
    setCreating(true);

    // Check URL first
    const searchParams = new URLSearchParams(window.location.search);
    const existingCode = searchParams.get("code");
    if (existingCode) {
      setCode(existingCode.toUpperCase());
      setCreating(false);
      return;
    }

    createRoom(uid, { mode: "presencial" })
      .then((c) => {
        setCode(c);
        window.history.replaceState(null, "", `?code=${c}`);
      })
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

  const theme = (room?.theme as TableThemeId | undefined) ?? "emerald";

  function onThemeChange(id: TableThemeId) {
    if (!code) return;
    setRoomTheme(code, id).catch(() => {});
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
      <BorderGlow
        className="w-full"
        edgeSensitivity={24}
        glowColor="210 55 50"
        backgroundColor="rgba(10, 11, 16, 0.88)"
        borderRadius={18}
        glowRadius={28}
        glowIntensity={0.95}
        coneSpread={26}
        animated={false}
        colors={["#34d399", "#60a5fa", "#c4b5fd"]}
        fillOpacity={0.4}
      >
        <header className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
          <div className="p-2 rounded-xl bg-white">
            {joinUrl ? <QRCodeSVG value={joinUrl} size={96} /> : null}
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
              Sala · Modo presencial
            </span>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-2 text-3xl tracking-[0.25em] font-semibold text-zinc-100 btn-press"
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
        <div className="flex max-w-xs flex-col gap-2">
          <div className="text-xs text-zinc-400">
            Comparte código o QR. Jugadores entran desde su teléfono y eligen
            apodo + avatar.
          </div>
          <button
            type="button"
            onClick={() => setShowThemePicker((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-xs text-zinc-200 w-fit transition btn-press"
          >
            <Palette className="w-3.5 h-3.5" />
            Tema de mesa
          </button>
          {showThemePicker ? (
            <TableThemePicker value={theme} onChange={onThemeChange} />
          ) : null}
        </div>
      </header>
      </BorderGlow>

      <PokerTable
        sync={{ roomCode: code, ownersMap }}
        playersOverride={lobbyAsPlayers}
        theme={theme}
      />
    </div>
  );
}
