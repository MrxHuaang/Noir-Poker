"use client";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import Grainient from "./Grainient";
import { ACCENT_GRAINIENT } from "@/lib/brand";

const GAME_PREFIXES = ["/host", "/play", "/admin"];
const BACKGROUND_OVERLAY =
  "radial-gradient(ellipse 100% 72% at 50% 44%, transparent 0%, rgba(8,6,14,0.58) 58%, rgba(6,5,11,0.9) 100%), linear-gradient(180deg, rgba(6,5,11,0.56) 0%, transparent 22%, transparent 78%, rgba(6,5,11,0.64) 100%)";

type BackgroundMode = "live" | "mobile-live" | "mobile-static";

function pickBackgroundMode() {
  if (typeof window === "undefined") return "live" as BackgroundMode;

  const isMobile = window.innerWidth < 640;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = "connection" in navigator
    && "saveData" in (navigator as Navigator & { connection?: { saveData?: boolean } }).connection!
    && Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  const lowEndDevice = memory <= 4 || cores <= 4;

  if (!isMobile) return "live";
  if (prefersReducedMotion || saveData || lowEndDevice) return "mobile-static";
  return "mobile-live";
}

export function GlobalBackground() {
  const pathname = usePathname();
  const [mode, setMode] = useState<BackgroundMode>("live");

  useEffect(() => {
    const check = () => setMode(pickBackgroundMode());
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const isGamePage = GAME_PREFIXES.some((p) => pathname.startsWith(p));
  if (isGamePage) return null;

  const showLive = mode === "live" || mode === "mobile-live";

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[1] overflow-hidden"
      aria-hidden
    >
      {showLive ? (
        <div className="absolute inset-0">
          <Grainient
            color1={ACCENT_GRAINIENT.color1}
            color2={ACCENT_GRAINIENT.color2}
            color3={ACCENT_GRAINIENT.color3}
            timeSpeed={mode === "mobile-live" ? 0.16 : 0.22}
            colorBalance={0.05}
            warpStrength={mode === "mobile-live" ? 0.55 : 0.9}
            warpFrequency={mode === "mobile-live" ? 3 : 4}
            warpSpeed={mode === "mobile-live" ? 1.2 : 1.8}
            warpAmplitude={mode === "mobile-live" ? 72 : 55}
            blendAngle={10}
            blendSoftness={0.1}
            rotationAmount={mode === "mobile-live" ? 220 : 340}
            noiseScale={mode === "mobile-live" ? 1.5 : 2}
            grainAmount={mode === "mobile-live" ? 0.12 : 0.18}
            grainScale={1.2}
            grainAnimated={false}
            contrast={1.4}
            gamma={0.9}
            saturation={mode === "mobile-live" ? 0.48 : 0.55}
            centerX={0}
            centerY={0}
            zoom={mode === "mobile-live" ? 0.94 : 0.88}
            maxDpr={mode === "mobile-live" ? 1.2 : 2}
            targetFps={mode === "mobile-live" ? 24 : undefined}
          />
        </div>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 140% 92% at 50% 10%, rgba(167,139,250,0.18) 0%, rgba(61,42,107,0.14) 28%, rgba(13,10,18,0.94) 74%, rgba(9,7,16,1) 100%)",
          }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background: BACKGROUND_OVERLAY,
        }}
      />
    </div>
  );
}
