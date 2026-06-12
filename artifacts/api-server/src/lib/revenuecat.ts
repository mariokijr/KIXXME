import { createHash, timingSafeEqual } from "node:crypto";
import type { Logger } from "pino";
import { applyPlanGrant, normalizePlan } from "./plan-grants.js";

/**
 * RevenueCat server integration (native in-app purchases).
 *
 * RevenueCat is the entitlement source for the iOS/Android apps (Apple/Google
 * forbid Stripe for digital goods inside the app — guideline 3.1.1). Purchases
 * happen client-side via `@revenuecat/purchases-capacitor`; this module is the
 * server half: it ingests RevenueCat webhooks and, on every event, RE-FETCHES
 * the subscriber's authoritative entitlements over the REST API and records the
 * resulting tier as RevenueCat's grant (see `lib/plan-grants.ts`). Re-fetching
 * rather than trusting the event body keeps us correct even if events arrive out
 * of order or are retried.
 *
 * Configuration (Replit secrets):
 *   - REVENUECAT_SECRET_KEY    REST API v1 secret key (sk_...). Server-only.
 *   - REVENUECAT_WEBHOOK_AUTH  shared secret matched against the webhook's
 *                              Authorization header (set the same value in the
 *                              RevenueCat dashboard webhook config).
 *
 * When the secret key is missing the module degrades gracefully (configured =
 * false, REST calls return null) so the rest of the app runs untouched until
 * RevenueCat is wired up.
 *
 * Entitlement identifiers configured in the RevenueCat dashboard MUST be named
 * exactly "plus" and "gold" so they map straight onto our plan tiers.
 */

const REST_BASE = "https://api.revenuecat.com/v1";

export interface RevenueCatConfig {
  secretKey: string;
}

/** REST config, or null when the secret key isn't set. */
export function getRevenueCatConfig(): RevenueCatConfig | null {
  const secretKey = process.env.REVENUECAT_SECRET_KEY;
  if (!secretKey) return null;
  return { secretKey };
}

/** True when the RevenueCat REST secret key is present. */
export function isRevenueCatConfigured(): boolean {
  return getRevenueCatConfig() !== null;
}

/**
 * Constant-time comparison of the webhook Authorization header against the
 * configured shared secret. Fails closed: returns false when no secret is
 * configured (an unconfigured deployment must not accept webhook writes).
 */
export function verifyWebhookAuth(header: string | undefined): boolean {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected) return false;
  if (!header) return false;
  // Hash both sides to a fixed length so timingSafeEqual never throws on a
  // length mismatch (which would itself leak length information).
  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

interface SubscriberEntitlement {
  expires_date: string | null;
}

interface SubscriberResponse {
  subscriber?: {
    entitlements?: Record<string, SubscriberEntitlement>;
  };
}

const RANK: Record<string, number> = { free: 0, plus: 1, gold: 2 };

/**
 * Fetch the subscriber's current effective plan from RevenueCat. Returns the MAX
 * tier among ACTIVE entitlements ("free" when none), or null when RevenueCat is
 * unconfigured or the lookup fails (caller treats null as "leave grant alone").
 */
export async function fetchSubscriberPlan(
  appUserId: string,
  log?: Logger,
): Promise<string | null> {
  const cfg = getRevenueCatConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(
      `${REST_BASE}/subscribers/${encodeURIComponent(appUserId)}`,
      {
        headers: {
          Authorization: `Bearer ${cfg.secretKey}`,
          "Content-Type": "application/json",
        },
      },
    );
    if (!res.ok) {
      log?.warn(
        { appUserId, status: res.status },
        "RevenueCat subscriber fetch failed",
      );
      return null;
    }
    const body = (await res.json()) as SubscriberResponse;
    const entitlements = body.subscriber?.entitlements ?? {};
    const now = Date.now();
    let plan = "free";
    for (const [id, ent] of Object.entries(entitlements)) {
      const active =
        ent.expires_date === null ||
        (ent.expires_date != null &&
          new Date(ent.expires_date).getTime() > now);
      if (!active) continue;
      const tier = normalizePlan(id);
      if ((RANK[tier] ?? 0) > (RANK[plan] ?? 0)) plan = tier;
    }
    return plan;
  } catch (err) {
    log?.error(
      { appUserId, err: err instanceof Error ? err.message : String(err) },
      "RevenueCat subscriber fetch threw",
    );
    return null;
  }
}

interface RevenueCatWebhookBody {
  event?: {
    type?: string;
    app_user_id?: string;
    aliases?: string[];
  };
}

/** A supabase user id (the app_user_id we set via Purchases.logIn). */
function isUuid(s: string | undefined): s is string {
  return (
    !!s &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}

/**
 * Apply a verified RevenueCat webhook. The app_user_id is the Supabase user id
 * (set client-side via `Purchases.logIn`); anonymous ids (pre-login purchases)
 * are skipped. On every event we re-fetch the subscriber's authoritative
 * entitlements and record the resulting tier as RevenueCat's grant.
 *
 * Throws on a transient REST/DB failure so the webhook returns 500 and
 * RevenueCat retries (the grant write is idempotent).
 */
export async function handleRevenueCatWebhook(
  body: RevenueCatWebhookBody,
  log: Logger,
): Promise<void> {
  const event = body.event;
  if (!event) {
    log.warn("RevenueCat webhook missing event body");
    return;
  }

  // Resolve the Supabase user id from app_user_id or any alias that looks like
  // one (RevenueCat may surface an anonymous id as the primary in some events).
  const candidates = [event.app_user_id, ...(event.aliases ?? [])];
  const userId = candidates.find(isUuid);
  if (!userId) {
    log.info(
      { type: event.type, appUserId: event.app_user_id },
      "RevenueCat webhook: no Supabase user id (anonymous) — ignoring",
    );
    return;
  }

  const plan = await fetchSubscriberPlan(userId, log);
  if (plan === null) {
    // Could not read authoritative state. TRANSFER/initial events can race the
    // REST cache; throw so RevenueCat retries rather than leaving a stale grant.
    throw new Error(
      `RevenueCat: could not fetch subscriber plan for ${userId}`,
    );
  }
  await applyPlanGrant(userId, "revenuecat", plan);
  log.info({ userId, plan, type: event.type }, "Applied RevenueCat entitlement");
}
