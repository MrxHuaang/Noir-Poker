"use client";
import { useEffect, useState } from "react";
import { Volume2, VolumeX, Mic, Activity } from "lucide-react";
import { useSound } from "@/hooks/useSound";
import { useMicDevice } from "@/hooks/useMicDevice";
import { useAudioDevices } from "@/hooks/useAudioDevices";
import { useAudioLevel } from "@/hooks/useAudioLevel";

// Sound (mute + master volume) and — on phones — microphone selection for the
// P2P voice chat. `showMic` is false on the TV host (it never joins voice).
export function AudioVideoSettings({ showMic = false }: { showMic?: boolean }) {
  const { muted, toggleMute, volume, setVolume } = useSound();
  const { micDeviceId, setMicDeviceId } = useMicDevice();
  const { devices, refresh } = useAudioDevices();
  const [testStream, setTestStream] = useState<MediaStream | null>(null);
  const level = useAudioLevel(testStream);

  // Stop the mic-test stream when leaving the panel.
  useEffect(() => {
    return () => testStream?.getTracks().forEach((t) => t.stop());
  }, [testStream]);

  async function startTest() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true,
      });
      setTestStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop());
        return s;
      });
      void refresh(); // labels become available once permission is granted
    } catch {
      /* permission denied / no device */
    }
  }

  function stopTest() {
    setTestStream(null);
  }

  const needLabels = showMic && devices.every((d) => !d.label || /Micrófono \d/.test(d.label));

  return (
    <div className="flex flex-col gap-6">
      {/* Sound */}
      <section className="flex flex-col gap-4 p-5 rounded-2xl bg-white/[0.03] ring-1 ring-white/10">
        <h3 className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
          Sonido
        </h3>

        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-200">Efectos de la mesa</span>
          <button
            type="button"
            onClick={toggleMute}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition btn-press ring-1 ${
              muted
                ? "bg-white/[0.04] text-zinc-500 ring-white/10"
                : "bg-white/[0.10] text-zinc-100 ring-white/20"
            }`}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            {muted ? "Silenciado" : "Activo"}
          </button>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-xs text-zinc-400 flex items-center justify-between">
            <span>Volumen</span>
            <span className="tabular-nums text-zinc-500">{Math.round(volume * 100)}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            disabled={muted}
            className="w-full accent-zinc-200 disabled:opacity-40"
          />
        </label>
      </section>

      {/* Microphone (phones only) */}
      {showMic && (
        <section className="flex flex-col gap-4 p-5 rounded-2xl bg-white/[0.03] ring-1 ring-white/10">
          <h3 className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
            Micrófono · chat de voz
          </h3>

          <label className="flex flex-col gap-2">
            <span className="text-xs text-zinc-400">Dispositivo de entrada</span>
            <select
              value={micDeviceId}
              onChange={(e) => setMicDeviceId(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-black/40 ring-1 ring-white/10 text-zinc-100 text-sm outline-none focus:ring-white/40"
            >
              <option value="">Micrófono por defecto</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          {needLabels && (
            <p className="text-[11px] text-zinc-500">
              Pulsa &quot;Probar&quot; y permite el micrófono para ver los nombres reales.
            </p>
          )}

          {/* Mic test + level meter */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={testStream ? stopTest : startTest}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition btn-press ring-1 bg-white/[0.05] text-zinc-200 ring-white/10 hover:bg-white/10"
            >
              {testStream ? <Activity className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {testStream ? "Detener" : "Probar"}
            </button>
            <div className="flex-1 h-2.5 rounded-full bg-white/[0.06] overflow-hidden ring-1 ring-white/10">
              <div
                className="h-full bg-zinc-200 transition-[width] duration-75"
                style={{ width: `${Math.min(100, Math.round(level * 140))}%` }}
              />
            </div>
          </div>
          <p className="text-[11px] text-zinc-500">
            El cambio de micrófono se aplica en vivo si ya estás en el canal de voz.
          </p>
        </section>
      )}
    </div>
  );
}
