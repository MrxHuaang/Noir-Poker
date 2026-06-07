"use client";
import { type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Monitor, Copy, Check, Smartphone } from "lucide-react";
import { useDeviceClass } from "@/hooks/useDeviceClass";

interface Props {
  children?: ReactNode;
  // Código de sala para mostrar en el gate (opcional).
  roomCode?: string;
  // URL alternativa para el QR/enlace. Por defecto: window.location.href.
  href?: string;
  // Callback llamado al pulsar "Continuar de todos modos". Si no se pasa,
  // el gate muestra children directamente al hacer bypass.
  onBypass?: () => void;
}

export function DesktopOnlyGate({ children, roomCode, href, onBypass }: Props) {
  const { isDesktop, isTablet, portrait } = useDeviceClass();
  const [bypassed, setBypassed] = useState(false);
  const [url, setUrl] = useState(href ?? "");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!href) setUrl(window.location.href);
  }, [href]);

  // Desktop or explicit bypass: render children.
  if (isDesktop || bypassed) return <>{children}</>;

  // La salida de escape aparece solo en tablets grandes en horizontal
  // (min-width: 1024 px + landscape). En teléfono vertical NO se ofrece.
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 0;
  const canEscape = isTablet && !portrait && viewportW >= 1024;

  function copyLink() {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  function handleBypass() {
    if (onBypass) {
      onBypass();
    } else {
      setBypassed(true);
    }
  }

  return (
    <div className="fixed inset-0 bg-[#0b0b0b] flex flex-col items-center justify-center p-6 gap-5 overflow-y-auto">
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-accent-600/5 blur-[100px]" />
      </div>

      {/* Icono de escritorio */}
      <div className="relative z-10 p-4 rounded-[20px] bg-accent-500/10 ring-1 ring-accent-400/20">
        <Monitor className="w-8 h-8 text-accent-400" aria-hidden="true" />
      </div>

      {/* Mensaje */}
      <div className="relative z-10 text-center max-w-xs flex flex-col gap-2">
        <h1 className="text-xl font-bold text-zinc-50 tracking-tight">
          Este modo es solo para escritorio
        </h1>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Los controles de apuesta no caben cómodos en la pantalla del
          teléfono. Abre este enlace en tu compu para entrar a la mesa.
        </p>
      </div>

      {/* Código de sala */}
      {roomCode && (
        <div className="relative z-10 px-4 py-1.5 rounded-full bg-white/5 ring-1 ring-white/10 text-[11px] font-mono uppercase tracking-[0.3em] text-zinc-400">
          Sala {roomCode}
        </div>
      )}

      {/* QR del enlace */}
      {url ? (
        <div className="relative z-10 p-3 bg-white rounded-2xl shadow-lg">
          <QRCodeSVG value={url} size={140} />
        </div>
      ) : (
        <div className="relative z-10 w-[166px] h-[166px] rounded-2xl bg-zinc-900 motion-safe:animate-pulse" />
      )}

      {/* Botón copiar enlace */}
      <button
        type="button"
        onClick={copyLink}
        className="relative z-10 inline-flex items-center gap-2 px-5 py-3 rounded-full bg-accent-700/60 hover:bg-accent-600/70 text-accent-100 font-bold text-sm uppercase tracking-widest transition btn-press"
      >
        {copied ? (
          <Check className="w-4 h-4" aria-hidden="true" />
        ) : (
          <Copy className="w-4 h-4" aria-hidden="true" />
        )}
        {copied ? "Enlace copiado" : "Copiar enlace"}
      </button>

      {/* Puntero al modo presencial */}
      <div className="relative z-10 text-center max-w-xs flex flex-col items-center gap-2">
        <p className="text-xs text-zinc-500">
          ¿Están todos en el mismo lugar? Prueba el modo presencial, pensado
          para jugar desde el teléfono.
        </p>
        <Link
          href="/host"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-accent-400 hover:text-accent-300 transition"
        >
          <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
          Ir al modo presencial
        </Link>
      </div>

      {/* Salida de escape — solo tablets grandes en horizontal */}
      {canEscape && (
        <button
          type="button"
          onClick={handleBypass}
          className="relative z-10 text-[11px] text-zinc-600 hover:text-zinc-400 transition underline underline-offset-2 mt-1"
        >
          Continuar de todos modos
        </button>
      )}
    </div>
  );
}
