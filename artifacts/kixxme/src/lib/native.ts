import { Capacitor } from "@capacitor/core";
import { setBaseUrl } from "@workspace/api-client-react";

// Injected at build time by vite (define). Holds the absolute origin the
// native bundle must call for the API (e.g. "https://kixxme.com"). Empty on
// the web build, where the API is reached same-origin through the proxy.
declare const __API_ORIGIN__: string;

/** True when running inside the Capacitor native shell (iOS/Android). */
export const isNativeApp = Capacitor.isNativePlatform();

/** The native platform id: "ios" | "android" | "web". */
export const nativePlatform = Capacitor.getPlatform();

/**
 * Bootstraps runtime config that only applies to the native shell. On the web
 * this is a no-op so the browser keeps using same-origin relative requests.
 *
 * The native WebView is served from capacitor://localhost / https://localhost,
 * so relative "/api" paths would resolve against that local origin. We point
 * the API client at the production origin instead. Auth already works because
 * the client sends the Supabase access token as a Bearer header (no cookies).
 */
export function initNativeRuntime(): void {
  if (!isNativeApp) return;

  const origin =
    typeof __API_ORIGIN__ === "string" ? __API_ORIGIN__.replace(/\/+$/, "") : "";

  if (origin) {
    setBaseUrl(origin);
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      "[native] __API_ORIGIN__ is empty — API calls will fail. Rebuild the " +
        "mobile bundle with MOBILE_API_ORIGIN set to your published domain.",
    );
  }
}
