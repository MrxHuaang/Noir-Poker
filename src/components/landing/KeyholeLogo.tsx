import Link from "next/link";

// The club's isotype, in the same pixel art as the room: a brass escutcheon
// with two rivets and a red spade inlaid where the keyhole goes, caught by the lamp.
// 13 x 17 pixels, drawn as crisp rects so it stays sharp at any size.
//   D outline   H highlight   B brass   S brass shadow   r rivet
//   T spade (lit)   t spade (shadow)   p glint of the lamp
const ART = [
  "..DDDDDDDDD..",
  ".DHHHHHHHHSD.",
  "DHHBBBrBBBBSD",
  "DHBBBBBBBBBSD",
  "DHBBBBTBBBBSD",
  "DHBBBTpTBBBSD",
  "DHBBTTTTTBBSD",
  "DHBTTTTTTTBSD",
  "DHBtttttttBSD",
  "DHBtt.t.ttBSD",
  "DHBBBBtBBBBSD",
  "DHBBBtttBBBSD",
  "DHBBBBBBBBBSD",
  "DHBBBBBBBBBSD",
  "DHBBBBrBBBBSD",
  ".DSSSSSSSSSD.",
  "..DDDDDDDDD..",
];
const FILL: Record<string, string> = {
  D: "var(--color-soot-950)",
  H: "var(--color-brass-200)",
  B: "var(--color-brass-400)",
  S: "var(--color-brass-700)",
  r: "var(--color-soot-800)",
  T: "var(--color-blood-400)",
  t: "var(--color-blood-700)",
  p: "var(--color-tungsten-300)",
  ".": "",
};

export function KeyholeMark({ className = "h-[34px] w-[26px]" }: { className?: string }) {
  const rects: React.ReactNode[] = [];
  ART.forEach((row, y) =>
    [...row].forEach((c, x) => {
      // Inside the plate a "." is the keyhole's dark cut, outside it is empty.
      const inside = x > 1 && x < row.length - 2 && y > 1 && y < ART.length - 2;
      const fill = c === "." ? (inside ? "var(--color-soot-900)" : "") : FILL[c];
      if (fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={fill} />);
    }),
  );
  return (
    <svg viewBox="0 0 13 17" shapeRendering="crispEdges" className={`flex-none ${className}`} aria-hidden>
      {rects}
    </svg>
  );
}

/** Club mark with the stencil wordmark, for navigation bars. */
export function KeyholeLogo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-3 text-paper no-underline" aria-label="Noir, inicio">
      <KeyholeMark />
      <span>
        <b className="stencil block text-[27px] leading-[.9] tracking-[.08em]">NOIR</b>
        <small className="block font-pix text-[10.5px] leading-[1.2] tracking-[.14em] text-brass-200">
          CLUB DE PÓKER · 1929
        </small>
      </span>
    </Link>
  );
}
