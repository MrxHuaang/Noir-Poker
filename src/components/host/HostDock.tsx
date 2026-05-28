"use client";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Check,
  Copy,
  Download,
  Palette,
  Settings,
  Users,
  X as CloseIcon,
  Menu,
  QrCode,
  History,
  Trophy,
  LogOut,
  Plus,
} from "lucide-react";
import Link from "next/link";
import type { HandRecord } from "@/lib/handHistory";
import { formatChips } from "@/lib/betting";
import { CATEGORY_LABEL } from "@/lib/handEval";
import { StackRequestPanel } from "@/components/lobby/StackRequestPanel";
import { NormalConfigPanel } from "@/components/betting/NormalConfigPanel";
import { TournamentConfigPanel } from "@/components/betting/TournamentConfigPanel";
import { TableThemePicker } from "@/components/themes/TableThemePicker";
import { CardBackPicker } from "@/components/themes/CardBackPicker";
import { CardFacePicker } from "@/components/themes/CardFacePicker";
import type { NormalLobbyPlayer } from "@/lib/normalRooms";
import { setNormalRoomTheme, setNormalRoomCardBack, setNormalRoomCardFace } from "@/lib/normalRooms";
import type { CardBackId, CardFaceId } from "@/lib/themes";
import type { StackRequest } from "@/lib/stackRequests";
import type { NormalSeat, RoomConfig } from "@/lib/betting";
import type { TableThemeId } from "@/lib/themes";

// Tiny inline card badge — rank + suit glyph without PlayingCard overhead.
function MiniCard({ id }: { id: string }) {
  const rank = id.length === 3 ? id.slice(0, 2) : id.slice(0, 1);
  const suit = id.slice(-1) as "S" | "H" | "D" | "C";
  const glyph = { S: "♠", H: "♥", D: "♦", C: "♣" }[suit] ?? suit;
  const isRed = suit === "H" || suit === "D";
  const rankLabel = rank === "T" ? "10" : rank;
  return (
    <span
      className={`inline-flex items-center gap-0 text-[9px] font-black leading-none px-1 py-0.5 rounded bg-white/10 tabular-nums ${
        isRed ? "text-rose-400" : "text-zinc-200"
      }`}
    >
      {rankLabel}{glyph}
    </span>
  );
}

function exportHistory(history: HandRecord[], code: string) {
  const blob = new Blob(
    [JSON.stringify(history, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `historial-${code}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

type Tab = "sala" | "config" | "tema" | "jugadores" | "historial";

type Props = {
  code: string | null;
  joinUrl: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  initialTab?: Tab;

  config: RoomConfig;
  onConfigChange: (c: RoomConfig) => void;

  theme: TableThemeId;
  cardBack: CardBackId;
  cardFace?: CardFaceId;

  lobby: NormalLobbyPlayer[];
  requests: StackRequest[];
  gameSeats: NormalSeat[] | null;
  locked: boolean;
  hostUid?: string | null;
  selfUid?: string | null;
  history?: HandRecord[];
  onAdjustChips: (uid: string, delta: number) => void;
  onSetAllChips: (amount: number) => void;
  onKick: (uid: string) => Promise<void>;
};

export function HostDock({
  code,
  joinUrl,
  open,
  onOpen,
  onClose,
  initialTab = "sala",
  config,
  onConfigChange,
  theme,
  cardBack,
  cardFace = "classic",
  lobby,
  requests,
  gameSeats,
  locked,
  hostUid,
  selfUid,
  history,
  onAdjustChips,
  onSetAllChips,
  onKick,
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [copied, setCopied] = useState(false);

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  function copy() {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="relative p-3 rounded-2xl glass hover:bg-white/10 ring-1 ring-white/10 text-zinc-300 transition btn-press shadow-xl"
      >
        <Menu className="w-5 h-5" />
        {pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-amber-400 text-amber-950 text-[10px] font-black flex items-center justify-center">
            {pendingCount}
          </span>
        )}
      </button>
    );
  }

  const TABS: { id: Tab; label: string; Icon: typeof Menu; badge?: number }[] = [
    { id: "sala", label: "Sala", Icon: QrCode },
    { id: "jugadores", label: "Jugadores", Icon: Users, badge: pendingCount },
    { id: "historial", label: "Historial", Icon: History },
    { id: "config", label: "Config", Icon: Settings },
    { id: "tema", label: "Tema", Icon: Palette },
  ];

  return (
    <div className="w-[380px] max-w-[92vw] max-h-[calc(100vh-32px)] bg-zinc-900/95 backdrop-blur-xl ring-1 ring-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-left-4 fade-in duration-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h2 className="text-sm font-black uppercase tracking-widest text-white">
          Mesa {code ?? "—"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-white/10 text-zinc-500 hover:text-white transition"
        >
          <CloseIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-1 px-2 pt-2 overflow-x-auto custom-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            title={t.label}
            className={`relative flex-shrink-0 inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition ${
              tab === t.id
                ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
            }`}
          >
            <t.Icon className="w-3.5 h-3.5" />
            <span>{t.label}</span>
            {t.badge ? (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-400 text-amber-950 text-[9px] font-black flex items-center justify-center">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4">
        {tab === "sala" && (
          <div className="flex flex-col gap-4 animate-in fade-in duration-200">
            <div className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-black/40 ring-1 ring-white/5">
              <div className="p-2 bg-white rounded-xl">
                {joinUrl ? <QRCodeSVG value={joinUrl} size={140} /> : null}
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-black">
                  Código
                </span>
                <button
                  type="button"
                  onClick={copy}
                  className="text-3xl font-mono font-black text-emerald-400 tracking-wider flex items-center gap-2 hover:opacity-80 transition"
                >
                  {code ?? "—"}
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-300" />
                  ) : (
                    <Copy className="w-4 h-4 text-zinc-600" />
                  )}
                </button>
                {joinUrl && (
                  <span className="text-[10px] text-zinc-600 truncate max-w-[260px]">
                    {joinUrl}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/host"
                className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-zinc-300 text-[11px] font-bold uppercase tracking-wider transition btn-press"
              >
                <Plus className="w-3.5 h-3.5" /> Otra sala
              </Link>
              <Link
                href="/"
                onClick={(e) => {
                  if (!confirm("¿Salir de la sala? Los jugadores perderán el host.")) {
                    e.preventDefault();
                  }
                }}
                className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 ring-1 ring-rose-400/20 text-rose-300 text-[11px] font-bold uppercase tracking-wider transition btn-press"
              >
                <LogOut className="w-3.5 h-3.5" /> Salir
              </Link>
            </div>
          </div>
        )}

        {tab === "config" && (
          <div className="animate-in fade-in duration-200">
            {config.mode === "torneo" ? (
              <TournamentConfigPanel config={config} onChange={onConfigChange} />
            ) : (
              <NormalConfigPanel
                config={config}
                onChange={onConfigChange}
                onClose={() => setTab("sala")}
              />
            )}
          </div>
        )}

        {tab === "tema" && (
          <div className="animate-in fade-in duration-200 flex flex-col gap-4">
            <div className="p-4 rounded-2xl bg-black/40 ring-1 ring-white/5 flex flex-col gap-2">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">
                Tema de mesa
              </span>
              <TableThemePicker
                value={theme}
                onChange={(id) => {
                  if (code) setNormalRoomTheme(code, id).catch(() => {});
                }}
              />
            </div>
            <div className="p-4 rounded-2xl bg-black/40 ring-1 ring-white/5 flex flex-col gap-2">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">
                Diseño de carta
              </span>
              <CardFacePicker
                value={cardFace}
                onChange={(id) => {
                  if (code) setNormalRoomCardFace(code, id).catch(() => {});
                }}
              />
            </div>
            <div className="p-4 rounded-2xl bg-black/40 ring-1 ring-white/5 flex flex-col gap-2">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">
                Reverso de cartas
              </span>
              <CardBackPicker
                value={cardBack}
                onChange={(id) => {
                  if (code) setNormalRoomCardBack(code, id).catch(() => {});
                }}
              />
            </div>
          </div>
        )}

        {tab === "historial" && (
          <div className="animate-in fade-in duration-200 flex flex-col gap-2">
            {/* Export button */}
            {history && history.length > 0 && code && (
              <button
                type="button"
                onClick={() => exportHistory(history, code)}
                className="self-end inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 ring-1 ring-white/10 text-zinc-400 hover:text-zinc-100 hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest transition"
              >
                <Download className="w-3 h-3" /> Exportar JSON
              </button>
            )}

            {(!history || history.length === 0) && (
              <div className="text-center py-8 text-zinc-600 text-xs">
                Sin manos jugadas
              </div>
            )}

            {history?.map((h) => (
              <div
                key={h.id}
                className="p-3 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.08] flex flex-col gap-2"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-widest font-black text-zinc-500">
                    Mano #{h.handNum}
                    {h.runTotal != null && h.runTotal > 1
                      ? ` · Run ${(h.runIndex ?? 0) + 1}/${h.runTotal}`
                      : ""}
                  </span>
                  <span className="text-[10px] tabular-nums text-emerald-400 font-black">
                    {formatChips(h.pot)}
                  </span>
                </div>

                {/* Board (community cards) */}
                {h.community.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {h.community.map((id) => (
                      <MiniCard key={id} id={id} />
                    ))}
                  </div>
                )}

                {/* Winner(s) */}
                <div className="flex items-center gap-2">
                  <Trophy className="w-3 h-3 text-amber-400 flex-shrink-0" />
                  <span className="text-xs text-zinc-100 font-bold truncate">
                    {h.winners
                      .map((w) => `${w.name} +${formatChips(w.amount)}`)
                      .join(" · ")}
                  </span>
                </div>

                {/* Hand category */}
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                  {CATEGORY_LABEL[h.category]}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "jugadores" && code && (
          <div className="animate-in fade-in duration-200">
            <StackRequestPanel
              code={code}
              requests={requests}
              lobby={lobby}
              gameSeats={gameSeats}
              config={config}
              locked={locked}
              hostUid={hostUid ?? null}
              selfUid={selfUid ?? null}
              onAdjustChips={onAdjustChips}
              onSetAllChips={onSetAllChips}
              onKick={onKick}
            />
          </div>
        )}
      </div>
    </div>
  );
}
