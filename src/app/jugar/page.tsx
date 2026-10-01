"use client";
// El club (Noir 1929): the panel you land on after the door. Your character on
// the left under the lamp; on the right a game menu that opens each way to
// play. Everything goes to the server-backed online mode:
//   Mesa rápida       sit at an open table with a free chair, or open one
//   Abrir una mesa    create a table (with or without coins) and sit
//   Torneo            create a sit-and-go tournament (no rebuys, blinds climb)
//   Con contraseña    join a table by its code
//   Mesas abiertas    the list of open tables
// The character is stored in the profile's avatarSeed ("cast:<id>") so every
// other player sees it at the table.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Spade } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { callOnline, subscribeOpenOnlineRooms, type OnlineRoomSummary } from "@/lib/online/client";
import { updateProfileFields } from "@/lib/users";
import { CAST, castFromSeed, featuredCast, sceneUrl, seedForCast, type CastId } from "@/lib/noirCast";
import { levelProgress } from "@/lib/progression";
import { KeyholeLogo } from "@/components/landing/KeyholeLogo";
import { CharacterPicker } from "@/components/noir/CharacterPicker";
import { CLUB_RULES, TableRulesForm, schedule, type TableSetup } from "@/components/noir/TableRulesForm";
import { NoirMenu } from "@/components/noir/NoirMenu";
import { Atmosphere } from "@/components/landing/Atmosphere";
import { useShutter } from "@/components/landing/Shutter";

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

type Room = "quick" | "open" | "tourney" | "code" | "list";
const ROOMS: { key: Room; label: string }[] = [
  { key: "quick", label: "Mesa rápida" },
  { key: "open", label: "Abrir una mesa" },
  { key: "tourney", label: "Torneo" },
  { key: "code", label: "Con contraseña" },
  { key: "list", label: "Mesas abiertas" },
];

const LINES = [
  "Buenas noches. Hay sillas libres en la trastienda.",
  "El Tano pregunta por usted. Dice que le debe una revancha.",
  "Siéntese donde quiera. Aquí nadie pregunta de dónde viene.",
  "Esta noche las ciegas suben rápido. No se duerma.",
];

function Pane({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="plate grid gap-5 px-7 pt-9 pb-7" aria-label={title}>
      <h2 className="stencil text-[clamp(30px,3vw,42px)]">{title}</h2>
      {children}
    </section>
  );
}

export default function ClubPage() {
  const router = useRouter();
  const { user, uid, profile, isGuest, loading, getToken, signInWithGoogle, signOut } = useAuth();
  const { go, node: shutter } = useShutter();
  // The landing links straight to a pane (/jugar?p=open|tourney|code|list).
  // Safe to read on the first client render: the panel waits for auth first.
  const [room, setRoom] = useState<Room>(() => {
    if (typeof window === "undefined") return "quick";
    const p = new URLSearchParams(window.location.search).get("p");
    return ROOMS.some((r) => r.key === p) ? (p as Room) : "quick";
  });
  const [rooms, setRooms] = useState<OnlineRoomSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [localCast, setLocalCast] = useState<CastId | null>(null);

  // House rules (shared by "Abrir una mesa" and "Torneo").
  const [casual, setCasual] = useState(false);
  const [setup, setSetup] = useState<TableSetup>({ sb: 5, bb: 10, stack: 1000, rules: CLUB_RULES });
  const [tSetup, setTSetup] = useState<TableSetup>({ sb: 10, bb: 20, stack: 2000, rules: { ...CLUB_RULES, levels: schedule(10, 20, 10), runItMode: "once" } });
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!user) return;
    return subscribeOpenOnlineRooms(setRooms);
  }, [user]);

  const seed = profile?.avatarSeed ?? uid ?? "guest";
  const me: CastId = localCast ?? castFromSeed(seed);
  const hasCharacter = !!localCast || seed.startsWith("cast:");
  const firstTime = !!profile && !hasCharacter;
  const featured = featuredCast();
  const line = LINES[new Date().getDate() % LINES.length];
  const progress = useMemo(() => levelProgress(profile?.xp ?? 0), [profile?.xp]);
  const noCoins = isGuest || !profile;
  const tableCasual = noCoins || casual;

  const choose = useCallback(
    async (id: CastId) => {
      setLocalCast(id);
      setPicking(false);
      if (uid && profile) {
        try {
          await updateProfileFields(uid, { avatarSeed: seedForCast(id) });
        } catch {
          setMsg("No se pudo guardar tu personaje. Lo verás solo en este equipo.");
        }
      }
    },
    [uid, profile],
  );

  async function create(tournament: boolean) {
    setMsg(null);
    const token = await getToken();
    if (!token) {
      setMsg("Todavía entrando al club, prueba en un momento.");
      return;
    }
    setBusy(true);
    const cfg = tournament ? tSetup : setup;
    const levels = cfg.rules.levels.length ? cfg.rules.levels : tournament ? schedule(cfg.sb, cfg.bb, 10) : [];
    try {
      const { code: c } = await callOnline<{ code: string }>(token, "create", {
        config: {
          sb: levels[0]?.sb ?? cfg.sb,
          bb: levels[0]?.bb ?? cfg.bb,
          stack: cfg.stack,
          casual: tableCasual,
          tournament,
          rules: { ...cfg.rules, levels },
        },
        sit: true,
      });
      go(`/play/online/${c}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "No se pudo abrir la mesa");
      setBusy(false);
    }
  }

  async function quick() {
    const pick = rooms.find((r) => r.players < 9 && (noCoins ? r.casual : true));
    if (pick) go(`/play/online/${pick.code}`);
    else await create(false);
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (c.length < 4) {
      setMsg("Son cuatro letras o números. Pídela a quien abrió la mesa.");
      return;
    }
    go(`/join?code=${c}`);
  }

  if (loading || !user) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-soot-900 font-pix text-sm tracking-[.14em] text-brass-200">
        ABRIENDO LA TRASTIENDA
      </div>
    );
  }

  const tableOptions = (tournament: boolean) => (
    <TableRulesForm
      value={tournament ? tSetup : setup}
      onChange={tournament ? setTSetup : setSetup}
      tournament={tournament}
      noCoins={noCoins}
      casual={tableCasual}
      onCasual={setCasual}
    />
  );

  return (
    <div className="relative isolate min-h-dvh bg-soot-900 text-paper">
      <Atmosphere />
      {/* Top edge: the club, your purse, your standing, the menu */}
      <header className="relative z-20 mx-auto flex max-w-[1320px] items-center gap-6 px-[clamp(18px,4vw,48px)] py-4">
        <KeyholeLogo />
        <div className="ml-auto flex items-center gap-6">
          {!noCoins && (
            <p className="m-0 font-pix text-sm text-paper-dim" aria-label="Monedero">
              <b className="font-mono text-base text-tungsten-400">{fmt(profile?.coins ?? 0)}</b> fichas
            </p>
          )}
          {profile && (
            <div className="hidden min-w-[160px] gap-1 sm:grid" aria-label="Rango">
              <p className="m-0 flex items-baseline justify-between gap-3">
                <b className="stencil text-lg">{profile.title}</b>
                <span className="font-pix text-[12px] text-paper-mute">nivel {progress.level}</span>
              </p>
              <i className="block h-[3px] bg-paper/15">
                <b className="block h-full bg-brass-400" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
              </i>
            </div>
          )}
          <NoirMenu
            items={[
              { label: "Expediente", onSelect: () => router.push("/perfil") },
              { label: "Cambiar de personaje", onSelect: () => setPicking(true) },
              ...(isGuest ? [{ label: "Entrar con Google", onSelect: () => void signInWithGoogle() }] : [{ label: "Cerrar sesión", danger: true, onSelect: () => void signOut().then(() => router.push("/")) }]),
            ]}
          />
        </div>
      </header>

      <main className="relative z-10 mx-auto grid max-w-[1320px] grid-cols-1 gap-[clamp(24px,4vw,56px)] px-[clamp(18px,4vw,48px)] pb-16 min-[960px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* You, under the lamp */}
        <section className="relative grid content-start gap-4" aria-label="Tu personaje">
          <div className="relative aspect-[4/5] w-full max-w-[460px] overflow-hidden bg-[#07060a] shadow-[0_0_0_1px_var(--color-brass-700),0_30px_70px_rgb(0_0_0/.55)]">
            <iframe key={me} src={sceneUrl("cameo", { id: me, turn: 0.35 })} title={CAST[me].name} className="absolute inset-0 h-full w-full border-0" />
            <p className="scrap absolute left-4 right-4 top-4 m-0 px-4 py-2.5 text-[14px] leading-snug">
              <b className="block font-pix text-[11px] uppercase tracking-[.1em] text-blood-500">Horacio, el crupier</b>
              {line}
            </p>
          </div>
          <div className="grid gap-1">
            <span className="kick">{CAST[me].alias}</span>
            <h1 className="stencil text-[clamp(34px,3.6vw,54px)]">{CAST[me].name}</h1>
            <p className="m-0 text-[15px] text-paper-dim">
              {profile?.nickname || profile?.displayName || "Invitado"} se sienta así en la mesa.
            </p>
          </div>
          <button type="button" onClick={() => setPicking(true)} className="btn-brass w-fit">
            Cambiar de personaje
          </button>
        </section>

        {/* The menu */}
        <section className="grid content-start gap-6" aria-label="A qué jugar">
          <ul className="m-0 grid w-fit list-none gap-0.5 p-0" data-menu>
            {ROOMS.map((r) => {
              const on = r.key === room;
              return (
                <li key={r.key}>
                  <button
                    type="button"
                    onClick={() => {
                      setRoom(r.key);
                      setMsg(null);
                    }}
                    aria-pressed={on}
                    className={`flex h-11 items-center gap-3 font-stencil text-[clamp(22px,2.1vw,30px)] font-extrabold uppercase tracking-[.06em] transition-[color,translate] duration-200 ${
                      on ? "translate-x-2 text-tungsten-400" : "text-paper hover:text-paper-dim"
                    }`}
                  >
                    <Spade className={`h-5 w-5 flex-none fill-current ${on ? "opacity-100" : "opacity-0"}`} aria-hidden />
                    {r.label}
                  </button>
                </li>
              );
            })}
          </ul>

          {msg && (
            <p role="status" className="scrap m-0 w-fit px-4 py-2 font-pix text-sm text-blood-500">
              {msg}
            </p>
          )}

          {room === "quick" && (
            <Pane title="Te guardamos silla">
              <p className="m-0 max-w-[48ch] text-paper-dim">
                {rooms.some((r) => r.players < 9 && (noCoins ? r.casual : true))
                  ? `Hay ${rooms.length === 1 ? "una mesa abierta" : `${rooms.length} mesas abiertas`}. Te sentamos en la primera con silla libre.`
                  : "No hay mesas con silla libre ahora mismo. Abrimos una para ti y pasas la contraseña."}
              </p>
              {featured !== me && (
                <div className="flex flex-wrap items-center gap-4 border-t border-brass-700/60 pt-4">
                  <div className="h-24 w-20 overflow-hidden bg-[#07060a]">
                    <iframe src={sceneUrl("cameo", { id: featured, turn: -0.3 })} title={CAST[featured].name} loading="lazy" className="h-full w-full border-0" />
                  </div>
                  <div className="grid gap-1">
                    <span className="kick text-[12px]">Personaje de la semana</span>
                    <b className="stencil text-2xl">{CAST[featured].name}</b>
                    <button type="button" className="stamp w-fit" onClick={() => void choose(featured)}>
                      Ser {CAST[featured].tag} esta noche
                    </button>
                  </div>
                </div>
              )}
              <button type="button" className="tk tk-red w-fit" disabled={busy} onClick={() => void quick()}>
                {busy ? "Buscando silla…" : "Sentarme"}
              </button>
            </Pane>
          )}

          {room === "open" && (
            <Pane title="La mesa de siempre">
              {tableOptions(false)}
              <button type="button" className="tk tk-red w-fit" disabled={busy} onClick={() => void create(false)}>
                {busy ? "Abriendo…" : "Abrir la mesa"}
              </button>
            </Pane>
          )}

          {room === "tourney" && (
            <Pane title="Uno solo se levanta">
              <p className="m-0 max-w-[50ch] text-paper-dim">
                Todos empiezan con las mismas fichas y las ciegas suben con el reloj. Sin recompras: quien se queda sin
                fichas mira desde la barra. Reparte quien lo abre cuando estén todos.
              </p>
              {tableOptions(true)}
              <button type="button" className="tk tk-red w-fit" disabled={busy} onClick={() => void create(true)}>
                {busy ? "Abriendo…" : "Abrir el torneo"}
              </button>
            </Pane>
          )}

          {room === "code" && (
            <Pane title="Toque tres veces">
              <form className="flex max-w-[460px] items-stretch" onSubmit={join} autoComplete="off">
                <label htmlFor="club-code" className="sr-only">
                  Contraseña de la mesa
                </label>
                <input
                  id="club-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  maxLength={8}
                  placeholder="Contraseña"
                  className="slot-input h-14 min-w-0 flex-1 px-4 font-pix text-2xl font-bold uppercase tracking-[.3em] placeholder:text-base placeholder:tracking-[.12em] placeholder:text-paper-mute"
                />
                <button type="submit" className="tk tk-right">
                  Pasar
                </button>
              </form>
            </Pane>
          )}

          {room === "list" && (
            <Pane title="Mesas abiertas">
              {rooms.length === 0 ? (
                <p className="m-0 text-paper-dim">No hay mesas abiertas ahora mismo. Abre una y pasa la contraseña.</p>
              ) : (
                <ul className="m-0 grid list-none gap-1 p-0">
                  {rooms.map((r) => (
                    <li key={r.code}>
                      <button
                        type="button"
                        onClick={() => go(`/play/online/${r.code}`)}
                        disabled={noCoins && !r.casual}
                        className="group flex w-full items-baseline gap-3 py-2 text-left disabled:opacity-40"
                      >
                        <b className="font-pix text-lg tracking-[.2em] text-tungsten-400">{r.code}</b>
                        <span className="flex-1 -translate-y-1 border-b-2 border-dotted border-paper/20" />
                        <span className="font-mono text-sm tabular-nums text-paper-dim">
                          {r.players}/9 · {r.sb}/{r.bb}
                        </span>
                        <span className="font-pix text-[12px] uppercase tracking-[.1em] text-paper-mute">{r.casual ? "sin fichas" : "con fichas"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Pane>
          )}

          <p className="m-0 text-[13px] text-paper-mute">
            ¿Prefieres la mesa en una pantalla y las cartas en el teléfono?{" "}
            <Link href="/host/normal" className="text-paper-dim underline underline-offset-4">
              Modo clásico
            </Link>
          </p>
        </section>
      </main>

      <CharacterPicker open={picking || firstTime} current={me} first={firstTime} onChosen={(id) => void choose(id)} onClose={() => setPicking(false)} />
      {shutter}
    </div>
  );
}
