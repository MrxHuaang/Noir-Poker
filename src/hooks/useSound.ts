"use client";
import { useCallback, useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { playAllIn, playChip, playWinner, setSoundMuted } from "@/lib/sound";

export type SoundCue = "chip" | "allIn" | "winner";

export function useSound() {
  const [muted, setMuted, loaded] = useLocalStorage<boolean>(
    "poker-sim:muted",
    false,
  );

  useEffect(() => {
    if (loaded) setSoundMuted(muted);
  }, [muted, loaded]);

  const play = useCallback((cue: SoundCue) => {
    if (cue === "chip") playChip();
    else if (cue === "allIn") playAllIn();
    else if (cue === "winner") playWinner();
  }, []);

  const toggleMute = useCallback(() => setMuted((m) => !m), [setMuted]);

  return { muted, toggleMute, play } as const;
}
