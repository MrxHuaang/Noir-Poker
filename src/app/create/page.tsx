"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Globe, Lock, Loader2, Spade } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { createNormalRoom } from "@/lib/normalRooms";
import type { RoomConfig } from "@/lib/betting";

const BLIND_PRESETS = [
  { sb: 5, bb: 10 },
  { sb: 10, bb: 20 },
  { sb: 25, bb: 50 },
  { sb: 50, bb: 100 },
];
const STACK_PRESETS = [1000, 2500, 5000, 10000];
const TIME_PRESETS = [15, 30, 45, 60];

export default function CreateRoom() {
  const { uid, loading } = useAuth();
  const router = useRouter();

  const [roomName, setRoomName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [blind, setBlind] = useState(BLIND_PRESETS[0]);
  const [stack, setStack] = useState(STACK_PRESETS[0]);
  const [turnSeconds, setTurnSeconds] = useState(30);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!uid || creating) return;
    setCreating(true);
    setError(null);
    const config: RoomConfig = {
      mode: "normal",
      startingStack: stack,
      smallBlind: blind.sb,
      bigBlind: blind.bb,
      ante: 0,
      turnTime: turnSeconds * 1000,
      timeBankInit: 60000,
    };
    try {
      const code = await createNormalRoom(uid, config, {
        roomName,
        isPublic,
        maxPlayers,
      });
      router.push(`/host/normal?code=${code}`);
    } catch {
      setError("No se pudo crear la mesa. Reintenta.");
      setCreating(false);
    }
  }

  return (
    <div className="relative z-[2] w-full max-w-lg mx-auto px-4 py-10 flex flex-col gap-7">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-zinc-100 transition"
          aria-label="Volver al lobby"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
            Crear mesa
          </h1>
          <p className="text-sm text-zinc-500">Sala online con fichas y apuestas</p>
        </div>
      </div>

      {/* Nombre */}
      <Field label="Nombre de la mesa">
        <input
          value={roomName}
          onChange={(e) => setRoomName(e.target.value.slice(0, 32))}
          placeholder="Mesa de la casa"
          className="w-full px-4 py-3 rounded-xl bg-white/[0.04] ring-1 ring-white/10 focus:ring-accent/60 outline-none text-zinc-100 placeholder:text-zinc-600 transition"
        />
      </Field>

      {/* Visibilidad */}
      <Field label="Visibilidad">
        <div className="grid grid-cols-2 gap-2">
          <Toggle
            active={isPublic}
            onClick={() => setIsPublic(true)}
            icon={<Globe className="w-4 h-4" />}
            title="Pública"
            sub="Aparece en el lobby"
          />
          <Toggle
            active={!isPublic}
            onClick={() => setIsPublic(false)}
            icon={<Lock className="w-4 h-4" />}
            title="Privada"
            sub="Solo con código"
          />
        </div>
      </Field>

      {/* Jugadores */}
      <Field label={`Jugadores máximos · ${maxPlayers}`}>
        <input
          type="range"
          min={2}
          max={9}
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(Number(e.target.value))}
          className="w-full accent-accent"
        />
      </Field>

      {/* Ciegas */}
      <Field label="Ciegas (SB / BB)">
        <Chips
          options={BLIND_PRESETS.map((b) => ({ key: `${b.sb}/${b.bb}`, value: b }))}
          selected={`${blind.sb}/${blind.bb}`}
          onSelect={(b) => setBlind(b)}
          render={(b) => `${b.sb} / ${b.bb}`}
        />
      </Field>

      {/* Stack inicial */}
      <Field label="Stack inicial">
        <Chips
          options={STACK_PRESETS.map((s) => ({ key: String(s), value: s }))}
          selected={String(stack)}
          onSelect={setStack}
          render={(s) => s.toLocaleString()}
        />
      </Field>

      {/* Tiempo de turno */}
      <Field label="Tiempo por turno">
        <Chips
          options={TIME_PRESETS.map((s) => ({ key: String(s), value: s }))}
          selected={String(turnSeconds)}
          onSelect={setTurnSeconds}
          render={(s) => `${s}s`}
        />
      </Field>

      {error ? (
        <p className="text-sm text-rose-400 text-center">{error}</p>
      ) : null}

      <button
        type="button"
        onClick={handleCreate}
        disabled={loading || !uid || creating}
        className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-accent text-black font-bold text-sm uppercase tracking-widest hover:brightness-110 disabled:opacity-40 transition btn-press shadow-lg"
      >
        {creating ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Spade className="w-4 h-4 fill-current" />
        )}
        {creating ? "Creando…" : "Crear y abrir mesa"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
        {label}
      </span>
      {children}
    </label>
  );
}

function Toggle({
  active,
  onClick,
  icon,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-1 p-3 rounded-xl ring-1 text-left transition ${
        active
          ? "bg-accent/10 ring-accent/50 text-zinc-100"
          : "bg-white/[0.03] ring-white/10 text-zinc-400 hover:ring-white/25"
      }`}
    >
      <span className={active ? "text-accent" : ""}>{icon}</span>
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-[11px] text-zinc-500">{sub}</span>
    </button>
  );
}

function Chips<T>({
  options,
  selected,
  onSelect,
  render,
}: {
  options: { key: string; value: T }[];
  selected: string;
  onSelect: (v: T) => void;
  render: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onSelect(o.value)}
          className={`px-4 py-2 rounded-lg text-sm font-semibold tabular-nums ring-1 transition ${
            selected === o.key
              ? "bg-accent text-black ring-accent"
              : "bg-white/[0.03] text-zinc-300 ring-white/10 hover:ring-white/25"
          }`}
        >
          {render(o.value)}
        </button>
      ))}
    </div>
  );
}
