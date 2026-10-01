"use client";
// Shell for the club's small rooms (login, join, profile): the soot room with
// smoke and grain, the club mark and a way back, and the content centred
// under the lamp.
import type { ReactNode } from "react";
import Link from "next/link";
import { Atmosphere } from "@/components/landing/Atmosphere";
import { KeyholeLogo } from "@/components/landing/KeyholeLogo";

export function NoirRoom({
  children,
  back = { href: "/jugar", label: "Volver al club" },
  right,
  center = true,
}: {
  children: ReactNode;
  back?: { href: string; label: string } | null;
  right?: ReactNode;
  center?: boolean;
}) {
  return (
    <div className="relative isolate min-h-dvh bg-soot-900 text-paper">
      <Atmosphere />
      <header className="relative z-20 mx-auto flex max-w-[1320px] items-center gap-6 px-[clamp(18px,4vw,48px)] py-4">
        <KeyholeLogo />
        <div className="ml-auto flex items-center gap-3">
          {right}
          {back && (
            <Link href={back.href} className="btn-brass btn-sm">
              {back.label}
            </Link>
          )}
        </div>
      </header>
      <main
        className={`relative z-10 mx-auto w-full max-w-[1320px] px-[clamp(18px,4vw,48px)] pb-16 ${
          center ? "grid min-h-[calc(100dvh-90px)] place-items-center" : ""
        }`}
      >
        {children}
      </main>
    </div>
  );
}
