---
name: Free Gold trial campaign
description: 5-day free Gold trial — eligibility, Stripe flow, lifecycle emails, campaign script.
---

## Anti-fraud architecture
- **Card fingerprint** (primary): `free_trial_uses.payment_fingerprint` (UNIQUE partial index WHERE NOT NULL). Fetched via `stripe.subscriptions.retrieve(subId, {expand:["default_payment_method"]})` inside `checkout.session.completed`. If fingerprint already exists under a DIFFERENT userId → cancel subscription + revert to free (no email). Zero friction for legitimate users.
- **IP address**: stored in `free_trial_uses.ip_address` from `client_ip` Stripe metadata (set at checkout creation via `x-forwarded-for` / `req.ip`).
- **One trial per account**: enforced by userId PK on `free_trial_uses` (onConflictDoNothing).

## Rule
One free trial per user, enforced by `free_trial_uses` (Replit Postgres, userId PK). Attempting a second trial returns 409 from `createTrialCheckoutSession`.

**Why:** `onConflictDoNothing` insert makes the uniqueness check race-free at the DB level.

## How to apply
- Server: `createTrialCheckoutSession` (lib/billing.ts) — Stripe Checkout with `trial_period_days:5` + `metadata.is_trial:"true"`.
- Webhook handler reads `is_trial` from metadata on `customer.subscription.created` → inserts `free_trial_uses` + sends `trialActivatedEmail`.
- `subscription.updated`: detects trialing→active transition → sends `trialConvertedEmail`.
- `customer.subscription.trial_will_end` (fires ~3 days before end) → `trialEndingEmail`.
- `GET /stripe/trial/status` → `{ eligible: bool, reason?: string }`.
- Frontend: `/trial` page (standalone landing), trial CTA banner in premium.tsx for `currentPlan === "free"` on web.
- Settings: `subscription.is_trial` drives heading ("PRUEBA GRATUITA") and cancel button label ("Cancelar prueba gratuita").
- Cancel-subscription page: `isTrial` flag (from `subscription.is_trial`) → trial-specific copy throughout.
- `EmailCategory` (email-policy.ts) must include `trial_activated | trial_ending | trial_converted` — these are always-on (no preference gate needed).
- Campaign script: `pnpm --filter @workspace/scripts run send-trial-promo -- --test` (test to one address), omit `--test` for bulk. Uses Gmail connector + emailSendsTable dedup key `gold-trial-promo-YYYYMMDD:{userId}`.
