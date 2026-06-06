"use client";
import { useLocalStorage } from "./useLocalStorage";

// Persisted microphone deviceId for the P2P voice chat. Empty string = browser
// default. Stored locally per device (mirrors useSound's localStorage pattern).
export function useMicDevice() {
  const [micDeviceId, setMicDeviceId, loaded] = useLocalStorage<string>(
    "poker-sim:micDeviceId",
    "",
  );
  return { micDeviceId, setMicDeviceId, loaded };
}
