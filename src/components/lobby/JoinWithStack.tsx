"use client";
import { useId, useState } from "react";
import { AlertCircle, ArrowRight, Loader2, Shuffle } from "lucide-react";
import { Avatar } from "@/components/players/Avatar";
import { randomSeed } from "@/lib/dicebear";

type Props = {
  defaultName?: string;
  suggestedStack?: number;
  mode?: "join" | "rebuy";
  locked?: boolean;
  // When true (join flow): show avatar picker + room code header as a full page.
  showAvatar?: boolean;
  roomCode?: string;
  // Saldo disponible del wallet: el stack no puede excederlo.
  maxStack?: number;
  onSubmit: (name: string, stack: number, seed: string) => Promise<void>;
};

function FieldError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="flex items-center gap-1.5 text-xs text-rose-300">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

export function JoinWithStack({
  defaultName = "",
  suggestedStack = 1000,
  mode = "join",
  locked = false,
  showAvatar = false,
  roomCode,
  maxStack,
  onSubmit,
}: Props) {
  const cap = maxStack !== undefined ? Math.max(0, Math.floor(maxStack)) : undefined;
  const [name, setName] = useState(defaultName);
  const [stack, setStack] = useState(
    cap !== undefined ? Math.min(suggestedStack, cap) : suggestedStack,
  );
  const [seed, setSeed] = useState(() => randomSeed());
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fid = useId();
  const nameId = `${fid}-name`;
  const nameErrorId = `${fid}-name-error`;
  const stackId = `${fid}-stack`;
  const stackHintId = `${fid}-stack-hint`;

  const overCap = cap !== undefined && stack > cap;
  const broke = cap !== undefined && cap <= 0;
  const nameError = submitted && !name.trim();
  const stackError = submitted && stack <= 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!name.trim() || stack <= 0 || locked || overCap || broke) return;
    setLoading(true);
    try {
      await onSubmit(name.trim(), stack, seed);
    } finally {
      setLoading(false);
    }
  }

  const isRebuy = mode === "rebuy";

  const fields = (
    <div className="flex flex-col gap-6">
      {/* Avatar picker — only in join mode with showAvatar */}
      {showAvatar && !isRebuy && (
        <div className="flex items-center gap-4">
          <Avatar seed={seed} size={72} className="rounded-[14px]! bg-bone!" />
          <div className="flex flex-col items-start gap-2">
            <span className="eyebrow">Tu avatar</span>
            <button type="button" onClick={() => setSeed(randomSeed())} className="btn-quiet">
              <Shuffle className="h-4 w-4" aria-hidden />
              Otro avatar
            </button>
          </div>
        </div>
      )}

      {!isRebuy && (
        <div className="flex flex-col gap-2">
          <label htmlFor={nameId} className="eyebrow">
            Tu nombre
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(e) => { setName(e.target.value); }}
            placeholder="Apodo o nombre"
            maxLength={20}
            autoFocus={!isRebuy}
            autoComplete="nickname"
            disabled={loading || locked}
            aria-invalid={nameError}
            aria-describedby={nameError ? nameErrorId : undefined}
            className={`field disabled:opacity-40 ${nameError ? "border-rose-400/60!" : ""}`}
          />
          {nameError && <FieldError id={nameErrorId}>El nombre es requerido</FieldError>}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor={stackId} className="eyebrow">
          {isRebuy ? "Cantidad de fichas" : "Stack de entrada"}
        </label>
        <div className="flex items-center gap-2">
          <input
            id={stackId}
            type="text"
            inputMode="numeric"
            value={stack === 0 ? "" : stack}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9]/g, "");
              setStack(val === "" ? 0 : Number(val));
            }}
            disabled={loading || locked}
            aria-invalid={stackError || overCap || broke}
            aria-describedby={cap !== undefined ? stackHintId : undefined}
            className={`field numeric min-w-0 flex-1 disabled:opacity-40 ${
              stackError || overCap || broke ? "border-rose-400/60!" : ""
            }`}
            placeholder="Fichas…"
          />
          {suggestedStack > 0 && (
            <button
              type="button"
              onClick={() =>
                setStack(cap !== undefined ? Math.min(suggestedStack, cap) : suggestedStack)
              }
              title="Stack sugerido"
              aria-label="×1, stack sugerido"
              className="btn-quiet numeric shrink-0"
            >
              ×1
            </button>
          )}
          {cap !== undefined && cap > 0 && (
            <button
              type="button"
              onClick={() => setStack(cap)}
              title="Todo tu saldo"
              className="btn-quiet shrink-0"
            >
              Máx
            </button>
          )}
        </div>
        {cap !== undefined && (
          <p id={stackHintId} className="text-xs text-muted">
            Saldo disponible:{" "}
            <span className="numeric text-secondary">{cap.toLocaleString("es")}</span> monedas
          </p>
        )}
        {stackError && <FieldError>Ingresa un monto mayor a 0</FieldError>}
        {overCap && !broke && <FieldError>No tienes monedas suficientes</FieldError>}
        {broke && <FieldError>Sin monedas. Vuelve al lobby para el rescate diario.</FieldError>}
        {!showAvatar && (
          <p className="text-xs text-muted">El dueño puede ajustar el monto antes de aceptar.</p>
        )}
      </div>

      {locked && !isRebuy && (
        <p role="status" className="text-sm text-rose-300">
          Mesa cerrada: no se aceptan nuevos jugadores.
        </p>
      )}

      <button
        type="submit"
        disabled={!name.trim() || stack <= 0 || loading || locked || overCap || broke}
        className={`${isRebuy ? "btn-accent" : "btn-primary"} w-full`}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            <span className="sr-only">Enviando</span>
          </>
        ) : (
          <>
            {isRebuy ? "Solicitar" : "Entrar a la mesa"}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </>
        )}
      </button>
    </div>
  );

  // Full-page join layout when showAvatar = true
  if (showAvatar && !isRebuy) {
    return (
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex w-full max-w-md flex-col gap-8 px-5 py-12 sm:py-16"
      >
        {roomCode && (
          <header>
            <p className="eyebrow mb-4 flex items-center gap-2">
              <span className="suit text-sm" aria-hidden>
                ♠
              </span>
              Antes de sentarte
            </p>
            <h1 className="display text-4xl text-primary sm:text-5xl">
              Toma <em className="text-accent-200">asiento</em>.
            </h1>
            <p className="mt-4 max-w-[40ch] text-sm leading-relaxed text-secondary">
              Sala{" "}
              <span className="numeric tracking-[0.12em] text-primary">{roomCode}</span>. Elige tu
              apodo, tu avatar y con cuántas fichas entras.
            </p>
          </header>
        )}
        <div className="sheet p-5 sm:p-6">{fields}</div>
      </form>
    );
  }

  // Compact layout for rebuy / simple embed (sits on the game surface)
  return (
    <form onSubmit={handleSubmit} className="glass-panel flex flex-col gap-5 rounded-[20px] p-5">
      {!isRebuy && <h2 className="display text-2xl text-primary">Unirse a la sala</h2>}
      {fields}
    </form>
  );
}
