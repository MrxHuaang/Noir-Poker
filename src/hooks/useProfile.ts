"use client";
import { useEffect, useState } from "react";
import { subscribeUserProfile, type UserProfile } from "@/lib/users";

// Suscripcion en vivo al perfil de cualquier uid (perfiles publicos).
// Para el perfil del usuario autenticado, useAuth ya expone `profile`.
export function useProfile(uid: string | null) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeUserProfile(uid, (p) => {
      setProfile(p);
      setLoading(false);
    });
    return () => unsub();
  }, [uid]);

  return { profile, loading };
}
