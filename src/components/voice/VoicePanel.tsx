"use client";
import { useEffect, useRef, useState } from "react";
import { Headphones, Mic, MicOff, PhoneOff, Volume2, VolumeX } from "lucide-react";
import { Avatar } from "@/components/players/Avatar";
import { useVoiceRoom, type VoiceParticipant } from "@/hooks/useVoiceRoom";
import { useAudioLevel } from "@/hooks/useAudioLevel";
import { RemoteAudio } from "./RemoteAudio";

export default function VoicePanel({
  code,
  uid,
  displayName,
  seed,
}: {
  code: string;
  uid: string | null;
  displayName: string;
  seed: string;
}) {
  const [enabled, setEnabled] = useState(false);
  // Whether the user joined in listen-only mode (starts with mic muted).
  const [listenOnly, setListenOnly] = useState(false);
  const [peerMuted, setPeerMuted] = useState<Record<string, boolean>>({});
  // Guard so we only auto-mute once after localStream becomes available.
  const listenOnlyApplied = useRef(false);

  const {
    participants,
    localStream,
    remoteStreams,
    peerConnectionStates,
    isMuted,
    toggleMute,
  } = useVoiceRoom(code, uid, displayName, seed, enabled);

  // Auto-mute once when joining in listen-only mode. Waits for localStream
  // because the audio track must exist before muting has any effect.
  useEffect(() => {
    if (!enabled) {
      listenOnlyApplied.current = false;
      return;
    }
    if (listenOnly && !listenOnlyApplied.current && localStream) {
      listenOnlyApplied.current = true;
      if (!isMuted) toggleMute();
    }
  }, [enabled, listenOnly, localStream, isMuted, toggleMute]);

  // Atajo M para mute (solo cuando ya estamos unidos).
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      if (e.key.toLowerCase() === "m") toggleMute();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, toggleMute]);

  // Wake Lock: mantener la pantalla encendida mientras el jugador esté en
  // voz. iOS suspende WebRTC ~30s después de apagarse la pantalla; con el
  // lock activo el SO no la apaga por inactividad. Degrada silenciosamente
  // en Safari < 16.4 y otros navegadores sin el API.
  useEffect(() => {
    if (!enabled) return;
    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    const acquire = async () => {
      try {
        const wakeLock = (navigator as unknown as {
          wakeLock?: {
            request: (type: "screen") => Promise<WakeLockSentinel>;
          };
        }).wakeLock;
        if (!wakeLock) return;
        const result = await wakeLock.request("screen");
        // Si el cleanup corrió mientras awaiteábamos, soltar inmediatamente
        // para no dejar un lock huérfano.
        if (released) {
          result.release().catch(() => {
            /* ignore */
          });
          return;
        }
        sentinel = result;
      } catch {
        /* ignore — API no soportado o permiso denegado */
      }
    };
    acquire();

    // Re-adquirir si la pestaña vuelve a primer plano (el SO libera el lock
    // al ocultar la página).
    const onVisibility = () => {
      if (document.visibilityState === "visible" && !released) {
        acquire();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisibility);
      sentinel?.release().catch(() => {
        /* ignore */
      });
    };
  }, [enabled]);

  if (!enabled) {
    // Botones pequeños tipo icono, al lado del chat. Mismo lenguaje visual que
    // ChatPanel/ReactionBar (glass + p-3 rounded-2xl) para que queden discretos.
    return (
      <div className="flex items-center gap-2">
        {/* Join with microphone — talk + listen */}
        <button
          type="button"
          onClick={() => { setListenOnly(false); setEnabled(true); }}
          className="p-3 rounded-2xl glass ring-1 ring-emerald-400/20 text-emerald-300 hover:bg-emerald-500/15 hover:text-emerald-200 transition btn-press shadow-xl"
          title="Unirme con micrófono"
          aria-label="Unirme con micrófono"
        >
          <Mic className="w-5 h-5" />
        </button>
        {/* Join listen-only — audio in, no mic */}
        <button
          type="button"
          onClick={() => { setListenOnly(true); setEnabled(true); }}
          className="p-3 rounded-2xl glass ring-1 ring-white/10 text-zinc-300 hover:bg-white/10 transition btn-press shadow-xl"
          title="Solo escuchar (sin micrófono)"
          aria-label="Solo escuchar (sin micrófono)"
        >
          <Headphones className="w-5 h-5" />
        </button>
      </div>
    );
  }


  // Lista de peers remotos (todos los participantes menos yo).
  const remotePeers = Object.values(participants).filter((p) => p.uid !== uid);
  const localParticipant: VoiceParticipant | null = uid
    ? (participants[uid] ?? {
        uid,
        displayName,
        seed,
        joinedAt: new Date().toISOString(),
        isMuted,
      })
    : null;

  return (
    <section
      aria-label="Canal de voz"
      className="rounded-2xl glass p-3 flex flex-col gap-3"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-zinc-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Voz · {Object.keys(participants).length} en sala
          {listenOnly && (
            <span className="flex items-center gap-0.5 text-zinc-500">
              <Headphones className="w-2.5 h-2.5" /> escucha
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleMute}
            className={`p-2 rounded-full ring-1 transition btn-press ${
              isMuted
                ? "bg-rose-500/20 ring-rose-400/40 text-rose-200"
                : "bg-white/5 ring-white/10 text-zinc-200 hover:bg-white/10"
            }`}
            title={isMuted ? "Activar micrófono (M)" : "Silenciar micrófono (M)"}
            aria-label={isMuted ? "Activar micrófono" : "Silenciar micrófono"}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setEnabled(false)}
            className="p-2 rounded-full bg-white/5 ring-1 ring-white/10 text-zinc-300 hover:bg-rose-500/20 hover:text-rose-300 hover:ring-rose-400/40 transition btn-press"
            title="Salir del canal de voz"
            aria-label="Salir del canal de voz"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </header>

      <ul className="flex flex-col gap-1.5">
        {localParticipant ? (
          <ParticipantRow
            participant={{ ...localParticipant, isMuted }}
            stream={localStream}
            isLocal
          />
        ) : null}
        {remotePeers.map((p) => (
          <ParticipantRow
            key={p.uid}
            participant={p}
            stream={remoteStreams[p.uid] ?? null}
            connectionState={peerConnectionStates[p.uid]}
            isMutedByListener={peerMuted[p.uid] ?? false}
            onToggleListenerMute={() =>
              setPeerMuted((prev) => ({ ...prev, [p.uid]: !prev[p.uid] }))
            }
          />
        ))}
      </ul>

      {/* Audio remoto invisible por peer */}
      {remotePeers.map((p) => (
        <RemoteAudio
          key={`audio-${p.uid}`}
          stream={remoteStreams[p.uid] ?? null}
          muted={peerMuted[p.uid] ?? false}
        />
      ))}
    </section>
  );
}

function ParticipantRow({
  participant,
  stream,
  isLocal,
  isMutedByListener,
  onToggleListenerMute,
  connectionState,
}: {
  participant: VoiceParticipant;
  stream: MediaStream | null;
  isLocal?: boolean;
  isMutedByListener?: boolean;
  onToggleListenerMute?: () => void;
  connectionState?: RTCPeerConnectionState;
}) {
  const level = useAudioLevel(stream);
  const talking = !participant.isMuted && level > 0.12;
  const ringClass = talking
    ? "ring-emerald-400/80 shadow-[0_0_12px_-2px_rgba(52,211,153,0.6)]"
    : "ring-white/10";
  const connLabel = !isLocal ? describeConnState(connectionState) : null;

  return (
    <li className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-white/[0.02] ring-1 ring-white/5">
      <span className={`rounded-full ring-2 ${ringClass} transition`}>
        <Avatar seed={participant.seed} size={28} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-zinc-100 truncate">
            {participant.displayName}
            {isLocal ? (
              <span className="ml-1 text-[10px] text-zinc-500">(tú)</span>
            ) : null}
          </span>
          {participant.isMuted ? (
            <MicOff className="w-3 h-3 text-rose-300 flex-shrink-0" />
          ) : null}
        </div>
        {connLabel ? (
          <p className="text-[10px] text-zinc-500 truncate">{connLabel}</p>
        ) : null}
      </div>
      {!isLocal ? (
        <button
          type="button"
          onClick={onToggleListenerMute}
          className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition"
          title={isMutedByListener ? "Reactivar audio" : "Silenciar para mí"}
          aria-label={isMutedByListener ? "Reactivar audio" : "Silenciar para mí"}
        >
          {isMutedByListener ? (
            <VolumeX className="w-3.5 h-3.5 text-rose-300" />
          ) : (
            <Volume2 className="w-3.5 h-3.5" />
          )}
        </button>
      ) : null}
    </li>
  );
}

function describeConnState(s: RTCPeerConnectionState | undefined): string | null {
  switch (s) {
    case "new":
    case "connecting":
      return "Conectando…";
    case "disconnected":
      return "Reconectando…";
    case "failed":
      return "Sin audio (red bloqueada)";
    default:
      return null;
  }
}
