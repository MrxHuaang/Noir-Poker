"use client";
import { useEffect, useRef } from "react";

export function RemoteAudio({
  stream,
  volume = 1,
  muted = false,
}: {
  stream: MediaStream | null;
  volume?: number;
  muted?: boolean;
}) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (stream) {
      el.srcObject = stream;
      el.volume = muted ? 0 : volume;
      el.play().catch((err) => {
        console.warn("No se pudo reproducir audio remoto:", err);
      });
    }
    return () => {
      if (el) el.srcObject = null;
    };
  }, [stream, volume, muted]);

  return (
    <audio
      ref={ref}
      autoPlay
      playsInline
      style={{ display: "none" }}
      aria-hidden
    />
  );
}
