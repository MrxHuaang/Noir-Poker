"use client";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  QrCode,
  Users,
  History,
  Settings,
  Palette,
  Volume2,
  Copy,
  Check,
  Link2,
  Share2,
  Download,
  Trophy,
  PlayCircle,
  BarChart3,
} from "lucide-react";
import type { HandRecord } from "@/lib/handHistory";
import { HandReplayModal } from "@/components/history/HandReplayModal";
import { HudPanel } from "@/components/history/HudPanel";
import { formatChips } from "@/lib/betting";
import { CATEGORY_LABEL } from "@/lib/handEval";
import { StackRequestPanel } from "@/components/lobby/StackRequestPanel";
import { NormalConfigPanel } from "@/components/betting/NormalConfigPanel";
import { TournamentConfigPanel } from "@/components/betting/TournamentConfigPanel";
import { TableThemePicker } from "@/components/themes/TableThemePicker";
import { CardBackPicker } from "@/components/themes/CardBackPicker";
import { RoomBgPicker } from "@/components/themes/RoomBgPicker";
import {
  setNormalRoomTheme,
  setNormalRoomCardBack,
  setNormalRoomBg,
} from "@/lib/normalRooms";
import type { NormalLobbyPlayer } from "@/lib/normalRooms";
import type { StackRequest } from "@/lib/stackRequests";
import type { NormalSeat, RoomConfig } from "@/lib/betting";
import type { TableThemeId, CardBackId } from "@/lib/themes";
import { SettingsOverlay, type SettingsTab } from "./SettingsOverlay";
import { AudioVideoSettings } from "./AudioVideoSettings";

function exportHistory(history: HandRecord[], code: string) {
  const blob = new Blob([JSON.stringify(history, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `historial-${code}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

type Props = {
  code: string | null;
  joinUrl: string;
  onClose: () => void;
  config: RoomConfig;
  onConfigChange: (c: RoomConfig) => void;
  maxPlayers?: number;
  onMaxPlayersChange?: (n: number) => void;
  theme: TableThemeId;
  cardBack: CardBackId;
  roomBg?: string;
  lobby: NormalLobbyPlayer[];
  requests: StackRequest[];
  gameSeats: NormalSeat[] | null;
  locked: boolean;
  hostUid?: string | null;
  selfUid?: string | null;
  economy?: "coins" | "casual";
  walletByUid?: Record<string, number>;
  history?: HandRecord[];
  onAdjustChips: (uid: string, delta: number) => void;
  onSetAllChips: (amount: number) => void;
  onKick: (uid: string) => Promise<void>;
};

export function HostSettings(props: Props) {
  const { code, joinUrl, onClose, config, history } = props;
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [replayHand, setReplayHand] = useState<HandRecord | null>(null);
  const nameById: Record<string, string> = {};
  for (const p of props.lobby) nameById[p.uid] = p.name;
  for (const s of props.gameSeats ?? []) nameById[s.id] = s.name;
  const pendingCount = props.requests.filter((r) => r.status === "pending").length;
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
          <button
            type="button"
            onClick={() => copy(code ?? "", setCopied)}
            className="flex items-center gap-2 hover:opacity-80 transition"
            title="Copiar código"
          >
            <span className="text-4xl font-mono font-black tracking-[0.25em] text-zinc-50">
              {code ?? "—"}
            </span>
            {copied ? (
              <Check className="w-5 h-5 text-zinc-300" />
            ) : (
              <Copy className="w-5 h-5 text-zinc-600" />
            )}
          </button>
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
      badge: pendingCount,
      content: code ? (
        <StackRequestPanel
          code={code}
          requests={props.requests}
          lobby={props.lobby}
          gameSeats={props.gameSeats}
          config={config}
          locked={props.locked}
          hostUid={props.hostUid ?? null}
          selfUid={props.selfUid ?? null}
          economy={props.economy}
          walletByUid={props.walletByUid}
          onAdjustChips={props.onAdjustChips}
          onSetAllChips={props.onSetAllChips}
          onKick={props.onKick}
        />
      ) : null,
    },
    {
      id: "historial",
      label: "Historial",
      icon: <History className="w-3.5 h-3.5" />,
      content: (
        <div className="flex flex-col gap-2">
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
            <div className="text-center py-10 text-zinc-600 text-sm">
              Sin manos jugadas
            </div>
          )}
          {history?.map((h) => (
            <button
              type="button"
              key={h.id}
              onClick={() => setReplayHand(h)}
              className="text-left p-3 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.08] flex flex-col gap-1.5 hover:bg-white/[0.06] hover:ring-accent-400/30 transition"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest font-black text-zinc-500">
                  Mano #{h.handNum}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-[10px] tabular-nums text-zinc-300 font-black">
                    {formatChips(h.pot)}
                  </span>
                  <PlayCircle className="w-3.5 h-3.5 text-accent-300/70" />
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Trophy className="w-3 h-3 text-zinc-300 flex-shrink-0" />
                <span className="text-xs text-zinc-100 font-bold truncate">
                  {h.winners.map((w) => `${w.name} +${formatChips(w.amount)}`).join(" · ")}
                </span>
              </div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                {CATEGORY_LABEL[h.category]}
              </div>
            </button>
          ))}
        </div>
      ),
    },
    {
      id: "stats",
      label: "Stats",
      icon: <BarChart3 className="w-3.5 h-3.5" />,
      content: <HudPanel hands={history ?? []} nameById={nameById} />,
    },
    {
      id: "config",
      label: "Config",
      icon: <Settings className="w-3.5 h-3.5" />,
      content:
        config.mode === "torneo" ? (
          <TournamentConfigPanel config={config} onChange={props.onConfigChange} />
        ) : (
          <NormalConfigPanel
            config={config}
            onChange={props.onConfigChange}
            onClose={onClose}
            maxPlayers={props.maxPlayers}
            onMaxPlayersChange={props.onMaxPlayersChange}
          />
        ),
    },
    {
      id: "tema",
      label: "Tema",
      icon: <Palette className="w-3.5 h-3.5" />,
      content: (
        <div className="flex flex-col gap-4">
          <Section title="Fondo de sala">
            <RoomBgPicker
              value={props.roomBg ?? "onyx"}
              onChange={(id) => code && setNormalRoomBg(code, id).catch(() => {})}
            />
          </Section>
          <Section title="Tema de mesa">
            <TableThemePicker
              value={props.theme}
              onChange={(id) => code && setNormalRoomTheme(code, id).catch(() => {})}
            />
          </Section>
          <Section title="Reverso de cartas">
            <CardBackPicker
              value={props.cardBack}
              onChange={(id) => code && setNormalRoomCardBack(code, id).catch(() => {})}
            />
          </Section>
        </div>
      ),
    },
    {
      id: "audio",
      label: "Audio",
      icon: <Volume2 className="w-3.5 h-3.5" />,
      content: <AudioVideoSettings showMic={false} />,
    },
  ];

  return (
    <>
      <SettingsOverlay
        title={`Mesa ${code ?? "—"}`}
        tabs={tabs}
        initialTab="sala"
        onClose={onClose}
      />
      {replayHand && (
        <HandReplayModal
          key={replayHand.id}
          hand={replayHand}
          cardBack={props.cardBack}
          onClose={() => setReplayHand(null)}
        />
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-2xl bg-black/30 ring-1 ring-white/5 flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">
        {title}
      </span>
      {children}
    </div>
  );
}
