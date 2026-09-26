// Connection to the serverless online mode, from a terminal. Same contract as
// the web client (src/hooks/useOnlineGame.ts): state arrives through Firestore
// (onlineRooms/{code} + our own holes/{uid}), moves go out as POST /api/online
// to the Next.js app, which validates them inside a Firestore transaction.
//
// Identity: an anonymous Firebase session (fresh per run). Anonymous players
// can only sit at casual ("Casual" / sin fichas) tables, same rule as the web.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import type { ConnStatus, PublicState } from "./types";

export type Handlers = {
  onState: (s: PublicState) => void;
  onHole: (cards: string[]) => void;
  onStatus: (status: ConnStatus) => void;
  onError: (message: string) => void;
};

const HEARTBEAT_MS = 25_000;

// NEXT_PUBLIC_FIREBASE_* from the environment, falling back to .env.local.
function firebaseEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const file = join(process.cwd(), ".env.local");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  return env;
}

export class GameConnection {
  private auth: Auth | null = null;
  private db: Firestore | null = null;
  private uid = "";
  private unsubs: (() => void)[] = [];
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private lastDeadline = 0;

  constructor(
    private readonly appUrl: string,
    private readonly room: string,
    private readonly name: string,
    private readonly h: Handlers,
  ) {}

  // Signs in, sets the display name, sits down and subscribes. Returns our uid.
  async connect(): Promise<string> {
    this.h.onStatus("connecting");
    const env = firebaseEnv();
    const app = initializeApp({
      apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });
    this.auth = getAuth(app);
    this.db = getFirestore(app);
    if (env.NEXT_PUBLIC_FIREBASE_EMULATORS === "true") {
      connectAuthEmulator(this.auth, "http://127.0.0.1:9099", { disableWarnings: true });
      connectFirestoreEmulator(this.db, "127.0.0.1", 8080);
    }
    const cred = await signInAnonymously(this.auth);
    this.uid = cred.user.uid;

    // Profile bootstrap (creates users/{uid}), then our visible nickname.
    await this.post("/api/economy", { action: "ensure-profile" }).catch(() => {});
    await updateDoc(doc(this.db, "users", this.uid), { nickname: this.name.slice(0, 40) }).catch(
      () => {},
    );

    this.unsubs.push(
      onSnapshot(
        doc(this.db, "onlineRooms", this.room),
        (snap) => {
          if (!snap.exists()) {
            this.h.onError(`La sala ${this.room} no existe (créala desde la web).`);
            return;
          }
          this.h.onStatus("connected");
          const state = (snap.data() as { state: PublicState }).state;
          this.h.onState(state);
          this.scheduleTick(state);
        },
        () => this.h.onStatus("error"),
      ),
      onSnapshot(doc(this.db, "onlineRooms", this.room, "holes", this.uid), (snap) => {
        const d = snap.data() as { cards?: string[] } | undefined;
        if (d?.cards) this.h.onHole(d.cards);
      }),
    );

    const sat = await this.call("sit");
    if (sat) {
      const beat = () => {
        setDoc(doc(this.db!, "onlineRooms", this.room, "presence", this.uid), {
          uid: this.uid,
          at: serverTimestamp(),
        }).catch(() => {});
      };
      beat();
      this.heartbeat = setInterval(beat, HEARTBEAT_MS);
    }
    return this.uid;
  }

  private async post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const token = await this.auth!.currentUser!.getIdToken();
    const res = await fetch(`${this.appUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(String(data.error ?? `HTTP ${res.status}`));
    return data;
  }

  // Sends one move; reports the server's rejection (illegal action, not your
  // turn, guest at a coin table...) through onError. Resolves true on success.
  private async call(action: string, params: Record<string, unknown> = {}): Promise<boolean> {
    try {
      await this.post("/api/online", { action, code: this.room, ...params });
      return true;
    } catch (err) {
      this.h.onError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  // The clients drive the turn clock: once the deadline passes, ask the server
  // to apply the auto-action (it re-checks the deadline itself).
  private scheduleTick(s: PublicState): void {
    if (!s.deadline || !s.toAct || s.paused || s.deadline === this.lastDeadline) return;
    this.lastDeadline = s.deadline;
    if (this.tickTimer) clearTimeout(this.tickTimer);
    const delay = Math.max(0, s.deadline - Date.now()) + (s.toAct === this.uid ? 400 : 2500);
    this.tickTimer = setTimeout(() => {
      this.post("/api/online", { action: "tick", code: this.room }).catch(() => {});
    }, delay);
  }

  start(): Promise<boolean> {
    return this.call("start");
  }

  action(move: string, amount = 0): Promise<boolean> {
    return this.call("act", { move, amount });
  }

  async close(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.tickTimer) clearTimeout(this.tickTimer);
    for (const u of this.unsubs) u();
    if (this.auth?.currentUser) await this.call("leave");
  }
}
