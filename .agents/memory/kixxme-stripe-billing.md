---
name: KixxMe Stripe billing
description: How KixxMe subscription billing is wired across the two databases — what writes entitlement, how users are mapped, and the tier-change gotcha.
---

# KixxMe Stripe subscription billing

Subscriptions use real Stripe Checkout (subscription mode). Billing data is synced
into Replit Postgres by `stripe-replit-sync` (the `stripe` schema); a small
`billing_customers` table (Replit Postgres, Drizzle) caches the user↔customer↔subscription
mapping. Entitlement itself lives in Supabase `profiles.plan` (`free`/`plus`/`gold`).

## Rules

- **`profiles.plan` (Supabase) is the entitlement source of truth, and the Stripe
  webhook is its ONLY writer.** Checkout never sets the plan directly; the client
  just redirects to Stripe and waits for the webhook to flip the plan.
  **Why:** payment success is only trustworthy when it comes from a signature-verified
  Stripe event, not from the browser returning to a success URL.

- **Map the Stripe object back to the user via `subscription metadata.supabase_user_id`**
  (set through `subscription_data.metadata` at checkout), falling back to the
  `billing_customers` cache by `stripe_customer_id`.
  **Why:** webhook events can arrive out of order / before the cache row exists, so the
  metadata is the only mapping guaranteed to be present on every subscription event.

- **Resolve the Stripe price by `lookup_key` (`<tier>_<interval>`, e.g. `plus_year`),
  not by querying the synced `stripe.prices` table.**
  **Why:** at first run the `syncBackfill()` may not have populated the `stripe` schema
  yet; `stripe.prices.list({lookup_keys})` hits the API directly and avoids that race.
  The seed script writes both the `lookup_key` and `metadata.tier` on each price.

- **Switching tiers creates a brand-new subscription** (Checkout always does), so on
  `checkout.session.completed` you must cancel the customer's OTHER active subscriptions
  or the user is billed for two plans at once.
  **How to apply:** cancellation is idempotent (filter out already-terminal statuses),
  and the `subscription.deleted` handler ignores deletions of non-current subscriptions
  so the just-purchased plan is never wrongly revoked.

- **Startup degrades gracefully:** `runMigrations()` needs only `DATABASE_URL` and runs
  unconditionally; the Stripe-connection steps (sync client, managed webhook, backfill)
  are wrapped so the server still boots and serves non-billing routes when Stripe is not
  connected.

- The Stripe **secret key is fetched server-side only** from the Replit connectors API
  (`getUncachableStripeClient`); it must never reach the frontend. The webhook route is
  registered with `express.raw` BEFORE `express.json` so signature verification works.

## Connection credential reality (cost several iterations — the Stripe skill template is stale)

- The Replit Stripe connection (`/api/v2/connection?...connector_names=stripe`) exposes the
  API key under **`settings.secret`**, plus `publishable`, `account_id`. It does **NOT**
  return `settings.secret_key` or any `settings.webhook_secret`. The skill's
  `code-templates.md` still reads `secret_key`/`webhook_secret`, which silently yields
  "Stripe integration not connected" even after a successful connect. Read `settings.secret`.
- Because the connection has **no webhook signing secret**, do not `stripe.webhooks.constructEvent`
  with a connection secret — there isn't one. Verification is owned by `stripe-replit-sync`:
  `findOrCreateManagedWebhook(url)` (run at startup) creates the Stripe webhook endpoint and
  persists its signing secret; `StripeSync.processWebhook(rawBody, sig)` then verifies + syncs.
  **How to apply:** in the webhook route, call `processWebhook` first (a thrown
  signature error → 400, any other throw → 500 so Stripe retries); only after it succeeds is the
  body trusted, so `JSON.parse(rawBody)` into a `Stripe.Event` for the entitlement logic.
  `StripeSync` is constructed with only `stripeSecretKey` (omit `stripeWebhookSecret`).
- In dev, the managed webhook points at `REPLIT_DOMAINS[0]/api/stripe/webhook`, which is
  publicly reachable, so real Stripe test-mode events (trial subscriptions need no card) deliver
  to the dev server within ~2s — usable for true end-to-end entitlement tests.
