"use client";
// The lineup: the 3D scene in select mode inside a dialog. The scene posts
// {chosen: id} when the player picks; the first time the dialog cannot be
// dismissed until someone is chosen (you need a face to sit at the table).
import { useEffect, useRef } from "react";
import { isCastId, sceneUrl, type CastId } from "@/lib/noirCast";

export function CharacterPicker({
  open,
  current,
  first,
  onChosen,
  onClose,
}: {
  open: boolean;
  current: CastId;
  first: boolean;
  onChosen: (id: CastId) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // The parent closes the dialog on a choice, so the URL never changes while open.
  const src = open ? sceneUrl("select", first ? { me: current, first: 1 } : { me: current }) : "";

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const id = e.data?.chosen;
      if (typeof id === "string" && isCastId(id)) onChosen(id);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onChosen]);

  return (
    <dialog
      ref={ref}
      aria-label="Elige quién eres"
      onCancel={(e) => {
        if (first) e.preventDefault();
        else onClose();
      }}
      className="m-auto h-[min(740px,90vh)] w-[min(1200px,95vw)] max-w-none overflow-hidden bg-[#07060a] p-0 text-paper shadow-[0_0_0_1px_var(--color-brass-700),0_40px_100px_rgb(0_0_0/.7)] backdrop:bg-[rgb(5_4_3/.88)]"
    >
      {src && <iframe src={src} title="Selector de personaje" className="h-full w-full border-0" />}
      {!first && (
        <button type="button" onClick={onClose} className="btn-brass btn-sm absolute right-3 top-3">
          Cerrar
        </button>
      )}
    </dialog>
  );
}
