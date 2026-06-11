---
name: KixxMe Live (Gold video calls, LiveKit)
description: Architecture and boundaries of the Gold-only "KixxMe Live" video-call feature — matchmaking concurrency, the LiveKit media plane, and UI state rules.
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
state. A one-time 5→1 countdown plays before the in-call surface (keyed by
`call.id` in local state); the LiveKit room connects during it (the
`useLiveKitCall` hook is hoisted into `<Live>`, not `InCall`).
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

## Media plane: LiveKit
Real video runs on LiveKit Cloud. Server `lib/livekit.ts`:
`mintRoomToken(roomName,userId)` signs a **room-scoped, Gold-gated** JWT (TTL 2h,
`roomRecord:false`); `issueMediaToken` (lib/live.ts) wraps it and `serializeCall`
attaches `mediaToken`+`mediaUrl` to the DTO **only while status==='active'** (null
otherwise / when LiveKit is unconfigured / not Gold). `endCall` fires a
best-effort `deleteRoom(roomName)` so a still-valid token can't rejoin after
hangup/block (block routes through `endCall`; ringing exits never minted a token,
so no room exists). `deleteRoom` lazily caches a `RoomServiceClient`
(wss→https via `toHttpUrl`), no-ops when unconfigured, never throws.

Frontend `src/lib/livekit-room.ts` `useLiveKitCall({callId,token,url,camOn,micOn})`:
- **LATCH creds once per `callId`.** The ~2s `GET /live/state` poll re-mints the
  token every call and returns null on a plan lapse — connecting straight off the
  DTO would reconnect every poll and tear down an active call. Latch
  `{callId,token,url}`; keep it on token churn / a transient null for the SAME
  call; drop only when `callId` changes/null. Connect effect deps **only** on the
  latch (cancellation-safe: `await connect` → if cancelled, `disconnect`).
- Cam/mic published by **separate** effects once `status==='connected'` (single
  publish source — the connect effect never publishes, avoiding a double-publish
  race). Toggles read live state, never re-trigger connect.
- Permission denial (incl. the preview iframe) → `mediaError` **without**
  disconnecting (remote video still flows). `resumeAudio`→`room.startAudio()`.
- Hoisted into `<Live>` (NOT `InCall`) so the room connects during the 5s
  countdown; `InCall` branches on `live.active`, **never** `call.mediaToken`
  (mirrors the "in-progress call renders before paywall" rule).

**Config:** needs secrets `LIVEKIT_URL` (wss://), `LIVEKIT_API_KEY`,
`LIVEKIT_API_SECRET`. Until set, the whole path no-ops gracefully (placeholder UI
+ `ComingSoonBanner` retained).
**Caveat:** `getUserMedia` needs `allow="camera;microphone"`, which the Replit
preview iframe lacks — local publish only works on the **published domain**;
in-preview you get the `mediaError` notice (remote-only). Can't fully e2e
in-agent (no camera).

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

## Match prerequisites: null age is a hard blocker; no coords ⇒ worldwide fallback
Two non-obvious reasons a Gold pair "searches forever and never matches" even
though both enqueue (POST /live/queue → 200) and poll cleanly with **no errors**:
- **`age == null` ⇒ never matches anyone.** `ageMutual` returns false if *either*
  side's `userAge` is null, so an incomplete profile (Live does NOT gate on
  profile completeness, only Gold) can sit in queue indefinitely. The fallback
  below does NOT fix this — the UI must warn (see `getLiveProfileFlags`/idle
  banner) and the user must set an age.
- **No coordinates + a location scope ⇒ never matches.** Default UI scope is
  "nearby", which needs both sides' coords; "spain"/"europe" need the target's
  coords; "city" needs a city. `effectiveScope` (applied in `loadSnapshot`)
  downgrades the searcher's scope to "worldwide" when their own data can't
  satisfy it, so the *stored* queue scope + `video_calls.filters` are already
  effective — both match directions and skip/heartbeat/requeue see it, and it's
  idempotent (self-heals legacy rows).
**Why:** the failure is silent (200s, no logs); the cause is profile data, not the
matcher. Always check `age`/`latitude`/`longitude` on the Supabase `profiles`
rows before suspecting the matchmaking code.

## E2E-testing authed endpoints without a password
To drive real `requireAuth` HTTP flows for a specific user (e.g. force a Live
match between two accounts), mint a genuine Supabase access token server-side:
admin `POST /auth/v1/admin/generate_link {type:"magiclink",email}` → take
`hashed_token` → `POST /auth/v1/verify {type:"magiclink",token_hash}` returns
`{access_token}`. Non-destructive (no password change). Use it as a Bearer
against `http://localhost:80/api/...` (shared proxy). Lets you prove the whole
chain (queue → match → both accept → `active` → both get LiveKit `mediaToken`).

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
