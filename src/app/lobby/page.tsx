import { redirect } from "next/navigation";

// The open tables are listed in the club panel ("Mesas abiertas").
export default function LobbyPage() {
  redirect("/jugar");
}
