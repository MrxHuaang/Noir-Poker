import { redirect } from "next/navigation";

// Tables are opened from the club panel now (Noir 1929).
export default function OnlineLandingPage() {
  redirect("/jugar");
}
