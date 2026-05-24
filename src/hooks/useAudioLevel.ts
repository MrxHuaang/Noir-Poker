"use client";
import { useEffect, useState } from "react";

// Web Audio analyser que entrega un valor 0..1 del nivel de voz para mostrar el
// anillo de "está hablando" en la UI. Refresca a ~12 fps (no 60) porque en una
// llamada full-mesh con 6-10 peers cada teléfono corre un analizador por
// participante; 60 fps × N peers funde batería y satura CPU del móvil. 12 fps
// es indistinguible al ojo para un indicador de actividad.
export function useAudioLevel(stream: MediaStream | null) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setLevel(0);
      return;
    }

    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const audioContext = new AudioCtor();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let rafId: number | null = null;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const average = sum / dataArray.length;
      setLevel(Math.min(1, average / 128));
      // ~12 fps: 80ms entre frames. rAF se usa solo para alinear con vsync
      // (evita medir mientras la pestaña está en background).
      timeoutId = setTimeout(() => {
        rafId = requestAnimationFrame(tick);
      }, 80);
    };

    tick();

    return () => {
      cancelled = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (rafId !== null) cancelAnimationFrame(rafId);
      source.disconnect();
      analyser.disconnect();
      audioContext.close().catch(() => {
        /* ignore */
      });
    };
  }, [stream]);

  return level;
}
