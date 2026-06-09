import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { AuthUser, Session, setAuthTokenGetter, refreshSession, useLogin, useSignUp, useLogout } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { setRealtimeAuth } from "./supabase";

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
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = "kixxme_session";
// Refresh proactively when the access token is within this many seconds of expiry.
const EXPIRY_BUFFER_SECONDS = 60;

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
    setLocation("/profile");
  };

  const signup = async (data: any) => {
    const res = await signupMut.mutateAsync({ data });
    if (res.session) {
      persist(res.session, res.user);
      setLocation("/profile");
    } else {
      setLocation("/login?confirm=1");
    }
  };

  const logout = () => {
    logoutMut.mutate(undefined, {
      onSettled: () => {
        persist(null, null);
        setLocation("/login");
      }
    });
  };

  return (
    <AuthContext.Provider value={{ session: state.session, user: state.user, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
