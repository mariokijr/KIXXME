---
name: KixxMe Live (video-call scaffold)
description: Architecture and boundaries of the Gold-only "KixxMe Live" video-call feature — matchmaking concurrency, scaffold limits, and UI state rules.
---

# KixxMe Live

Gold-only video-call feature. Two repo-owned Replit-Postgres tables: `live_queue`
(one searcher per `user_id`) and `video_calls` (random + private calls, status
machine `ringing → active → ended/declined/cancelled/missed`).

## Scaffold boundary (intentional, not a bug)
There is **no media plane**. `lib/live.ts` `issueMediaToken()` is a documented
stub and is the single future integration point for WebRTC/LiveKit. In-call
cam/mic toggles in `pages/live.tsx` are cosmetic local state only. Do not treat
"no real video / no token" as a defect — the task was a scaffold.

## Matchmaking concurrency model
**Why:** two searchers polling concurrently must never double-match or both grab
the same partner.
**How:** the matcher runs inside one transaction holding a global
`pg_advisory_xact_lock`, scans candidates `FOR UPDATE SKIP LOCKED`, then deletes
both queue rows and inserts the `video_calls` row atomically. Staleness prune
(~30s heartbeat) and lazy `RING_TTL` (~60s → `missed`) happen on read. Lifecycle
transitions (accept/decline/cancel/end) re-select the row `FOR UPDATE` and assert
the caller is a participant (IDOR guard) plus a status-machine guard. Dual-accept
is race-safe: the second accept sees the first's timestamp and flips to `active`.

## Entitlement gating
`lib/entitlement.ts getPlan/hasGold` reads Supabase `profiles.plan` (the billing
source of truth — see kixxme-stripe-billing.md). Random matching is Gold-only;
private invites require **both** users Gold. Server is authoritative; the
frontend paywall only mirrors it.

## UI rule: an in-progress call renders before the paywall
In `pages/live.tsx` the active/ringing-call branches are checked **before** the
`!canAccess` paywall. **Why:** if a plan lapses mid-call (webhook downgrade) the
user must keep the End-Call UI instead of being kicked to the paywall. The
`GET /live/state` endpoint returns the active call regardless of plan, which makes
this ordering safe.

## Cross-DB
No FK between `video_calls`/`live_queue` (Replit Postgres) and Supabase
`profiles`/`blocks`; block filtering and profile hydration happen in app code
(consistent with kixxme-dual-database.md).
