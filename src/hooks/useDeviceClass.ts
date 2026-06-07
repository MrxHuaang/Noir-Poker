"use client";
import { useEffect, useState } from "react";

export interface DeviceClass {
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  coarsePointer: boolean;
  portrait: boolean;
}

// SSR/pre-hydration default: assume desktop so the page renders normally and
// there is no hydration mismatch. The real values are set in useEffect (client only).
const SSR_DEFAULT: DeviceClass = {
  isPhone: false,
  isTablet: false,
  isDesktop: true,
  coarsePointer: false,
  portrait: false,
};

function compute(): DeviceClass {
  const w = window.innerWidth;
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  // Primary pointer coarse (touch) or no hover capability → treat as touch device.
  const coarsePointer =
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(hover: none)").matches;

  const isPhone = coarsePointer && w < 768;
  const isTablet = coarsePointer && w >= 768;
  const isDesktop = !coarsePointer;

  return { isPhone, isTablet, isDesktop, coarsePointer, portrait };
}

export function useDeviceClass(): DeviceClass {
  const [state, setState] = useState<DeviceClass>(SSR_DEFAULT);

  useEffect(() => {
    setState(compute());

    const orientationMq = window.matchMedia("(orientation: portrait)");

    function update() {
      setState(compute());
    }

    orientationMq.addEventListener("change", update);
    window.addEventListener("resize", update);

    return () => {
      orientationMq.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return state;
}
