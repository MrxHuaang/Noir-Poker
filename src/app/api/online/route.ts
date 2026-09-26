// Authoritative backend of the online mode. Replaces the former Go WebSocket
// server: each move is a stateless POST that runs one Firestore transaction
// (see src/lib/online/server.ts). Clients receive state by subscribing to
// Firestore, so no persistent server or socket is needed.
//
// The uid comes from the verified Firebase ID token; any uid in the body is
// ignored. Runs on the Node runtime (Admin SDK).
import { NextResponse } from "next/server";
import { verifyBearerUid } from "@/lib/firebaseAdmin";
import { OnlineError } from "@/lib/online/engine";
import * as online from "@/lib/online/server";
import type { OnlineConfigInput } from "@/lib/online/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configFrom(raw: unknown): OnlineConfigInput {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return {
    sb: num(c.sb),
    bb: num(c.bb),
    stack: num(c.stack),
    runItN: num(c.runItN),
    blindLevelSecs: num(c.blindLevelSecs),
    casual: c.casual === true,
  };
}

export async function POST(req: Request) {
  const uid = await verifyBearerUid(req);
  if (!uid) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const action = String(body.action ?? "");

  try {
    if (action === "create") {
      const code = await online.createRoom(uid, configFrom(body.config));
      let sitError: string | null = null;
      if (body.sit === true) {
        try {
          await online.sit(uid, code);
        } catch (err) {
          sitError = err instanceof Error ? err.message : "No se pudo sentar";
        }
      }
      return NextResponse.json({ code, sitError });
    }

    const code = online.normalizeCode(body.code);
    switch (action) {
      case "sit":
        return NextResponse.json({ result: await online.sit(uid, code) });
      case "leave":
        await online.leave(uid, code);
        return NextResponse.json({ ok: true });
      case "start":
        await online.start(uid, code);
        return NextResponse.json({ ok: true });
      case "act": {
        const amount = typeof body.amount === "number" ? body.amount : 0;
        await online.act(uid, code, String(body.move ?? ""), amount);
        return NextResponse.json({ ok: true });
      }
      case "tick":
        return NextResponse.json(await online.tick(code));
      case "config":
        await online.configure(uid, code, { ...configFrom(body.config), casual: undefined });
        return NextResponse.json({ ok: true });
      case "pause":
      case "resume":
        await online.setPaused(uid, code, action === "pause");
        return NextResponse.json({ ok: true });
      case "rebuy":
        await online.rebuy(uid, code);
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof OnlineError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/online]", action, err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
