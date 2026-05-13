"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Spade } from "lucide-react";

export function Nav() {
  const path = usePathname();
  const links = [
    { href: "/", label: "Mesa" },
    { href: "/players", label: "Jugadores" },
  ];
  return (
    <nav className="sticky top-0 z-30 backdrop-blur bg-black/30 border-b border-white/5">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 text-zinc-100 font-medium tracking-tight"
        >
          <Spade className="w-4 h-4 text-emerald-400" />
          <span>Poker Sim</span>
        </Link>
        <ul className="flex items-center gap-1">
          {links.map((l) => {
            const active = path === l.href;
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={`px-3 py-1.5 rounded-full text-sm transition ${
                    active
                      ? "bg-white/10 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5"
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
