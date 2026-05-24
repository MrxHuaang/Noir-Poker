"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Signal =
  | { from: string; to: string; type: "offer"; data: string }
  | { from: string; to: string; type: "answer"; data: string }
  | { from: string; to: string; type: "candidate"; data: string };

const OPUS_MAX_BITRATE = 24000; // 24 kbps: claro para voz, ~2.5x menos tráfico

// STUN solo basta cuando ambos peers están detrás de NAT permisivo. En LatAm
// (y muchas redes corporativas/hoteles) el NAT es simétrico y los paquetes
// nunca se encuentran sin un relay TURN. Las credenciales se leen en build
// time desde process.env; si faltan se cae a STUN-only y se avisa por consola.
// El constructor de RTCPeerConnection rechaza URLs sin esquema (`turn:`/`turns:`).
// Normalizamos defensivamente para que un .env mal rellenado no tumbe la app.
function normalizeTurnUrl(raw: string, tls: boolean): string {
  const trimmed = raw.trim();
  if (/^(turn|turns|stun|stuns):/i.test(trimmed)) return trimmed;
  return `${tls ? "turns" : "turn"}:${trimmed}`;
}

function buildIceServers(): RTCConfiguration {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const turnUrlTls = process.env.NEXT_PUBLIC_TURN_URL_TLS;
  const username = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  if (turnUrl && username && credential) {
    const urls = [normalizeTurnUrl(turnUrl, false)];
    if (turnUrlTls) urls.push(normalizeTurnUrl(turnUrlTls, true));
    servers.push({ urls, username, credential });
  } else {
    console.warn(
      "TURN no configurado: las llamadas entre redes restrictivas pueden quedarse sin audio.",
    );
  }
  return { iceServers: servers };
}

// SDP munging: cap Opus a 24 kbps en el lado del que ofrece/responde. Algunos
// navegadores ignoran esto y respetan solo setParameters(); aplicamos ambas
// vías para máxima compatibilidad. Sin esto, el default de Opus en WebRTC
// (~40-64 kbps) por 5-9 streams paralelos satura redes móviles flojas.
function capOpusBitrate(sdp: string): string {
  const lines = sdp.split(/\r?\n/);
  const audioIdx = lines.findIndex((l) => l.startsWith("m=audio"));
  if (audioIdx === -1) return sdp;
  // 1) Encontrar el payload type del codec Opus en la sección de audio.
  let opusPt: string | null = null;
  for (let i = audioIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("m=")) break; // siguiente media section
    const m = lines[i].match(/^a=rtpmap:(\d+)\s+opus\//i);
    if (m) {
      opusPt = m[1];
      break;
    }
  }
  if (!opusPt) return sdp;
  // 2) Inyectar b=AS justo después de la línea c= o m=audio.
  let cIdx = -1;
  for (let i = audioIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("m=")) break;
    if (lines[i].startsWith("c=")) {
      cIdx = i;
      break;
    }
  }
  const insertIdx = cIdx !== -1 ? cIdx + 1 : audioIdx + 1;
  const kbps = Math.round(OPUS_MAX_BITRATE / 1000);
  // Evita duplicar si ya existe.
  if (!lines.some((l) => l.startsWith("b=AS:"))) {
    lines.splice(insertIdx, 0, `b=AS:${kbps}`);
  }
  // 3) Actualizar o agregar a=fmtp:<pt> maxaveragebitrate=...
  const fmtpRegex = new RegExp(`^a=fmtp:${opusPt}\\s+`);
  const fmtpLineIdx = lines.findIndex((l) => fmtpRegex.test(l));
  if (fmtpLineIdx !== -1) {
    const existing = lines[fmtpLineIdx];
    if (/maxaveragebitrate=/.test(existing)) {
      lines[fmtpLineIdx] = existing.replace(
        /maxaveragebitrate=\d+/,
        `maxaveragebitrate=${OPUS_MAX_BITRATE}`,
      );
    } else {
      lines[fmtpLineIdx] = `${existing};maxaveragebitrate=${OPUS_MAX_BITRATE}`;
    }
  } else {
    // Insertar al final de la sección de audio.
    let endIdx = lines.length;
    for (let i = audioIdx + 1; i < lines.length; i++) {
      if (lines[i].startsWith("m=")) {
        endIdx = i;
        break;
      }
    }
    lines.splice(
      endIdx,
      0,
      `a=fmtp:${opusPt} maxaveragebitrate=${OPUS_MAX_BITRATE};stereo=0;useinbandfec=1`,
    );
  }
  return lines.join("\r\n");
}

async function applyAudioBitrateCap(pc: RTCPeerConnection) {
  for (const sender of pc.getSenders()) {
    if (!sender.track || sender.track.kind !== "audio") continue;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      params.encodings[0].maxBitrate = OPUS_MAX_BITRATE;
      await sender.setParameters(params);
    } catch (err) {
      console.warn("No se pudo aplicar maxBitrate al sender de audio:", err);
    }
  }
}

export function useVoiceWebRTC(
  callId: string | null,
  userId: string | null,
  channel: RealtimeChannel | null,
  // Clave estable (uids ordenados unidos por coma) de los participantes vivos.
  // Se usa para cerrar PeerConnections cuando un peer sale. Es string (no array)
  // para evitar re-disparos por identidad: solo cambia si entra/sale alguien.
  peerUidsKey: string,
) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<{
    [uid: string]: MediaStream;
  }>({});
  const [peerConnectionStates, setPeerConnectionStates] = useState<{
    [uid: string]: RTCPeerConnectionState;
  }>({});
  const peerConnections = useRef<{ [uid: string]: RTCPeerConnection }>({});
  const localStreamRef = useRef<MediaStream | null>(null);

  // Capturar localStream una vez por llamada.
  useEffect(() => {
    if (!callId) return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setLocalStream(stream);
        localStreamRef.current = stream;
      } catch (err) {
        console.error("Error accediendo al micrófono:", err);
      }
    })();
    return () => {
      cancelled = true;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      Object.values(peerConnections.current).forEach((pc) => pc.close());
      peerConnections.current = {};
      setRemoteStreams({});
      setPeerConnectionStates({});
      setLocalStream(null);
    };
  }, [callId]);

  // Cuando un peer desaparece de la lista de participantes vivos, cerrar
  // su RTCPeerConnection y eliminar su MediaStream remoto. Sin esto, cerrar
  // una pestaña dejaría la tarjeta del peer y su conexión vivas en la otra.
  useEffect(() => {
    const alive = new Set(
      peerUidsKey ? peerUidsKey.split(",").filter(Boolean) : [],
    );
    const toRemove: string[] = [];
    for (const uid of Object.keys(peerConnections.current)) {
      if (!alive.has(uid)) toRemove.push(uid);
    }
    if (toRemove.length === 0) return;
    for (const uid of toRemove) {
      peerConnections.current[uid].close();
      delete peerConnections.current[uid];
    }
    setRemoteStreams((prev) => {
      const next = { ...prev };
      for (const uid of toRemove) delete next[uid];
      return next;
    });
    setPeerConnectionStates((prev) => {
      const next = { ...prev };
      for (const uid of toRemove) delete next[uid];
      return next;
    });
  }, [peerUidsKey]);

  const sendSignal = useCallback(
    (signal: Signal) => {
      if (!channel) return;
      channel.send({ type: "broadcast", event: "signal", payload: signal });
    },
    [channel],
  );

  const createPeerConnection = useCallback(
    (peerUid: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection(buildIceServers());

      pc.onicecandidate = (event) => {
        if (event.candidate && userId) {
          sendSignal({
            from: userId,
            to: peerUid,
            type: "candidate",
            data: JSON.stringify(event.candidate),
          });
        }
      };

      pc.ontrack = (event) => {
        if (event.track.kind !== "audio") return;
        if (event.streams.length > 0) {
          setRemoteStreams((prev) => ({
            ...prev,
            [peerUid]: event.streams[0],
          }));
        }
      };

      pc.onconnectionstatechange = () => {
        setPeerConnectionStates((prev) => ({
          ...prev,
          [peerUid]: pc.connectionState,
        }));
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          setRemoteStreams((prev) => {
            const next = { ...prev };
            delete next[peerUid];
            return next;
          });
        }
      };

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      peerConnections.current[peerUid] = pc;
      return pc;
    },
    [userId, sendSignal],
  );

  const handleSignal = useCallback(
    async (signal: Signal) => {
      if (!userId || signal.to !== userId) return;

      let pc = peerConnections.current[signal.from];
      if (!pc) pc = createPeerConnection(signal.from);

      try {
        if (signal.type === "offer") {
          await pc.setRemoteDescription(
            new RTCSessionDescription(JSON.parse(signal.data)),
          );
          const answer = await pc.createAnswer();
          answer.sdp = answer.sdp ? capOpusBitrate(answer.sdp) : answer.sdp;
          await pc.setLocalDescription(answer);
          await applyAudioBitrateCap(pc);
          sendSignal({
            from: userId,
            to: signal.from,
            type: "answer",
            data: JSON.stringify(pc.localDescription),
          });
        } else if (signal.type === "answer") {
          await pc.setRemoteDescription(
            new RTCSessionDescription(JSON.parse(signal.data)),
          );
          await applyAudioBitrateCap(pc);
        } else if (signal.type === "candidate") {
          await pc.addIceCandidate(
            new RTCIceCandidate(JSON.parse(signal.data)),
          );
        }
      } catch (err) {
        console.warn("Error procesando señal WebRTC:", err);
      }
    },
    [userId, createPeerConnection, sendSignal],
  );

  // Suscribirse al canal Broadcast para recibir señales.
  useEffect(() => {
    if (!channel || !userId) return;
    const handler = ({ payload }: { payload: Signal }) => {
      handleSignal(payload);
    };
    channel.on("broadcast", { event: "signal" }, handler);
    // El cleanup del canal lo hace el dueño (useVoiceRoom) al desmontar.
  }, [channel, userId, handleSignal]);

  const initiateCall = useCallback(
    async (targetUid: string) => {
      if (!userId || !localStreamRef.current) return;
      try {
        const pc = createPeerConnection(targetUid);
        const offer = await pc.createOffer();
        offer.sdp = offer.sdp ? capOpusBitrate(offer.sdp) : offer.sdp;
        await pc.setLocalDescription(offer);
        await applyAudioBitrateCap(pc);
        sendSignal({
          from: userId,
          to: targetUid,
          type: "offer",
          data: JSON.stringify(pc.localDescription),
        });
      } catch (err) {
        console.error("Error iniciando llamada WebRTC:", err);
      }
    },
    [userId, createPeerConnection, sendSignal],
  );

  // Renegociación manual tras agregar/quitar tracks. Glare protection lite:
  // si la PC no está en 'stable', otra oferta ya está en vuelo y procesarla
  // crashea con InvalidStateError. La próxima señal volverá a stable y un
  // retry del usuario cubre el caso raro.
  const renegotiate = useCallback(
    async (peerUid: string, pc: RTCPeerConnection) => {
      if (!userId) return;
      if (pc.signalingState !== "stable") {
        console.warn(
          `PC ${peerUid} no estable (${pc.signalingState}), salto renegociación`,
        );
        return;
      }
      try {
        const offer = await pc.createOffer();
        offer.sdp = offer.sdp ? capOpusBitrate(offer.sdp) : offer.sdp;
        await pc.setLocalDescription(offer);
        await applyAudioBitrateCap(pc);
        sendSignal({
          from: userId,
          to: peerUid,
          type: "offer",
          data: JSON.stringify(pc.localDescription),
        });
      } catch (err) {
        console.error("Error renegociando con", peerUid, err);
      }
    },
    [userId, sendSignal],
  );

  // Race condition típica de móvil: el navegador pide permiso del micrófono
  // (popup táctil que tarda segundos), mientras tanto el otro peer ya envió la
  // offer. handleSignal crea la PeerConnection con localStreamRef.current=null
  // → la PC nace sin audio tracks. Cuando finalmente llega el stream, las PCs
  // existentes quedan mudas y solo se arregla saliendo y volviendo a entrar.
  //
  // Este effect cierra la brecha: cuando localStream pasa a estar disponible,
  // recorre las PCs ya creadas, agrega los tracks que falten y renegocia.
  // Si la PC todavía está en medio de offer/answer (signalingState !== stable),
  // espera al próximo signalingstatechange y renegocia entonces.
  useEffect(() => {
    if (!localStream) return;
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) return;

    const cleanups: Array<() => void> = [];

    for (const [peerUid, pc] of Object.entries(peerConnections.current)) {
      const hasAudioSender = pc
        .getSenders()
        .some((s) => s.track?.kind === "audio");
      if (hasAudioSender) continue;

      for (const track of audioTracks) {
        pc.addTrack(track, localStream);
      }

      if (pc.signalingState === "stable") {
        void renegotiate(peerUid, pc);
      } else {
        const onStateChange = () => {
          if (pc.signalingState === "stable") {
            pc.removeEventListener("signalingstatechange", onStateChange);
            void renegotiate(peerUid, pc);
          }
        };
        pc.addEventListener("signalingstatechange", onStateChange);
        cleanups.push(() =>
          pc.removeEventListener("signalingstatechange", onStateChange),
        );
      }
    }

    return () => {
      for (const c of cleanups) c();
    };
  }, [localStream, renegotiate]);

  return {
    localStream,
    remoteStreams,
    initiateCall,
    peerConnectionStates,
  };
}
