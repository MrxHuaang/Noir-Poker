// Lightweight WebAudio sound cues — synthesized, no asset files, no deps.
// Used for chip/bet, all-in and winner events. Muting is a module-level flag
// driven by useSound so every cue short-circuits cheaply when off.

let ctx: AudioContext | null = null;
let muted = false;

export function setSoundMuted(v: boolean): void {
  muted = v;
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  // Browsers start the context suspended until a user gesture; resume best-effort.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

type ToneOpts = {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  startAt?: number;
  sweepTo?: number;
};

function tone(c: AudioContext, o: ToneOpts): void {
  const t0 = c.currentTime + (o.startAt ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? "triangle";
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.sweepTo) {
    osc.frequency.exponentialRampToValueAtTime(o.sweepTo, t0 + o.duration);
  }
  const peak = o.gain ?? 0.18;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.duration);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + o.duration + 0.02);
}

export function playChip(): void {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  tone(c, { freq: 660, duration: 0.07, type: "square", gain: 0.1 });
  tone(c, { freq: 880, duration: 0.06, type: "square", gain: 0.08, startAt: 0.05 });
}

export function playAllIn(): void {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  tone(c, { freq: 220, sweepTo: 880, duration: 0.35, type: "sawtooth", gain: 0.16 });
}

export function playWinner(): void {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) =>
    tone(c, { freq: f, duration: 0.18, type: "triangle", gain: 0.16, startAt: i * 0.09 }),
  );
}
