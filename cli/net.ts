// WebSocket connection to the authoritative Go game server, with reconnect.
// Uses Node's built-in global WebSocket (stable since Node 21+), so there is
// NO runtime dependency. Mirrors src/hooks/useGameSocket.ts and adds the
// reconnect/backoff the reference client lacks (Render free tier sleeps ~15 min
// and cold-starts in ~1 min). Every "state" frame is a full snapshot, never a
// diff, so on reconnect the server's OnJoin re-pushes current state + our hole.

import type { PublicState, ConnStatus } from "./types";

export type Handlers = {
  onState: (s: PublicState) => void;
  onHole: (cards: string[]) => void;
  onStatus: (status: ConnStatus) => void;
};

export class GameConnection {
  private ws: WebSocket | null = null;
  private closedByUser = false;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly wsBase: string,
    private readonly room: string,
    private readonly id: string,
    private readonly name: string,
    private readonly h: Handlers,
  ) {}

  private url(): string {
    // http -> ws, https -> wss, strip trailing slash (same as useGameSocket.ts).
    const base = this.wsBase.replace(/^http/, "ws").replace(/\/$/, "");
    const nameQ = this.name ? `&name=${encodeURIComponent(this.name)}` : "";
    return `${base}/ws?room=${encodeURIComponent(this.room)}&id=${encodeURIComponent(
      this.id,
    )}${nameQ}`;
  }

  connect(): void {
    this.closedByUser = false;
    this.h.onStatus(this.attempt === 0 ? "connecting" : "reconnecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.attempt = 0;
      this.h.onStatus("connected");
    });
    ws.addEventListener("message", (ev: MessageEvent) => {
      try {
        const data = typeof ev.data === "string" ? ev.data : String(ev.data);
        const msg = JSON.parse(data) as { type: string; payload?: unknown };
        if (msg.type === "state") this.h.onState(msg.payload as PublicState);
        else if (msg.type === "hole")
          this.h.onHole((msg.payload as { cards: string[] }).cards);
        // unknown types ignored, matching the web client
      } catch {
        /* ignore malformed frame */
      }
    });
    ws.addEventListener("error", () => {
      this.h.onStatus("error");
      // a "close" event follows and triggers reconnect
    });
    ws.addEventListener("close", () => {
      this.ws = null;
      if (!this.closedByUser) this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.closedByUser) return;
    this.h.onStatus("reconnecting");
    const delay = Math.min(1000 * 2 ** this.attempt, 10_000);
    this.attempt++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), delay);
  }

  private send(type: string, payload?: unknown): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload !== undefined ? { type, payload } : { type }));
    return true;
  }

  start(): boolean {
    return this.send("start");
  }

  action(action: string, amount = 0): boolean {
    return this.send("action", { action, amount });
  }

  close(): void {
    this.closedByUser = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
  }
}
