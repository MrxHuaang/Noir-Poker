"use client";
// Small previews for the pickers, drawn with the scene's own art: a card face
// or back (public/noir/art.js), a miniature of your seat at the table, felt and
// rail samples, and the room and dealer pictures (static images in
// public/noir/art/, painted once, so nothing is drawn at runtime).
import { useEffect, useRef } from "react";
import { loadArt, type ArtCard } from "@/lib/noirArt";

/** Felt and rail colours, mirrored from scene.html (FELTS / RAILS). */
export const FELT_RGB: Record<string, [number, number, number]> = { verde: [30, 78, 52], vino: [66, 18, 26], noche: [28, 44, 78], carbon: [44, 43, 41] };
export const RAIL_HEX: Record<string, string> = { cuero: "#3a1f18", nogal: "#5a3a22", negro: "#141210" };
const feltCss = (v: string, k = 1) => `rgb(${(FELT_RGB[v] ?? FELT_RGB.verde).map((x) => Math.round(x * k)).join(",")})`;
/** The scene's colour grades, approximated with CSS filters for the previews. */
export const GRADE_FILTER: Record<string, string> = {
  humo: "sepia(.28) saturate(.9)",
  noche: "hue-rotate(185deg) saturate(.55) brightness(.92)",
  sangre: "grayscale(.85) contrast(1.15)",
  libre: "none",
};

/** One card drawn with the table's art, crisp at any size. */
export function CardArt({ card, face, four, back, height }: { card: ArtCard; face: string; four: boolean; back: string; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const width = Math.round(height / 1.375);
  useEffect(() => {
    let live = true;
    loadArt().then((art) => {
      const c = ref.current;
      if (!live || !c) return;
      const src = art.cardCanvas(card, { face, four, back });
      const d = Math.min(3, window.devicePixelRatio || 1);
      c.width = Math.round(width * d);
      c.height = Math.round(height * d);
      const g = c.getContext("2d");
      if (!g) return;
      // pixel faces scale with hard edges when they grow, smooth when they shrink
      g.imageSmoothingEnabled = !(src.nearest && c.height >= src.height);
      g.imageSmoothingQuality = "high";
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(src, 0, 0, c.width, c.height);
    }).catch(() => {});
    return () => { live = false; };
  }, [card?.r, card?.s, card === null, face, four, back, width, height]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} style={{ width, height }} className="block shrink-0 shadow-[2px_3px_0_rgb(0_0_0/.45)]" aria-hidden />;
}

const HOLE: ArtCard[] = [{ r: 12, s: 0 }, { r: 11, s: 1 }];
const BOARD: ArtCard[] = [{ r: 10, s: 3 }, { r: 8, s: 2 }, { r: 5, s: 0 }];

/** Your seat at the table as it will look: felt, rail, the board, your cards and the backs across. */
export function TableTray({ felt, rail, face, four, back, grade, cam, label }: { felt: string; rail: string; face: string; four: boolean; back: string; grade: string; cam: "front" | "iso"; label: string }) {
  const iso = cam === "iso";
  return (
    <div className="pk-tray h-[118px] w-full" role="img" aria-label={label} style={{ filter: GRADE_FILTER[grade] ?? "none" }}>
      {/* the lamp */}
      <div className="absolute top-0 left-1/2 h-24 w-56 -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,rgb(255_200_120/.28),transparent_70%)]" />
      {/* rail and felt */}
      <div
        className="absolute left-1/2 top-[52%] h-[80px] w-[86%] rounded-[50%]"
        style={{ background: RAIL_HEX[rail] ?? RAIL_HEX.cuero, transform: `translate(-50%,-50%) ${iso ? "rotate(-8deg) scaleY(.9)" : ""}`, boxShadow: "inset 0 6px 0 rgb(255 255 255 / .08), 0 10px 18px rgb(0 0 0 / .6)" }}
      >
        <div className="absolute inset-[9px] rounded-[50%]" style={{ background: `radial-gradient(ellipse at 45% 35%, ${feltCss(felt, 1.35)}, ${feltCss(felt, .8)} 75%)` }}>
          <div className="absolute inset-[14%] rounded-[50%] border border-[rgb(239_230_211/.25)]" />
        </div>
      </div>
      {/* backs across the table, the board in the middle, your two cards at the edge */}
      <div className="absolute left-[16%] top-[22%] flex -rotate-6 gap-0.5"><CardArt card={null} face={face} four={four} back={back} height={26} /><CardArt card={null} face={face} four={four} back={back} height={26} /></div>
      <div className="absolute right-[16%] top-[20%] flex rotate-6 gap-0.5"><CardArt card={null} face={face} four={four} back={back} height={26} /><CardArt card={null} face={face} four={four} back={back} height={26} /></div>
      <div className="absolute left-1/2 top-[44%] flex -translate-x-1/2 -translate-y-1/2 gap-1">
        {BOARD.map((c, i) => <CardArt key={i} card={c} face={face} four={four} back={back} height={30} />)}
      </div>
      <div className="absolute bottom-[6px] left-1/2 flex -translate-x-[40%] gap-1">
        {HOLE.map((c, i) => <CardArt key={i} card={c} face={face} four={four} back={back} height={46} />)}
      </div>
    </div>
  );
}

/** A felt (or rail) sample: a small oval table in that colour. */
export function FeltSample({ felt, rail }: { felt: string; rail: string }) {
  return (
    <span className="relative block h-[34px] w-full" aria-hidden>
      <span className="absolute inset-x-[8%] inset-y-[10%] rounded-[50%]" style={{ background: RAIL_HEX[rail] ?? RAIL_HEX.cuero, boxShadow: "0 4px 6px rgb(0 0 0 / .5)" }}>
        <span className="absolute inset-[4px] rounded-[50%]" style={{ background: `radial-gradient(ellipse at 45% 35%, ${feltCss(felt, 1.35)}, ${feltCss(felt, .8)} 75%)` }} />
      </span>
    </span>
  );
}

/** A palette chip for a scene grade. */
export function GradeChip({ grade }: { grade: string }) {
  return (
    <span
      aria-hidden
      className="block h-3 w-7 shrink-0"
      style={{ background: "linear-gradient(90deg,#1a1410,#2a5a3a 35%,#c98f3c 70%,#efe6d3)", filter: GRADE_FILTER[grade] ?? "none", boxShadow: "0 0 0 1px rgb(0 0 0 / .6)" }}
    />
  );
}

/** The room and dealer pictures (pixel art, painted once into static files). */
// Plain <img>: tiny pre-optimized pixel-art PNGs that must scale with hard edges.
export function PlacePicture({ place }: { place: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/noir/art/place-${place}.png`} alt="" width={384} height={216} loading="lazy" decoding="async" className="aspect-video" />;
}
export function DealerPicture({ dealer }: { dealer: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/noir/art/dealer-${dealer}.png`} alt="" width={288} height={360} loading="lazy" decoding="async" className="aspect-[4/5]" />;
}
