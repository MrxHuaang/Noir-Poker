"use client";
import { useEffect, useState } from "react";
import { Volume2, VolumeX, Mic, Activity } from "lucide-react";
import { useSound } from "@/hooks/useSound";
import { useMicDevice } from "@/hooks/useMicDevice";
import { useAudioDevices } from "@/hooks/useAudioDevices";
import { useAudioLevel } from "@/hooks/useAudioLevel";

// Sound (mute + master volume) and microphone selection for P2P voice chat.
// `showMic` is only enabled for clients that can join the voice room.
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
      <section className="flex flex-col gap-4 p-5 rounded-2xl bg-white/[0.03] ring-1 ring-line">
        <h3 className="eyebrow text-[11px]">
          Sonido
        </h3>

        <div className="flex items-center justify-between">
          <span className="text-sm text-primary">Efectos de la mesa</span>
          <button
            type="button"
            onClick={toggleMute}
            className={`text-xs font-semibold inline-flex items-center gap-2 px-3 py-2 rounded-xl transition btn-press ring-1 ${
              muted
                ? "bg-white/[0.04] text-muted ring-line"
                : "bg-white/[0.10] text-primary ring-line-strong"
            }`}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            {muted ? "Silenciado" : "Activo"}
          </button>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-xs text-secondary flex items-center justify-between">
            <span>Volumen</span>
            <span className="tabular-nums text-muted">{Math.round(volume * 100)}%</span>
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
        <section className="flex flex-col gap-4 p-5 rounded-2xl bg-white/[0.03] ring-1 ring-line">
          <h3 className="eyebrow text-[11px]">
            Micrófono · chat de voz
          </h3>

          <label className="flex flex-col gap-2">
            <span className="text-xs text-secondary">Dispositivo de entrada</span>
            <select
              value={micDeviceId}
              onChange={(e) => setMicDeviceId(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-black/40 ring-1 ring-line text-primary text-sm outline-none focus:ring-white/40"
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
            <p className="text-[11px] text-muted">
              Pulsa &quot;Probar&quot; y permite el micrófono para ver los nombres reales.
            </p>
          )}

          {/* Mic test + level meter */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={testStream ? stopTest : startTest}
              className="font-semibold inline-flex items-center gap-2 px-3 py-2 rounded-xl transition btn-press ring-1 bg-white/[0.05] ring-line hover:bg-bone/[0.07]"
            >
              {testStream ? <Activity className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {testStream ? "Detener" : "Probar"}
            </button>
            <div className="flex-1 h-2.5 rounded-full bg-white/[0.06] overflow-hidden ring-1 ring-line">
              <div
                className="h-full bg-zinc-200 transition-[width] duration-75"
                style={{ width: `${Math.min(100, Math.round(level * 140))}%` }}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted">
            El cambio de micrófono se aplica en vivo si ya estás en el canal de voz.
          </p>
        </section>
      )}
    </div>
  );
}
