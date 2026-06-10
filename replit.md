# KixxMe

A Spanish-language gay social/dating app: users build a profile, discover nearby people on a list and map, like and chat in real time, and block users they don't want to interact with.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/scripts run seed-stripe` — create/sync Stripe products & prices (requires Stripe connected)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Web app (React + Vite): `artifacts/kixxme/` — pages in `src/pages/` (discover, map, chat, public-profile, profile, auth).
- API server (Express): `artifacts/api-server/` — routes in `src/routes/` (`profiles.ts`, `conversations.ts`), helpers in `src/lib/` (`supabase.ts`, `auth.ts`, `blocks.ts`, `geo.ts`).
- API contract (source of truth): `lib/api-spec/openapi.yaml` → Orval-generated hooks + Zod via `pnpm --filter @workspace/api-spec run codegen`.
- Repo-owned DB schema (Drizzle): `lib/db/src/schema/` (e.g. `blocks.ts`, `billing-customers.ts`), exported from `lib/db/src/index.ts`.
- Likes/SuperLikes/Matches: append-only Drizzle `like_actions` (`lib/db/src/schema/like-actions.ts`); quota/match/redaction logic in `artifacts/api-server/src/lib/likes.ts`; routes via POST `/profiles/:id/like` + GET `/likes/quota` and notifications redaction in `src/lib/notifications.ts`; frontend `src/lib/like-actions.tsx` (`useLikeActions` hook) + `src/lib/match-celebration.tsx` (overlay), SuperLike buttons in `pages/discover.tsx`/`favorites.tsx`/`public-profile.tsx`, received-SuperLike toasts in `src/lib/notifications.tsx`. See `.agents/memory/kixxme-likes.md`.
- Billing/Stripe: `artifacts/api-server/src/lib/stripe.ts` (client) + `billing.ts` (checkout + webhook entitlement), route in `src/routes/stripe.ts`, raw webhook wired in `src/app.ts`; seed in `scripts/src/seed-stripe-products.ts`; frontend in `artifacts/kixxme/src/pages/premium.tsx`.
- Support: repo-owned `support_reports` table (`lib/db/src/schema/support-reports.ts`); API `src/routes/support.ts` (POST `/support/reports`, saves + notifies); frontend `artifacts/kixxme/src/components/support-dialog.tsx` + `pages/support.tsx` (Soporte page), entry points in `profile.tsx` / `public-profile.tsx`.
- Email: `artifacts/api-server/src/lib/email.ts` (neon/fire HTML templates + provider-agnostic `sendEmail`) over `gmail.ts` (Gmail-connector transport). See `.agents/memory/kixxme-transactional-email.md`.
- Branding: reusable neon "K + location pin" emblem in `artifacts/kixxme/src/components/brand/kixxme-logo.tsx` (`KixxMeLogo`), used across splash/auth/nav/headers in place of the old Flame icon.
- KixxMe Live (Gold-only video calls, **scaffold**): repo-owned DB schema `lib/db/src/schema/live.ts` (`live_queue` w/ `skipCount`+`lastSkippedPartnerId`, `video_calls` w/ dual-filter `{caller,callee}` jsonb + `skipped` status); API `routes/live.ts` (incl. `POST /live/calls/:id/skip`) + matcher/`skipCall` in `lib/live.ts` + `lib/entitlement.ts`; frontend `artifacts/kixxme/src/pages/live.tsx` (Reveal + Countdown + Searching), bottom-nav "Live" tab, Gold-gated camera button in `chat.tsx`. See `.agents/memory/kixxme-live.md`.

## Architecture decisions

- **Two databases.** Core app tables (`profiles`, `likes`, `conversations`, `messages`), auth, storage, and realtime live in **Supabase** (PostgREST via `supabase-js`); this schema is NOT DDL-modifiable from this repo. Repo-owned tables (e.g. `blocks`) live in the separate **Replit Postgres** (`DATABASE_URL`) via `@workspace/db` Drizzle. See `.agents/memory/kixxme-dual-database.md`.
- **No cross-DB foreign keys.** Relationships between Replit-Postgres tables and Supabase tables are enforced in application code, not SQL joins (e.g. block filtering loads block sets, then filters Supabase rows in JS).
- **Block enforcement is centralized** in `artifacts/api-server/src/lib/blocks.ts` and applied at every surface that exposes another user (discover/map, favorites, conversation list/create, send/read messages, image upload, like).
- **Contract-first.** Endpoints are defined in OpenAPI, then server validates with generated Zod and the client uses generated React Query hooks.
- **Billing/entitlement.** Subscriptions via Stripe Checkout. `profiles.plan` in Supabase is the entitlement source of truth, written **only** by the Stripe webhook. Stripe data + a `billing_customers` mapping live in Replit Postgres (`stripe-replit-sync` `stripe` schema). Price resolution is by `lookup_key`; tier switches cancel the superseded subscription. See `.agents/memory/kixxme-stripe-billing.md`.
- **KixxMe Live matchmaking.** Gold-only. The matcher runs in one transaction under a global `pg_advisory_xact_lock`, scans `FOR UPDATE SKIP LOCKED`, and atomically dequeues both users + inserts the call (no double-matching), storing both parties' filters + skip streak. Staleness/`RING_TTL` expiry is lazy on read; lifecycle transitions re-select `FOR UPDATE` with participant (IDOR) guards. Skip ("Siguiente") flips the call to `skipped` and re-queues **both** users (skipper streak+1, partner reset); 3 consecutive skips → 429. **No media plane** — `lib/live.ts` `issueMediaToken()` is the single future WebRTC/LiveKit stub. See `.agents/memory/kixxme-live.md`.

## Product

- Email/password auth (Supabase) with profile creation (bio, photos, location).
- Discover nearby users as a list and on a map, sorted/filtered by distance and online status.
- Like and SuperLike profiles, and view a favorites list. Free users get 15 likes/6h + 1 SuperLike/24h (Plus/Gold higher/unlimited); hitting a limit shows a Spanish message + Premium upsell. A mutual like is a Match ("🎉 ¡Es un Match!") that opens chat. Free users are told when they receive a SuperLike but not by whom; Plus/Gold see the sender.
- One-to-one realtime chat with text and image messages, read receipts, and unread counts.
- Block / unblock users: blocking hides each user from the other across discovery, favorites, likes, and chat, and prevents new contact in either direction.
- Premium subscriptions (Stripe Checkout): Plus and Gold tiers, monthly or yearly (EUR), with the active plan reflected on the premium page.
- Support: a Spanish "Soporte" page plus "Contactar soporte" / "Reportar problema" entry points that save reports to the DB and notify `supportkixxme@gmail.com`.
- Transactional emails (neon/fire branded): welcome on signup and a premium-welcome on subscribe; sent from `supportkixxme@gmail.com` via the Gmail connector.
- KixxMe Live (Gold-only): a "Live" tab for video calls — random matching with age-range + scope (nearby/city/Spain/Europe/worldwide) filters. Random matches show a pre-call reveal (photo/name/age·city) with "Aceptar" / "Siguiente" (skip → auto-find another, capped at 3 consecutive skips) / "Cancelar", a both-accept countdown into the call, and safety copy throughout. Private invites via a camera button in chat keep the incoming-ring handshake. In-call controls (cam/mic/end/report/block). Non-Gold users see a Gold paywall. Currently a UI + matchmaking scaffold; the live video stream is not wired yet.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The API server has **no hot reload** — restart the `artifacts/api-server: API Server` workflow after backend edits. The web app uses Vite HMR.
- Two separate databases (see Architecture decisions). You cannot `CREATE`/`ALTER TABLE` on Supabase from this repo; new repo-owned tables go in the Replit Postgres (`DATABASE_URL`) via Drizzle.
- After editing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen`. After editing a `lib/*` package, run `pnpm run typecheck:libs` before leaf typechecks.
- Chat image uploads are base64 in the request body; very large images can hit the Express body size limit (`PayloadTooLargeError`).
- Transactional emails send via the **Gmail connector** — until it is connected, `sendEmail` degrades gracefully (logs and returns false; signup/checkout/support still succeed). After connecting, wire the real client into `gmail.ts` (see `.agents/memory/kixxme-transactional-email.md`). Password-reset emails are handled by **Supabase Auth**, not this repo.
- Stripe Checkout will not load inside the Replit preview iframe — open it in a pre-opened tab from the click gesture, not a `window.location` redirect (see `premium.tsx`).
- KixxMe Live is a **scaffold**: there is no real media/WebRTC and `issueMediaToken()` is a stub. The frontend drives the call state machine by polling `GET /live/state` (dynamic interval) — there is no socket/push. In-call cam/mic toggles are cosmetic local state only.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
