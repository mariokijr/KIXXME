import type Stripe from "stripe";
import type { Logger } from "pino";
import { eq } from "drizzle-orm";
import { db, billingCustomersTable } from "@workspace/db";
import { supabase } from "./supabase.js";
import { getUncachableStripeClient } from "./stripe.js";
import {
  sendEmail,
  appBaseUrl,
  allowedHosts,
  premiumWelcomeEmail,
  subscriptionRenewedEmail,
  paymentFailedEmail,
  premiumEndedEmail,
} from "./email.js";
import { claimEmailSend } from "./email-policy.js";
import { ensureOfficialTicket } from "./support-tickets.js";
import { applyPlanGrant } from "./plan-grants.js";

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

/**
 * Record Stripe's entitlement grant and recompute the effective plan.
 *
 * The authoritative `profiles.plan` is written by `applyPlanGrant` as the MAX
 * tier across every payment source (Stripe + RevenueCat). Writing Stripe's grant
 * here — instead of blind-writing `profiles.plan` — is what stops a Stripe
 * downgrade from revoking an App Store (RevenueCat) Gold entitlement.
 */
async function setUserPlan(userId: string, plan: string): Promise<void> {
  await applyPlanGrant(userId, "stripe", plan);
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

/**
 * Resolve the Supabase user + entitled tier for an INVOICE event from the
 * customer mapping. Invoices don't carry our checkout metadata, so we look up
 * the `billing_customers` row by Stripe customer id. Returns null when the
 * customer isn't mapped yet (an event arriving before the cache row exists —
 * Stripe retries, and the first invoice is covered by the welcome email).
 */
async function resolveUserFromCustomer(
  custRef: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): Promise<{ userId: string; tier: string | null } | null> {
  const cust = customerId(custRef);
  if (!cust) return null;
  const row = (
    await db
      .select()
      .from(billingCustomersTable)
      .where(eq(billingCustomersTable.stripeCustomerId, cust))
      .limit(1)
  )[0];
  if (!row) return null;
  return { userId: row.userId, tier: row.plan === "free" ? null : row.plan };
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
 * knows its base path behind the proxy), but the server only accepts hosts it
 * owns (the custom domain via APP_BASE_URL plus every REPLIT_DOMAINS entry),
 * then appends the checkout result param itself.
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
  const hosts = allowedHosts();
  // Fail closed: with no configured allowlist we cannot validate the host, so
  // reject rather than accept an arbitrary (possibly attacker-controlled) URL.
  if (hosts.length === 0 || !hosts.includes(parsed.hostname)) {
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
 * Cancel ALL of a user's still-billing subscriptions. Used on account deletion
 * so a removed user is never charged again. Idempotent (already-cancelled subs
 * are filtered out by status); a no-op when the user has no Stripe customer.
 */
export async function cancelAllSubscriptionsForUser(
  userId: string,
  log: Logger,
): Promise<void> {
  const row = (
    await db
      .select()
      .from(billingCustomersTable)
      .where(eq(billingCustomersTable.userId, userId))
      .limit(1)
  )[0];
  if (!row?.stripeCustomerId) return;
  const stripe = await getUncachableStripeClient();
  const subs = await stripe.subscriptions.list({
    customer: row.stripeCustomerId,
    status: "all",
    limit: 100,
  });
  for (const sub of subs.data) {
    if (!CANCELABLE_STATUSES.has(sub.status)) continue;
    await stripe.subscriptions.cancel(sub.id);
    log.info({ subId: sub.id, userId }, "Cancelled subscription on account deletion");
  }
}

// --- Self-service subscription status + cancellation -----------------------

export interface ActiveSubscription {
  id: string;
  tier: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

/** Period end of a subscription (basil API: lives on the line item). */
function periodEndOf(sub: Stripe.Subscription): Date | null {
  const end = sub.items?.data?.[0]?.current_period_end;
  return typeof end === "number" ? new Date(end * 1000) : null;
}

/**
 * Load the user's entitled (active/trialing/past_due) subscriptions plus the
 * "preferred" one — the locally-tracked current sub when still entitled, else
 * the newest. Returns null (and makes ZERO Stripe calls) when the user has no
 * billing_customers row, so free users' settings loads stay cheap.
 */
async function loadEntitledSubs(userId: string): Promise<{
  stripe: Stripe;
  entitled: Stripe.Subscription[];
  preferred: Stripe.Subscription;
} | null> {
  const row = (
    await db
      .select()
      .from(billingCustomersTable)
      .where(eq(billingCustomersTable.userId, userId))
      .limit(1)
  )[0];
  if (!row?.stripeCustomerId) return null;
  const stripe = await getUncachableStripeClient();
  const list = await stripe.subscriptions.list({
    customer: row.stripeCustomerId,
    status: "all",
    limit: 100,
  });
  const entitled = list.data.filter((s) => ENTITLED_STATUSES.has(s.status));
  if (entitled.length === 0) return null;
  const preferred =
    entitled.find((s) => s.id === row.stripeSubscriptionId) ??
    entitled.reduce((a, b) => (b.created > a.created ? b : a));
  return { stripe, entitled, preferred };
}

/** The user's real active subscription, or null. May call Stripe. */
export async function getActiveSubscription(
  userId: string,
): Promise<ActiveSubscription | null> {
  const loaded = await loadEntitledSubs(userId);
  if (!loaded) return null;
  const { preferred } = loaded;
  return {
    id: preferred.id,
    tier: tierFromSubscription(preferred),
    currentPeriodEnd: periodEndOf(preferred),
    cancelAtPeriodEnd: preferred.cancel_at_period_end,
  };
}

/**
 * Schedule cancellation at period end for ALL of the user's entitled
 * subscriptions (intent = stop billing; covers the rare double-sub case). The
 * plan stays active until Stripe fires `customer.subscription.deleted` at period
 * end, which the webhook downgrades to free. Returns the access end date + tier,
 * or null when there is nothing to cancel.
 */
export async function cancelSubscriptionAtPeriodEnd(
  userId: string,
): Promise<{ currentPeriodEnd: Date | null; tier: string | null } | null> {
  const loaded = await loadEntitledSubs(userId);
  if (!loaded) return null;
  const { stripe, entitled, preferred } = loaded;
  let preferredFinal = preferred;
  for (const sub of entitled) {
    if (sub.cancel_at_period_end) continue; // already scheduled
    const updated = await stripe.subscriptions.update(sub.id, {
      cancel_at_period_end: true,
    });
    if (sub.id === preferred.id) preferredFinal = updated;
  }
  const endDate =
    typeof preferredFinal.cancel_at === "number"
      ? new Date(preferredFinal.cancel_at * 1000)
      : periodEndOf(preferredFinal);
  return {
    currentPeriodEnd: endDate,
    tier: tierFromSubscription(preferredFinal),
  };
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
        const { subject, html } = premiumWelcomeEmail(
          tier,
          base ? `${base}/premium` : undefined,
        );
        await sendEmail({ to: email, subject, html });
      })();
      // Gold members get the official "👑 Soporte KixxMe" welcome conversation,
      // auto-created (idempotent) on activation. Fire-and-forget so a failure
      // never turns into a webhook 500 / Stripe retry; GET /support/official is
      // a lazy safety net if this misses.
      if (tier === "gold") {
        void ensureOfficialTicket(userId).catch((error) => {
          log.error(
            { userId, error: error instanceof Error ? error.message : error },
            "Failed to ensure official support ticket on Gold activation",
          );
        });
      }
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
      // Notify the user their premium has ended. Always-on; dedup on the
      // subscription id so a retried webhook never double-sends.
      const endedTier =
        tierFromSubscription(sub) ??
        (row?.plan && row.plan !== "free" ? row.plan : null);
      void (async () => {
        const claimed = await claimEmailSend({
          userId,
          category: "premium_ended",
          dedupKey: `sub_deleted:${sub.id}`,
        });
        if (!claimed) return;
        const email = await getUserEmail(userId);
        if (!email) return;
        const base = appBaseUrl();
        const { subject, html } = premiumEndedEmail({
          tier: endedTier,
          appUrl: base ? `${base}/premium` : undefined,
        });
        await sendEmail({ to: email, subject, html });
      })();
      log.info({ userId }, "Downgraded plan to free on subscription deletion");
      return;
    }

    case "invoice.paid": {
      const invoice = event.data.object;
      // Only renewals — the first invoice (billing_reason "subscription_create")
      // is already covered by the premium welcome email from checkout.
      if (invoice.billing_reason !== "subscription_cycle") return;
      const resolved = await resolveUserFromCustomer(invoice.customer);
      if (!resolved) {
        log.warn({ invoiceId: invoice.id }, "invoice.paid: could not resolve user");
        return;
      }
      void (async () => {
        const claimed = await claimEmailSend({
          userId: resolved.userId,
          category: "invoice_paid",
          dedupKey: `invoice:${invoice.id}`,
        });
        if (!claimed) return;
        const email = await getUserEmail(resolved.userId);
        if (!email) return;
        const periodEnd = invoice.lines?.data?.[0]?.period?.end ?? null;
        const base = appBaseUrl();
        const { subject, html } = subscriptionRenewedEmail({
          tier: resolved.tier,
          periodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
          appUrl: base ? `${base}/premium` : undefined,
        });
        await sendEmail({ to: email, subject, html });
      })();
      return;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const resolved = await resolveUserFromCustomer(invoice.customer);
      if (!resolved) {
        log.warn(
          { invoiceId: invoice.id },
          "invoice.payment_failed: could not resolve user",
        );
        return;
      }
      void (async () => {
        const claimed = await claimEmailSend({
          userId: resolved.userId,
          category: "payment_failed",
          dedupKey: `invoice:${invoice.id}:failed`,
        });
        if (!claimed) return;
        const email = await getUserEmail(resolved.userId);
        if (!email) return;
        const base = appBaseUrl();
        const { subject, html } = paymentFailedEmail({
          tier: resolved.tier,
          appUrl: base ? `${base}/premium` : undefined,
        });
        await sendEmail({ to: email, subject, html });
      })();
      return;
    }

    default:
      return;
  }
}
