import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { and, eq, inArray } from "drizzle-orm";
import { db, deviceTokensTable } from "@workspace/db";
import { logger } from "./logger.js";

/**
 * Native push notifications (Firebase Cloud Messaging).
 *
 * Both platforms route through FCM: Android natively, iOS via an APNs auth key
 * uploaded to the Firebase project. This module is the ONLY place that talks to
 * FCM. It owns the `device_tokens` table (register/unregister) and the actual
 * send, and prunes tokens FCM reports as permanently invalid.
 *
 * Configuration (Replit secret):
 *   - FIREBASE_SERVICE_ACCOUNT  the service-account JSON (as a single string)
 *     downloaded from Firebase console → Project settings → Service accounts.
 *
 * When the secret is missing the module degrades gracefully: `isPushConfigured`
 * is false and every send is a no-op (it never even queries the DB), so the app
 * runs untouched until push is wired up.
 */

export type DevicePlatform = "ios" | "android" | "web";

export interface PushPayload {
  title: string;
  body: string;
  /** FCM data values must be strings. */
  data?: Record<string, string>;
}

let cachedApp: App | null = null;
let initFailed = false;

function getServiceAccount(): Record<string, unknown> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "FIREBASE_SERVICE_ACCOUNT is not valid JSON — push disabled",
    );
    return null;
  }
}

/** True when FCM credentials are present and parseable. */
export function isPushConfigured(): boolean {
  if (cachedApp) return true;
  if (initFailed) return false;
  return getServiceAccount() !== null;
}

function getApp(): App | null {
  if (cachedApp) return cachedApp;
  if (initFailed) return null;
  const serviceAccount = getServiceAccount();
  if (!serviceAccount) {
    initFailed = true;
    return null;
  }
  try {
    cachedApp =
      getApps()[0] ??
      initializeApp({
        credential: cert(serviceAccount as Parameters<typeof cert>[0]),
      });
    return cachedApp;
  } catch (err) {
    initFailed = true;
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "firebase-admin init failed — push disabled",
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Token registry (device_tokens)
// ---------------------------------------------------------------------------

/** Upsert a device token, claiming it for `userId` (idempotent). */
export async function saveDeviceToken(
  userId: string,
  token: string,
  platform: DevicePlatform,
): Promise<void> {
  await db
    .insert(deviceTokensTable)
    .values({ userId, token, platform })
    .onConflictDoUpdate({
      target: deviceTokensTable.token,
      set: { userId, platform, lastSeenAt: new Date() },
    });
}

/** Remove a single token for a user (no-op when absent). */
export async function removeDeviceToken(
  userId: string,
  token: string,
): Promise<void> {
  await db
    .delete(deviceTokensTable)
    .where(
      and(
        eq(deviceTokensTable.token, token),
        eq(deviceTokensTable.userId, userId),
      ),
    );
}

async function pruneTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  try {
    await db
      .delete(deviceTokensTable)
      .where(inArray(deviceTokensTable.token, tokens));
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "pruneTokens failed",
    );
  }
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

const PRUNE_ERROR_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

/**
 * Send a push to every device a user has registered. No-op (and zero DB cost)
 * when push isn't configured or the user has no devices. Never throws — callers
 * fire-and-forget. Tokens FCM reports as permanently invalid are pruned.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  const app = getApp();
  if (!app) return;
  try {
    const rows = await db
      .select({ token: deviceTokensTable.token })
      .from(deviceTokensTable)
      .where(eq(deviceTokensTable.userId, userId));
    const tokens = rows.map((r) => r.token);
    if (tokens.length === 0) return;

    const res = await getMessaging(app).sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
      android: { priority: "high", notification: { sound: "default" } },
      apns: { payload: { aps: { sound: "default" } } },
    });

    if (res.failureCount > 0) {
      const dead: string[] = [];
      res.responses.forEach((r, i) => {
        const code = r.error?.code;
        if (code && PRUNE_ERROR_CODES.has(code)) dead.push(tokens[i]);
      });
      await pruneTokens(dead);
    }
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), userId },
      "sendPushToUser failed",
    );
  }
}
