"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft,
  Globe,
  Lock,
  Loader2,
  ArrowRight,
  Copy,
  Check,
  Share2,
  Link2,
  LayoutGrid,
  Coins,
  Users2,
} from "lucide-react";
import { BorderGlow } from "@/components/ui/BorderGlow";
import { useAuth } from "@/hooks/useAuth";
import { createNormalRoom } from "@/lib/normalRooms";
import { DEFAULT_CONFIG } from "@/lib/betting";

const GLOW = "0 0 82";
const GLOW_COLORS = ["#ededf2", "#c4c4cc", "#8a8a93", "#52525b"];

export default function CreateRoom() {
  const { uid, loading } = useAuth();
  const router = useRouter();

  const [isPublic, setIsPublic] = useState(true);
  const [economy, setEconomy] = useState<"coins" | "casual">("coins");
  const [roomName, setRoomName] = useState("");
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const joinUrl =
    code && typeof window !== "undefined"
      ? `${window.location.origin}/play/normal/${code}`
      : "";

  function copy(text: string, mark: (v: boolean) => void) {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => {
      mark(true);
      setTimeout(() => mark(false), 1500);
    });
  }

  const canShare =
    typeof navigator !== "undefined" && "share" in navigator;

  function share() {
    if (!canShare || !joinUrl) return;
    navigator
      .share({ title: "Noir — mesa de poker", text: `Únete a mi mesa (${code})`, url: joinUrl })
      .catch(() => {});
  }

  async function handleCreate() {
    if (!uid || creating) return;
    setCreating(true);
    setError(null);
    try {
      const c = await createNormalRoom(
        uid,
        { ...DEFAULT_CONFIG, mode: "normal" },
        { isPublic, economy, maxPlayers: 9, roomName: roomName.trim() || undefined },
      );
      setCode(c);
    } catch {
      setError("No se pudo crear la mesa. Reintenta.");
      setCreating(false);
    }
  }

  return (
    <div className="relative z-[2] w-full max-w-md mx-auto px-4 py-12 flex flex-col gap-7">
      <div className="flex items-center gap-3">
        <Link
          href="/lobby"
          className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-zinc-100 transition"
          aria-label="Volver al lobby"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">
            Crear mesa
          </h1>
          <p className="text-sm text-muted">
            Las ciegas, stack y tiempo se ajustan dentro de la sala.
          </p>
        </div>
      </div>

      {code ? (
        /* Success: show the generated code */
        <BorderGlow
          className="w-full lg-blur"
          glowColor={GLOW}
          colors={GLOW_COLORS}
          backgroundColor="var(--lg-bg)"
          borderRadius={22}
          glowRadius={34}
          glowIntensity={1.05}
          coneSpread={22}
          fillOpacity={0.42}
          animated
        >
          <div className="flex flex-col items-center gap-5 p-7 text-center">
            <span className="text-[10px] uppercase tracking-[0.4em] text-muted font-bold">
              {isPublic ? "Mesa pública creada" : "Mesa privada creada"}
            </span>

            {/* QR */}
            {joinUrl && (
              <div className="p-3 bg-white rounded-2xl">
                <QRCodeSVG value={joinUrl} size={150} />
              </div>
            )}

            {/* Code — click to copy */}
            <button
              type="button"
              onClick={() => copy(code!, setCopied)}
              title="Copiar código"
              className="flex items-center gap-2 hover:opacity-80 transition"
            >
              <span className="text-5xl font-mono font-black tracking-[0.25em] text-zinc-50">
                {code}
              </span>
              {copied ? (
                <Check className="w-5 h-5 text-zinc-300" />
              ) : (
                <Copy className="w-5 h-5 text-zinc-600" />
              )}
            </button>

            <p className="text-xs text-muted -mt-1">
              {isPublic
                ? "Ya aparece en el lobby. Comparte el código, el enlace o el QR."
                : "Sala privada: solo con el código o el enlace pueden entrar."}
            </p>

            {/* Share row */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => copy(code!, setCopied)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/[0.05] hover:bg-white/10 ring-1 ring-white/10 text-zinc-200 text-[11px] font-bold uppercase tracking-widest transition btn-press"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                Código
              </button>
              <button
                type="button"
                onClick={() => copy(joinUrl, setCopiedLink)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/[0.05] hover:bg-white/10 ring-1 ring-white/10 text-zinc-200 text-[11px] font-bold uppercase tracking-widest transition btn-press"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                Enlace
              </button>
              {canShare && (
                <button
                  type="button"
                  onClick={share}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/[0.05] hover:bg-white/10 ring-1 ring-white/10 text-zinc-200 text-[11px] font-bold uppercase tracking-widest transition btn-press"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Compartir
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => router.push(`/host/normal?code=${code}`)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-black font-bold text-sm uppercase tracking-widest hover:bg-zinc-200 transition btn-press"
            >
              Entrar a la mesa
              <ArrowRight className="w-4 h-4" />
            </button>

            <Link
              href="/lobby"
              className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Volver al lobby
            </Link>
          </div>
        </BorderGlow>
      ) : (
        <>
          {/* Room name */}
          <BorderGlow
            className="w-full lg-blur"
            glowColor={GLOW}
            colors={GLOW_COLORS}
            backgroundColor="var(--lg-bg)"
            borderRadius={18}
            glowRadius={26}
            glowIntensity={0.75}
            coneSpread={24}
            fillOpacity={0.35}
            animated={false}
          >
            <label className="flex flex-col gap-1.5 p-4">
              <span className="text-[11px] uppercase tracking-[0.2em] text-muted font-bold">
                Nombre de la mesa
              </span>
              <input
                type="text"
                maxLength={32}
                placeholder="Mesa sin nombre"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="bg-transparent text-zinc-100 text-sm outline-none placeholder:text-zinc-600 caret-white"
              />
            </label>
          </BorderGlow>

          {/* Economy + Visibility — compact segmented selectors */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-[11px] uppercase tracking-[0.2em] text-muted font-bold px-0.5">
                Modo
              </span>
              <div className="grid grid-cols-2 gap-2">
                <OptionPill
                  active={economy === "coins"}
                  onClick={() => setEconomy("coins")}
                  icon={<Coins className="w-4 h-4" />}
                  label="Con monedas"
                  sub="Buy-in · XP"
                />
                <OptionPill
                  active={economy === "casual"}
                  onClick={() => setEconomy("casual")}
                  icon={<Users2 className="w-4 h-4" />}
                  label="Casual"
                  sub="Stack libre"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[11px] uppercase tracking-[0.2em] text-muted font-bold px-0.5">
                Visibilidad
              </span>
              <div className="grid grid-cols-2 gap-2">
                <OptionPill
                  active={isPublic}
                  onClick={() => setIsPublic(true)}
                  icon={<Globe className="w-4 h-4" />}
                  label="Pública"
                  sub="En el lobby"
                />
                <OptionPill
                  active={!isPublic}
                  onClick={() => setIsPublic(false)}
                  icon={<Lock className="w-4 h-4" />}
                  label="Privada"
                  sub="Solo con código"
                />
              </div>
            </div>
          </div>

          {error ? (
            <p className="text-sm text-rose-400 text-center">{error}</p>
          ) : null}

          <button
            type="button"
            onClick={handleCreate}
            disabled={loading || !uid || creating}
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-white text-black font-bold text-sm uppercase tracking-widest hover:bg-zinc-100 disabled:opacity-40 transition btn-press shadow-[0_2px_24px_rgba(255,255,255,0.12)]"
          >
            {creating && <Loader2 className="w-4 h-4 animate-spin" />}
            {creating ? "Creando…" : "Crear mesa"}
          </button>
        </>
      )}
    </div>
  );
}

function OptionPill({
  active,
  onClick,
  icon,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl ring-1 text-left btn-press transition-all ${
        active
          ? "bg-white/[0.10] ring-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]"
          : "bg-white/[0.03] ring-white/[0.08] hover:bg-white/[0.06] hover:ring-white/15"
      }`}
      style={{ transitionDuration: "var(--duration-micro)" }}
    >
      <span className={`shrink-0 ${active ? "text-accent-400" : "text-zinc-500"}`}>
        {icon}
      </span>
      <span className="flex flex-col min-w-0">
        <span className={`text-sm font-medium leading-tight ${active ? "text-zinc-50" : "text-zinc-300"}`}>
          {label}
        </span>
        <span className={`text-[11px] leading-tight mt-0.5 ${active ? "text-zinc-400" : "text-zinc-600"}`}>
          {sub}
        </span>
      </span>
    </button>
  );
}
