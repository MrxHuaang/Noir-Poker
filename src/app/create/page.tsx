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
  Spade,
  ArrowRight,
  Copy,
  Check,
  Share2,
  Link2,
  LayoutGrid,
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
        { isPublic, maxPlayers: 9, roomName: roomName.trim() || undefined },
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
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
            Crear mesa
          </h1>
          <p className="text-sm text-zinc-500">
            Las ciegas, stack y tiempo se ajustan dentro de la sala.
          </p>
        </div>
      </div>

      {code ? (
        /* Success: show the generated code */
        <BorderGlow
          className="w-full"
          glowColor={GLOW}
          colors={GLOW_COLORS}
          backgroundColor="rgba(11,11,13,0.85)"
          borderRadius={22}
          glowRadius={34}
          glowIntensity={1.05}
          coneSpread={22}
          fillOpacity={0.42}
          animated
        >
          <div className="flex flex-col items-center gap-5 p-7 text-center">
            <span className="text-[10px] uppercase tracking-[0.4em] text-zinc-500 font-bold">
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

            <p className="text-xs text-zinc-500 -mt-1">
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
            className="w-full"
            glowColor={GLOW}
            colors={GLOW_COLORS}
            backgroundColor="rgba(10,10,12,0.85)"
            borderRadius={18}
            glowRadius={26}
            glowIntensity={0.75}
            coneSpread={24}
            fillOpacity={0.35}
            animated={false}
          >
            <label className="flex flex-col gap-1.5 p-4">
              <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
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

          {/* Visibility choice */}
          <div className="grid grid-cols-2 gap-3">
            <VisToggle
              active={isPublic}
              onClick={() => setIsPublic(true)}
              icon={<Globe className="w-5 h-5" />}
              title="Pública"
              sub="Aparece en el lobby"
            />
            <VisToggle
              active={!isPublic}
              onClick={() => setIsPublic(false)}
              icon={<Lock className="w-5 h-5" />}
              title="Privada"
              sub="Solo con código"
            />
          </div>

          {error ? (
            <p className="text-sm text-rose-400 text-center">{error}</p>
          ) : null}

          <button
            type="button"
            onClick={handleCreate}
            disabled={loading || !uid || creating}
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-white text-black font-bold text-sm uppercase tracking-widest hover:bg-zinc-200 disabled:opacity-40 transition btn-press shadow-lg"
          >
            {creating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Spade className="w-4 h-4 fill-current" />
            )}
            {creating ? "Creando…" : "Crear mesa"}
          </button>
        </>
      )}
    </div>
  );
}

function VisToggle({
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
    <button type="button" onClick={onClick} className="block text-left btn-press">
      <BorderGlow
        className="w-full"
        glowColor={GLOW}
        colors={GLOW_COLORS}
        backgroundColor={active ? "rgba(24,24,27,0.9)" : "rgba(10,10,12,0.85)"}
        borderRadius={18}
        glowRadius={26}
        glowIntensity={active ? 1.1 : 0.7}
        coneSpread={24}
        fillOpacity={0.4}
        animated={active}
      >
        <div className="flex flex-col gap-1.5 p-4">
          <span className={active ? "text-zinc-50" : "text-zinc-500"}>{icon}</span>
          <span
            className={`text-sm font-semibold ${active ? "text-zinc-50" : "text-zinc-300"}`}
          >
            {title}
          </span>
          <span className="text-[11px] text-zinc-500">{sub}</span>
        </div>
      </BorderGlow>
    </button>
  );
}
