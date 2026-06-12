import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerServiceWorker } from "./pwa";
import { initNativeRuntime, isNativeApp } from "./lib/native";

// Point the API client at the production origin when running natively.
initNativeRuntime();

// Password-recovery resilience. Supabase appends the recovery session to the URL
// *hash* (implicit flow). If its redirect allowlist doesn't contain the exact
// `/reset-password` URL, Supabase silently falls back to the configured Site URL
// (usually the app root), so the token lands on a page that ignores it and the
// user gets bounced to the login/welcome screen. Detect a recovery hash on any
// path and forward it — hash intact — to `/reset-password` before React mounts,
// so the reset screen always receives the token (no flash, no reload).
(function forwardRecoveryHash() {
  try {
    const rawHash = window.location.hash.replace(/^#/, "");
    if (!rawHash) return;
    const params = new URLSearchParams(rawHash);
    const isRecovery = params.get("type") === "recovery";
    const isAuthError = !!(params.get("error_code") || params.get("error"));
    const path = window.location.pathname;
    const target = `${import.meta.env.BASE_URL}reset-password`;
    if (path === target) return;
    // `/auth/callback` handles its own (OAuth) hash; never hijack it.
    const onCallback = path.endsWith("/auth/callback");
    if (isRecovery || (isAuthError && !onCallback)) {
      window.history.replaceState({}, "", `${target}${window.location.hash}`);
    }
  } catch {
    // Never block app boot on a hash-parsing edge case.
  }
})();

createRoot(document.getElementById("root")!).render(<App />);

// The service worker is web-only; on the native shell it is pointless and the
// local app scheme can break it.
if (!isNativeApp) {
  registerServiceWorker();
}
