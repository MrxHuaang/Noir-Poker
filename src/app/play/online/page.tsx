"use client";
import { DesktopOnlyGate } from "@/components/ui/DesktopOnlyGate";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Coins, LogIn, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { callOnline, subscribeOpenOnlineRooms, type OnlineRoomSummary } from "@/lib/online/client";
import { formatChips } from "@/lib/betting";

export default function OnlineLandingPage() {
  return (
    <DesktopOnlyGate>
      <OnlineLandingPageInner />
    </DesktopOnlyGate>
  );
}

const ECONOMY = [
  {
    casual: false,
    label: "Con fichas",
    hint: "Buy-in con las monedas de tu perfil. Requiere cuenta.",
    Icon: Coins,
  },
  {
    casual: true,
    label: "Casual",
    hint: "Sin monedas: stacks libres, recompras gratis, entra cualquiera.",
    Icon: Users,
  },
] as const;

function OnlineLandingPageInner() {
  const router = useRouter();
  const { user, isGuest, getToken } = useAuth();
  const [casual, setCasual] = useState(false);
  const [sb, setSb] = useState(5);
  const [bb, setBb] = useState(10);
  const [stack, setStack] = useState(1000);
  const [runItN, setRunItN] = useState(1);
  const [blindLevelMins, setBlindLevelMins] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [rooms, setRooms] = useState<OnlineRoomSummary[]>([]);

  useEffect(() => {
    if (!user) return;
    return subscribeOpenOnlineRooms(setRooms);
  }, [user]);

  const blindsOk = sb > 0 && bb >= sb && stack >= bb * 2;

  // El servidor genera el código, crea la sala y sienta al creador en la misma
  // llamada (buy-in incluido). Un invitado en mesa con fichas la crea igual y
  // entra observando: la mesa le ofrece iniciar sesión para sentarse.
  const create = async () => {
    setError(null);
    const token = await getToken();
    if (!token) {
      setError("Todavía conectando, intenta de nuevo");
      return;
    }
    setCreating(true);
    try {
      const { code } = await callOnline<{ code: string; sitError: string | null }>(token, "create", {
        config: {
          sb,
          bb,
          stack,
          runItN,
          casual,
          blindLevelSecs: blindLevelMins > 0 ? blindLevelMins * 60 : 0,
        },
        sit: casual || !isGuest,
      });
      router.push(`/play/online/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la sala");
      setCreating(false);
    }
  };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (/^[A-Z0-9]{4,8}$/.test(code)) router.push(`/play/online/${code}`);
    else setError("Código inválido");
  };

  return (
    <div className="relative z-[2] mx-auto w-full max-w-6xl px-5 pt-14 pb-24 sm:px-8 sm:pt-20">
      <div className="grid grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-10">
        {/* Create */}
        <section className="lg:col-span-7">
          <p className="eyebrow flex items-center gap-2">
            <span className="suit suit-red text-sm" aria-hidden>
              ♥
            </span>
            Modo online
          </p>
          <h1 className="display mt-3 text-5xl text-primary sm:text-6xl">
            Abre una mesa <em className="text-accent-200">a distancia</em>
          </h1>
          <p className="mt-5 max-w-[50ch] text-[15px] leading-relaxed text-secondary">
            El servidor baraja, valida cada jugada y reparte a cada jugador solo sus cartas.
            Comparte el código y se sientan desde su navegador.
          </p>

          <p className="eyebrow mt-10 mb-3">Economía</p>
          <div
            role="radiogroup"
            aria-label="Economía de la mesa"
            className="grid grid-cols-1 border-y border-line sm:grid-cols-2"
          >
            {ECONOMY.map(({ casual: value, label, hint, Icon }) => {
              const on = casual === value;
              return (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setCasual(value)}
                  className={`flex items-start gap-3 px-1 py-5 text-left transition-colors sm:px-4 ${
                    value ? "border-t border-line sm:border-t-0 sm:border-l" : ""
                  } ${on ? "bg-bone/[0.035]" : "hover:bg-bone/[0.02]"}`}
                >
                  <span
                    className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                      on ? "border-accent-400" : "border-line-strong"
                    }`}
                    aria-hidden
                  >
                    {on && <span className="h-2 w-2 rounded-full bg-accent-400" />}
                  </span>
                  <span>
                    <span className="flex items-center gap-2 text-[15px] font-semibold text-primary">
                      <Icon className="h-4 w-4 text-muted" aria-hidden />
                      {label}
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted">{hint}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <p className="eyebrow mt-10 mb-3">Mesa</p>
          <div className="grid grid-cols-3 gap-4">
            {(
              [
                ["Ciega chica", sb, setSb],
                ["Ciega grande", bb, setBb],
                ["Stack inicial", stack, setStack],
              ] as const
            ).map(([label, val, set]) => (
              <label key={label} className="flex flex-col gap-2">
                <span className="text-xs text-muted">{label}</span>
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={val}
                  onChange={(e) => set(Math.max(0, Number(e.target.value) || 0))}
                  className="field numeric"
                />
              </label>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-xs text-muted">Run it</span>
              <select value={runItN} onChange={(e) => setRunItN(Number(e.target.value))} className="field">
                <option value={1}>Una vez</option>
                <option value={2}>Dos veces</option>
                <option value={3}>Tres veces</option>
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs text-muted">Subir ciegas</span>
              <select
                value={blindLevelMins}
                onChange={(e) => setBlindLevelMins(Number(e.target.value))}
                className="field"
              >
                <option value={0}>Nunca</option>
                <option value={5}>Cada 5 min</option>
                <option value={10}>Cada 10 min</option>
                <option value={15}>Cada 15 min</option>
              </select>
            </label>
          </div>
          {!blindsOk && (
            <p className="mt-3 text-sm text-warn-400">
              La ciega grande debe ser al menos la chica, y el stack al menos dos ciegas grandes.
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button type="button" onClick={create} disabled={creating || !blindsOk} className="btn-primary">
              {creating ? "Creando mesa…" : `Crear mesa ${casual ? "casual" : "con fichas"}`}
            </button>
            {!casual && isGuest && (
              <p className="max-w-[36ch] text-sm text-muted">
                Como invitado entras observando; inicia sesión para sentarte con fichas.
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-4 text-sm text-rose-300">
              {error}
            </p>
          )}
        </section>

        {/* Join */}
        <aside className="lg:col-span-5 lg:border-l lg:border-line lg:pl-10">
          <h2 className="display text-3xl text-primary">Entrar a una mesa</h2>
          <form onSubmit={join} className="mt-5 flex gap-2">
            <label className="sr-only" htmlFor="join-code">
              Código de sala
            </label>
            <input
              id="join-code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Código"
              maxLength={8}
              autoComplete="off"
              className="field numeric uppercase tracking-[0.25em] placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
            />
            <button type="submit" className="btn-quiet shrink-0">
              <LogIn className="h-4 w-4" aria-hidden /> Entrar
            </button>
          </form>

          <div className="mt-12">
            <p className="eyebrow mb-2">Mesas abiertas</p>
            {rooms.length === 0 ? (
              <p className="border-t border-line pt-5 font-display text-xl italic text-muted">
                Nadie jugando ahora. Abre la primera.
              </p>
            ) : (
              <ul className="border-t border-line">
                {rooms.slice(0, 8).map((r) => (
                  <li key={r.code} className="border-b border-line">
                    <button
                      type="button"
                      onClick={() => router.push(`/play/online/${r.code}`)}
                      className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-4 px-1 py-3.5 text-left transition-colors hover:bg-bone/[0.03]"
                    >
                      <span className="numeric text-sm tracking-[0.2em] text-primary">{r.code}</span>
                      <span className="text-xs text-muted">
                        <span className="numeric">
                          {formatChips(r.sb)}/{formatChips(r.bb)}
                        </span>
                        {" · "}
                        {r.casual ? "Casual" : "Con fichas"}
                      </span>
                      <span className="numeric inline-flex items-center gap-1.5 text-sm text-secondary">
                        <Users className="h-3.5 w-3.5 text-muted" aria-hidden />
                        {r.players}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
