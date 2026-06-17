/**
 * VAPID Web Push notifications (no Firebase).
 *
 * Uses the `web-push` npm package. Requires two Replit secrets:
 *   VAPID_PUBLIC_KEY   — base64url-encoded public key
 *   VAPID_PRIVATE_KEY  — base64url-encoded private key
 *   VAPID_CONTACT      — optional mailto: or https: contact URL (default mailto:admin@kixxme.app)
 *
 * When the secrets are missing every operation is a safe no-op.
 *
 * VAPID keys were generated with:
 *   PUBLIC:  BOi3EL5KQOIFXDITnew2X_HQmQBqLOmzOhv1o6ee5eZo8S7H_oOwYFpEVw7ZEmAXYpH7C5T6raXRTFfXB6W4RBk
 *   PRIVATE: NX_yo3BmPVpwpMcDEtsOfZtLa2Lp7I9nOG2Tq_5IX4w
 * Set both as Replit secrets (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY) to enable.
 */
import webPush, { type PushSubscription } from "web-push";
import { eq, and } from "drizzle-orm";
import { db, webPushSubscriptionsTable } from "@workspace/db";
import { logger } from "./logger.js";

let configured = false;

function tryInit(): void {
  if (configured) return;
  const pub  = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return;
  const contact = process.env.VAPID_CONTACT ?? "mailto:admin@kixxme.app";
  try {
    webPush.setVapidDetails(contact, pub, priv);
    configured = true;
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "VAPID init failed");
  }
}

export function isWebPushConfigured(): boolean {
  tryInit();
  return configured;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

/** Save (upsert) a PushSubscription for a user. */
export async function saveWebPushSubscription(
  userId: string,
  endpoint: string,
  p256dh: string,
  auth: string,
): Promise<void> {
  await db
    .insert(webPushSubscriptionsTable)
    .values({ userId, endpoint, p256dh, auth })
    .onConflictDoUpdate({
      target: webPushSubscriptionsTable.endpoint,
      set: { userId, p256dh, auth },
    });
}

/** Remove a subscription by endpoint. */
export async function removeWebPushSubscription(
  userId: string,
  endpoint: string,
): Promise<void> {
  await db
    .delete(webPushSubscriptionsTable)
    .where(
      and(
        eq(webPushSubscriptionsTable.userId, userId),
        eq(webPushSubscriptionsTable.endpoint, endpoint),
      ),
    );
}

export interface WebPushPayload {
  title: string;
  body: string;
  /** Deep-link path inside the app (e.g. "/chat/abc") */
  url?: string;
  icon?: string;
}

/**
 * Send a web push notification to all subscriptions for a user.
 * Never throws — callers fire-and-forget.
 * Subscriptions that report "Gone" (410) or "Invalid" (404) are pruned.
 */
export async function sendWebPushToUser(
  userId: string,
  payload: WebPushPayload,
): Promise<void> {
  tryInit();
  if (!configured) return;

  let subs;
  try {
    subs = await db
      .select()
      .from(webPushSubscriptionsTable)
      .where(eq(webPushSubscriptionsTable.userId, userId));
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "sendWebPushToUser: db error");
    return;
  }

  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  const dead: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      const subscription: PushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webPush.sendNotification(subscription, body, { TTL: 86400 });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          dead.push(sub.endpoint);
        } else {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err), userId },
            "sendWebPushToUser: send failed",
          );
        }
      }
    }),
  );

  // Prune gone subscriptions
  for (const ep of dead) {
    db.delete(webPushSubscriptionsTable)
      .where(eq(webPushSubscriptionsTable.endpoint, ep))
      .catch(() => { /* best-effort */ });
  }
}
