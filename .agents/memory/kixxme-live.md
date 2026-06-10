---
name: KixxMe Live (video-call scaffold)
description: Architecture and boundaries of the Gold-only "KixxMe Live" video-call feature — matchmaking concurrency, scaffold limits, and UI state rules.
---

# KixxMe Live

Gold-only video-call feature. Two repo-owned Replit-Postgres tables: `live_queue`
(one searcher per `user_id`) and `video_calls` (random + private calls, status
machine `ringing → active → ended/declined/cancelled/missed/skipped`).

## Both call types use the Reveal flow
**Random AND private** ringing calls render the same pre-call **Reveal** (partner
photo/name/age·city + Aceptar). The secondary action differs by type: random
shows "Siguiente" (skip → find someone new); private shows "Rechazar" (decline
this specific invite). Private has no "Cancelar búsqueda" footer; the private
caller (auto-accepted on creation) lands directly in the waiting/"Llamando…"
state. A one-time cosmetic 5→1 countdown plays before the in-call surface (keyed
by `call.id` in local state).
**Why:** the single `Ringing` component was removed — keeping two parallel
incoming-call UIs drifted; route every ringing call through `Reveal`.

## Leaving a random ringing call re-queues the OTHER user
Skip, **decline**, and cancel of a *random* ringing call all re-queue the
non-leaving participant (`requeuePartner`, streak reset) so they keep
roulette-ing instead of being dropped to idle. Private declines/cancels stay
terminal (`requeuePartner` is a no-op for `type !== "random"`). `declineCall`
mirrors `cancelCall`: terminate, then requeue only if the returned row's status
actually flipped.

## Skip streak / 3-skip anti-abuse
**Why:** prevent rapid-fire skipping abuse while keeping roulette flowing.
**How:** `video_calls.filters` stores BOTH parties' filters AND skip streak as
`{ caller, callee }` (each `{scope,ageMin,ageMax,skipCount}`). On skip the skipper
re-enqueues at `skipCount+1`, the partner resets to 0; the matcher excludes the
just-skipped pair via `live_queue.lastSkippedPartnerId`. `MAX_SKIPS=3`
consecutive skips → `skipCall` returns `"limit"` (HTTP 429) **without** ending the
call. The streak resets on accept or a brand-new `POST /live/queue`.
**Known soft limits (acceptable for scaffold):** (1) the cap is bypassable by
Cancel→re-search since a fresh queue resets the streak; (2) with exactly two
eligible users, one skip leaves both searching until someone re-searches (the
mutual `lastSkippedPartnerId` exclusion persists across heartbeats); (3)
`requeuePartner` on cancel runs after the cancel tx commits (non-atomic) — a crash
between them just drops the partner to idle (they re-tap search).

## Skip concurrency (skipCall)
**Why:** skip vs accept vs double-skip must resolve without double-queueing.
**How:** `skipCall` pre-reads + does Supabase snapshot loads OUTSIDE the tx (no
network I/O under lock), then re-selects the call `FOR UPDATE`, re-validates
participant/type/status and the streak on the locked row, flips to `skipped`, and
upserts both queue rows in the same tx. Both participants serialize on the same
call-row lock; the loser of a race sees a non-ringing status → `"invalid"` (409).
Legacy old-shape `filters` (`{scope,ageMin,ageMax}`, no caller/callee) are
defensive via optional chaining + `filtersOf()` permissive defaults.

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
