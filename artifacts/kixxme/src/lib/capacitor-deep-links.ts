import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "./auth";

/**
 * Listens for App Links opened on Android (and Universal Links on iOS).
 * When Google OAuth redirects back to https://kixxme.com/auth/callback,
 * Android intercepts the URL and fires appUrlOpen instead of loading a
 * browser page. We extract the tokens from the hash and adopt the session.
 *
 * No-op on web (Capacitor.isNativePlatform() is false).
 */
export function useCapacitorDeepLinks(): void {
  const [, setLocation] = useLocation();
  const { adoptOAuthSession } = useAuth();

  useEffect(() => {
    let removeListener: (() => void) | null = null;

    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { App: CapApp } = await import("@capacitor/app");
        const handle = await CapApp.addListener("appUrlOpen", (event) => {
          try {
            const url = new URL(event.url);
            if (!url.pathname.endsWith("/auth/callback")) return;
            const fragment = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
            const params = new URLSearchParams(fragment);
            const access_token = params.get("access_token");
            const refresh_token = params.get("refresh_token");
            const expires_at = params.get("expires_at");
            if (access_token && refresh_token) {
              adoptOAuthSession({
                access_token,
                refresh_token,
                expires_at: expires_at
                  ? Number(expires_at)
                  : Math.floor(Date.now() / 1000) + 3600,
              }).catch(() => setLocation("/login"));
            }
          } catch {
            // malformed URL — ignore
          }
        });
        removeListener = () => handle.remove();
      } catch {
        // @capacitor/core not available (plain browser build)
      }
    })();

    return () => {
      removeListener?.();
    };
  }, [adoptOAuthSession, setLocation]);
}
