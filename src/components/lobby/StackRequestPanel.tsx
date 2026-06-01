"use client";
import { useState } from "react";
import {
  Check,
  X,
  Lock,
  Unlock,
  UserX,
  ChevronUp,
  ChevronDown,
  Coins,
  RefreshCw,
  Pause,
  Play,
  Pencil,
  Shuffle,
  Crown,
} from "lucide-react";
import { randomSeed } from "@/lib/dicebear";
import { Avatar } from "@/components/players/Avatar";
import { formatChips } from "@/lib/betting";
import type { NormalLobbyPlayer } from "@/lib/normalRooms";
import {
  approveJoin,
  patchLobbyPlayer,
  setTableLocked,
  patchNormalRoom,
} from "@/lib/normalRooms";
import {
  rejectStackRequest,
  dismissStackRequest,
  type StackRequest,
} from "@/lib/stackRequests";
import type { NormalSeat } from "@/lib/betting";
import type { RoomConfig } from "@/lib/betting";

type Props = {
  code: string;
  requests: StackRequest[];
  lobby: NormalLobbyPlayer[];
  gameSeats: NormalSeat[] | null;
  config: RoomConfig;
  locked: boolean;
  hostUid?: string | null;
  selfUid?: string | null;
  // Modelo economico de la sala. En "coins" mostramos el wallet de cada jugador
  // y atajos "Máx" al ajustar su stack.
  economy?: "coins" | "casual";
  // Monedas disponibles del wallet por uid (solo modo coins).
  walletByUid?: Record<string, number>;
  onAdjustChips: (uid: string, delta: number) => void;
  onSetAllChips: (amount: number) => void;
  onKick: (uid: string) => Promise<void>;
};

function ApproveRow({
  code,
  req,
  config,
}: {
  code: string;
  req: StackRequest;
  config: RoomConfig;
}) {
  const [amount, setAmount] = useState(req.requestedStack);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    setLoading(true);
    try {
      if (req.type === "join") {
        await approveJoin(code, req.uid, req.name, req.seed, amount);
      } else {
        // rebuy: add to pendingRebuys
        await patchNormalRoom(code, {
          [`pendingRebuys.${req.uid}`]: amount,
        });
      }
      await dismissStackRequest(code, req.uid);
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    setLoading(true);
    try {
      await rejectStackRequest(code, req.uid, rejectReason || undefined);
    } finally {
      setLoading(false);
    }
  }

  const isRebuy = req.type === "rebuy";

  return (
    <li className="flex flex-col gap-2 p-3 rounded-xl glass ring-1 ring-white/8">
      <div className="flex items-center gap-2">
        <Avatar seed={req.seed} size={28} />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-zinc-100 truncate font-medium">
            {req.name}
          </div>
          <div className="text-[11px] text-zinc-500 flex items-center gap-1">
            {isRebuy ? (
              <RefreshCw className="w-3 h-3" />
            ) : (
              <Coins className="w-3 h-3" />
            )}
            {isRebuy ? "Rebuy" : "Entrada"} ·{" "}
            {formatChips(req.requestedStack)} solicitados
          </div>
        </div>
      </div>

      {showReject ? (
        <div className="flex flex-col gap-1.5">
          <input
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Razón (opcional)"
            className="px-2.5 py-1.5 rounded-lg bg-black/40 ring-1 ring-white/10 text-zinc-100 text-xs outline-none focus:ring-rose-400/40"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleReject}
              disabled={loading}
              className="flex-1 px-3 py-1.5 rounded-lg bg-rose-500/20 ring-1 ring-rose-400/30 text-rose-200 text-xs hover:bg-rose-500/30 disabled:opacity-40 transition"
            >
              Confirmar rechazo
            </button>
            <button
              type="button"
              onClick={() => setShowReject(false)}
              className="px-3 py-1.5 rounded-lg glass ring-1 ring-white/10 text-zinc-400 text-xs hover:bg-white/10 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Math.max(1, Number(e.target.value)))}
            min={1}
            step={100}
            className="w-24 px-2.5 py-1.5 rounded-lg bg-black/40 ring-1 ring-white/10 text-zinc-100 text-xs outline-none focus:ring-accent-500/40 tabular-nums"
          />
          <button
            type="button"
            onClick={() => setAmount(config.startingStack)}
            className="px-2 py-1.5 rounded-lg glass ring-1 ring-white/8 text-zinc-400 text-[10px] hover:bg-white/10 transition"
          >
            Std
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setShowReject(true)}
            disabled={loading}
            className="p-1.5 rounded-lg glass ring-1 ring-white/8 text-rose-400 hover:bg-rose-500/10 disabled:opacity-40 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={loading}
            className="p-1.5 rounded-lg bg-accent-500/10 ring-1 ring-accent-400/25 text-accent-300 hover:bg-accent-500/18 disabled:opacity-40 transition"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </li>
  );
}

function PlayerRow({
  seat,
  lobbyPlayer,
  code,
  isHost,
  isSelf,
  economy = "coins",
  wallet,
  onAdjust,
  onKick,
}: {
  seat: NormalSeat | null;
  lobbyPlayer: NormalLobbyPlayer;
  code: string;
  isHost: boolean;
  isSelf: boolean;
  economy?: "coins" | "casual";
  wallet?: number;
  onAdjust: (uid: string, delta: number) => void;
  onKick: (uid: string) => Promise<void>;
}) {
  const [editName, setEditName] = useState(false);
  const [nameDraft, setNameDraft] = useState(lobbyPlayer.name);
  const [stackOpen, setStackOpen] = useState(false);
  const [setAmount, setSetAmount] = useState<string>(
    String(seat?.chips ?? lobbyPlayer.chips),
  );
  const chips = seat?.chips ?? lobbyPlayer.chips;
  const isOut = seat?.status === "out";

  async function handleKick() {
    if (!confirm(`¿Expulsar a ${lobbyPlayer.name}?`)) return;
    await onKick(lobbyPlayer.uid);
  }

  async function handleToggleSitOut() {
    await patchLobbyPlayer(code, lobbyPlayer.uid, {
      sittingOut: !lobbyPlayer.sittingOut,
    }).catch(() => {});
  }

  async function handleSaveName() {
    const v = nameDraft.trim().slice(0, 24);
    if (!v) return setEditName(false);
    await patchLobbyPlayer(code, lobbyPlayer.uid, { name: v }).catch(() => {});
    setEditName(false);
  }

  async function handleShuffleAvatar() {
    await patchLobbyPlayer(code, lobbyPlayer.uid, { seed: randomSeed() }).catch(() => {});
  }

  function adjust(delta: number) {
    if (!seat) {
      patchLobbyPlayer(code, lobbyPlayer.uid, { chips: Math.max(0, chips + delta) }).catch(() => {});
    } else {
      onAdjust(lobbyPlayer.uid, delta);
    }
  }

  function handleSetChips() {
    const val = Math.max(0, Number(setAmount) || 0);
    if (!seat) {
      patchLobbyPlayer(code, lobbyPlayer.uid, { chips: val }).catch(() => {});
    } else {
      onAdjust(lobbyPlayer.uid, val - chips);
    }
    setStackOpen(false);
  }

  return (
    <li
      className={`rounded-2xl ring-1 transition overflow-hidden ${
        isOut
          ? "bg-white/[0.02] ring-white/5 opacity-50"
          : "bg-white/[0.03] ring-white/8 hover:ring-white/12"
      }`}
    >
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={isSelf ? handleShuffleAvatar : undefined}
          className={`relative ${isSelf ? "hover:opacity-80 transition cursor-pointer" : ""}`}
          title={isSelf ? "Cambiar avatar" : undefined}
        >
          <Avatar seed={lobbyPlayer.seed} size={36} />
          {isSelf && (
            <div className="absolute -bottom-0.5 -right-0.5 p-0.5 rounded-full bg-zinc-900 ring-1 ring-white/10">
              <Shuffle className="w-2.5 h-2.5 text-accent-400" />
            </div>
          )}
        </button>

        <div className="flex-1 min-w-0">
          {editName ? (
            <div className="flex items-center gap-1">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") setEditName(false);
                }}
                maxLength={24}
                autoFocus
                className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-black/50 ring-1 ring-accent-400/25 text-zinc-100 text-sm outline-none"
              />
              <button
                type="button"
                onClick={handleSaveName}
                className="p-1 rounded-lg bg-accent-500/10 ring-1 ring-accent-400/25 text-accent-300 hover:bg-accent-500/15 transition"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-zinc-100 truncate">
                {lobbyPlayer.name}
              </span>
              {isHost && <Crown className="w-3 h-3 text-accent-400 flex-shrink-0" />}
              {isSelf && (
                <button
                  type="button"
                  onClick={() => {
                    setNameDraft(lobbyPlayer.name);
                    setEditName(true);
                  }}
                  className="p-0.5 rounded text-zinc-500 hover:text-zinc-200 transition"
                  title="Editar nombre"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs tabular-nums text-accent-300 font-mono font-bold">
              {formatChips(chips)}
            </span>
            {lobbyPlayer.sittingOut && (
              <span className="text-[9px] uppercase tracking-widest text-zinc-500 bg-white/5 px-1.5 py-0.5 rounded-full font-bold">
                Away
              </span>
            )}
            {seat?.status === "all-in" && (
              <span className="text-[9px] uppercase tracking-widest text-accent-300 bg-accent-400/10 px-1.5 py-0.5 rounded-full font-bold">
                All-in
              </span>
            )}
            {seat?.status === "folded" && (
              <span className="text-[9px] uppercase tracking-widest text-zinc-500 bg-white/5 px-1.5 py-0.5 rounded-full font-bold">
                Fold
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {!isOut && (
            <button
              type="button"
              onClick={() => setStackOpen((v) => !v)}
              title="Ajustar stack"
              className={`p-1.5 rounded-lg ring-1 transition ${
                stackOpen
                  ? "bg-accent-500/10 ring-accent-400/25 text-accent-300"
                  : "bg-white/5 ring-white/10 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={handleToggleSitOut}
            title={lobbyPlayer.sittingOut ? "Reactivar" : "Sentar fuera"}
            className="p-1.5 rounded-lg bg-white/5 ring-1 ring-white/10 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition"
          >
            {lobbyPlayer.sittingOut ? (
              <Play className="w-3.5 h-3.5" />
            ) : (
              <Pause className="w-3.5 h-3.5" />
            )}
          </button>
          {!isSelf && (
            <button
              type="button"
              onClick={handleKick}
              title="Expulsar"
              className="p-1.5 rounded-lg bg-white/5 ring-1 ring-white/10 text-rose-400/60 hover:bg-rose-500/10 hover:text-rose-400 transition"
            >
              <UserX className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {stackOpen && !isOut && (
        <div className="px-3 pb-3 flex flex-col gap-2 animate-in slide-in-from-top-1 fade-in duration-200">
          {economy === "coins" && wallet !== undefined && (
            <div className="flex items-center justify-between gap-2 text-[10px]">
              <span className="text-zinc-500">
                Wallet:{" "}
                <span className="text-accent-300 font-bold tabular-nums">
                  {formatChips(wallet)}
                </span>{" "}
                disponibles
              </span>
              <button
                type="button"
                onClick={() => setSetAmount(String(chips + wallet))}
                disabled={wallet <= 0}
                className="px-2 py-1 rounded-lg bg-accent-500/10 ring-1 ring-accent-400/25 text-accent-300 text-[10px] font-bold uppercase tracking-widest hover:bg-accent-500/18 disabled:opacity-30 transition"
                title="Fijar al maximo del wallet (fichas actuales + disponible)"
              >
                Máx
              </button>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            {[-1000, -500, -100, 100, 500, 1000].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => adjust(d)}
                className={`flex-1 px-1 py-1.5 rounded-lg text-[10px] font-bold tabular-nums transition ring-1 ${
                  d < 0
                    ? "bg-rose-500/5 ring-rose-400/20 text-rose-300 hover:bg-rose-500/15"
                    : "bg-accent-500/5 ring-accent-400/18 text-accent-300 hover:bg-accent-500/10"
                }`}
              >
                {d > 0 ? "+" : ""}
                {d >= 1000 || d <= -1000 ? `${d / 1000}K` : d}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              inputMode="numeric"
              value={setAmount}
              onChange={(e) => setSetAmount(e.target.value.replace(/[^0-9]/g, ""))}
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-black/50 ring-1 ring-white/10 text-zinc-100 text-xs outline-none tabular-nums focus:ring-accent-500/40"
              placeholder="Fijar stack..."
            />
            <button
              type="button"
              onClick={handleSetChips}
              className="px-3 py-1.5 rounded-lg bg-accent-500/10 ring-1 ring-accent-400/25 text-accent-300 text-[11px] font-bold uppercase tracking-widest hover:bg-accent-500/15 transition btn-press"
            >
              Fijar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export function StackRequestPanel({
  code,
  requests,
  lobby,
  gameSeats,
  config,
  locked,
  hostUid,
  selfUid,
  economy = "coins",
  walletByUid,
  onAdjustChips,
  onSetAllChips,
  onKick,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [setAllAmount, setSetAllAmount] = useState(config.startingStack);

  const pending = requests.filter((r) => r.status === "pending");
  const hasNotifs = pending.length > 0;

  return (
    <div className="rounded-2xl glass overflow-hidden">
      <div
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-200 font-medium">Jugadores</span>
          {hasNotifs && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent-400 text-accent-950 text-[10px] font-bold">
              {pending.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setTableLocked(code, !locked).catch(() => {});
            }}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] ring-1 transition ${
              locked
                ? "bg-rose-500/20 ring-rose-400/30 text-rose-300 hover:bg-rose-500/30"
                : "glass ring-white/10 text-zinc-400 hover:bg-white/10"
            }`}
          >
            {locked ? (
              <>
                <Lock className="w-3 h-3" /> Cerrada
              </>
            ) : (
              <>
                <Unlock className="w-3 h-3" /> Abierta
              </>
            )}
          </button>
          <div className="p-1">
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-zinc-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-500" />
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-4">
          {/* Pending requests */}
          {pending.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-accent-400">
                Solicitudes pendientes
              </span>
              <ul className="flex flex-col gap-2">
                {pending.map((req) => (
                  <ApproveRow
                    key={req.uid}
                    code={code}
                    req={req}
                    config={config}
                  />
                ))}
              </ul>
            </div>
          )}

          {/* Active players */}
          {lobby.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                En sala ({lobby.length})
              </span>
              <ul className="flex flex-col gap-2">
                {lobby.map((p) => (
                  <PlayerRow
                    key={p.uid}
                    seat={gameSeats?.find((s) => s.id === p.uid) ?? null}
                    lobbyPlayer={p}
                    code={code}
                    isHost={!!hostUid && p.uid === hostUid}
                    isSelf={!!selfUid && p.uid === selfUid}
                    economy={economy}
                    wallet={walletByUid?.[p.uid]}
                    onAdjust={onAdjustChips}
                    onKick={onKick}
                  />
                ))}
              </ul>
            </div>
          )}

          {/* Set all chips */}
          {lobby.length > 0 && (
            <div className="flex flex-col gap-2 pt-2 border-t border-white/8">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">
                Igualar stack a todos
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={setAllAmount}
                  onChange={(e) =>
                    setSetAllAmount(Math.max(1, Number(e.target.value)))
                  }
                  min={1}
                  step={100}
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-black/40 ring-1 ring-white/10 text-zinc-100 text-xs outline-none tabular-nums focus:ring-accent-500/40"
                />
                <button
                  type="button"
                  onClick={() => onSetAllChips(setAllAmount)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-accent-500/10 ring-1 ring-accent-400/25 text-accent-300 text-[11px] font-bold uppercase tracking-widest hover:bg-accent-500/15 transition btn-press"
                >
                  Aplicar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
