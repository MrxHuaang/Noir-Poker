"use client";
// Single app-wide auth session. <AuthProvider> (mounted once in the root
// layout) owns the Firebase listener, the profile bootstrap (ensure-profile +
// reconcile-escrows) and the live profile subscription; useAuth() just reads
// it. Before this, every component calling useAuth() opened its own listener
// and ensure-profile ran several times per page.
//
// Google sign-in uses a POPUP. The redirect flow broke in current browsers:
// with authDomain on <project>.firebaseapp.com the redirect result lives in
// third-party storage, which Chrome/Safari/Firefox partition, so users came
// back to /login still a guest. Redirect is only a fallback when the browser
// blocks the popup.
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
  GoogleAuthProvider,
  getRedirectResult,
  linkWithPopup,
  linkWithRedirect,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, googleProvider } from "@/lib/firebase";
import { ensureUserProfile, reconcileEscrows, subscribeUserProfile, type UserProfile } from "@/lib/users";

const ALREADY_IN_USE = ["auth/credential-already-in-use", "auth/email-already-in-use"];
const CANCELLED = ["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"];

export type AuthState = {
  user: User | null;
  uid: string | null;
  profile: UserProfile | null;
  loading: boolean;
  isGuest: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Linking keeps the same User object (only isAnonymous flips), which React
  // would not see as a change: bump this to re-derive the session.
  const [rev, setRev] = useState(0);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // The linked Google account already belongs to an earlier Noir account:
  // sign into that one with the credential carried by the error.
  const recoverExisting = useCallback(async (err: unknown) => {
    const code = (err as { code?: string })?.code ?? "";
    if (!ALREADY_IN_USE.includes(code)) return false;
    const cred = GoogleAuthProvider.credentialFromError(err as never);
    if (!cred) return false;
    await signInWithCredential(getFirebaseAuth(), cred);
    return true;
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuth();
    // Result of a fallback redirect (only used when the popup was blocked).
    getRedirectResult(auth).catch(async (err) => {
      try {
        if (await recoverExisting(err)) return;
      } catch {
        /* fall through */
      }
      setAuthError("No se pudo iniciar sesión. Intenta de nuevo.");
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
  }, [recoverExisting]);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    return subscribeUserProfile(user.uid, setProfile);
  }, [user]);

  // Links the anonymous session to Google (keeps the uid, coins and history).
  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    const auth = getFirebaseAuth();
    const current = auth.currentUser;
    const provider = googleProvider();
    try {
      if (current?.isAnonymous) {
        const res = await linkWithPopup(current, provider);
        // Same uid, now a real account: refresh the profile with Google data.
        await res.user.getIdToken(true);
        await ensureUserProfile(res.user).catch(() => {});
        setUser(res.user);
        setRev((r) => r + 1);
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      if (CANCELLED.includes(code)) return;
      try {
        if (await recoverExisting(err)) return;
      } catch {
        setAuthError("No se pudo iniciar sesión. Intenta de nuevo.");
        return;
      }
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        // Popup not allowed here: fall back to the redirect flow.
        if (current?.isAnonymous) await linkWithRedirect(current, provider);
        else await signInWithRedirect(auth, provider);
        return;
      }
      setAuthError("No se pudo iniciar sesión. Intenta de nuevo.");
    }
  }, [recoverExisting]);

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
      signOut,
      getToken,
    }),
    // rev: re-derive isGuest after linking mutates the same User object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, rev, profile, loading, authError, signInWithGoogle, signOut, getToken],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
