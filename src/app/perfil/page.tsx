"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  Check,
  Coins,
  Gift,
  History,
  LogOut,
  Pencil,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { BorderGlow } from "@/components/ui/BorderGlow";
import { Avatar } from "@/components/players/Avatar";
import { useAuth } from "@/hooks/useAuth";
import {
  claimDailyBonus,
  getHistory,
  updateProfileFields,
  type HistoryRecord,
} from "@/lib/users";
import { levelProgress, rankForLevel, MAX_LEVEL } from "@/lib/progression";
import {
  availableCoins,
  dailyBonusReady,
  escrowedTotal,
} from "@/lib/economy";
import { formatChips } from "@/lib/betting";
import { randomSeed } from "@/lib/dicebear";

export default function PerfilPage() {
  const { user, profile, isGuest, signOut } = useAuth();
  const scope = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [draftNick, setDraftNick] = useState("");
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);

  const uid = user?.uid ?? null;
  const prog = profile ? levelProgress(profile.xp) : null;
  const rank = prog ? rankForLevel(prog.level) : null;

  useEffect(() => {
    if (!uid || isGuest) return;
    getHistory(uid).then(setHistory).catch(() => setHistory([]));
  }, [uid, isGuest, profile?.gamesPlayed]);

  // Barra de XP animada (respeta prefers-reduced-motion).
  useGSAP(
    () => {
      if (!prog) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          ".xp-fill",
          { width: "0%" },
          { width: `${prog.ratio * 100}%`, duration: 1.1, ease: "power3.out" },
        );
      });
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(".xp-fill", { width: `${prog.ratio * 100}%` });
      });
      return () => mm.revert();
    },
    { scope, dependencies: [prog?.ratio, prog?.level] },
  );

  if (isGuest || !profile) {
    return (
      <div className="relative isolate min-h-full w-full flex items-center justify-center px-4 py-12">
        <div className="relative z-[2] w-full max-w-md">
          <BorderGlow
            className="w-full"
            edgeSensitivity={26}
            glowColor="0 0 82"
            backgroundColor="rgba(9,9,11,0.9)"
            borderRadius={24}
            glowRadius={36}
            glowIntensity={1.05}
            coneSpread={22}
            animated
            colors={["#ededf2", "#a0a0a8", "#52525b"]}
            fillOpacity={0.4}
          >
            <div className="flex flex-col gap-5 p-8 text-center">
              <Sparkles className="w-7 h-7 mx-auto text-zinc-300" />
              <div>
                <h1 className="text-xl font-semibold text-zinc-50">
                  Crea tu cuenta
                </h1>
                <p className="text-sm text-zinc-400 mt-2">
                  Inicia sesion para tener perfil, monedas, rango por experiencia
                  e historial de partidas.
                </p>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-white text-black font-bold text-sm uppercase tracking-widest hover:bg-zinc-200 transition btn-press"
              >
                Iniciar sesion
              </Link>
            </div>
          </BorderGlow>
        </div>
      </div>
    );
  }

  const memberSince = new Date(profile.createdAt).toLocaleDateString("es", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const winRate =
    profile.handsPlayed > 0
      ? Math.round((profile.handsWon / profile.handsPlayed) * 100)
      : 0;
  const locked = escrowedTotal(profile.escrows);
  const bonusReady = dailyBonusReady(profile.lastDailyBonus, Date.now());

  async function saveNick() {
    if (!uid) return;
    const next = draftNick.trim();
    if (next.length >= 2 && next.length <= 24) {
      await updateProfileFields(uid, { nickname: next });
    }
    setEditing(false);
  }

  async function regenAvatar() {
    if (!uid) return;
    await updateProfileFields(uid, { avatarSeed: randomSeed() });
  }

  async function onClaim() {
    if (!uid) return;
    setClaiming(true);
    setClaimMsg(null);
    try {
      const granted = await claimDailyBonus(uid);
      setClaimMsg(
        granted > 0
          ? `+${formatChips(granted)} monedas`
          : "Vuelve manhana por tu bono",
      );
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div ref={scope} className="relative isolate min-h-full w-full">
      <div className="relative z-[2] w-full max-w-3xl mx-auto px-4 py-10 sm:py-14 flex flex-col gap-5">
        {/* Cabecera de identidad */}
        <BorderGlow
          className="w-full"
          edgeSensitivity={24}
          glowColor="0 0 82"
          backgroundColor="rgba(9,9,11,0.9)"
          borderRadius={24}
          glowRadius={34}
          glowIntensity={1}
          coneSpread={22}
          animated={false}
          colors={["#ededf2", "#a0a0a8", "#52525b"]}
          fillOpacity={0.4}
        >
          <div className="flex flex-col sm:flex-row items-center gap-5 p-6 sm:p-7">
            <div className="relative shrink-0">
              {profile.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.photoURL}
                  alt={profile.nickname}
                  className="w-20 h-20 rounded-full ring-1 ring-white/15 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Avatar seed={profile.avatarSeed} size={80} />
              )}
              {!profile.photoURL && (
                <button
                  type="button"
                  onClick={regenAvatar}
                  title="Cambiar avatar"
                  className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-zinc-900 ring-1 ring-white/20 text-zinc-300 hover:text-white hover:ring-white/40 transition btn-press"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex-1 min-w-0 text-center sm:text-left">
              {editing ? (
                <div className="flex items-center gap-2 justify-center sm:justify-start">
                  <input
                    autoFocus
                    value={draftNick}
                    onChange={(e) => setDraftNick(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveNick();
                      if (e.key === "Escape") setEditing(false);
                    }}
                    maxLength={24}
                    className="bg-white/[0.06] ring-1 ring-white/20 rounded-lg px-3 py-1.5 text-lg font-semibold text-zinc-50 outline-none focus:ring-white/40 w-48"
                  />
                  <button
                    type="button"
                    onClick={saveNick}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-zinc-100 transition btn-press"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 justify-center sm:justify-start">
                  <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 truncate">
                    {profile.nickname}
                  </h1>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftNick(profile.nickname);
                      setEditing(true);
                    }}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-500 hover:text-zinc-200 transition"
                    title="Editar apodo"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              )}
              <p className="text-xs text-zinc-500 mt-1">
                {profile.email ?? "Cuenta de invitado"} · desde {memberSince}
              </p>
              {rank && (
                <span className="inline-flex items-center gap-2 mt-2 text-[10px] uppercase tracking-[0.2em] px-2 py-1 rounded-full ring-1 bg-white/[0.05] text-zinc-300 ring-white/15">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={rank.emblem} alt={rank.name} className="w-5 h-5 object-contain" />
                  {rank.name}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={signOut}
              className="self-start sm:self-center inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white/[0.04] hover:bg-white/10 ring-1 ring-white/10 text-zinc-400 hover:text-zinc-200 text-[11px] font-bold uppercase tracking-widest transition btn-press"
            >
              <LogOut className="w-3.5 h-3.5" />
              Salir
            </button>
          </div>
        </BorderGlow>

        {/* Rango / XP */}
        {prog && rank && (
          <Card>
            <div className="flex items-center gap-5 mb-5">
              {/* Escudo del rango */}
              <div className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={rank.emblem}
                  alt={rank.name}
                  className="w-20 h-20 object-contain drop-shadow-[0_0_18px_rgba(167,139,250,0.35)]"
                />
                <span className="absolute -bottom-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full bg-zinc-900 ring-2 ring-zinc-950 text-[10px] font-black text-zinc-100 flex items-center justify-center tabular-nums">
                  {prog.level}
                </span>
              </div>

              {/* Info del rango */}
              <div className="flex-1 min-w-0">
                <div className="text-xl font-bold tracking-tight text-zinc-50">
                  {rank.name}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  Nivel {prog.level}{prog.level >= MAX_LEVEL ? " · Máximo" : ""}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-sm font-semibold text-zinc-200 tabular-nums">
                    {formatChips(profile.xp)} XP
                  </span>
                  {!prog.isMax && (
                    <span className="text-[11px] text-zinc-500">
                      {formatChips(prog.span - prog.xpIntoLevel)} para nivel {prog.level + 1}
                    </span>
                  )}
                </div>
                <div className="mt-2 h-2 rounded-full bg-white/[0.06] overflow-hidden ring-1 ring-white/10">
                  <div
                    className="xp-fill h-full rounded-full bg-gradient-to-r from-violet-400 to-violet-200 shadow-[0_0_12px_rgba(167,139,250,0.5)]"
                    style={{ width: `${prog.ratio * 100}%` }}
                  />
                </div>
              </div>
            </div>
            <p className="text-[11px] text-zinc-600">
              Ganas experiencia por jugar manos y completar partidas. Cuanto mas juegas, mas subes.
            </p>
          </Card>
        )}

        {/* Wallet */}
        <Card>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-white/[0.06] ring-1 ring-white/15 text-zinc-100">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xl font-bold text-zinc-50 tabular-nums">
                  {formatChips(availableCoins(profile))}
                </div>
                <div className="text-xs text-zinc-500">
                  monedas disponibles
                  {locked > 0 && (
                    <span className="text-zinc-400">
                      {" "}
                      · {formatChips(locked)} en juego
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={onClaim}
                disabled={claiming || !bonusReady}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black font-bold text-xs uppercase tracking-widest hover:bg-zinc-200 transition btn-press disabled:opacity-50 disabled:hover:bg-white"
              >
                <Gift className="w-4 h-4" />
                {bonusReady ? "Bono diario" : "Bono reclamado"}
              </button>
              {claimMsg && (
                <span className="text-[11px] text-zinc-400">{claimMsg}</span>
              )}
            </div>
          </div>
        </Card>

        {/* Estadisticas */}
        <Card>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Partidas" value={profile.gamesPlayed} />
            <Stat label="Manos jugadas" value={profile.handsPlayed} />
            <Stat label="Manos ganadas" value={`${winRate}%`} />
            <Stat label="Bote mayor" value={formatChips(profile.biggestPot)} />
          </div>
        </Card>

        {/* Historial */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-200">
              Historial de partidas
            </h2>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4 text-center">
              Aun no has jugado ninguna partida online.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-white/[0.06]">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-200 truncate">
                      {h.roomName || "Sala"}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {new Date(h.ts).toLocaleDateString("es")} · {h.handsPlayed}{" "}
                      manos · +{h.xpGained} XP
                    </div>
                  </div>
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      h.net >= 0 ? "text-emerald-400/90" : "text-rose-400/90"
                    }`}
                  >
                    {h.net >= 0 ? "+" : ""}
                    {formatChips(h.net)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-zinc-950/80 ring-1 ring-white/[0.1] p-5 sm:p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-2xl font-bold text-zinc-50 tabular-nums">
        {value}
      </span>
      <span className="text-[11px] uppercase tracking-[0.15em] text-zinc-500">
        {label}
      </span>
    </div>
  );
}
