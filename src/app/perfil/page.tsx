"use client";
// El expediente: the file the club keeps on you. A photo of your character
// with your rank stamped across it, the typed record (nickname, since when,
// experience), the figures as evidence tags, the house bonus, the rank ladder
// and every session as a line of the bar's ledger.
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { claimDailyBonus, getHistory, updateProfileFields, type HistoryRecord } from "@/lib/users";
import { levelProgress, rankForLevel, TITLES } from "@/lib/progression";
import { DAILY_BONUS, availableCoins, dailyBonusReady, escrowedTotal } from "@/lib/economy";
import { CAST, castFromSeed, sceneUrl, seedForCast, type CastId } from "@/lib/noirCast";
import { NoirRoom } from "@/components/noir/NoirRoom";
import { CharacterPicker } from "@/components/noir/CharacterPicker";

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export default function ExpedientePage() {
  const router = useRouter();
  const { user, profile, isGuest, loading, signOut } = useAuth();
  const uid = user?.uid ?? null;
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [editing, setEditing] = useState(false);
  const [nick, setNick] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!uid || isGuest) return;
    getHistory(uid).then(setHistory).catch(() => setHistory([]));
  }, [uid, isGuest, profile?.gamesPlayed]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const choose = useCallback(
    async (id: CastId) => {
      setPicking(false);
      if (uid) await updateProfileFields(uid, { avatarSeed: seedForCast(id) }).catch(() => {});
    },
    [uid],
  );

  if ((loading || (user && !isGuest)) && !profile) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-soot-900 font-pix text-sm tracking-[.14em] text-brass-200">
        BUSCANDO TU EXPEDIENTE
      </div>
    );
  }

  if (isGuest || !profile) {
    return (
      <NoirRoom>
        <section className="plate grid w-[min(460px,92vw)] gap-4 px-8 pt-10 pb-8">
          <p className="kick m-0">Sin expediente</p>
          <h1 className="stencil m-0 text-[44px]">La casa no te conoce</h1>
          <p className="m-0 text-[15px] text-[#dccfb1]">
            Entra con tu cuenta y el club abre tu expediente: fichas, rango, personaje y cada noche en la mesa.
          </p>
          <Link href="/login?next=/perfil" className="tk tk-red w-fit">
            Entrar con Google
          </Link>
        </section>
      </NoirRoom>
    );
  }

  const prog = levelProgress(profile.xp);
  const rank = rankForLevel(prog.level);
  const nextRank = TITLES.find((t) => t.level > prog.level);
  const me = castFromSeed(profile.avatarSeed || profile.uid);
  const since = new Date(profile.createdAt).toLocaleDateString("es", { year: "numeric", month: "long", day: "numeric" });
  const winRate = profile.handsPlayed > 0 ? Math.round((profile.handsWon / profile.handsPlayed) * 100) : 0;
  const locked = escrowedTotal(profile.escrows);
  const bonusReady = dailyBonusReady(profile.lastDailyBonus, now);

  async function saveNick() {
    const v = nick.trim();
    if (uid && v.length >= 2 && v.length <= 24) await updateProfileFields(uid, { nickname: v }).catch(() => {});
    setEditing(false);
  }

  async function claim() {
    if (!uid) return;
    setClaiming(true);
    setClaimMsg(null);
    try {
      const granted = await claimDailyBonus(uid);
      setClaimMsg(granted > 0 ? `La casa te invita: +${fmt(granted)} fichas` : "Vuelve mañana por tu bono");
    } finally {
      setClaiming(false);
    }
  }

  const tags: { label: string; value: string; note?: string }[] = [
    { label: "Fichas", value: fmt(availableCoins(profile)), note: locked > 0 ? `${fmt(locked)} en la mesa` : "en el monedero" },
    { label: "Manos jugadas", value: fmt(profile.handsPlayed) },
    { label: "Manos ganadas", value: `${winRate}%` },
    { label: "Bote mayor", value: fmt(profile.biggestPot) },
  ];

  return (
    <NoirRoom
      center={false}
      right={
        <button type="button" onClick={() => void signOut().then(() => router.push("/"))} className="btn-brass btn-sm">
          Cerrar sesión
        </button>
      }
    >
      <div className="grid gap-12 pt-4">
        {/* The file */}
        <section className="grid gap-[clamp(24px,4vw,56px)] min-[900px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" aria-label="Tu expediente">
          <div className="relative w-full max-w-[420px]">
            <div className="relative aspect-[4/5] -rotate-2 overflow-hidden bg-[#07060a] shadow-[0_0_0_10px_#e9e1cf,0_0_0_11px_#8a7f6d,0_30px_60px_rgb(0_0_0/.55)]">
              <iframe key={me} src={sceneUrl("cameo", { id: me, turn: 0.35 })} title={CAST[me].name} className="absolute inset-0 h-full w-full border-0" />
            </div>
            <span className="stencil pointer-events-none absolute bottom-10 right-2 rotate-[-14deg] border-4 border-blood-400 px-3 py-1 text-3xl tracking-[.12em] text-blood-400 opacity-90 mix-blend-screen">
              {rank.name}
            </span>
            <span className="absolute -top-3 left-8 h-8 w-4 rounded-[2px] bg-brass-400 shadow-[0_2px_0_#050404]" aria-hidden />
            <button type="button" onClick={() => setPicking(true)} className="btn-brass btn-sm mt-8">
              Cambiar de personaje
            </button>
          </div>

          <div className="grid content-start gap-5">
            <p className="kick m-0">Expediente Nº {profile.uid.slice(0, 6).toUpperCase()}</p>
            {editing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveNick();
                }}
                className="flex max-w-[460px] items-stretch"
              >
                <label htmlFor="nick" className="sr-only">
                  Apodo
                </label>
                <input
                  id="nick"
                  autoFocus
                  value={nick}
                  maxLength={24}
                  onChange={(e) => setNick(e.target.value)}
                  className="slot-input h-14 min-w-0 flex-1 px-4 font-stencil text-3xl font-black uppercase"
                />
                <button type="submit" className="tk tk-right">
                  Firmar
                </button>
              </form>
            ) : (
              <h1 className="stencil m-0 text-[clamp(44px,5.6vw,84px)]">
                {profile.nickname || profile.displayName || "Sin nombre"}
              </h1>
            )}
            {!editing && (
              <button
                type="button"
                onClick={() => {
                  setNick(profile.nickname || profile.displayName || "");
                  setEditing(true);
                }}
                className="w-fit text-[14px] text-paper-dim underline underline-offset-4 hover:text-paper"
              >
                Cambiar el apodo
              </button>
            )}
            <p className="m-0 max-w-[52ch] text-paper-dim">
              Se sienta como <b className="text-paper">{CAST[me].name}</b>, {CAST[me].alias.toLowerCase()}. En el club desde el {since}.
            </p>

            <div className="grid max-w-[520px] gap-2">
              <p className="m-0 flex items-baseline justify-between gap-3">
                <span className="stencil text-2xl">
                  {rank.name} · nivel {prog.level}
                </span>
                <span className="font-pix text-[12px] text-paper-mute">
                  {prog.isMax ? "Lo más alto del club" : `${fmt(prog.xpIntoLevel)} / ${fmt(prog.span)} de experiencia`}
                </span>
              </p>
              <i className="block h-1.5 bg-paper/10" aria-hidden>
                <b className="block h-full origin-left bg-brass-400 transition-transform duration-1000" style={{ transform: `scaleX(${prog.ratio})` }} />
              </i>
              {nextRank && <p className="m-0 text-[13px] text-paper-mute">Próximo rango: {nextRank.name}, en el nivel {nextRank.level}.</p>}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={claim} disabled={!bonusReady || claiming} className="tk tk-red disabled:opacity-40">
                {claiming ? "Cobrando…" : bonusReady ? `Cobrar el bono (+${fmt(DAILY_BONUS)})` : "Bono cobrado hoy"}
              </button>
              {claimMsg && <p className="scrap m-0 px-3 py-1.5 font-pix text-sm">{claimMsg}</p>}
            </div>
          </div>
        </section>

        {/* Evidence tags */}
        <section className="grid grid-cols-2 gap-4 min-[760px]:grid-cols-4" aria-label="Tus números">
          {tags.map((t, i) => (
            <div
              key={t.label}
              className="relative bg-[linear-gradient(170deg,#efe6d3,#d6c7a8)] px-5 pt-6 pb-4 text-card-ink shadow-[0_14px_30px_rgb(0_0_0/.45)] [clip-path:polygon(18px_0,100%_0,100%_100%,0_100%,0_18px)]"
              style={{ rotate: `${[-1.2, 0.8, -0.6, 1.1][i]}deg` } as CSSProperties}
            >
              <span className="absolute left-2 top-2 h-2.5 w-2.5 rounded-full bg-soot-900" aria-hidden />
              <p className="m-0 font-pix text-[11px] uppercase tracking-[.14em] text-[#5a4d3e]">{t.label}</p>
              <p className="stencil m-0 mt-1 text-[40px]">{t.value}</p>
              {t.note && <p className="m-0 text-[13px] text-[#5a4d3e]">{t.note}</p>}
            </div>
          ))}
        </section>

        {/* Rank ladder */}
        <section className="grid gap-4" aria-label="Rangos del club">
          <h2 className="stencil m-0 text-[clamp(32px,3.4vw,52px)]">Tu lugar en la casa</h2>
          <ol className="m-0 grid list-none grid-cols-2 gap-3 p-0 min-[560px]:grid-cols-4 min-[1000px]:grid-cols-7">
            {TITLES.map((t, i) => {
              const reached = prog.level >= t.level;
              const current = t.name === rank.name;
              return (
                <li
                  key={t.name}
                  className={`grid justify-items-center gap-2 border-t-2 px-2 pt-5 pb-3 text-center ${current ? "border-tungsten-400" : reached ? "border-brass-700" : "border-paper/15"}`}
                >
                  <svg viewBox="0 0 64 72" className={`h-16 w-14 ${current ? "text-tungsten-400" : reached ? "text-brass-400" : "text-soot-700"}`} aria-hidden>
                    <path d="M32 3 60 13v22c0 17-12 29-28 34C16 64 4 52 4 35V13Z" fill="#1d1814" stroke="currentColor" strokeWidth="3" />
                    {Array.from({ length: i + 1 }, (_, j) => (
                      <rect key={j} x="18" y={52 - j * 6} width="28" height="3.5" fill="currentColor" />
                    ))}
                  </svg>
                  <b className={`stencil text-xl ${reached ? "text-paper" : "text-paper-mute"}`}>{t.name}</b>
                  <span className="text-[12px] text-paper-mute">nivel {t.level}</span>
                </li>
              );
            })}
          </ol>
        </section>

        {/* The ledger */}
        <section className="grid gap-4" aria-label="Tus noches en la mesa">
          <h2 className="stencil m-0 text-[clamp(32px,3.4vw,52px)]">El libro de la barra</h2>
          {history.length === 0 ? (
            <p className="m-0 text-paper-dim">Todavía no hay noches apuntadas. La primera se escribe al levantarte de una mesa.</p>
          ) : (
            <ol className="m-0 grid max-w-[860px] list-none gap-1.5 bg-[linear-gradient(170deg,#ece3cf,#d6c7a8)] p-5 font-pix text-[14px] text-card-ink shadow-[0_20px_40px_rgb(0_0_0/.45)]">
              {history.slice(0, 40).map((h) => (
                <li key={h.id} className="flex items-baseline gap-3">
                  <span className="w-24 flex-none text-[#5a4d3e]">{new Date(h.ts).toLocaleDateString("es", { day: "2-digit", month: "short" })}</span>
                  <span className="flex-none tracking-[.14em]">{h.code}</span>
                  <span className="text-[#5a4d3e]">
                    {h.handsPlayed} manos · {h.handsWon} ganadas
                  </span>
                  <span className="flex-1 -translate-y-1 border-b-2 border-dotted border-[#8a7f6d]" />
                  <b className={`flex-none tabular-nums ${h.net >= 0 ? "text-[#6b4f12]" : "text-blood-500"}`}>
                    {h.net >= 0 ? "+" : ""}
                    {fmt(h.net)}
                  </b>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <CharacterPicker open={picking} current={me} first={false} onChosen={(id) => void choose(id)} onClose={() => setPicking(false)} />
    </NoirRoom>
  );
}
