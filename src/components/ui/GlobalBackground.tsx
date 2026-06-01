"use client";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import Grainient from "./Grainient";

const GAME_PREFIXES = ["/host", "/play", "/admin"];

export function GlobalBackground() {
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const isGamePage = GAME_PREFIXES.some((p) => pathname.startsWith(p));
  if (isGamePage || isMobile) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[1] overflow-hidden"
      aria-hidden
    >
      <div className="absolute inset-0">
        <Grainient
          color1="#a78bfa"
          color2="#0d0a12"
          color3="#3d2a6b"
          timeSpeed={0.22}
          colorBalance={0.05}
          warpStrength={0.9}
          warpFrequency={4}
          warpSpeed={1.8}
          warpAmplitude={55}
          blendAngle={10}
          blendSoftness={0.1}
          rotationAmount={340}
          noiseScale={2}
          grainAmount={0.18}
          grainScale={1.2}
          grainAnimated={false}
          contrast={1.4}
          gamma={0.9}
          saturation={0.55}
          centerX={0}
          centerY={0}
          zoom={0.88}
        />
      </div>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 100% 72% at 50% 44%, transparent 0%, rgba(8,6,14,0.58) 58%, rgba(6,5,11,0.9) 100%), linear-gradient(180deg, rgba(6,5,11,0.56) 0%, transparent 22%, transparent 78%, rgba(6,5,11,0.64) 100%)",
        }}
      />
    </div>
  );
}
