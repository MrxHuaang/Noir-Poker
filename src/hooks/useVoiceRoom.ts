import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabaseClient";
import { useVoiceWebRTC } from "./useVoiceWebRTC";

export type VoiceParticipant = {
  uid: string;
  displayName: string;
  seed: string;
  isMuted: boolean;
  joinedAt: string;
};

interface PresenceItem {
  displayName: string;
  seed: string;
  joinedAt: string;
}

type UseVoiceRoomResult = {
  participants: Record<string, VoiceParticipant>;
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  peerConnectionStates: Record<string, RTCPeerConnectionState>;
  isMuted: boolean;
  toggleMute: () => void;
};

export function useVoiceRoom(
  code: string,
  uid: string | null,
  displayName: string,
  seed: string,
  enabled: boolean,
  micDeviceId?: string,
): UseVoiceRoomResult {
  const [participants, setParticipants] = useState<
    Record<string, VoiceParticipant>
  >({});
  const [isMuted, setIsMuted] = useState(false);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  // reconnectTick: incrementa cuando el canal Realtime cae inesperadamente
  // (CLOSED / CHANNEL_ERROR). Va en las deps del effect → fuerza canal nuevo.
  const [reconnectTick, setReconnectTick] = useState(0);

  const joinedAtRef = useRef<string>(new Date().toISOString());
  const mutedRef = useRef<boolean>(false);
  const knownPeersRef = useRef<Set<string>>(new Set());
  const presenceUidsRef = useRef<Set<string>>(new Set());
  const channelRef = useRef<RealtimeChannel | null>(null);

  const callId = enabled && code && uid ? code : null;

  // Clave estable del conjunto de uids vivos. Object.keys devuelve referencia
  // nueva en cada render — pasar el array suelto a useVoiceWebRTC dispararía
  // cleanups espurios cuando solo cambia mute local de algún peer.
  const peerUidsKey = useMemo(
    () => Object.keys(participants).sort().join(","),
    [participants],
  );

  const {
    localStream,
    remoteStreams,
    initiateCall,
    peerConnectionStates,
  } = useVoiceWebRTC(callId, uid, channel, peerUidsKey, micDeviceId);

  // 1. Crear canal Presence + Broadcast.
  useEffect(() => {
    if (!enabled || !code || !uid) return;

    if (reconnectTick === 0) {
      joinedAtRef.current = new Date().toISOString();
      mutedRef.current = false;
      knownPeersRef.current.clear();
      setIsMuted(false);
    }
    presenceUidsRef.current = new Set();

    let supabase: ReturnType<typeof getSupabase>;
    try {
      supabase = getSupabase();
    } catch (err) {
      console.error("Canal de voz no disponible (faltan env vars de Supabase):", err);
      return;
    }
    const ch = supabase.channel(`voice:${code}`, {
      config: { presence: { key: uid } },
    });

    // Presence: identidad estática (displayName, seed, joinedAt). El estado
    // dinámico (isMuted) viaja por Broadcast para no acumular entries en el
    // slot de presence (Supabase Realtime no reemplaza, acumula).
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      const currentUids = new Set<string>();
      setParticipants((prev) => {
        const next: Record<string, VoiceParticipant> = {};
        for (const [pUid, items] of Object.entries(state)) {
          const arr = items as unknown as PresenceItem[];
          const item = arr[arr.length - 1];
          if (!item) continue;
          currentUids.add(pUid);
          next[pUid] = {
            uid: pUid,
            displayName: item.displayName,
            seed: item.seed,
            joinedAt: item.joinedAt,
            isMuted: prev[pUid]?.isMuted ?? false,
          };
        }
        return next;
      });
      // Si entró alguien nuevo, broadcastear nuestro mute para que nos vea
      // con el estado correcto en lugar del default.
      const newcomers: string[] = [];
      for (const pUid of currentUids) {
        if (pUid !== uid && !presenceUidsRef.current.has(pUid)) {
          newcomers.push(pUid);
        }
      }
      presenceUidsRef.current = currentUids;
      if (newcomers.length > 0 && channelRef.current === ch) {
        ch.send({
          type: "broadcast",
          event: "peer-state",
          payload: { uid, isMuted: mutedRef.current },
        });
      }
    });

    ch.on("broadcast", { event: "peer-state" }, ({ payload }) => {
      const { uid: pUid, isMuted: pMuted } = payload as {
        uid: string;
        isMuted: boolean;
      };
      if (pUid === uid) return;
      setParticipants((prev) => {
        if (!prev[pUid]) return prev;
        return { ...prev, [pUid]: { ...prev[pUid], isMuted: pMuted } };
      });
    });

    let active = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    ch.subscribe(async (status) => {
      if (status === "CLOSED" || status === "CHANNEL_ERROR") {
        if (channelRef.current === ch) channelRef.current = null;
        if (active && reconnectTimer === null) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            if (active) setReconnectTick((t) => t + 1);
          }, 1000);
        }
        return;
      }
      if (!active || status !== "SUBSCRIBED") return;
      channelRef.current = ch;
      await ch.track({
        displayName,
        seed,
        joinedAt: joinedAtRef.current,
      });
      if (mutedRef.current) {
        ch.send({
          type: "broadcast",
          event: "peer-state",
          payload: { uid, isMuted: true },
        });
      }
    });

    setChannel(ch);

    return () => {
      active = false;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      channelRef.current = null;
      ch.untrack();
      supabase.removeChannel(ch);
      setChannel(null);
      setParticipants({});
    };
  }, [enabled, code, uid, displayName, seed, reconnectTick]);

  // 2. Iniciar oferta WebRTC para peers nuevos. Regla: uid mayor inicia oferta
  // (evita glare donde ambos peers ofertan simultáneamente).
  useEffect(() => {
    if (!uid) return;
    for (const pUid of Object.keys(participants)) {
      if (pUid === uid) continue;
      if (knownPeersRef.current.has(pUid)) continue;
      knownPeersRef.current.add(pUid);
      if (uid > pUid) initiateCall(pUid);
    }
    for (const pUid of Array.from(knownPeersRef.current)) {
      if (pUid !== uid && !participants[pUid]) {
        knownPeersRef.current.delete(pUid);
      }
    }
  }, [participants, uid, initiateCall]);

  // 3a. Sincronizar isMuted al track de audio local.
  useEffect(() => {
    mutedRef.current = isMuted;
    if (localStream) {
      const track = localStream.getAudioTracks()[0];
      if (track) track.enabled = !isMuted;
    }
  }, [isMuted, localStream]);

  // 3b. Broadcast del cambio de mute.
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch || !uid) return;
    ch.send({
      type: "broadcast",
      event: "peer-state",
      payload: { uid, isMuted },
    });
  }, [isMuted, uid]);

  const toggleMute = useCallback(() => setIsMuted((v) => !v), []);

  return {
    participants,
    localStream,
    remoteStreams,
    peerConnectionStates,
    isMuted,
    toggleMute,
  };
}
