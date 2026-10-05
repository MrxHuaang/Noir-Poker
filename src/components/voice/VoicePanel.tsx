"use client";
import { useEffect, useRef, useState } from "react";
import { Headphones, Mic, MicOff, PhoneOff, Volume2, VolumeX } from "lucide-react";
import { useVoiceRoom, type VoiceParticipant } from "@/hooks/useVoiceRoom";
import { useAudioLevel } from "@/hooks/useAudioLevel";
import { useMicDevice } from "@/hooks/useMicDevice";
import { RemoteAudio } from "./RemoteAudio";

export default function VoicePanel({
  code,
  uid,
  displayName,
  seed,
  canLeave = true,
  bare = false,
  onStatus,
}: {
  code: string;
  uid: string | null;
  displayName: string;
  seed: string;
  // En salas online/torneo no se permite terminar la llamada: solo silenciarse
  // y mutear a otros participantes. Pasar false oculta el boton de salir.
  canLeave?: boolean;
  /** Drawn inside another surface (the table's case): no plate of its own. */
  bare?: boolean;
  /** Reports whether you are on the line and with the mic open (UI only). */
  onStatus?: (s: { on: boolean; talking: boolean }) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  // Whether the user joined in listen-only mode (starts with mic muted).
  const [listenOnly, setListenOnly] = useState(false);
  const [peerMuted, setPeerMuted] = useState<Record<string, boolean>>({});
  // Guard so we only auto-mute once after localStream becomes available.
  const listenOnlyApplied = useRef(false);

  const { micDeviceId } = useMicDevice();
  const {
    participants,
    localStream,
    remoteStreams,
    peerConnectionStates,
    isMuted,
    toggleMute,
  } = useVoiceRoom(code, uid, displayName, seed, enabled, micDeviceId);

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

  const statusRef = useRef(onStatus);
  useEffect(() => {
    statusRef.current = onStatus;
  }, [onStatus]);
  useEffect(() => {
    statusRef.current?.({ on: enabled, talking: enabled && !isMuted });
  }, [enabled, isMuted]);

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
    // Two brass plates beside the chat: talk (mic) or just listen.
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { setListenOnly(false); setEnabled(true); }}
          className="btn-brass btn-sm"
          title="Unirme con micrófono"
        >
          <Mic className="h-4 w-4" aria-hidden /> Hablar
        </button>
        <button
          type="button"
          onClick={() => { setListenOnly(true); setEnabled(true); }}
          className="btn-brass btn-sm"
          title="Solo escuchar (sin micrófono)"
        >
          <Headphones className="h-4 w-4" aria-hidden /> Escuchar
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
    <section aria-label="Canal de voz" className={bare ? "grid gap-3" : "plate grid w-64 gap-3 px-4 pt-7 pb-4"}>
      <header className="flex items-center justify-between gap-2">
        <p className="kick m-0 text-[12px]">
          Radio · {Object.keys(participants).length} en la línea{listenOnly ? " · escuchas" : ""}
        </p>
      </header>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={toggleMute}
          className={`btn-brass btn-sm ${isMuted ? "text-blood-400" : ""}`}
          title={isMuted ? "Activar micrófono (M)" : "Silenciar micrófono (M)"}
        >
          {isMuted ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
          {isMuted ? "Callado" : "Hablando"}
        </button>
        {canLeave ? (
          <button type="button" onClick={() => setEnabled(false)} className="btn-brass btn-sm" title="Salir del canal de voz">
            <PhoneOff className="h-4 w-4" aria-hidden /> Colgar
          </button>
        ) : null}
      </div>

      <ul className="m-0 grid list-none gap-1.5 p-0">
        {localParticipant ? (
          <ParticipantRow participant={{ ...localParticipant, isMuted }} stream={localStream} isLocal />
        ) : null}
        {remotePeers.map((p) => (
          <ParticipantRow
            key={p.uid}
            participant={p}
            stream={remoteStreams[p.uid] ?? null}
            connectionState={peerConnectionStates[p.uid]}
            isMutedByListener={peerMuted[p.uid] ?? false}
            onToggleListenerMute={() => setPeerMuted((prev) => ({ ...prev, [p.uid]: !prev[p.uid] }))}
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
  const connLabel = !isLocal ? describeConnState(connectionState) : null;

  // A line on the radio: the name, a needle that moves with the voice.
  return (
    <li className="grid gap-1">
      <div className="flex items-center gap-2">
        <span className={`stencil flex-1 truncate text-[15px] ${talking ? "text-tungsten-400" : "text-paper"}`}>
          {participant.displayName}
          {isLocal ? <span className="ml-1 font-pix text-[10px] normal-case text-paper-mute">(tú)</span> : null}
        </span>
        {participant.isMuted ? <MicOff className="h-3.5 w-3.5 flex-none text-blood-400" aria-label="Micrófono apagado" /> : null}
        {!isLocal ? (
          <button
            type="button"
            onClick={onToggleListenerMute}
            className="text-paper-dim hover:text-paper"
            title={isMutedByListener ? "Reactivar audio" : "Silenciar para mí"}
            aria-label={isMutedByListener ? "Reactivar audio" : "Silenciar para mí"}
          >
            {isMutedByListener ? <VolumeX className="h-4 w-4 text-blood-400" /> : <Volume2 className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
      <i className="block h-[3px] bg-paper/10" aria-hidden>
        <b
          className="block h-full origin-left bg-tungsten-400 transition-transform duration-100"
          style={{ transform: `scaleX(${participant.isMuted ? 0 : Math.min(1, level * 2.2)})` }}
        />
      </i>
      {connLabel ? <p className="m-0 font-pix text-[11px] text-paper-mute">{connLabel}</p> : null}
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
