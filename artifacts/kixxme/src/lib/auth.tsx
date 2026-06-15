import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { AuthUser, Session, setAuthTokenGetter, refreshSession, useLogin, useSignUp, useLogout } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { setRealtimeAuth, supabase } from "./supabase";
import { queryClient } from "./query-client";
import { syncNativeAccount, unregisterNativeAccount } from "./native-account";

interface AuthState {
  session: Session | null;
  user: AuthUser | null;
}

interface AuthContextValue {
  session: Session | null;
  user: AuthUser | null;
  isLoading: boolean;
  login: (data: any) => Promise<void>;
  signup: (data: any) => Promise<void>;
  logout: () => void;
  applySession: (res: { user: AuthUser; session: Session | null }) => void;
  loginWithProvider: (provider: "google") => Promise<void>;
  adoptOAuthSession: (tokens: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = "kixxme_session";
// Refresh proactively when the access token is within this many seconds of expiry.
const EXPIRY_BUFFER_SECONDS = 60;

export const SOCIAL_AUTH_ENABLED: boolean = true;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, user: null });
  const [isLoading, setIsLoading] = useState(true);
  const loginMut = useLogin();
  const signupMut = useSignUp();
  const logoutMut = useLogout();
  const [, setLocation] = useLocation();

  // Always-current snapshots so the long-lived token getter closure reads fresh state.
  const sessionRef = useRef<Session | null>(null);
  const userRef = useRef<AuthUser | null>(null);
  const refreshInFlight = useRef<Promise<string | null> | null>(null);

  const persist = (session: Session | null, user: AuthUser | null) => {
    sessionRef.current = session;
    userRef.current = user;
    setState({ session, user });
    if (session && user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ session, user }));
      setRealtimeAuth(session.access_token);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      setRealtimeAuth(null);
    }
  };

  // Register a single async token getter that proactively refreshes the access
  // token before (or right after) it expires, so polling never 401s forever.
  useEffect(() => {
    setAuthTokenGetter(async () => {
      const session = sessionRef.current;
      if (!session) return null;

      const now = Math.floor(Date.now() / 1000);
      if (session.expires_at - EXPIRY_BUFFER_SECONDS > now) {
        return session.access_token;
      }

      // Token expired/expiring — refresh once and let concurrent callers share it.
      if (!refreshInFlight.current) {
        refreshInFlight.current = (async () => {
          try {
            // Pass the (stale) bearer so customFetch skips the auth getter and
            // we don't recurse into another refresh while fetching /auth/refresh.
            const res = await refreshSession(
              { refresh_token: session.refresh_token },
              { headers: { Authorization: `Bearer ${session.access_token}` } },
            );
            persist(res.session, userRef.current);
            return res.session.access_token;
          } catch {
            // Refresh token revoked/expired — sign out and bounce to login.
            persist(null, null);
            queryClient.clear();
            setLocation("/login");
            return null;
          } finally {
            refreshInFlight.current = null;
          }
        })();
      }
      return refreshInFlight.current;
    });

    return () => setAuthTokenGetter(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bridge the auth lifecycle to native-only concerns (RevenueCat identity +
  // push token registration). No-op on the web build.
  useEffect(() => {
    syncNativeAccount(state.user?.id ?? null);
  }, [state.user?.id]);

  // Restore persisted session on mount.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.session && parsed.user) {
          persist(parsed.session, parsed.user);
        }
      }
    } catch (e) {
      console.error("Failed to restore session", e);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (data: any) => {
    const res = await loginMut.mutateAsync({ data });
    persist(res.session, res.user);
    // Drop any cached responses from a previous account so per-user state
    // (e.g. isAdmin from /me/moderation) is refetched fresh for this session.
    queryClient.clear();
    setLocation("/profile");
  };

  const signup = async (data: any) => {
    const res = await signupMut.mutateAsync({ data });
    // Flag a one-time welcome modal for this brand-new account. Survives the
    // queryClient.clear() below and the email-confirmation login round-trip,
    // and is keyed per user so it never shows for pre-existing accounts.
    if (res.user?.id) {
      try {
        localStorage.setItem(`kixxme:welcome-pending:${res.user.id}`, "1");
      } catch {
        // ignore storage errors
      }
    }
    if (res.session) {
      persist(res.session, res.user);
      queryClient.clear();
      setLocation("/profile");
    } else {
      setLocation("/login?confirm=1");
    }
  };

  const logout = () => {
    // On native, release the push token + RevenueCat identity while the session
    // is still valid, so the authenticated DELETE /me/devices lands before we
    // clear the token. Resolves immediately on web.
    void unregisterNativeAccount().finally(() => {
      logoutMut.mutate(undefined, {
        onSettled: () => {
          persist(null, null);
          queryClient.clear();
          setLocation("/login");
        },
      });
    });
  };

  // Adopt a session minted outside the login/signup mutations (e.g. the
  // password-reset flow returns a fresh session so the user lands logged in).
  // If no session came back, the password change still succeeded — send the
  // user to login to sign in manually.
  const applySession = (res: { user: AuthUser; session: Session | null }) => {
    if (res.session) {
      persist(res.session, res.user);
      queryClient.clear();
      setLocation("/discover");
    } else {
      setLocation("/login?reset=1");
    }
  };

  // Kick off a Google OAuth sign-in. supabase-js redirects the whole
  // browser to Google; on return it lands on /auth/callback with tokens
  // in the URL hash (implicit flow).
  const loginWithProvider = async (provider: "google") => {
    const baseNoSlash = import.meta.env.BASE_URL.replace(/\/$/, "");
    const redirectTo = `${window.location.origin}${baseNoSlash}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) throw error;
  };

  // Adopt a Supabase session obtained client-side via OAuth. We resolve the
  // user from the access token and persist it like any other login. New users
  // have no `username` yet, so /profile forces onboarding (the server JIT-creates
  // the profile row on the first /profiles/me call).
  const adoptOAuthSession = async (tokens: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  }) => {
    const { data, error } = await supabase.auth.getUser(tokens.access_token);
    if (error || !data.user) {
      throw error ?? new Error("No se pudo obtener el usuario");
    }
    const u = data.user;
    const username =
      typeof u.user_metadata?.username === "string"
        ? u.user_metadata.username
        : "";
    const user: AuthUser = { id: u.id, email: u.email ?? "", username };
    persist(
      {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_at,
      },
      user,
    );
    queryClient.clear();
    setLocation("/profile");
  };

  return (
    <AuthContext.Provider value={{ session: state.session, user: state.user, isLoading, login, signup, logout, applySession, loginWithProvider, adoptOAuthSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
