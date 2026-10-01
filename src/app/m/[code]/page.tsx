import { redirect } from "next/navigation";

// Short invitation link (like PokerNow's): /m/K7Q2X opens the table, observer-first.
export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  redirect(clean ? `/play/online/${clean}` : "/jugar");
}
