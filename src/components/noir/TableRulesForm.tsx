"use client";
// The house rules of a table, set like a PokerNow room but written on the
// club's paper: blinds (fixed or climbing, with an editable schedule and
// antes), time (decision clock, time bank), dealing (auto next hand, showdown
// pace, what to do in an all-in, rabbit hunting) and chairs (how many, whether
// the owner lets people in, dealing to players who stepped away).
// Pure form: the engine clamps and validates everything again.
import { Minus, Plus } from "lucide-react";
import type { BlindLevel, TableRules } from "@/lib/online/protocol";

export type TableSetup = { sb: number; bb: number; stack: number; rules: TableRules };

export const CLUB_RULES: TableRules = {
  ante: 0,
  levels: [],
  turnSecs: 30,
  bankSecs: 30,
  bankHands: 10,
  autoStart: true,
  showdownSecs: 6,
  revealAllIn: true,
  runItMode: "ask",
  rabbit: false,
  maxSeats: 9,
  approveSeats: false,
  dealAway: false,
};

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** A schedule that doubles every `mins` minutes from sb/bb, antes from level 3. */
export function schedule(sb: number, bb: number, mins: number, count = 10): BlindLevel[] {
  const out: BlindLevel[] = [];
  let s = sb;
  let b = bb;
  for (let i = 0; i < count; i++) {
    out.push({ sb: s, bb: b, ante: i >= 2 ? Math.max(1, Math.round(b / 10)) : 0, mins: i === count - 1 ? 0 : mins });
    s = Math.round(s * (i % 2 ? 1.5 : 2));
    b = Math.round(b * (i % 2 ? 1.5 : 2));
  }
  return out;
}

function Stamps<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
  hint,
  locked,
}: {
  label: string;
  value: T;
  options: { v: T; label: string; off?: boolean }[];
  onChange: (v: T) => void;
  hint?: string;
  locked?: boolean;
}) {
  return (
    <div className="grid gap-1.5" role="radiogroup" aria-label={label}>
      <span className="text-[13.5px] font-semibold text-brass-200">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            role="radio"
            aria-checked={value === o.v}
            disabled={locked || o.off}
            onClick={() => onChange(o.v)}
            className="stamp disabled:cursor-not-allowed disabled:opacity-30"
          >
            {o.label}
          </button>
        ))}
      </div>
      {hint && <span className="text-[13px] text-paper-mute">{hint}</span>}
    </div>
  );
}

function Num({ value, onChange, label, w = "w-20" }: { value: number; onChange: (n: number) => void; label: string; w?: string }) {
  return (
    <input
      aria-label={label}
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)}
      className={`slot-input h-9 ${w} px-2 text-right text-[15px] tabular-nums`}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="m-0 grid gap-4 border-0 border-t-2 border-dotted border-brass-700/70 p-0 pt-4">
      <legend className="float-left mb-1 w-full text-lg font-bold tracking-[-.01em] text-paper">{title}</legend>
      {children}
    </fieldset>
  );
}

export function TableRulesForm({
  value,
  onChange,
  tournament = false,
  noCoins = false,
  casual,
  onCasual,
}: {
  value: TableSetup;
  onChange: (v: TableSetup) => void;
  tournament?: boolean;
  noCoins?: boolean;
  /** Economy choice (only when opening a table). */
  casual?: boolean;
  onCasual?: (casual: boolean) => void;
}) {
  const r = value.rules;
  const set = (p: Partial<TableRules>) => onChange({ ...value, rules: { ...r, ...p } });
  const rising = r.levels.length > 0;
  const levels = r.levels;
  const setLevel = (i: number, p: Partial<BlindLevel>) => set({ levels: levels.map((l, k) => (k === i ? { ...l, ...p } : l)) });

  return (
    <div className="legible grid gap-5">
      {onCasual && (
        <Stamps
          label="Fichas"
          value={casual ? "casual" : "coins"}
          onChange={(v) => onCasual(v === "casual")}
          options={[
            { v: "coins", label: "Del monedero", off: noCoins },
            { v: "casual", label: "Sin fichas" },
          ]}
          hint={noCoins ? "Los invitados solo abren mesas sin fichas." : tournament ? "Con fichas del monedero, el ganador se lo lleva todo." : undefined}
        />
      )}

      <Section title="Ciegas">
        <Stamps
          label="Las ciegas"
          value={rising}
          locked={tournament}
          onChange={(v) => set({ levels: v ? schedule(value.sb, value.bb, 10) : [] })}
          options={[
            { v: false, label: "Fijas", off: tournament },
            { v: true, label: "Suben con el reloj" },
          ]}
        />
        {!rising ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-[13px] text-paper-mute">
              Ciega chica
              <Num label="Ciega chica" value={value.sb} onChange={(sb) => onChange({ ...value, sb, bb: Math.max(value.bb, sb) })} />
            </label>
            <label className="grid gap-1 text-[13px] text-paper-mute">
              Ciega grande
              <Num label="Ciega grande" value={value.bb} onChange={(bb) => onChange({ ...value, bb })} />
            </label>
            <label className="grid gap-1 text-[13px] text-paper-mute">
              Ante
              <Num label="Ante" value={r.ante} onChange={(ante) => set({ ante })} />
            </label>
          </div>
        ) : (
          <div className="grid gap-2">
            <div className="grid grid-cols-[28px_repeat(4,minmax(0,1fr))_28px] items-center gap-2 text-[12.5px] font-medium text-paper-mute">
              <span>Nº</span>
              <span>Chica</span>
              <span>Grande</span>
              <span>Ante</span>
              <span>Minutos</span>
              <span />
            </div>
            {levels.map((l, i) => (
              <div key={i} className="grid grid-cols-[28px_repeat(4,minmax(0,1fr))_28px] items-center gap-2">
                <b className="text-sm text-brass-200 tabular-nums">{i + 1}</b>
                <Num label={`Nivel ${i + 1} ciega chica`} value={l.sb} w="w-full" onChange={(sb) => setLevel(i, { sb })} />
                <Num label={`Nivel ${i + 1} ciega grande`} value={l.bb} w="w-full" onChange={(bb) => setLevel(i, { bb })} />
                <Num label={`Nivel ${i + 1} ante`} value={l.ante} w="w-full" onChange={(ante) => setLevel(i, { ante })} />
                {i === levels.length - 1 ? (
                  <span className="text-center text-[12.5px] text-paper-mute" title="El último nivel no termina">
                    sin fin
                  </span>
                ) : (
                  <Num label={`Nivel ${i + 1} minutos`} value={l.mins} w="w-full" onChange={(mins) => setLevel(i, { mins })} />
                )}
                <button
                  type="button"
                  aria-label={`Quitar nivel ${i + 1}`}
                  disabled={levels.length <= 1}
                  onClick={() => set({ levels: levels.filter((_, k) => k !== i).map((x, k, a) => (k === a.length - 1 ? { ...x, mins: 0 } : x)) })}
                  className="grid h-7 w-7 place-items-center text-paper-dim hover:text-blood-400 disabled:opacity-20"
                >
                  <Minus className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                className="btn-brass btn-sm"
                onClick={() => {
                  const last = levels[levels.length - 1] ?? { sb: value.sb, bb: value.bb, ante: 0, mins: 10 };
                  const prev = levels.map((x, k) => (k === levels.length - 1 ? { ...x, mins: x.mins || 10 } : x));
                  set({ levels: [...prev, { sb: last.sb * 2, bb: last.bb * 2, ante: last.ante * 2, mins: 0 }] });
                }}
              >
                <Plus className="h-4 w-4" aria-hidden /> Añadir nivel
              </button>
              {[5, 10, 15, 20].map((m) => (
                <button key={m} type="button" className="stamp" onClick={() => set({ levels: schedule(value.sb, value.bb, m) })}>
                  Cada {m} min
                </button>
              ))}
            </div>
          </div>
        )}
        <Stamps
          label={tournament ? "Fichas de salida" : "Fichas al sentarse"}
          value={value.stack}
          onChange={(stack) => onChange({ ...value, stack })}
          options={[500, 1000, 2000, 5000, 10000].map((v) => ({ v, label: fmt(v), off: v < value.bb * 20 }))}
        />
      </Section>

      <Section title="Tiempo">
        <Stamps
          label="Tiempo para decidir"
          value={r.turnSecs}
          onChange={(turnSecs) => set({ turnSecs })}
          options={[
            { v: 15, label: "15 s" },
            { v: 20, label: "20 s" },
            { v: 30, label: "30 s" },
            { v: 60, label: "60 s" },
            { v: 0, label: "Sin límite" },
          ]}
        />
        <Stamps
          label="Cigarrillo de reserva (banco de tiempo)"
          value={r.bankSecs}
          onChange={(bankSecs) => set({ bankSecs })}
          options={[
            { v: 0, label: "Ninguno" },
            { v: 15, label: "15 s" },
            { v: 30, label: "30 s" },
            { v: 60, label: "60 s" },
          ]}
        />
        {r.bankSecs > 0 && (
          <Stamps
            label="Se repone cada"
            value={r.bankHands}
            onChange={(bankHands) => set({ bankHands })}
            options={[5, 10, 20].map((v) => ({ v, label: `${v} manos` }))}
          />
        )}
      </Section>

      <Section title="Reparto">
        <Stamps
          label="La siguiente mano"
          value={r.autoStart}
          onChange={(autoStart) => set({ autoStart })}
          options={[
            { v: true, label: "Se reparte sola" },
            { v: false, label: "La reparte el anfitrión" },
          ]}
        />
        <Stamps
          label="Tiempo para ver cómo acabó la mano"
          value={r.showdownSecs}
          onChange={(showdownSecs) => set({ showdownSecs })}
          options={[
            { v: 3, label: "Rápido" },
            { v: 6, label: "Normal" },
            { v: 9, label: "Lento" },
          ]}
        />
        {!tournament && (
          <Stamps
            label="En un all-in"
            value={r.runItMode}
            onChange={(runItMode) => set({ runItMode })}
            options={[
              { v: "ask", label: "Preguntar a los jugadores" },
              { v: "once", label: "Siempre un tablero" },
              { v: "twice", label: "Siempre dos tableros" },
            ]}
            hint={r.runItMode === "ask" ? "Se reparte dos veces solo si todos los del all-in aceptan." : undefined}
          />
        )}
        <Stamps
          label="Enseñar las manos cuando ya nadie puede apostar"
          value={r.revealAllIn}
          onChange={(revealAllIn) => set({ revealAllIn })}
          options={[
            { v: true, label: "Sí" },
            { v: false, label: "No" },
          ]}
        />
        <Stamps
          label="Ver las cartas que habrían salido"
          value={r.rabbit}
          onChange={(rabbit) => set({ rabbit })}
          options={[
            { v: true, label: "Sí" },
            { v: false, label: "No" },
          ]}
        />
      </Section>

      <Section title="Sillas">
        <Stamps
          label="Jugadores como máximo"
          value={r.maxSeats}
          onChange={(maxSeats) => set({ maxSeats })}
          options={[2, 4, 6, 8, 9].map((v) => ({ v, label: String(v) }))}
        />
        <Stamps
          label="Quién se sienta"
          value={r.approveSeats}
          onChange={(approveSeats) => set({ approveSeats })}
          options={[
            { v: false, label: "Cualquiera con el enlace" },
            { v: true, label: "El anfitrión deja pasar" },
          ]}
        />
        <Stamps
          label="A quien se ausenta"
          value={r.dealAway}
          onChange={(dealAway) => set({ dealAway })}
          options={[
            { v: false, label: "No se le reparte" },
            { v: true, label: "Se le reparte igual" },
          ]}
        />
      </Section>
    </div>
  );
}
