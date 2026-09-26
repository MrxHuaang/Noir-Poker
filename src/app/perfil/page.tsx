"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowRight, Check, Gift, LogOut, Pencil, RefreshCw } from "lucide-react";
import { Avatar } from "@/components/players/Avatar";
import { RankTowerModal } from "@/components/profile/RankTowerModal";
import { useAuth } from "@/hooks/useAuth";
import {
  claimDailyBonus,
  getHistory,
  updateProfileFields,
  type HistoryRecord,
} from "@/lib/users";
import { levelProgress, rankForLevel, MAX_LEVEL } from "@/lib/progression";
import {
  DAILY_BONUS,
  availableCoins,
  dailyBonusReady,
  escrowedTotal,
} from "@/lib/economy";
import { formatChips } from "@/lib/betting";
import { randomSeed } from "@/lib/dicebear";

const SHELL = "mx-auto w-full max-w-6xl px-5 sm:px-8";

export default function PerfilPage() {
  const { user, profile, isGuest, loading, signOut } = useAuth();
  const scope = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [draftNick, setDraftNick] = useState("");
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const uid = user?.uid ?? null;
  const prog = profile ? levelProgress(profile.xp) : null;
  const rank = prog ? rankForLevel(prog.level) : null;
  const [showTower, setShowTower] = useState(false);

  useEffect(() => {
    if (!uid || isGuest) return;
    getHistory(uid).then(setHistory).catch(() => setHistory([]));
  }, [uid, isGuest, profile?.gamesPlayed]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

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

  // Cuenta real con el perfil aun cargando: no mostrar "Crea tu cuenta".
  if ((loading || (user && !isGuest)) && !profile) {
    return (
      <div className={`${SHELL} pt-14 pb-24 sm:pt-20`}>
        <p role="status" className="text-sm text-muted">
          Cargando perfil…
        </p>
      </div>
    );
  }

  if (isGuest || !profile) {
    return (
      <div className={SHELL}>
        <section className="pt-14 pb-24 sm:pt-20 lg:pt-24">
          <p className="eyebrow mb-6 flex items-center gap-2">
            <span className="suit text-sm" aria-hidden>
              ♠
            </span>
            Perfil
          </p>
          <h1 className="display max-w-[16ch] text-5xl text-primary sm:text-6xl lg:text-7xl">
            Crea tu cuenta y <em className="text-accent-200">guarda tu progreso.</em>
          </h1>
          <p className="mt-7 max-w-[48ch] text-base leading-relaxed text-secondary">
            Inicia sesión para tener perfil, monedas, rango por experiencia e historial de
            partidas.
          </p>
          <div className="mt-9">
            <Link href="/login" className="btn-primary">
              Iniciar sesión
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
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
  const bonusReady = dailyBonusReady(profile.lastDailyBonus, now);

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
          : "Vuelve mañana por tu bono",
      );
    } finally {
      setClaiming(false);
    }
  }

  const figures: { label: string; value: string | number; note?: string }[] = [
    {
      label: "Monedas",
      value: formatChips(availableCoins(profile)),
      note: locked > 0 ? `${formatChips(locked)} en juego` : "Disponibles",
    },
    { label: "Manos jugadas", value: profile.handsPlayed },
    { label: "Manos ganadas", value: `${winRate}%` },
    { label: "Bote mayor", value: formatChips(profile.biggestPot) },
  ];

  return (
    <div ref={scope} className={SHELL}>
      {/* Identidad */}
      <header className="grid grid-cols-1 gap-8 pt-14 sm:pt-20 lg:grid-cols-12 lg:items-end">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-8 lg:col-span-9">
          <div className="relative shrink-0 self-start sm:self-end">
            {profile.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.photoURL}
                alt={profile.nickname}
                className="h-20 w-20 rounded-[10px] object-cover sm:h-24 sm:w-24"
                referrerPolicy="no-referrer"
              />
            ) : (
              <>
                <Avatar seed={profile.avatarSeed} size={96} className="rounded-[10px]!" />
                <button
                  type="button"
                  onClick={regenAvatar}
                  title="Cambiar avatar"
                  aria-label="Cambiar avatar"
                  className="absolute -right-2 -bottom-2 inline-flex h-8 w-8 items-center justify-center rounded-[9px] border border-line-strong bg-ink-850 text-bone-dim transition-colors hover:bg-ink-700 hover:text-bone"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="eyebrow mb-3 flex items-center gap-2">
              <span className="suit text-sm" aria-hidden>
                ♠
              </span>
              Perfil · desde {memberSince}
            </p>
            {editing ? (
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="perfil-nick" className="sr-only">
                  Apodo
                </label>
                <div className="w-full max-w-sm">
                  <input
                    id="perfil-nick"
                    autoFocus
                    value={draftNick}
                    onChange={(e) => setDraftNick(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveNick();
                      if (e.key === "Escape") setEditing(false);
                    }}
                    maxLength={24}
                    className="field h-14! font-display text-3xl!"
                  />
                </div>
                <button type="button" onClick={saveNick} className="btn-primary">
                  <Check className="h-4 w-4" />
                  Guardar
                </button>
                <button type="button" onClick={() => setEditing(false)} className="btn-quiet">
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <h1 className="display min-w-0 text-5xl text-primary [overflow-wrap:anywhere] sm:text-6xl lg:text-7xl">
                  {profile.nickname}
                </h1>
                <button
                  type="button"
                  onClick={() => {
                    setDraftNick(profile.nickname);
                    setEditing(true);
                  }}
                  title="Editar apodo"
                  aria-label="Editar apodo"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[color:var(--text-muted)] transition-colors hover:bg-bone/[0.05] hover:text-bone"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            )}
            <p className="mt-3 truncate text-sm text-muted">
              {user?.email ?? "Cuenta de invitado"}
            </p>
          </div>
        </div>

        <div className="lg:col-span-3 lg:justify-self-end">
          <button type="button" onClick={signOut} className="btn-quiet">
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* Rango / XP */}
      {prog && rank && (
        <section
          aria-labelledby="perfil-rango"
          className="mt-14 grid grid-cols-1 gap-8 border-t border-line pt-10 lg:grid-cols-12"
        >
          <div className="flex items-center gap-5 lg:col-span-5">
            <Image
              src={rank.emblem}
              alt=""
              width={72}
              height={72}
              className="h-16 w-16 shrink-0 object-contain sm:h-[72px] sm:w-[72px]"
              priority
            />
            <div className="min-w-0">
              <p className="eyebrow">Rango</p>
              <h2 id="perfil-rango" className="display mt-1 text-4xl text-primary sm:text-5xl">
                {rank.name}
              </h2>
              <p className="mt-2 text-sm text-muted">
                Nivel <span className="numeric text-primary">{prog.level}</span>
                {prog.level >= MAX_LEVEL ? " · Máximo" : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-col justify-end gap-3 lg:col-span-7">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-sm text-muted">
                <span className="numeric text-lg text-primary">{formatChips(profile.xp)}</span> XP
              </p>
              {!prog.isMax && (
                <p className="text-sm text-muted">
                  <span className="numeric text-secondary">
                    {formatChips(prog.span - prog.xpIntoLevel)}
                  </span>{" "}
                  para nivel <span className="numeric text-secondary">{prog.level + 1}</span>
                </p>
              )}
            </div>
            <div
              role="progressbar"
              aria-label="Progreso al siguiente nivel"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(prog.ratio * 100)}
              className="relative h-[3px] w-full"
            >
              <span className="absolute inset-x-0 top-px h-px bg-line-strong" aria-hidden />
              <span
                className="xp-fill absolute inset-y-0 left-0 bg-accent-300"
                style={{ width: `${prog.ratio * 100}%` }}
                aria-hidden
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pt-1">
              <p className="max-w-[46ch] text-sm text-muted">
                Ganas experiencia jugando manos y completando partidas.
              </p>
              <button type="button" onClick={() => setShowTower(true)} className="btn-link text-sm">
                Ver todos los rangos
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Cifras */}
      <section aria-label="Estadísticas" className="mt-14">
        <dl className="grid grid-cols-2 border-y border-line lg:grid-cols-4">
          {figures.map((f, i) => (
            <div key={f.label} className={`flex flex-col gap-3 border-line py-7 sm:py-9 ${FIGURE_EDGE[i]}`}>
              <dt className="eyebrow">{f.label}</dt>
              <dd className="numeric text-3xl leading-none text-primary sm:text-4xl lg:text-5xl">
                {f.value}
              </dd>
              {f.note ? <dd className="text-xs text-muted">{f.note}</dd> : null}
            </div>
          ))}
        </dl>

        {/* Bono diario */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line py-5">
          <div className="flex min-w-0 items-center gap-3">
            <Gift className="h-4 w-4 shrink-0 text-bone-dim" aria-hidden />
            <p className="text-sm text-secondary">
              Bono diario de <span className="numeric text-primary">{formatChips(DAILY_BONUS)}</span>{" "}
              monedas cada 24 horas.
            </p>
            <span role="status" className="text-sm text-primary">
              {claimMsg}
            </span>
          </div>
          <button
            type="button"
            onClick={onClaim}
            disabled={claiming || !bonusReady}
            aria-busy={claiming}
            className={bonusReady ? "btn-primary" : "btn-quiet"}
          >
            {bonusReady ? "Reclamar bono" : "Bono reclamado"}
          </button>
        </div>
      </section>

      {/* Historial */}
      <section aria-labelledby="perfil-historial" className="mt-20 pb-24">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Partidas online</p>
            <h2 id="perfil-historial" className="display mt-1 text-4xl text-primary sm:text-5xl">
              Historial
            </h2>
          </div>
          <p className="text-sm text-muted">
            <span className="numeric text-primary">{profile.gamesPlayed}</span>{" "}
            {profile.gamesPlayed === 1 ? "partida jugada" : "partidas jugadas"}
          </p>
        </div>

        {history.length === 0 ? (
          <div className="border-t border-line py-12">
            <p className="font-display text-2xl text-secondary sm:text-3xl">
              Aún no has jugado ninguna partida online.
            </p>
            <Link href="/play/online" className="btn-link mt-4 inline-block text-sm">
              Abrir una mesa online
            </Link>
          </div>
        ) : (
          <table className="w-full border-t border-line text-left">
            <caption className="sr-only">Historial de partidas online</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="eyebrow py-3 pr-4 text-left">
                  Sala
                </th>
                <th scope="col" className="eyebrow hidden py-3 pr-6 text-left sm:table-cell">
                  Fecha
                </th>
                <th scope="col" className="eyebrow hidden py-3 pr-6 text-right sm:table-cell">
                  Manos
                </th>
                <th scope="col" className="eyebrow hidden py-3 pr-6 text-right sm:table-cell">
                  XP
                </th>
                <th scope="col" className="eyebrow py-3 text-right">
                  Resultado
                </th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => {
                const date = new Date(h.ts).toLocaleDateString("es");
                return (
                  <tr
                    key={h.id}
                    className="border-b border-line transition-colors hover:bg-bone/[0.03]"
                  >
                    <td className="w-full max-w-0 py-4 pr-4">
                      <span className="block truncate text-[15px] text-primary">
                        {h.roomName || "Sala"}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted sm:hidden">
                        {date} · {h.handsPlayed} manos · +{h.xpGained} XP
                      </span>
                    </td>
                    <td className="numeric hidden py-4 pr-6 text-sm whitespace-nowrap text-secondary sm:table-cell">
                      {date}
                    </td>
                    <td className="numeric hidden py-4 pr-6 text-right text-sm text-secondary sm:table-cell">
                      {h.handsPlayed}
                    </td>
                    <td className="numeric hidden py-4 pr-6 text-right text-sm whitespace-nowrap text-secondary sm:table-cell">
                      +{h.xpGained}
                    </td>
                    <td
                      className={`numeric py-4 text-right text-[15px] whitespace-nowrap ${
                        h.net >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {h.net >= 0 ? "+" : ""}
                      {formatChips(h.net)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {showTower && prog && (
        <RankTowerModal
          currentLevel={prog.level}
          onClose={() => setShowTower(false)}
        />
      )}
    </div>
  );
}

// Hairlines between the four figures: a 2x2 grid on phones, one row on desktop.
const FIGURE_EDGE = [
  "pr-4",
  "border-l pl-5 sm:pl-8",
  "border-t pr-4 lg:border-t-0 lg:border-l lg:pl-8",
  "border-l border-t pl-5 sm:pl-8 lg:border-t-0",
];
