"use client";
// The house rules of a table, set like a PokerNow room but written on the
// club's paper. Short on purpose: a one-line summary of what is set, the
// money choice, then index tabs (blinds, time, dealing, chairs, room) so only
// one group is open at a time. Each option is one row: the question on the
// left, one straight control on the right (switch, lever or dial, see
// Pickers.tsx); the rows stack when the panel is narrow. The last tab is the room itself (place,
// felt, rail): cosmetic, everyone at the table sees the same one.
// Pure form: the engine clamps and validates everything again.
import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { AutoPick, PickRow, PickRows, Seg, Tiles } from "@/components/noir/Pickers";
import { DealerPicture, FeltSample, PlacePicture } from "@/components/noir/Previews";
import { DEFAULT_AMBIENCE, type Ambience, type BlindLevel, type TableRules } from "@/lib/online/protocol";

export type TableSetup = { sb: number; bb: number; stack: number; rules: TableRules; ambience?: Ambience };

export const PLACE_LABEL: Record<Ambience["place"], string> = { trastienda: "La trastienda", jazz: "Club de jazz", muelle: "Almacén del muelle" };
const FELT_LABEL: Record<Ambience["felt"], string> = { verde: "Verde billar", vino: "Vino", noche: "Azul noche", carbon: "Carbón" };
const RAIL_LABEL: Record<Ambience["rail"], string> = { cuero: "Cuero granate", nogal: "Nogal", negro: "Laca negra" };
export const DEALER_LABEL: Record<Ambience["dealer"], { name: string; hint: string }> = {
  horacio: { name: "Horacio", hint: "Visera verde. Sobrio, de pocas palabras." },
  celestina: { name: "Celestina", hint: "Corte bob y boquilla. Seca, con ironía." },
  conde: { name: "El Conde", hint: "Chistera y monóculo. Ceremonioso." },
  lucha: { name: "Mamá Lucha", hint: "Chal y peineta. Cálida, regaña." },
  tito: { name: "Tito el Mudo", hint: "Gorra y tirantes. Dos palabras, como mucho." },
};

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
  straddle: false,
  bombEvery: 0,
  bombBB: 2,
  buyInMin: 0,
  buyInMax: 0,
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

/** The rules in one line, for the top of the form and the table's book. */
export function rulesSummary(setup: TableSetup, tournament = false): string[] {
  const r = setup.rules;
  const first = r.levels[0];
  return [
    r.levels.length
      ? `Ciegas desde ${fmt(first.sb)}/${fmt(first.bb)}, suben cada ${first.mins || "∞"} min`
      : `Ciegas ${fmt(setup.sb)}/${fmt(setup.bb)}${r.ante ? ` + ante ${fmt(r.ante)}` : ""}`,
    !tournament && (r.buyInMin || r.buyInMax)
      ? `compra ${fmt(r.buyInMin || setup.stack)} a ${fmt(r.buyInMax || setup.stack)}`
      : `${fmt(setup.stack)} fichas`,
    r.turnSecs ? `${r.turnSecs} s por turno` : "sin reloj",
    tournament ? "un tablero" : r.runItMode === "ask" ? "all-in: se pregunta" : r.runItMode === "twice" ? "all-in: dos tableros" : "all-in: un tablero",
    ...(r.straddle ? ["straddle"] : []),
    ...(r.bombEvery ? [`bote bomba cada ${r.bombEvery} manos`] : []),
    `${r.maxSeats} sillas`,
    PLACE_LABEL[(setup.ambience ?? DEFAULT_AMBIENCE).place],
    `reparte ${DEALER_LABEL[{ ...DEFAULT_AMBIENCE, ...setup.ambience }.dealer].name}`,
  ];
}

/** One question, one row: the label on the left, free controls on the right. */
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <PickRow label={label} hint={hint} labelWidth="12rem">
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </PickRow>
  );
}

/** One question with a fixed set of answers: the control is picked from the options. */
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
    <PickRow label={label} hint={hint} labelWidth="12rem">
      <AutoPick label={label} value={value} options={options} onChange={onChange} disabled={locked} />
    </PickRow>
  );
}

/** A choice made by looking: the question and the current answer above, the samples below. */
function TileRow<T extends string>({ label, hint, value, options, onChange }: { label: string; hint?: string; value: T; options: { v: T; label: string; art: React.ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="pk-lbl">{label}</span>
        <span className="truncate text-[12.5px] font-semibold text-tungsten-300">{options.find((o) => o.v === value)?.label}</span>
      </div>
      <Tiles label={label} value={value} options={options} onChange={onChange} wrap />
      {hint && <span className="pk-hint min-h-[1.3em]">{hint}</span>}
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

type Tab = "ciegas" | "tiempo" | "reparto" | "sillas" | "ambiente";
const TABS: { key: Tab; label: string }[] = [
  { key: "ciegas", label: "Ciegas" },
  { key: "tiempo", label: "Tiempo" },
  { key: "reparto", label: "Reparto" },
  { key: "sillas", label: "Sillas" },
  { key: "ambiente", label: "Ambiente" },
];

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
  const [tab, setTab] = useState<Tab>("ciegas");
  const r = value.rules;
  const set = (p: Partial<TableRules>) => onChange({ ...value, rules: { ...r, ...p } });
  const rising = r.levels.length > 0;
  const levels = r.levels;
  const setLevel = (i: number, p: Partial<BlindLevel>) => set({ levels: levels.map((l, k) => (k === i ? { ...l, ...p } : l)) });
  const amb = { ...DEFAULT_AMBIENCE, ...value.ambience };
  const setAmb = (p: Partial<Ambience>) => onChange({ ...value, ambience: { ...amb, ...p } });
  const bb = levels[0]?.bb ?? value.bb;
  const ranged = !tournament && (r.buyInMin > 0 || r.buyInMax > 0);
  const setRange = (minBB: number, maxBB: number) => set({ buyInMin: minBB * bb, buyInMax: maxBB * bb });

  return (
    <div className="legible grid gap-4">
      {/* What is set, at a glance */}
      <p className="m-0 flex flex-wrap gap-x-2 gap-y-1 text-[13.5px] text-paper-dim" aria-label="Resumen de las reglas">
        {rulesSummary(value, tournament).map((s, i) => (
          <span key={s}>
            {i > 0 && <span className="mr-2 text-brass-700">·</span>}
            {s}
          </span>
        ))}
      </p>

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

      {/* Index tabs: one group open at a time */}
      <div className="grid gap-4">
        <div role="tablist" aria-label="Reglas de la mesa" className="flex gap-1 border-b-2 border-brass-700/70">
          {TABS.map((t) => {
            const on = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.key)}
                className={`-mb-0.5 border-2 border-b-0 px-3.5 py-1.5 text-[14px] font-semibold transition-colors [clip-path:polygon(6px_0,calc(100%-6px)_0,100%_100%,0_100%)] ${
                  on ? "border-brass-700/70 bg-[rgb(0_0_0/.28)] text-tungsten-400" : "border-transparent text-paper-dim hover:text-paper"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div role="tabpanel">
          <PickRows className="pk-wide">
          {tab === "ciegas" && (
            <>
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
                <Row label="Chica, grande y ante">
                  <Num label="Ciega chica" value={value.sb} onChange={(sb) => onChange({ ...value, sb, bb: Math.max(value.bb, sb) })} />
                  <span className="text-paper-mute">/</span>
                  <Num label="Ciega grande" value={value.bb} onChange={(bb) => onChange({ ...value, bb })} />
                  <span className="ml-2 text-[13px] text-paper-mute">ante</span>
                  <Num label="Ante" value={r.ante} onChange={(ante) => set({ ante })} />
                </Row>
              ) : (
                <>
                  <PickRow label="Subir cada" hint="Rehace la tabla desde el primer nivel." labelWidth="12rem">
                    <Seg
                      label="Subir cada"
                      value={levels[0]?.mins ?? 0}
                      onChange={(m) => set({ levels: schedule(value.sb, value.bb, m) })}
                      options={[5, 10, 15, 20].map((m) => ({ v: m, label: `${m} min` }))}
                    />
                  </PickRow>
                  <div className="max-h-[232px] overflow-y-auto border border-brass-700/50 bg-[rgb(0_0_0/.18)]">
                    <div className="sticky top-0 z-[1] grid grid-cols-[28px_repeat(4,minmax(0,1fr))_28px] items-center gap-2 bg-[#21180d] px-2 py-1.5 text-[12.5px] font-medium text-paper-mute">
                      <span>Nº</span>
                      <span>Chica</span>
                      <span>Grande</span>
                      <span>Ante</span>
                      <span>Minutos</span>
                      <span />
                    </div>
                    {levels.map((l, i) => (
                      <div key={i} className="grid grid-cols-[28px_repeat(4,minmax(0,1fr))_28px] items-center gap-2 px-2 py-1">
                        <b className="text-sm tabular-nums text-brass-200">{i + 1}</b>
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
                  </div>
                  <button
                    type="button"
                    className="btn-brass btn-sm w-fit"
                    onClick={() => {
                      const last = levels[levels.length - 1] ?? { sb: value.sb, bb: value.bb, ante: 0, mins: 10 };
                      const prev = levels.map((x, k) => (k === levels.length - 1 ? { ...x, mins: x.mins || 10 } : x));
                      set({ levels: [...prev, { sb: last.sb * 2, bb: last.bb * 2, ante: last.ante * 2, mins: 0 }] });
                    }}
                  >
                    <Plus className="h-4 w-4" aria-hidden /> Añadir nivel
                  </button>
                </>
              )}
              <Stamps
                label="Straddle"
                hint="El que va después de la grande pone dos grandes y habla último antes del flop. Con 3 o más."
                value={r.straddle}
                onChange={(straddle) => set({ straddle })}
                options={[
                  { v: false, label: "No" },
                  { v: true, label: "Siempre" },
                ]}
              />
              <Stamps
                label="Bote bomba"
                hint="Todos ponen lo mismo y la mano empieza en el flop."
                value={r.bombEvery}
                onChange={(bombEvery) => set({ bombEvery })}
                options={[
                  { v: 0, label: "Nunca" },
                  { v: 5, label: "Cada 5 manos" },
                  { v: 10, label: "Cada 10" },
                  { v: 20, label: "Cada 20" },
                ]}
              />
              {r.bombEvery > 0 && (
                <Stamps
                  label="Cada uno pone"
                  value={r.bombBB}
                  onChange={(bombBB) => set({ bombBB })}
                  options={[1, 2, 3, 5].map((v) => ({ v, label: `${v} ${v === 1 ? "grande" : "grandes"}` }))}
                />
              )}
              {!tournament && (
                <Stamps
                  label="Cuánto trae cada uno"
                  hint={ranged ? "Cada jugador elige al sentarse, dentro del rango." : undefined}
                  value={ranged}
                  onChange={(v) => (v ? setRange(40, 200) : set({ buyInMin: 0, buyInMax: 0 }))}
                  options={[
                    { v: false, label: "Lo mismo todos" },
                    { v: true, label: "Lo que quiera" },
                  ]}
                />
              )}
              {ranged && (
                <PickRow label="Compra" hint={`En grandes: ${Math.round(r.buyInMin / bb)} a ${Math.round(r.buyInMax / bb)}.`} labelWidth="12rem">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-paper-mute">de</span>
                    <Num label="Compra mínima" w="w-24" value={r.buyInMin} onChange={(buyInMin) => set({ buyInMin })} />
                    <span className="text-[13px] text-paper-mute">a</span>
                    <Num label="Compra máxima" w="w-24" value={r.buyInMax} onChange={(buyInMax) => set({ buyInMax })} />
                  </div>
                  <Seg
                    label="Atajos de compra"
                    value={`${r.buyInMin / bb}-${r.buyInMax / bb}`}
                    onChange={(k) => { const [lo, hi] = k.split("-").map(Number); setRange(lo, hi); }}
                    options={[[20, 100], [40, 200], [100, 300]].map(([lo, hi]) => ({ v: `${lo}-${hi}`, label: `${lo}-${hi} BB` }))}
                  />
                </PickRow>
              )}
              <Stamps
                label={tournament ? "Fichas de salida" : ranged ? "Compra sugerida" : "Fichas al sentarse"}
                hint={ranged ? "La que aparece marcada al sentarse." : undefined}
                value={value.stack}
                onChange={(stack) => onChange({ ...value, stack })}
                options={[500, 1000, 2000, 5000, 10000].map((v) => ({ v, label: fmt(v), off: v < value.bb * 20 }))}
              />
            </>
          )}

          {tab === "tiempo" && (
            <>
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
                label="Cigarrillo de reserva"
                hint="Tiempo extra cuando se acaba el tuyo."
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
                <Stamps label="Se repone cada" value={r.bankHands} onChange={(bankHands) => set({ bankHands })} options={[5, 10, 20].map((v) => ({ v, label: `${v} manos` }))} />
              )}
            </>
          )}

          {tab === "reparto" && (
            <>
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
                label="Pausa al terminar la mano"
                value={r.showdownSecs}
                onChange={(showdownSecs) => set({ showdownSecs })}
                options={[
                  { v: 3, label: "Corta" },
                  { v: 6, label: "Normal" },
                  { v: 9, label: "Larga" },
                ]}
              />
              {!tournament && (
                <Stamps
                  label="En un all-in"
                  hint={r.runItMode === "ask" ? "Dos tableros solo si todos los del all-in aceptan." : undefined}
                  value={r.runItMode}
                  onChange={(runItMode) => set({ runItMode })}
                  options={[
                    { v: "ask", label: "Preguntar" },
                    { v: "once", label: "Un tablero" },
                    { v: "twice", label: "Dos tableros" },
                  ]}
                />
              )}
              <Stamps
                label="Enseñar las manos en el all-in"
                hint="Cuando ya nadie puede apostar."
                value={r.revealAllIn}
                onChange={(revealAllIn) => set({ revealAllIn })}
                options={[
                  { v: true, label: "Sí" },
                  { v: false, label: "No" },
                ]}
              />
              <Stamps
                label="Cartas que habrían salido"
                hint="Al ganar sin showdown."
                value={r.rabbit}
                onChange={(rabbit) => set({ rabbit })}
                options={[
                  { v: true, label: "Enseñar" },
                  { v: false, label: "No" },
                ]}
              />
            </>
          )}

          {tab === "sillas" && (
            <>
              <Stamps label="Jugadores como máximo" value={r.maxSeats} onChange={(maxSeats) => set({ maxSeats })} options={[2, 4, 6, 8, 9].map((v) => ({ v, label: String(v) }))} />
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
            </>
          )}

          {tab === "ambiente" && (
            <>
              <TileRow
                label="Dónde se juega"
                hint="Todos en la mesa ven la misma sala."
                value={amb.place}
                onChange={(place) => setAmb({ place })}
                options={(Object.keys(PLACE_LABEL) as Ambience["place"][]).map((v) => ({ v, label: PLACE_LABEL[v], art: <PlacePicture place={v} /> }))}
              />
              <TileRow
                label="El crupier"
                hint={DEALER_LABEL[amb.dealer].hint}
                value={amb.dealer}
                onChange={(dealer) => setAmb({ dealer })}
                options={(Object.keys(DEALER_LABEL) as Ambience["dealer"][]).map((v) => ({ v, label: DEALER_LABEL[v].name, art: <DealerPicture dealer={v} /> }))}
              />
              <TileRow
                label="El paño"
                value={amb.felt}
                onChange={(felt) => setAmb({ felt })}
                options={(Object.keys(FELT_LABEL) as Ambience["felt"][]).map((v) => ({ v, label: FELT_LABEL[v], art: <FeltSample felt={v} rail={amb.rail} /> }))}
              />
              <TileRow
                label="El borde"
                value={amb.rail}
                onChange={(rail) => setAmb({ rail })}
                options={(Object.keys(RAIL_LABEL) as Ambience["rail"][]).map((v) => ({ v, label: RAIL_LABEL[v], art: <FeltSample felt={amb.felt} rail={v} /> }))}
              />
            </>
          )}
          </PickRows>
        </div>
      </div>
    </div>
  );
}
