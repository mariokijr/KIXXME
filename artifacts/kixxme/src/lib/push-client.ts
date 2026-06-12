import { registerDevice, unregisterDevice } from "@workspace/api-client-react";
import { isNativeApp, nativePlatform } from "./native";

// Native push (FCM) bridge. The @capacitor-firebase/messaging plugin is loaded
// dynamically so it never enters the web bundle; every export is a no-op on web.

let currentToken: string | null = null;
let listenerAttached = false;

function devicePlatform(): "ios" | "android" {
  return nativePlatform === "ios" ? "ios" : "android";
}

async function sendToken(token: string): Promise<void> {
  if (!token || token === currentToken) return;
  try {
    await registerDevice({ token, platform: devicePlatform() });
    currentToken = token;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[push] token upload failed", e);
  }
}

/**
 * Requests notification permission, uploads the FCM token to the API, and
 * (once) wires a refresh listener so a rotated token is re-registered.
 * Safe to call repeatedly. No-op on web or when permission is denied.
 */
export async function registerPushForUser(): Promise<void> {
  if (!isNativeApp) return;
  try {
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");

    const perm = await FirebaseMessaging.requestPermissions();
    if (perm.receive !== "granted") return;

    if (!listenerAttached) {
      listenerAttached = true;
      await FirebaseMessaging.addListener("tokenReceived", (event) => {
        void sendToken(event.token);
      });
    }

    const { token } = await FirebaseMessaging.getToken();
    await sendToken(token);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[push] register failed", e);
  }
}

/**
 * Removes this device's token from the API and clears it locally so stale
 * tokens don't keep receiving another account's notifications. No-op on web.
 */
export async function unregisterPush(): Promise<void> {
  if (!isNativeApp) return;
  const known = currentToken;
  try {
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
    const token =
      known ??
      (await FirebaseMessaging.getToken()
        .then((r) => r.token)
        .catch(() => null));
    if (token) {
      await unregisterDevice({ token }).catch(() => {});
    }
    await FirebaseMessaging.deleteToken().catch(() => {});
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[push] unregister failed", e);
  } finally {
    currentToken = null;
  }
}
