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

- **Changing a price amount = create-new-then-archive, never edit.** Stripe prices are
  immutable (`unit_amount`/`currency`/`recurring` can't be patched). To re-price a tier the
  seed must, IN THIS ORDER: (1) backfill `metadata.tier` on the OLD price, (2) create the new
  price with `transfer_lookup_key:true` + `metadata:{tier}`, (3) archive the old (`active:false`).
  **Why:** `tierFromSubscription()` resolves tier by `metadata.tier` FIRST, then `lookup_key`.
  Transferring the lookup_key strips it from the old price, so an existing subscriber renewing on
  the old (still-attached) price would lose its tier signal and get downgraded — unless the old
  price already carries `metadata.tier`. Backfilling before the transfer closes that window.
  Re-running the seed is idempotent: matching amount/currency/interval → no-op (+ metadata backfill).
  Existing subscribers keep renewing at the OLD price/amount (standard Stripe); only new checkouts
  hit the new amount.

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

## Checkout 502 "No active Stripe price for lookup_key" = unseeded account, not an env bug

- Symptom: `POST /api/stripe/checkout` returns 502 ("No se pudo iniciar el pago") for
  EVERY tier/interval; prod log shows `resolvePriceId` throwing `No active Stripe price for
  lookup_key "plus_month"/"gold_month"...`. Root cause is data, not config: the connected
  Stripe account simply has no products/prices yet. Stripe IS connected (the code reached
  `stripe.prices.list`, which needs a valid authenticated client) — so don't chase keys/CORS.
- **Fix = run the idempotent seed** (`pnpm --filter @workspace/scripts run seed-stripe`). The
  Stripe connector is ONE connection shared by dev + the deployment, so seeding once (from dev)
  creates the prices the live deployment reads at request time — **no redeploy needed**, the fix
  is live immediately. Confirm with `stripe.prices.list({lookup_keys,active})`; check `livemode`
  to know test vs live (this account is live).
- **Next failure point after prices exist = `buildReturnUrl` host allowlist.** It runs AFTER
  `resolvePriceId`, so the price error masks it. The client sends `returnUrl = origin + BASE_URL
  + "premium"` (e.g. `https://kixxme.com/premium`); the server only accepts hosts in
  `allowedHosts()` = `APP_BASE_URL` host ∪ `REPLIT_DOMAINS`. If the deployment's `REPLIT_DOMAINS`
  doesn't include the custom domain, checkout 502s again with `returnUrl host "..." is not
  allowed`. Set `APP_BASE_URL=https://kixxme.com` as a deployment secret to make it deterministic
  (same secret also fixes recovery-link + email base URLs).

## Auditing the live funnel — what "customers in Stripe" really means

- A Stripe **Customer is created at checkout START** (`findOrCreateCustomer` inside
  `createCheckoutSession`), NOT at signup. So "users appear as customers in Stripe" only
  means they clicked Activar Gold/Plus and a session was created — it says nothing about
  payment. Don't equate Stripe customer count with registered users or with conversions.
- **Conversion truth = `checkout.sessions.list` bucketed by `status/payment_status`.**
  `open/unpaid` = reached/started checkout but never paid (abandoned, no card entered);
  `complete/paid` = real conversion. `paymentIntents.list` by status gives card declines
  (0 declines + many open sessions ⇒ top-of-checkout abandonment, a product/pricing/UX
  problem, not a backend bug).
- **Webhook delivery health without dashboard access:** `stripe.events.list()` → each event's
  `pending_webhooks` is the number of endpoints that have NOT yet returned 2xx. `=0` on the
  entitlement events (checkout.session.completed / customer.subscription.created / invoice.paid)
  proves the webhook delivered AND the handler acknowledged. Also list `webhookEndpoints` and
  confirm `status=enabled`, `livemode=true`, and the 3 events are in `enabled_events`.
- **Entitlement source of truth is shared; the cache is per-environment.** Supabase
  `profiles.plan` is in the SHARED Supabase project (dev and prod read the same rows), so verify
  a real purchaser's grant there (admin listUsers→id→profiles.plan). `billing_customers` /
  `plan_grants` live in **Replit Postgres, which is SEPARATE per environment** — the
  `executeSql` callback hits the **DEV** DB, so a missing/stale `billing_customers` row there is
  NOT evidence of a prod webhook failure. Use Supabase to judge prod entitlement.
- **Real root cause of "registros suben, conversiones ~0" can simply be: the LIVE account had no
  products/prices yet.** `resolvePriceId` runs BEFORE `findOrCreateCustomer`, so an unseeded live
  account 502s every checkout before a customer is ever created ⇒ ZERO live Stripe customers and
  zero conversions, even though all code is correct. Symptom check: `prices.list({lookup_keys})`
  with `livemode` + the `price.created` timestamp tells you exactly when live checkout became
  possible. Fix is the idempotent seed (no redeploy — shared connection).

## Checkout 502 "No such customer: 'cus_…'" = stale test-mode customer under live keys

- Symptom: `POST /api/stripe/checkout` 502s and `GET /subscription` warns, both with
  `StripeInvalidRequestError` / `resource_missing` "No such customer: 'cus_…'". Root cause:
  `billing_customers` cached a `cus_…` minted in **test** mode, but the account now runs **live**
  keys (the prices were seeded live) — a test customer id does not resolve under live keys.
- **The stored customer id must be VALIDATED before reuse**, never trusted blindly.
  `findOrCreateCustomer` now reuses the row only if `customerIsUsable` (a `customers.retrieve`
  that returns false on `resource_missing` **or** `{deleted:true}`, and re-throws anything else so
  a transient/auth error never spawns a duplicate); otherwise it mints a fresh customer and
  repoints the row (clearing the now-invalid `stripeSubscriptionId`). The same `resource_missing`
  guard is applied to the read/cancel paths (`loadEntitledSubs`, `cancelAllSubscriptionsForUser`)
  so a dead mapping degrades to "no sub"/"nothing to cancel" instead of 502.
  **Why:** detect the wrong-mode/deleted customer at the API, not by guessing from the DB.
  Duck-type the error on `err.code === "resource_missing"` — this module imports `Stripe` as a
  TYPE only, so the runtime `Stripe.errors.*` classes are unavailable.
- **Unlike the price-seed fix, this is CODE → it needs a redeploy** to reach production.
- **Known residual data debt (separate from this fix):** `profiles.plan` may still hold a `gold`/
  `plus` granted by an old TEST-mode webhook. Such a user has no live subscription, nothing will
  ever fire `subscription.deleted` to downgrade them, so they keep premium for free. Reconciling
  that = a one-time audit of non-free `plan_grants` (source=stripe) with no live sub; tell the user
  first since it revokes visible entitlements. And a live→test→live key flip would orphan a live
  customer (repointed to a test one) — `cancelSupersededSubscriptions` lists subs on one customer
  only, so accept it as a documented edge.
