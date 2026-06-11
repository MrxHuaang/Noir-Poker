"use client";
import { useCallback, useEffect, useState } from "react";
import {
  GithubAuthProvider,
  GoogleAuthProvider,
  getRedirectResult,
  linkWithRedirect,
  onAuthStateChanged,
  signInAnonymously,
  signInWithRedirect,
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
    // Consume any pending redirect result (after Google/GitHub OAuth redirect).
    getRedirectResult(auth).catch(() => { /* silent — onAuthStateChanged handles the user */ });
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
  // Usa redirect (no popup) para evitar bloqueos por Cross-Origin-Opener-Policy.
  const linkOrSignIn = useCallback(async (provider: FbAuthProvider) => {
    const auth = getFirebaseAuth();
    const current = auth.currentUser;
    if (current?.isAnonymous) {
      await linkWithRedirect(current, provider);
      return;
    }
    await signInWithRedirect(auth, provider);
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
