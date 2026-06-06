"use client";
import { useCallback, useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";
import {
  playAllIn,
  playChip,
  playWinner,
  setSoundMuted,
  setSoundVolume,
} from "@/lib/sound";

export type SoundCue = "chip" | "allIn" | "winner";

export function useSound() {
  const [muted, setMuted, loaded] = useLocalStorage<boolean>(
    "poker-sim:muted",
    false,
  );
  const [volume, setVol, volLoaded] = useLocalStorage<number>(
    "poker-sim:volume",
    0.8,
  );

  useEffect(() => {
    if (loaded) setSoundMuted(muted);
  }, [muted, loaded]);

  useEffect(() => {
    if (volLoaded) setSoundVolume(volume);
  }, [volume, volLoaded]);

  const play = useCallback((cue: SoundCue) => {
    if (cue === "chip") playChip();
    else if (cue === "allIn") playAllIn();
    else if (cue === "winner") playWinner();
  }, []);

  const toggleMute = useCallback(() => setMuted((m) => !m), [setMuted]);
  const setVolume = useCallback((v: number) => setVol(v), [setVol]);

  return { muted, toggleMute, play, volume, setVolume } as const;
}
