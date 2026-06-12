import { isNativeApp } from "./native";
import { rcLogIn, rcLogOut } from "./revenuecat";
import { registerPushForUser, unregisterPush } from "./push-client";

// Bridges the web auth lifecycle to the native-only concerns (RevenueCat
// identity + push token registration). Every path is a no-op on the web build.

let lastUserId: string | null = null;

/**
 * Reconciles native account state with the current Supabase user id. Called from
 * the AuthProvider whenever the signed-in user changes (login/logout/refresh).
 * Idempotent: only acts when the user id actually changes.
 */
export function syncNativeAccount(userId: string | null): void {
  if (!isNativeApp) return;
  if (userId === lastUserId) return;
  lastUserId = userId;

  if (userId) {
    void rcLogIn(userId);
    void registerPushForUser();
  } else {
    void rcLogOut();
    void unregisterPush();
  }
}

/**
 * Tears down native account bindings (push token + RevenueCat identity) and
 * resolves once done, so callers can `await` it BEFORE clearing the auth session
 * — keeping the server-side DELETE /me/devices authenticated. No-op on web.
 */
export async function unregisterNativeAccount(): Promise<void> {
  if (!isNativeApp) return;
  lastUserId = null;
  // Race the teardown against a short timeout so a stalled push/RC call can
  // never hang the logout flow; the work still continues in the background.
  const teardown = Promise.allSettled([rcLogOut(), unregisterPush()]);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 4000));
  await Promise.race([teardown, timeout]);
}
