import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { AuthUser, Session, setAuthTokenGetter, useLogin, useSignUp, useLogout } from "@workspace/api-client-react";
import { useLocation } from "wouter";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, user: null });
  const [isLoading, setIsLoading] = useState(true);
  const loginMut = useLogin();
  const signupMut = useSignUp();
  const logoutMut = useLogout();
  const [, setLocation] = useLocation();

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.session && parsed.user) {
          setState(parsed);
          setAuthTokenGetter(() => parsed.session.access_token);
        }
      }
    } catch (e) {
      console.error("Failed to restore session", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setSessionData = (session: Session | null, user: AuthUser | null) => {
    setState({ session, user });
    if (session && user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ session, user }));
      setAuthTokenGetter(() => session.access_token);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      setAuthTokenGetter(() => null);
    }
  };

  const login = async (data: any) => {
    const res = await loginMut.mutateAsync({ data });
    setSessionData(res.session, res.user);
    setLocation("/profile");
  };

  const signup = async (data: any) => {
    const res = await signupMut.mutateAsync({ data });
    setSessionData(res.session, res.user);
    setLocation("/profile");
  };

  const logout = () => {
    logoutMut.mutate(undefined, {
      onSettled: () => {
        setSessionData(null, null);
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
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
