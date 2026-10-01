"use client";
// "Who's knocking?": the landing's sign-in. Google keeps coins, rank and
// character; guests walk in anyway but only sit at tables without chips.
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function LoginDoor({
  open,
  onClose,
  onEnter,
}: {
  open: boolean;
  onClose: () => void;
  onEnter: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { user, isGuest, signInWithGoogle, authError } = useAuth();
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Walk in as soon as the Google account is on the user.
  useEffect(() => {
    if (waiting && user && !isGuest) onEnter();
  }, [waiting, user, isGuest, onEnter]);

  async function google() {
    setWaiting(true);
    try {
      await signInWithGoogle();
    } catch {
      setWaiting(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="door-title"
      className="m-auto w-[min(460px,92vw)] bg-transparent p-0 text-paper backdrop:bg-[rgb(5_4_3/.82)]"
    >
      <div className="plate grid gap-3.5 px-8 pt-9 pb-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-4 top-3.5 grid h-9 w-9 place-items-center text-[#b9a684] hover:text-paper"
        >
          <X className="h-5 w-5" />
        </button>
        <p className="kick">La mirilla se abre</p>
        <h2 id="door-title" className="stencil text-[40px]">
          ¿Quién llama?
        </h2>
        <p className="m-0 text-[15px] text-[#dccfb1]">
          Entra con tu cuenta para guardar tus fichas, tu rango y tu personaje.
        </p>
        <button type="button" className="tk" onClick={google} disabled={waiting && !authError}>
          {waiting && !authError ? "Abriendo la puerta" : "Continuar con Google"}
        </button>
        {authError && (
          <p role="alert" className="m-0 font-pix text-sm text-tungsten-400">
            {authError}
          </p>
        )}
        <div className="flex items-center gap-2.5 text-[13px] text-[#b9a684] before:h-px before:flex-1 before:bg-brass-200/30 after:h-px after:flex-1 after:bg-brass-200/30">
          o bien
        </div>
        <button type="button" className="btn-brass" onClick={onEnter}>
          Entrar como invitado
        </button>
        <p className="m-0 text-[13px] text-[#b9a684]">Los invitados solo juegan mesas sin fichas.</p>
      </div>
    </dialog>
  );
}
