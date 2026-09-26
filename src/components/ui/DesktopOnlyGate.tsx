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
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 overflow-y-auto bg-ink-900 p-6">
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute top-0 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full bg-bone/[0.04] blur-[90px]" />
      </div>

      {/* Icono de escritorio */}
      <Monitor className="relative z-10 h-7 w-7 text-muted" aria-hidden="true" />

      {/* Mensaje */}
      <div className="relative z-10 text-center max-w-xs flex flex-col gap-2">
        <h1 className="display text-4xl text-primary">
          Esta mesa se juega en <em className="text-accent-200">computadora</em>
        </h1>
        <p className="text-sm leading-relaxed text-secondary">
          Los controles de apuesta no caben cómodos en la pantalla del
          teléfono. Abre este enlace en tu compu para entrar a la mesa.
        </p>
      </div>

      {/* Código de sala */}
      {roomCode && (
        <p className="relative z-10 text-sm text-muted">
          Sala <span className="numeric tracking-[0.25em] text-primary">{roomCode}</span>
        </p>
      )}

      {/* QR del enlace */}
      {url ? (
        <div className="relative z-10 rounded-2xl bg-bone p-3">
          <QRCodeSVG value={url} size={140} />
        </div>
      ) : (
        <div className="relative z-10 h-[166px] w-[166px] rounded-2xl bg-ink-800 motion-safe:animate-pulse" />
      )}

      {/* Botón copiar enlace */}
      <button
        type="button"
        onClick={copyLink}
        className="btn-primary relative z-10"
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
        <p className="text-xs leading-relaxed text-muted">
          ¿Están todos en el mismo lugar? Prueba el modo presencial, pensado
          para jugar desde el teléfono.
        </p>
        <Link
          href="/host"
          className="btn-link inline-flex items-center gap-1.5 text-sm"
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
          className="btn-link relative z-10 mt-1 text-xs"
        >
          Continuar de todos modos
        </button>
      )}
    </div>
  );
}
