"use client";
// The Noir table: the pixel-art 3D scene (public/noir/scene.html?mode=remote)
// full screen, fed with snapshots of the authoritative state. The scene only
// renders; this component only forwards. Controls and prompts are children
// laid over the room, kept to the edges so the table stays the picture.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SceneSnapshot } from "@/lib/noirScene";

export type SceneCam = "front" | "iso";

/** A one-off sound for something the scene cannot see (a new blind level, a note). */
export type SceneCue = { kind: "level" | "paper" | "join"; n: number };

export function NoirTable({
  snapshot,
  cam,
  sound,
  music = true,
  cue,
  fourColor,
  onShown,
  children,
}: {
  snapshot: SceneSnapshot;
  cam: SceneCam;
  sound: boolean;
  /** The radio in the corner (the effects stay with `sound`). */
  music?: boolean;
  cue?: SceneCue | null;
  fourColor: boolean;
  /** The scene finished laying out a hand's result (runout, winners lit). */
  onShown?: (hand: number) => void;
  children?: ReactNode;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  // The iframe URL is fixed at mount; later changes travel as messages.
  const [src] = useState(
    () => `/noir/scene.html?mode=remote&lift=0.13&cam=${cam}&place=trastienda&grade=humo&felt=verde&four=${fourColor ? "on" : "off"}`,
  );

  const shownRef = useRef(onShown);
  useEffect(() => {
    shownRef.current = onShown;
  }, [onShown]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.sceneReady === "remote") setReady(true);
      if (typeof e.data?.shown === "number") shownRef.current?.(e.data.shown);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const post = (msg: unknown) => frame.current?.contentWindow?.postMessage(msg, window.location.origin);

  useEffect(() => {
    if (ready) post({ snap: snapshot });
  }, [ready, snapshot]);
  useEffect(() => {
    if (ready) post({ cam });
  }, [ready, cam]);
  useEffect(() => {
    if (ready) post({ sound });
  }, [ready, sound]);
  useEffect(() => {
    if (ready) post({ four: fourColor });
  }, [ready, fourColor]);
  useEffect(() => {
    if (ready) post({ music });
  }, [ready, music]);
  useEffect(() => {
    if (ready && cue) post({ cue: cue.kind });
  }, [ready, cue]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#07060a] text-paper">
      <iframe
        ref={frame}
        src={src}
        title="Mesa de póker en la trastienda"
        // The table's sounds play inside the scene: let the page's clicks unlock its audio.
        allow="autoplay"
        className="absolute inset-0 h-full w-full border-0"
      />
      {!ready && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#07060a] font-pix text-sm tracking-[.14em] text-brass-200">
          ENCENDIENDO LA LÁMPARA
        </div>
      )}
      {children}
    </div>
  );
}
