"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Palette, QrCode, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRoom, useLobby } from "@/hooks/useRoom";
import { createRoom, setRoomTheme } from "@/lib/rooms";
import { PokerTable } from "@/components/table/PokerTable";
import { TableThemePicker } from "@/components/themes/TableThemePicker";
import type { TableThemeId } from "@/lib/themes";
import type { Player } from "@/lib/poker";

export default function HostPage() {
  const { uid, loading } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);
  const room = useRoom(code);
  const lobby = useLobby(code);

  useEffect(() => {
    if (loading || !uid || code || creating) return;
    setCreating(true);

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

  // Close popover on outside click
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (showQr && qrRef.current && !qrRef.current.contains(e.target as Node)) {
        setShowQr(false);
      }
      if (showThemePicker && themeRef.current && !themeRef.current.contains(e.target as Node)) {
        setShowThemePicker(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showQr, showThemePicker]);

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

  // Lock body scroll so the host table fills the viewport without page scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

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
    <div className="fixed inset-0 flex flex-col bg-[#06070a] overflow-hidden">
      {/* Compact header bar */}
      <header className="relative flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] shrink-0">
        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 hidden sm:block">
          Sala · Presencial
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-zinc-100 text-sm font-mono tracking-[0.2em] transition btn-press"
          title="Copiar código"
        >
          {code}
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-300" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-zinc-400" />
          )}
        </button>

        {/* QR button + popover */}
        <div className="relative" ref={qrRef}>
          <button
            type="button"
            onClick={() => { setShowQr((v) => !v); setShowThemePicker(false); }}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-zinc-400 hover:text-zinc-200 transition btn-press"
            title="Código QR"
            aria-label="Mostrar QR"
          >
            <QrCode className="w-4 h-4" />
          </button>
          {showQr && joinUrl ? (
            <div className="absolute top-full left-0 mt-2 z-50 p-4 rounded-2xl bg-[#0d0f14] ring-1 ring-white/10 shadow-xl flex flex-col gap-3 min-w-[200px]">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Escanea para unirte</span>
                <button
                  type="button"
                  onClick={() => setShowQr(false)}
                  className="text-zinc-500 hover:text-zinc-200 transition"
                  aria-label="Cerrar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="p-2 rounded-xl bg-white self-center">
                <QRCodeSVG value={joinUrl} size={140} />
              </div>
              <span className="text-[10px] text-zinc-500 text-center break-all">
                {joinUrl.replace(/^https?:\/\//, "")}
              </span>
            </div>
          ) : null}
        </div>

        {/* Theme button + popover */}
        <div className="relative" ref={themeRef}>
          <button
            type="button"
            onClick={() => { setShowThemePicker((v) => !v); setShowQr(false); }}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-zinc-400 hover:text-zinc-200 transition btn-press"
            title="Tema de mesa"
            aria-label="Tema de mesa"
          >
            <Palette className="w-4 h-4" />
          </button>
          {showThemePicker ? (
            <div className="absolute top-full left-0 mt-2 z-50 p-3 rounded-2xl bg-[#0d0f14] ring-1 ring-white/10 shadow-xl min-w-[220px]">
              <TableThemePicker value={theme} onChange={(id) => { onThemeChange(id); setShowThemePicker(false); }} />
            </div>
          ) : null}
        </div>
      </header>

      {/* Table fills remaining height */}
      <div className="flex-1 min-h-0 overflow-hidden px-3 py-2">
        <div className="h-full">
          <PokerTable
            sync={{ roomCode: code, ownersMap }}
            playersOverride={lobbyAsPlayers}
            theme={theme}
          />
        </div>
      </div>
    </div>
  );
}
