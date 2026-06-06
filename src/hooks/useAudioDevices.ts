"use client";
import { useCallback, useEffect, useState } from "react";

export type AudioInputDevice = { deviceId: string; label: string };

// Enumerates audio input (microphone) devices. Labels are only populated once
// the user has granted mic permission — until then they show generic names.
// Re-enumerates on the browser's `devicechange` event (plug/unplug).
export function useAudioDevices() {
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);

  const refresh = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.enumerateDevices
    ) {
      return;
    }
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const mics = all
        .filter((d) => d.kind === "audioinput")
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Micrófono ${i + 1}`,
        }));
      setDevices(mics);
    } catch {
      /* ignore — permission or unsupported */
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    const md = navigator.mediaDevices;
    md.addEventListener?.("devicechange", refresh);
    return () => md.removeEventListener?.("devicechange", refresh);
  }, [refresh]);

  return { devices, refresh };
}
