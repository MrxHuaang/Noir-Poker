"use client";
// Single app-wide auth session. <AuthProvider> (mounted once in the root
// layout) owns the Firebase listener, the OAuth redirect result, the profile
// bootstrap (ensure-profile + reconcile-escrows) and the live profile
// subscription; useAuth() just reads it. Before this, every component calling
// useAuth() opened its own listener: ensure-profile ran several times per page
// and the one-shot redirect result was consumed by whichever instance mounted
// first (the Nav), so /login never saw a failed sign-in.
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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

const PENDING_PROVIDER_KEY = "auth:pendingProvider";

// Credential embedded in a failed-link error. Each provider class must be
// asked with its own helper: GoogleAuthProvider.credentialFromError happily
// wraps a GitHub token in a google.com credential (it does not check the
// provider id), which then fails to sign in. So pick the provider from the
// error itself, falling back to the one we redirected with.
function credentialFromLinkError(error: unknown): OAuthCredential | null {
  const tokenProvider = (error as { customData?: { _tokenResponse?: { providerId?: string } } })
    ?.customData?._tokenResponse?.providerId;
  let pending: string | null = null;
  try {
    pending = sessionStorage.getItem(PENDING_PROVIDER_KEY);
  } catch {
    /* storage unavailable */
  }
  const providerId = tokenProvider ?? pending ?? "";
  if (providerId.includes("github")) {
    return GithubAuthProvider.credentialFromError(error as never) ?? null;
  }
  if (providerId.includes("google")) {
    return GoogleAuthProvider.credentialFromError(error as never) ?? null;
  }
  return null;
}

export type AuthState = {
  user: User | null;
  uid: string | null;
  profile: UserProfile | null;
  loading: boolean;
  isGuest: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithGithub: () => Promise<void>;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    // Consume the pending OAuth redirect result once. linkWithRedirect fails
    // here (not at call time: the page already navigated away) when the chosen
    // account already exists; the Google/GitHub credential belongs to that
    // earlier account, not to this session's fresh anonymous one. Recover by
    // signing into the existing account with the credential from the error.
    let returningFromProvider = false;
    try {
      returningFromProvider = !!sessionStorage.getItem(PENDING_PROVIDER_KEY);
    } catch {
      /* storage unavailable */
    }
    getRedirectResult(auth)
      .then((result) => {
        // Back from Google/GitHub but no result and still a guest: the
        // browser dropped the redirect state (third-party storage
        // partitioning with a foreign authDomain). Say so instead of silently
        // landing on /login again.
        if (!result && returningFromProvider && auth.currentUser?.isAnonymous) {
          setAuthError(
            "Tu navegador bloqueó el inicio de sesión (almacenamiento de terceros). Intenta de nuevo o usa otro navegador.",
          );
        }
      })
      .catch(async (err) => {
        const code = (err as { code?: string })?.code;
        if (code === "auth/credential-already-in-use" || code === "auth/email-already-in-use") {
          const cred = credentialFromLinkError(err);
          if (cred) {
            try {
              await signInWithCredential(auth, cred);
              return;
            } catch {
              /* fall through to the error message below */
            }
          }
        }
        setAuthError("No se pudo iniciar sesion. Intenta de nuevo.");
      })
      .finally(() => {
        try {
          sessionStorage.removeItem(PENDING_PROVIDER_KEY);
        } catch {
          /* storage unavailable */
        }
      });

    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        try {
          await signInAnonymously(auth);
        } catch {
          setLoading(false);
        }
        return;
      }
      setUser(u);
      setLoading(false);
      // Profile bootstrap (initial grant, daily bonus, bust rescue) and release
      // of escrows left behind by sessions that did not close cleanly.
      try {
        await ensureUserProfile(u);
        await reconcileEscrows(u.uid);
      } catch {
        /* the profile subscription reflects whatever is available */
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    return subscribeUserProfile(user.uid, setProfile);
  }, [user]);

  // Links the anonymous session to a social provider (keeps the uid). Redirect
  // flow: popups break under Cross-Origin-Opener-Policy.
  const linkOrSignIn = useCallback(async (provider: FbAuthProvider, id: string) => {
    setAuthError(null);
    try {
      sessionStorage.setItem(PENDING_PROVIDER_KEY, id);
    } catch {
      /* storage unavailable */
    }
    const auth = getFirebaseAuth();
    const current = auth.currentUser;
    if (current?.isAnonymous) {
      await linkWithRedirect(current, provider);
      return;
    }
    await signInWithRedirect(auth, provider);
  }, []);

  const signInWithGoogle = useCallback(
    () => linkOrSignIn(googleProvider(), "google.com"),
    [linkOrSignIn],
  );
  const signInWithGithub = useCallback(
    () => linkOrSignIn(githubProvider(), "github.com"),
    [linkOrSignIn],
  );

  const signOut = useCallback(async () => {
    await fbSignOut(getFirebaseAuth());
    // onAuthStateChanged starts a fresh anonymous guest session.
  }, []);

  const getToken = useCallback(async () => {
    const u = getFirebaseAuth().currentUser;
    if (!u) return null;
    try {
      return await u.getIdToken();
    } catch {
      return null;
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      uid: user?.uid ?? null,
      profile,
      loading,
      isGuest: !!user?.isAnonymous,
      authError,
      signInWithGoogle,
      signInWithGithub,
      signOut,
      getToken,
    }),
    [user, profile, loading, authError, signInWithGoogle, signInWithGithub, signOut, getToken],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

// Re-exported for UI convenience.
export { GoogleAuthProvider, GithubAuthProvider };
