"use client";
import { DesktopOnlyGate } from "@/components/ui/DesktopOnlyGate";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, ArrowRight, Check, Copy, Link2, Loader2, Share2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { createNormalRoom } from "@/lib/normalRooms";
import { DEFAULT_CONFIG } from "@/lib/betting";

export default function CreateRoom() {
  return (
    <DesktopOnlyGate>
      <CreateRoomInner />
    </DesktopOnlyGate>
  );
}

function CreateRoomInner() {
  const { uid, loading } = useAuth();
  const router = useRouter();
  const scope = useRef<HTMLDivElement>(null);

  const [isPublic, setIsPublic] = useState(true);
  const [economy, setEconomy] = useState<"coins" | "casual">("coins");
  const [roomName, setRoomName] = useState("");
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".rise", {
          opacity: 0,
          y: 16,
          duration: 0.6,
          ease: "power3.out",
          stagger: 0.07,
          clearProps: "all",
        });
      });
      return () => mm.revert();
    },
    { scope, dependencies: [] },
  );

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
    <div ref={scope} className="relative z-[2] mx-auto w-full max-w-6xl px-5 pt-8 pb-24 sm:px-8 sm:pt-12">
      <Link
        href="/lobby"
        className="rise btn-link inline-flex min-h-11 items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al lobby
      </Link>

      <div className="mt-8 grid grid-cols-1 gap-12 sm:mt-10 lg:grid-cols-12 lg:gap-8">
        <header className="lg:col-span-5">
          <p className="rise eyebrow mb-5 flex items-center gap-2">
            <span className="suit suit-red text-sm" aria-hidden>
              ♦
            </span>
            {code ? (isPublic ? "Mesa pública creada" : "Mesa privada creada") : "Nueva mesa"}
          </p>
          <h1 className="rise display text-5xl text-primary sm:text-6xl">
            {code ? (
              <>
                La mesa está <em className="text-accent-200">servida</em>.
              </>
            ) : (
              <>
                Abre una <em className="text-accent-200">mesa</em>.
              </>
            )}
          </h1>
          <p className="rise mt-5 max-w-[42ch] text-[15px] leading-relaxed text-secondary">
            {code
              ? isPublic
                ? "Ya aparece en el lobby. Comparte el código, el enlace o el QR con tu grupo."
                : "Es privada: solo entra quien tenga el código o el enlace."
              : "Las ciegas, el stack y el tiempo por jugada se ajustan dentro de la sala."}
          </p>
        </header>

        <div className="rise lg:col-span-7">
          {code ? (
            <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="eyebrow">Código de sala</p>
                <button
                  type="button"
                  onClick={() => copy(code, setCopied)}
                  title="Copiar código"
                  aria-label={`Copiar código ${code}`}
                  className="group mt-2 inline-flex items-center gap-4 text-left"
                >
                  <span className="numeric text-6xl font-medium tracking-[0.14em] text-primary sm:text-7xl">
                    {code}
                  </span>
                  {copied ? (
                    <Check className="h-5 w-5 shrink-0 text-accent-300" />
                  ) : (
                    <Copy className="h-5 w-5 shrink-0 text-muted transition-colors group-hover:text-primary" />
                  )}
                </button>

                <div className="mt-7 flex flex-wrap gap-2">
                  <button type="button" onClick={() => copy(code, setCopied)} className="btn-quiet">
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Código copiado" : "Copiar código"}
                  </button>
                  <button type="button" onClick={() => copy(joinUrl, setCopiedLink)} className="btn-quiet">
                    {copiedLink ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                    {copiedLink ? "Enlace copiado" : "Copiar enlace"}
                  </button>
                  {canShare && (
                    <button type="button" onClick={share} className="btn-quiet">
                      <Share2 className="h-4 w-4" />
                      Compartir
                    </button>
                  )}
                </div>
                <span className="sr-only" aria-live="polite">
                  {copied ? "Código copiado" : copiedLink ? "Enlace copiado" : ""}
                </span>

                <div className="rule mt-9" />
                <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
                  <button
                    type="button"
                    onClick={() => router.push(`/host/normal?code=${code}`)}
                    className="btn-primary"
                  >
                    Entrar a la mesa
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <Link href="/lobby" className="btn-link text-sm">
                    Ver el lobby
                  </Link>
                </div>
              </div>

              {joinUrl && (
                <figure className="shrink-0">
                  <div className="w-fit rounded-2xl bg-bone p-3.5">
                    <QRCodeSVG value={joinUrl} size={148} bgColor="transparent" />
                  </div>
                  <figcaption className="eyebrow mt-3">Escanéalo para entrar</figcaption>
                </figure>
              )}
            </div>
          ) : (
            <div className="sheet p-5 sm:p-7">
              <div className="flex flex-col gap-2">
                <label htmlFor="room-name" className="eyebrow">
                  Nombre de la mesa
                </label>
                <input
                  id="room-name"
                  type="text"
                  maxLength={32}
                  placeholder="Mesa sin nombre"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  autoComplete="off"
                  className="field"
                />
              </div>

              <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-6">
                <ChoiceGroup
                  legend="Modo"
                  name="economy"
                  value={economy}
                  onChange={setEconomy}
                  options={[
                    { value: "coins", label: "Con monedas", sub: "Buy-in con tu saldo, suma XP" },
                    { value: "casual", label: "Casual", sub: "Stack libre, sin monedas" },
                  ]}
                />
                <ChoiceGroup
                  legend="Visibilidad"
                  name="visibility"
                  value={isPublic ? "public" : "private"}
                  onChange={(v) => setIsPublic(v === "public")}
                  options={[
                    { value: "public", label: "Pública", sub: "Aparece en el lobby" },
                    { value: "private", label: "Privada", sub: "Solo con el código" },
                  ]}
                />
              </div>

              <div className="rule mt-8" />

              <div className="mt-6 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-[34ch] text-xs leading-relaxed text-muted">
                  Hasta <span className="numeric text-secondary">9</span> jugadores. Tú haces de
                  anfitrión.
                </p>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={loading || !uid || creating}
                  className="btn-primary w-full sm:w-auto"
                >
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  {creating ? "Creando…" : "Crear mesa"}
                </button>
              </div>

              {error ? (
                <p role="alert" className="mt-4 text-sm text-rose-300">
                  {error}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type Choice<T extends string> = { value: T; label: string; sub: string };

// A segmented choice as hairline rows: native radios for keyboard and screen
// readers, the accent only marks the selected row.
function ChoiceGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: Choice<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="eyebrow mb-2">{legend}</legend>
      <div className="border-t border-line">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <label
              key={o.value}
              className="flex min-h-14 cursor-pointer items-center gap-3.5 border-b border-line px-1.5 py-3 transition-colors duration-200 hover:bg-bone/[0.03] has-[:focus-visible]:bg-bone/[0.04] has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-accent-300"
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={active}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors duration-200 ${
                  active ? "border-accent-400" : "border-line-strong"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full bg-accent-400 transition-opacity duration-200 ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-medium ${active ? "text-primary" : "text-secondary"}`}>
                  {o.label}
                </span>
                <span className="mt-0.5 block text-xs text-muted">{o.sub}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
