"use client";
import { useCallback, useEffect, useState } from "react";
import {
  GithubAuthProvider,
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut as fbSignOut,
  type AuthProvider as FbAuthProvider,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, githubProvider, googleProvider } from "@/lib/firebase";
import { ensureUserProfile, reconcileEscrows, subscribeUserProfile, type UserProfile } from "@/lib/users";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        try {
          await signInAnonymously(auth);
        } catch {
          /* ignore */
        }
        return;
      }
      setUser(u);
      setLoading(false);
      // Crea/actualiza el perfil (grant inicial, bono diario, rescate).
      try {
        await ensureUserProfile(u);
        // Libera escrows huerfanos de sesiones que no cerraron limpiamente.
        await reconcileEscrows(u.uid);
      } catch {
        /* la suscripcion reflejara el estado disponible */
      }
    });
    return () => unsub();
  }, []);

  // Suscripcion en vivo al perfil del usuario actual.
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    const unsub = subscribeUserProfile(user.uid, setProfile);
    return () => unsub();
  }, [user]);

  // Enlaza la cuenta anonima con un proveedor social para conservar el uid.
  // Si la credencial ya pertenece a otra cuenta, hace login normal (best-effort).
  const linkOrSignIn = useCallback(async (provider: FbAuthProvider) => {
    const auth = getFirebaseAuth();
    const current = auth.currentUser;
    try {
      if (current?.isAnonymous) {
        await linkWithPopup(current, provider);
        return;
      }
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      // La cuenta social ya existe: caer a login normal mas abajo.
      if (
        code !== "auth/credential-already-in-use" &&
        code !== "auth/email-already-in-use" &&
        code !== "auth/provider-already-linked"
      ) {
        throw err;
      }
    }
    await signInWithPopup(auth, provider);
  }, []);

  const signInWithGoogle = useCallback(
    () => linkOrSignIn(googleProvider()),
    [linkOrSignIn],
  );
  const signInWithGithub = useCallback(
    () => linkOrSignIn(githubProvider()),
    [linkOrSignIn],
  );

  const signOut = useCallback(async () => {
    const auth = getFirebaseAuth();
    await fbSignOut(auth);
    // onAuthStateChanged re-crea una sesion anonima de invitado.
  }, []);

  const isGuest = !!user?.isAnonymous;

  return {
    user,
    uid: user?.uid ?? null,
    profile,
    loading,
    isGuest,
    signInWithGoogle,
    signInWithGithub,
    signOut,
  };
}

// Re-export para conveniencia de UI.
export { GoogleAuthProvider, GithubAuthProvider };
