// Build-time stub for `firebase/messaging`.
//
// `@capacitor-firebase/messaging` ships a web implementation (web.js) that
// statically imports the Firebase JS SDK. On native (iOS/Android) Capacitor uses
// the native plugin and never executes that web chunk, and we never call the
// push client on the web (it is guarded by `isNativeApp`). To avoid shipping the
// heavy Firebase JS SDK in the web bundle, vite aliases `firebase/messaging` to
// this stub, which only needs to satisfy the bundler's import resolution.

export function getMessaging(): unknown {
  throw new Error("firebase/messaging is not available in this build");
}

export function getToken(): Promise<string> {
  throw new Error("firebase/messaging is not available in this build");
}

export function deleteToken(): Promise<boolean> {
  throw new Error("firebase/messaging is not available in this build");
}

export async function isSupported(): Promise<boolean> {
  return false;
}

export function onMessage(): () => void {
  return () => {};
}
