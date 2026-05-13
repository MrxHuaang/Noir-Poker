"use client";
import { useCallback, useEffect, useState } from "react";
import { safeGet, safeSet } from "@/lib/storage";

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setValue(safeGet<T>(key, initial));
    setLoaded(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setValue(safeGet<T>(key, initial));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    safeSet(key, value);
  }, [key, value, loaded]);

  const update = useCallback((v: T | ((prev: T) => T)) => {
    setValue(v);
  }, []);

  return [value, update, loaded] as const;
}
