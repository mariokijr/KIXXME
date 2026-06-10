---
name: KixxMe custom-domain launch
description: Cross-system steps/dependencies to take KixxMe live on a custom domain (URLs, password-reset redirect, build-time secrets) that are NOT visible from the repo.
---

# Custom-domain launch (e.g. kixxme.com)

All user-facing links come from one function: `appBaseUrl()` in
`artifacts/api-server/src/lib/email.ts`. It resolves `APP_BASE_URL` first
(validated as an http(s) URL, trailing slashes stripped), then falls back to
`REPLIT_DOMAINS[0]`. `allowedHosts()` (same file) drives the Stripe checkout
open-redirect allowlist and unions the `APP_BASE_URL` host with `REPLIT_DOMAINS`.

## The non-obvious cross-system dependencies (invisible from code)

- **Set `APP_BASE_URL` as a DEPLOYMENT secret only** (e.g. `https://kixxme.com`).
  Do NOT set it in dev — it would point dev links at the live domain and break
  dev password-reset/email links. **Why:** `REPLIT_DOMAINS` ordering in prod is
  not guaranteed, so without the override reset/email links could resolve to the
  `*.replit.app` domain instead of the custom one.
- **Supabase Auth → URL Configuration must list the domain.** Add
  `https://kixxme.com/reset-password` (and the Site URL) to the redirect
  allowlist. **Why:** the custom reset flow passes `redirectTo = appBaseUrl()+"/reset-password"`
  to `admin.generateLink(recovery)`; Supabase silently ignores a non-allowlisted
  `redirectTo` and falls back to the Site URL, so the email link lands on the
  wrong host. This config lives in the Supabase dashboard, NOT the repo, and the
  service-role key cannot edit it (needs the Management API / dashboard).
- **Production build needs `SUPABASE_URL` + `SUPABASE_ANON_KEY` at BUILD time.**
  `artifacts/kixxme/vite.config.ts` bakes them into the client bundle via
  `define` (public anon values). They must be present in the deployment build env.

## What does NOT need changing

- Stripe: checkout return URLs are validated dynamically (now allow the custom
  domain), and the managed webhook stays on `REPLIT_DOMAINS[0]` (server-to-server,
  works pre-DNS). No Stripe dashboard URL edit required.

## Ordering

Custom domains can only be added AFTER the first publish (the Replit Deploy →
Settings → Custom Domain panel generates the exact A-record IP + TXT value — they
cannot be known in advance). So: publish → add domain in UI → copy records into
the registrar → wait for verification → then set `APP_BASE_URL` + Supabase
allowlist.
