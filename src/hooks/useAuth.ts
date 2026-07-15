"use client";
import { useCallback, useEffect, useState } from "react";
import {
  GithubAuthProvider,
  GoogleAuthProvider,
  getRedirectResult,
  linkWithRedirect,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithRedirect,
  signOut as fbSignOut,
  type AuthProvider as FbAuthProvider,
  type OAuthCredential,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, githubProvider, googleProvider } from "@/lib/firebase";
import { ensureUserProfile, reconcileEscrows, subscribeUserProfile, type UserProfile } from "@/lib/users";

// Credential embedded in a failed-link error (see extractCredential below).
// Firebase's typings don't expose it, but both Google/GitHub OAuth errors
// carry it on `customData._tokenResponse` — read it defensively.
function credentialFromLinkError(error: unknown): OAuthCredential | null {
  return (
    GoogleAuthProvider.credentialFromError(error as never) ??
    GithubAuthProvider.credentialFromError(error as never) ??
    null
  );
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    // Consume any pending redirect result (after Google/GitHub OAuth redirect).
    // linkWithRedirect fails here (not at call time — the page already
    // navigated away) when the chosen account was already used before: the
    // Google/GitHub credential is tied to a DIFFERENT (earlier) account than
    // this session's fresh anonymous one, so Firebase rejects the link with
    // credential-already-in-use. Previously this error was swallowed, leaving
    // the user anonymous forever — every retry repeated the same failed link,
    // looping back to /login. Recover by signing into that existing account
    // with the credential Firebase hands back in the error.
    getRedirectResult(auth).catch(async (err) => {
      const code = (err as { code?: string })?.code;
      if (code === "auth/credential-already-in-use" || code === "auth/email-already-in-use") {
        const cred = credentialFromLinkError(err);
        if (cred) {
          try {
            await signInWithCredential(auth, cred);
            return;
          } catch {
            /* fall through to error message below */
          }
        }
      }
      setAuthError("No se pudo iniciar sesion. Intenta de nuevo.");
    });
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
    setAuthError(null);
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
    authError,
    signInWithGoogle,
    signInWithGithub,
    signOut,
  };
}

// Re-export para conveniencia de UI.
export { GoogleAuthProvider, GithubAuthProvider };
