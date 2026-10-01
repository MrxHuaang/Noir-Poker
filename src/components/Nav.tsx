"use client";
// Route guard for the app-shell nav. The Noir screens (landing, club panel,
// profile, tables) carry their own chrome, so the full nav (avatars, coins,
// mode list) is code-split and only loaded on the pages that show it.
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const SiteNav = dynamic(() => import("@/components/SiteNav").then((m) => m.SiteNav));

function hidden(path: string | null) {
  return (
    // The landing carries its own club nav.
    path === "/" ||
    path === "/jugar" ||
    path === "/login" ||
    path === "/join" ||
    path === "/perfil" ||
    Boolean(path?.startsWith("/host")) ||
    Boolean(path?.startsWith("/play/normal")) ||
    // Online table is a fixed full-screen view (TableShell); the nav would
    // overlap the felt. The /play/online landing keeps the nav.
    Boolean(path?.startsWith("/play/online/"))
  );
}

export function Nav() {
  const path = usePathname();
  if (hidden(path)) return null;
  return <SiteNav />;
}
