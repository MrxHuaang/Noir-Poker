"use client";
// The room's pickers: every option set is one straight object, never a wall of
// wrapping stamps.
// - Seg: a brass switch of equal segments (few short options).
// - Lever: two-way choices, the word on each side of a brass lever.
// - Dial: long lists, the value in a sunk slot with arrows and notches.
// - Tiles: framed samples for choices you look at (cards, rooms, dealers).
// - PickRow / PickRows: one row per question, laid out against its own width.
// All are radio groups (Dial is a slider) with arrow keys, Home and End.
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type PickOption<T> = { v: T; label: string; off?: boolean; icon?: ReactNode; art?: ReactNode };

export function PickRows({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`pk-rows ${className}`}>{children}</div>;
}

export function PickRow({ label, hint, children, labelWidth }: { label: string; hint?: ReactNode; children: ReactNode; labelWidth?: string }) {
  return (
    <div className="pk-row" style={labelWidth ? ({ "--pk-lw": labelWidth } as React.CSSProperties) : undefined}>
      <div>
        <span className="pk-lbl">{label}</span>
        {hint ? <span className="pk-hint">{hint}</span> : null}
      </div>
      <div className="pk-ctl">{children}</div>
    </div>
  );
}

/** Arrow keys move the choice (skipping disabled options) and the focus with it. */
function useRadioKeys<T>(options: PickOption<T>[], value: T, onChange: (v: T) => void) {
  const box = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent) => {
    const live = options.map((o, i) => [o, i] as const).filter(([o]) => !o.off);
    if (!live.length) return;
    const at = live.findIndex(([o]) => o.v === value);
    let j: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (at + 1) % live.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (at - 1 + live.length) % live.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = live.length - 1;
    if (j === null) return;
    e.preventDefault();
    const [o, i] = live[j];
    onChange(o.v);
    (box.current?.querySelectorAll<HTMLElement>("[role=radio]")[i])?.focus();
  };
  return { box, onKeyDown };
}

export function Seg<T>({ label, value, options, onChange, disabled }: { label: string; value: T; options: PickOption<T>[]; onChange: (v: T) => void; disabled?: boolean }) {
  const { box, onKeyDown } = useRadioKeys(options, value, onChange);
  return (
    <div ref={box} className="pk-seg" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button key={String(o.v)} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} disabled={disabled || o.off} onClick={() => onChange(o.v)} title={o.label}>
            {o.icon}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A row of equal brass buttons for actions (not a choice): bet presets, show a card. */
export function ActSeg({ label, actions }: { label: string; actions: { label: ReactNode; onClick: () => void; disabled?: boolean; key: string; title?: string }[] }) {
  return (
    <div className="pk-seg pk-act" role="group" aria-label={label}>
      {actions.map((a) => (
        <button key={a.key} type="button" onClick={a.onClick} disabled={a.disabled} title={a.title}>
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Lever<T>({ label, value, options, onChange }: { label: string; value: T; options: [PickOption<T>, PickOption<T>]; onChange: (v: T) => void }) {
  const { box, onKeyDown } = useRadioKeys(options, value, onChange);
  const [a, b] = options;
  const right = value === b.v;
  const pick = (o: PickOption<T>) => (
    <button type="button" role="radio" aria-checked={o.v === value} tabIndex={o.v === value ? 0 : -1} onClick={() => onChange(o.v)}>
      {o.label}
    </button>
  );
  return (
    <div ref={box} className="pk-lv" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {pick(a)}
      <span className="pk-lever" data-on={right} aria-hidden onClick={() => onChange(right ? a.v : b.v)}>
        <i />
      </span>
      {pick(b)}
    </div>
  );
}

export function Dial<T>({ label, value, options, onChange, thumb }: { label: string; value: T; options: PickOption<T>[]; onChange: (v: T) => void; thumb?: (v: T) => ReactNode }) {
  const live = options.filter((o) => !o.off);
  const i = Math.max(0, live.findIndex((o) => o.v === value));
  const go = (j: number) => { if (j >= 0 && j < live.length) onChange(live[j].v); };
  const cur = live[i];
  return (
    <div
      className="pk-dial"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={live.length - 1}
      aria-valuenow={i}
      aria-valuetext={`${cur?.label ?? ""} (${i + 1} de ${live.length})`}
      onKeyDown={(e) => {
        const m: Record<string, number> = { ArrowRight: i + 1, ArrowUp: i + 1, ArrowLeft: i - 1, ArrowDown: i - 1, Home: 0, End: live.length - 1 };
        if (e.key in m) { e.preventDefault(); go(m[e.key]); }
      }}
    >
      <button type="button" className="pk-dial-a" tabIndex={-1} aria-hidden disabled={i === 0} onMouseDown={(e) => e.preventDefault()} onClick={() => go(i - 1)}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="pk-dial-v">
        {cur && thumb ? thumb(cur.v) : null}
        <span className="pk-dial-t">{cur?.label}</span>
        <span className="pk-ticks" aria-hidden>
          {live.map((o, j) => (
            <i key={String(o.v)} data-on={j === i} title={o.label} onMouseDown={(e) => e.preventDefault()} onClick={() => go(j)} />
          ))}
        </span>
      </span>
      <button type="button" className="pk-dial-a" tabIndex={-1} aria-hidden disabled={i === live.length - 1} onMouseDown={(e) => e.preventDefault()} onClick={() => go(i + 1)}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Tiles<T>({ label, value, options, onChange, wrap }: { label: string; value: T; options: PickOption<T>[]; onChange: (v: T) => void; wrap?: boolean }) {
  const { box, onKeyDown } = useRadioKeys(options, value, onChange);
  return (
    <div ref={box} className="pk-tiles" data-wrap={!!wrap} style={{ "--pk-n": options.length } as React.CSSProperties} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button key={String(o.v)} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} disabled={o.off} className="pk-tile" onClick={() => onChange(o.v)} title={o.label}>
            {o.art}
            <span className="pk-cap">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The right control for a plain option list: a lever for two short words, a
 * switch when everything fits in one line, a dial otherwise.
 */
export function AutoPick<T>({ label, value, options, onChange, disabled }: { label: string; value: T; options: PickOption<T>[]; onChange: (v: T) => void; disabled?: boolean }) {
  const chars = options.reduce((n, o) => n + o.label.length, 0);
  if (disabled) return <Seg label={label} value={value} options={options} onChange={onChange} disabled />;
  if (options.length <= 5 && chars <= 34) return <Seg label={label} value={value} options={options} onChange={onChange} />;
  if (options.length === 2) return <Seg label={label} value={value} options={options} onChange={onChange} />;
  return <Dial label={label} value={value} options={options} onChange={onChange} />;
}
