"use client";
// "La mesa": the house book, a sheet of paper slid in from the side, ordered
// like PokerNow's options: the invitation link, who is waiting at the door and
// who is seated (the owner lets people in or shows them out), the house rules
// (the owner edits them, the server validates them again), the session book
// (buy-ins and stacks) and the book of hands. Presentational only.
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { categoryLabel, type OnlineHandRecord } from "@/hooks/useOnlineHistory";
import type { PublicState } from "@/lib/online/protocol";
import { CLUB_RULES, TableRulesForm, type TableSetup } from "@/components/noir/TableRulesForm";

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const lineCls = "flex items-baseline gap-2";
const dots = <span className="flex-1 -translate-y-1 border-b-2 border-dotted border-[#8a7f6d]" />;

function Heading({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-[15px] font-bold text-card-ink">{children}</p>;
}

export function NoirTableLedger({
  code,
  joinUrl,
  state,
  uid,
  isOwner,
  history,
  onConfig,
  onApprove,
  onDeny,
  onKick,
  onStandUp,
  onClose,
}: {
  code: string;
  joinUrl: string;
  state: PublicState | null;
  uid: string | null;
  isOwner: boolean;
  history: OnlineHandRecord[];
  onConfig: (setup: TableSetup) => Promise<string | null>;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onKick: (id: string) => void;
  onStandUp?: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TableSetup>(() => ({
    sb: state?.sb ?? 5,
    bb: state?.bb ?? 10,
    stack: state?.startStack ?? 1000,
    rules: state?.rules ?? CLUB_RULES,
  }));
  const [note, setNote] = useState<string | null>(null);
  const locked = !!state?.tournament && !!state?.tStarted;

  async function copy() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function apply() {
    setNote(null);
    const err = await onConfig(draft);
    setNote(err ?? "Anotado en el libro. Vale desde la próxima mano.");
    if (!err) setEditing(false);
  }

  const r = state?.rules ?? CLUB_RULES;
  const summary = [
    r.levels.length ? `Ciegas que suben (${r.levels.length} niveles)` : `Ciegas ${fmt(state?.sb ?? 0)}/${fmt(state?.bb ?? 0)}${r.ante ? ` · ante ${fmt(r.ante)}` : ""}`,
    r.turnSecs ? `${r.turnSecs} s por turno` : "Sin reloj",
    r.bankSecs ? `reserva de ${r.bankSecs} s` : "sin reserva",
    r.runItMode === "ask" ? "all-in: se pregunta" : r.runItMode === "twice" ? "all-in: dos tableros" : "all-in: un tablero",
    `${r.maxSeats} sillas`,
    r.approveSeats ? "el anfitrión deja pasar" : "entra quien tenga el enlace",
  ];

  return (
    <div
      className="fixed inset-0 z-[80] flex justify-end bg-[rgb(5_4_3/.7)]"
      role="dialog"
      aria-modal="true"
      aria-label={`La mesa ${code}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="legible relative flex h-full w-[min(480px,96vw)] flex-col gap-6 overflow-y-auto bg-[linear-gradient(170deg,#ece3cf,#d6c7a8)] px-6 pt-7 pb-10 text-card-ink shadow-[-30px_0_60px_rgb(0_0_0/.5)]">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="m-0 text-[13px] font-semibold text-blood-500">El libro de la casa</p>
            <h2 className="m-0 text-3xl font-extrabold tracking-[-.02em]">
              La mesa <span className="tracking-[.12em]">{code}</span>
            </h2>
          </div>
          <button type="button" onClick={onClose} className="btn-brass btn-sm">
            Cerrar
          </button>
        </header>

        {/* The invitation: a link, like PokerNow */}
        <section className="grid gap-3 border-t-2 border-dotted border-[#8a7f6d] pt-4">
          <Heading>La invitación</Heading>
          <div className="flex items-center gap-4">
            <div className="bg-[#f6efdd] p-2 shadow-[inset_0_0_0_1px_#1a1612]">
              <QRCodeSVG value={joinUrl} size={92} bgColor="#f6efdd" fgColor="#1a1612" />
            </div>
            <div className="grid min-w-0 gap-2">
              <p className="m-0 truncate text-[14px]">{joinUrl.replace(/^https?:\/\//, "")}</p>
              <button type="button" onClick={copy} className="tk tk-sm tk-red w-fit">
                {copied ? "Enlace copiado" : "Copiar el enlace"}
              </button>
            </div>
          </div>
          <p className="m-0 text-[13px] text-[#5a4d3e]">Quien abra el enlace entra mirando y se sienta desde su navegador.</p>
        </section>

        {/* The door and the chairs */}
        <section className="grid gap-2 border-t-2 border-dotted border-[#8a7f6d] pt-4" aria-label="Jugadores">
          <Heading>En la puerta y en la mesa</Heading>
          {(state?.requests ?? []).map((q) => (
            <div key={q.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">
                <b>{q.name}</b> quiere sentarse
              </span>
              {isOwner && (
                <>
                  <button type="button" className="stamp text-blood-500" onClick={() => onApprove(q.id)}>
                    Dejar pasar
                  </button>
                  <button type="button" className="stamp text-[#5a4d3e]" onClick={() => onDeny(q.id)}>
                    No
                  </button>
                </>
              )}
            </div>
          ))}
          {(state?.seats ?? []).map((s) => (
            <div key={s.id} className={lineCls}>
              <span className="min-w-0 truncate">
                {s.id === uid ? "Tú" : s.name}
                {s.id === state?.owner ? <span className="text-[#5a4d3e]"> · anfitrión</span> : null}
                {s.away ? <span className="text-[#5a4d3e]"> · ausente</span> : null}
              </span>
              {dots}
              <b className="tabular-nums">{fmt(s.chips)}</b>
              {isOwner && s.id !== uid && (
                <button type="button" className="stamp h-6 px-1.5 text-[11px] text-blood-500" onClick={() => onKick(s.id)}>
                  Echar
                </button>
              )}
            </div>
          ))}
          {(state?.waiting?.length ?? 0) > 0 && <p className="m-0 text-[13px] text-[#5a4d3e]">{state!.waiting!.length} esperan silla en la barra.</p>}
        </section>

        {/* House rules */}
        <section className="grid gap-3 border-t-2 border-dotted border-[#8a7f6d] pt-4" aria-label="Reglas de la casa">
          <Heading>Reglas de la casa</Heading>
          {!editing ? (
            <>
              <ul className="m-0 grid list-none gap-1 p-0 text-[14px]">
                {summary.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              {isOwner && !locked && (
                <button type="button" className="btn-brass w-fit" onClick={() => setEditing(true)}>
                  Cambiar las reglas
                </button>
              )}
            </>
          ) : (
            // The form is written for the dark room: it sits on a brass plate here.
            <div className="plate grid gap-4 px-5 pt-7 pb-5 text-paper">
              <TableRulesForm value={draft} onChange={setDraft} tournament={!!state?.tournament} />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={apply} className="tk tk-sm tk-red">
                  Anotar en el libro
                </button>
                <button type="button" onClick={() => setEditing(false)} className="btn-brass btn-sm">
                  Dejarlo como estaba
                </button>
              </div>
            </div>
          )}
          {note && <p className="m-0 text-[14px] font-medium text-blood-500">{note}</p>}
        </section>

        {onStandUp && (
          <section className="grid gap-2 border-t-2 border-dotted border-[#8a7f6d] pt-4">
            <button type="button" onClick={onStandUp} className="btn-brass w-fit">
              Levantarme y mirar
            </button>
            <p className="m-0 text-[13px] text-[#5a4d3e]">Tus fichas vuelven al monedero al levantarte.</p>
          </section>
        )}

        {/* Session book */}
        <section className="grid gap-2 border-t-2 border-dotted border-[#8a7f6d] pt-4" aria-label="Libro de la sesión">
          <Heading>Libro de la sesión</Heading>
          {(state?.ledger ?? []).length === 0 ? (
            <p className="m-0 text-[14px] text-[#5a4d3e]">Nadie se ha sentado todavía.</p>
          ) : (
            <ol className="m-0 grid list-none gap-1 p-0 text-[14px]">
              <li className="flex gap-2 text-[13px] font-medium text-[#6d6252]">
                <span className="flex-1">Quién</span>
                <span className="w-16 text-right">Entró</span>
                <span className="w-16 text-right">Tiene</span>
                <span className="w-16 text-right">Neto</span>
              </li>
              {state!.ledger!.map((l, i) => {
                const net = l.stack - l.buyIn;
                return (
                  <li key={`${l.id}-${i}`} className="flex gap-2">
                    <span className="min-w-0 flex-1 truncate">
                      {l.id === uid ? "Tú" : l.name}
                      {l.left ? <span className="text-[#8a7f6d]"> (se fue)</span> : null}
                    </span>
                    <span className="w-16 text-right tabular-nums">{fmt(l.buyIn)}</span>
                    <span className="w-16 text-right tabular-nums">{fmt(l.stack)}</span>
                    <b className={`w-16 text-right tabular-nums ${net >= 0 ? "text-[#6b4f12]" : "text-blood-500"}`}>
                      {net >= 0 ? "+" : ""}
                      {fmt(net)}
                    </b>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* Book of hands */}
        <section className="grid gap-2 border-t-2 border-dotted border-[#8a7f6d] pt-4" aria-label="Libro de manos">
          <Heading>Libro de manos · {history.length}</Heading>
          {history.length === 0 ? (
            <p className="m-0 text-[14px] text-[#5a4d3e]">Todavía no se ha jugado ninguna mano.</p>
          ) : (
            <ol className="m-0 grid list-none gap-1.5 p-0 text-[14px]">
              {history.slice(0, 30).map((h) => {
                const who = (h.winners ?? []).map((w) => `${h.seatNames?.[w.id] ?? "?"} +${fmt(w.amount)}`).join(", ");
                const cat = h.categories ? [...new Set(Object.values(h.categories).map((c) => categoryLabel(c)))][0] : null;
                return (
                  <li key={h.handNum} className={lineCls}>
                    <span className="w-8 flex-none text-[#8a7f6d]">#{h.handNum}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {who}
                      {cat ? <span className="text-[#5a4d3e]"> · {cat.toLowerCase()}</span> : null}
                    </span>
                    {dots}
                    <b className="flex-none tabular-nums">{fmt(h.pot)}</b>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
