"use client";
// The room around the page: slow smoke and dust motes in the lamp light,
// drifting against the scroll, plus the film grain texture. One fixed canvas,
// ~30 fps, paused while the tab is hidden. Reduced motion slows it down
// instead of freezing it: the room stays alive, nothing sweeps across.
import { useEffect, useRef } from "react";
import { NOIR } from "@/lib/brand";

export function Atmosphere() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Grain: a tiny noise tile shared by every .grain overlay.
    const tile = document.createElement("canvas");
    tile.width = tile.height = 120;
    const tx = tile.getContext("2d");
    if (tx) {
      const im = tx.createImageData(120, 120);
      for (let i = 0; i < im.data.length; i += 4) {
        const v = Math.random() * 255;
        im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
        im.data[i + 3] = 255;
      }
      tx.putImageData(im, 0, 0);
      document.documentElement.style.setProperty("--noise", `url(${tile.toDataURL()})`);
    }

    const cv = ref.current;
    const g = cv?.getContext("2d");
    if (!cv || !g) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const speed = calm ? 0.35 : 1;
    let W = 0;
    let H = 0;
    const fit = () => {
      W = cv.width = window.innerWidth;
      H = cv.height = window.innerHeight;
    };
    fit();
    window.addEventListener("resize", fit);

    const puffs = Array.from({ length: 16 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.12 + Math.random() * 0.22,
      vx: (Math.random() - 0.5) * 0.00006,
      a: 0.025 + Math.random() * 0.03,
    }));
    const motes = Array.from({ length: 70 }, () => ({
      x: Math.random(),
      y: Math.random(),
      s: Math.random() * 1.6 + 0.4,
      v: 0.00004 + Math.random() * 0.00008,
      p: Math.random() * 6,
    }));

    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 32) return;
      const dt = Math.min(64, t - last) * speed;
      last = t;
      const sy = window.scrollY * 0.00012;
      g.clearRect(0, 0, W, H);
      for (const p of puffs) {
        p.x += p.vx * dt;
        if (p.x < -0.3) p.x = 1.3;
        if (p.x > 1.3) p.x = -0.3;
        const y = (((p.y - sy) % 1) + 1) % 1;
        const R = p.r * Math.max(W, H);
        const gr = g.createRadialGradient(p.x * W, y * H, 0, p.x * W, y * H, R);
        gr.addColorStop(0, `rgba(${NOIR.smokeRgb},${p.a})`);
        gr.addColorStop(1, `rgba(${NOIR.smokeRgb},0)`);
        g.fillStyle = gr;
        g.fillRect(p.x * W - R, y * H - R, R * 2, R * 2);
      }
      for (const m of motes) {
        m.y -= m.v * dt;
        if (m.y < -0.02) m.y = 1.02;
        const y = (((m.y - sy * 2) % 1) + 1) % 1;
        const tw = 0.35 + Math.sin(t / 900 + m.p) * 0.25;
        g.fillStyle = `rgba(${NOIR.dustRgb},${tw})`;
        g.fillRect(m.x * W + Math.sin(t / 2000 + m.p) * 8, y * H, m.s, m.s);
      }
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <>
      <canvas ref={ref} className="pointer-events-none fixed inset-0 -z-10 h-full w-full" aria-hidden />
      <div className="grain" aria-hidden />
    </>
  );
}
