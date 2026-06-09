import type Stripe from "stripe";
import type { Logger } from "pino";
import { eq } from "drizzle-orm";
import { db, billingCustomersTable } from "@workspace/db";
import { supabase } from "./supabase.js";
import { getUncachableStripeClient } from "./stripe.js";
import {
  sendEmail,
  appBaseUrl,
  PREMIUM_WELCOME_SUBJECT,
  premiumWelcomeEmailHtml,
} from "./email.js";

export type Tier = "plus" | "gold";
export type Interval = "month" | "year";

// Subscription statuses that grant entitlement. `past_due` is included so a
// transient failed payment (which Stripe retries) does not immediately revoke
// access; a truly cancelled subscription fires `deleted` / a non-entitled status.
const ENTITLED_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
]);

/** Authoritative entitlement lives in Supabase `profiles.plan`. */
async function setUserPlan(userId: string, plan: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ plan })
    .eq("id", userId);
  if (error) {
    throw new Error(
      `Failed to update profiles.plan for ${userId}: ${error.message}`,
    );
  }
}

/** Local mapping cache in the repo-owned Replit Postgres. */
async function upsertBilling(
  userId: string,
  stripeCustomerId: string | null,
  stripeSubscriptionId: string | null,
  plan: string,
): Promise<void> {
  if (!stripeCustomerId) return; // cannot upsert without the unique customer id
  await db
    .insert(billingCustomersTable)
    .values({ userId, stripeCustomerId, stripeSubscriptionId, plan })
    .onConflictDoUpdate({
      target: billingCustomersTable.userId,
      set: {
        stripeCustomerId,
        stripeSubscriptionId,
        plan,
        updatedAt: new Date(),
      },
    });
}

async function getUserEmail(userId: string): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  return data.user.email ?? null;
}

function customerId(
  ref: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

function tierFromSubscription(sub: Stripe.Subscription): string | null {
  const price = sub.items?.data?.[0]?.price;
  if (!price) return null;
  if (price.metadata?.tier) return price.metadata.tier;
  if (price.lookup_key) return price.lookup_key.split("_")[0] ?? null;
  return null;
}

/**
 * Resolve the Supabase user for a subscription event. The metadata set at
 * checkout (`subscription_data.metadata.supabase_user_id`) is the PRIMARY
 * mapping because it survives even if the local cache row does not yet exist
 * (events can arrive out of order). Falls back to the billing_customers cache.
 */
async function resolveUserId(sub: Stripe.Subscription): Promise<string | null> {
  const fromMeta = sub.metadata?.supabase_user_id;
  if (fromMeta) return fromMeta;
  const cust = customerId(sub.customer);
  if (!cust) return null;
  const row = (
    await db
      .select()
      .from(billingCustomersTable)
      .where(eq(billingCustomersTable.stripeCustomerId, cust))
      .limit(1)
  )[0];
  return row?.userId ?? null;
}

async function findOrCreateCustomer(
  stripe: Stripe,
  userId: string,
): Promise<string> {
  const existing = (
    await db
      .select()
      .from(billingCustomersTable)
      .where(eq(billingCustomersTable.userId, userId))
      .limit(1)
  )[0];
  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const email = await getUserEmail(userId);
  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { supabase_user_id: userId },
  });
  await db
    .insert(billingCustomersTable)
    .values({ userId, stripeCustomerId: customer.id })
    .onConflictDoUpdate({
      target: billingCustomersTable.userId,
      set: { stripeCustomerId: customer.id, updatedAt: new Date() },
    });
  return customer.id;
}

async function resolvePriceId(
  stripe: Stripe,
  tier: Tier,
  interval: Interval,
): Promise<string> {
  const lookupKey = `${tier}_${interval}`;
  const prices = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  const price = prices.data[0];
  if (!price) {
    throw new Error(
      `No active Stripe price for lookup_key "${lookupKey}". ` +
        "Run the seed-stripe-products script.",
    );
  }
  return price.id;
}

/**
 * Guard against open redirects: the client supplies its own return URL (it
 * knows its base path behind the proxy), but the server only accepts hosts
 * listed in REPLIT_DOMAINS, then appends the checkout result param itself.
 */
function buildReturnUrl(returnUrl: string, result: "success" | "cancel"): string {
  let parsed: URL;
  try {
    parsed = new URL(returnUrl);
  } catch {
    throw new Error("Invalid returnUrl");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Invalid returnUrl protocol");
  }
  const domains = (process.env.REPLIT_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  // Fail closed: with no configured allowlist we cannot validate the host, so
  // reject rather than accept an arbitrary (possibly attacker-controlled) URL.
  if (domains.length === 0 || !domains.includes(parsed.hostname)) {
    throw new Error(`returnUrl host "${parsed.hostname}" is not allowed`);
  }
  parsed.hash = "";
  parsed.searchParams.set("checkout", result);
  return parsed.toString();
}

export async function createCheckoutSession(params: {
  userId: string;
  tier: Tier;
  interval: Interval;
  returnUrl: string;
}): Promise<string> {
  const { userId, tier, interval, returnUrl } = params;
  const stripe = await getUncachableStripeClient();

  const priceId = await resolvePriceId(stripe, tier, interval);
  const customer = await findOrCreateCustomer(stripe, userId);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userId,
    metadata: { supabase_user_id: userId, tier },
    subscription_data: { metadata: { supabase_user_id: userId, tier } },
    allow_promotion_codes: true,
    success_url: buildReturnUrl(returnUrl, "success"),
    cancel_url: buildReturnUrl(returnUrl, "cancel"),
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout session URL");
  }
  return session.url;
}

// Non-terminal subscription statuses that keep billing the customer. When a
// user switches tiers a fresh subscription is created via Checkout, so any of
// these OTHER subscriptions must be cancelled to avoid double-billing.
const CANCELABLE_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
  "paused",
]);

/**
 * Cancel every active subscription on a customer except `keepSubId` (the one
 * just purchased). Idempotent: already-cancelled subs are filtered out by
 * status, so a webhook retry after a partial failure simply finishes the job.
 */
async function cancelSupersededSubscriptions(
  stripe: Stripe,
  customer: string,
  keepSubId: string | null,
  log: Logger,
): Promise<void> {
  const subs = await stripe.subscriptions.list({
    customer,
    status: "all",
    limit: 100,
  });
  for (const sub of subs.data) {
    if (sub.id === keepSubId) continue;
    if (!CANCELABLE_STATUSES.has(sub.status)) continue;
    await stripe.subscriptions.cancel(sub.id);
    log.info(
      { subId: sub.id, customer },
      "Cancelled superseded subscription on tier change",
    );
  }
}

/**
 * Apply entitlement changes from a verified Stripe event. Throwing here makes
 * the webhook return 500 so Stripe retries (the upserts are idempotent).
 */
export async function handleStripeWebhook(
  event: Stripe.Event,
  log: Logger,
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId =
        session.metadata?.supabase_user_id ?? session.client_reference_id ?? null;
      const tier = session.metadata?.tier ?? null;
      if (!userId || !tier) {
        log.warn(
          { sessionId: session.id },
          "checkout.session.completed missing user/tier metadata",
        );
        return;
      }
      const cust = customerId(session.customer);
      const subId =
        typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription?.id ?? null);
      await setUserPlan(userId, tier);
      await upsertBilling(userId, cust, subId, tier);
      // Switching tiers creates a brand-new subscription; cancel any older
      // ones on this customer so they are not billed for two plans at once.
      if (cust) {
        const stripe = await getUncachableStripeClient();
        await cancelSupersededSubscriptions(stripe, cust, subId, log);
      }
      // Premium welcome email. Triggered ONLY here (checkout.session.completed
      // fires once per successful purchase) to avoid duplicates from the
      // subscription.* events. Fire-and-forget so a mail failure never turns
      // into a webhook 500 / Stripe retry. sendEmail itself never throws.
      void (async () => {
        const email = await getUserEmail(userId);
        if (!email) return;
        const base = appBaseUrl();
        await sendEmail({
          to: email,
          subject: PREMIUM_WELCOME_SUBJECT,
          html: premiumWelcomeEmailHtml(base ? `${base}/premium` : undefined),
        });
      })();
      log.info({ userId, tier }, "Activated plan from checkout");
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object;
      const userId = await resolveUserId(sub);
      if (!userId) {
        log.warn({ subId: sub.id }, "subscription event: could not resolve user");
        return;
      }
      const tier = tierFromSubscription(sub);
      const entitled = ENTITLED_STATUSES.has(sub.status) && Boolean(tier);
      const plan = entitled ? (tier as string) : "free";
      await setUserPlan(userId, plan);
      await upsertBilling(userId, customerId(sub.customer), sub.id, plan);
      log.info(
        { userId, plan, status: sub.status },
        "Synced plan from subscription event",
      );
      return;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const userId = await resolveUserId(sub);
      if (!userId) {
        log.warn(
          { subId: sub.id },
          "subscription.deleted: could not resolve user",
        );
        return;
      }
      // Only downgrade if this is the user's CURRENT subscription. During an
      // upgrade Stripe may delete the old subscription after creating the new
      // one; downgrading then would wrongly revoke the just-purchased plan.
      const row = (
        await db
          .select()
          .from(billingCustomersTable)
          .where(eq(billingCustomersTable.userId, userId))
          .limit(1)
      )[0];
      if (row?.stripeSubscriptionId && row.stripeSubscriptionId !== sub.id) {
        log.info(
          { userId, subId: sub.id },
          "Ignoring deletion of non-current subscription",
        );
        return;
      }
      await setUserPlan(userId, "free");
      await upsertBilling(userId, customerId(sub.customer), null, "free");
      log.info({ userId }, "Downgraded plan to free on subscription deletion");
      return;
    }

    default:
      return;
  }
}
