// Autoridad server-side de la economia/progresion. Toda mutacion de
// coins/escrows/xp/stats pasa por aqui. El uid se deriva del idToken de Firebase
// verificado con el Admin SDK; cualquier uid que mande el cliente se ignora.
//
// Corre en runtime Node (el Admin SDK no funciona en Edge). En Vercel Hobby es
// una serverless function gratuita.
import { NextResponse } from "next/server";
import { verifyBearerUid } from "@/lib/firebaseAdmin";
import {
  buyIn,
  cashOut,
  claimDailyBonus,
  ensureProfile,
  reconcileEscrows,
  recordSession,
  refundBuyIn,
} from "@/lib/economyServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const uid = await verifyBearerUid(req);
  if (!uid) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const code = typeof body.code === "string" ? body.code : "";
  const amount = typeof body.amount === "number" ? body.amount : 0;

  try {
    switch (action) {
      case "ensure-profile": {
        const profile = await ensureProfile(uid);
        return NextResponse.json({ profile });
      }
      case "reconcile-escrows": {
        await reconcileEscrows(uid);
        return NextResponse.json({ ok: true });
      }
      case "daily-bonus": {
        const granted = await claimDailyBonus(uid);
        return NextResponse.json({ granted });
      }
      case "buy-in": {
        if (!code) return NextResponse.json({ error: "Falta code" }, { status: 400 });
        const mode = body.mode === "online" ? "online" : "normal";
        const coins = await buyIn(uid, code, amount, mode);
        return NextResponse.json({ coins });
      }
      case "refund": {
        if (!code) return NextResponse.json({ error: "Falta code" }, { status: 400 });
        await refundBuyIn(uid, code, amount);
        return NextResponse.json({ ok: true });
      }
      case "cash-out": {
        if (!code) return NextResponse.json({ error: "Falta code" }, { status: 400 });
        const coins = await cashOut(uid, code);
        return NextResponse.json({ coins });
      }
      case "record-session": {
        const s = (body.session ?? {}) as Record<string, unknown>;
        await recordSession(uid, {
          code: String(s.code ?? ""),
          roomName: String(s.roomName ?? ""),
          handsPlayed: Number(s.handsPlayed ?? 0),
          handsWon: Number(s.handsWon ?? 0),
          net: Number(s.net ?? 0),
          biggestPot: Number(s.biggestPot ?? 0),
        });
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    // Errores de negocio esperados (saldo insuficiente, monto invalido) -> 400.
    const known = ["Saldo insuficiente", "Monto invalido", "Perfil inexistente"];
    const status = known.includes(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
