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
- **SINGLE getUserMedia on connect, then reconcile.** The connect flow calls
  `enableCameraAndMicrophone()` ONCE, then `setCameraEnabled/setMicrophoneEnabled`
  to match the user's toggle intent; a `mediaReady` flag + `appliedCam/MicRef`
  guards gate the per-toggle effects so they only act on *subsequent* changes,
  never a second concurrent acquisition. The reconcile is **skipped** when the
  initial acquire threw (permission denied) so we don't fire a redundant
  camera-only getUserMedia. Toggles read live state, never re-trigger connect.
- Permission denial (incl. the preview iframe) → `mediaError` **without**
  disconnecting (remote video still flows). `resumeAudio`→`room.startAudio()`.
- Hoisted into `<Live>` (NOT `InCall`) so the room connects during the 5s
  countdown; `InCall` branches on `live.active`, **never** `call.mediaToken`
  (mirrors the "in-progress call renders before paywall" rule).

## iOS Safari media-plane bugs (the "match works but no remote video/audio")
Real-phone symptom: lifecycle (match/accept/reveal/countdown) works, but the
remote video is blank and remote audio is silent. Four iOS-specific causes, all
fixed in `useLiveKitCall`:
- **Two separate `getUserMedia` calls drop the first track on iOS.** Requesting
  camera then mic (or vice-versa) in two calls silently kills the first capture
  → published mic/cam missing. Fix: acquire BOTH at once via
  `enableCameraAndMicrophone()`, then reconcile.
- **`adaptiveStream`/`dynacast` pause a "not visible" remote track.** The
  fullscreen remote `<video>` sits at `opacity:0` until a track arrives, which
  adaptiveStream reads as not-visible and pauses → connected-but-blank. Fix:
  `new Room()` with NEITHER option for 1:1 calls (plain receive).
- **Remote `<video>` must be `muted`; play remote AUDIO via a separate hidden
  `<audio>`.** iOS only autoplays a muted video; routing audio through its own
  element lets the picture autoplay while audio waits for a gesture.
- **Audio autoplay needs a user gesture with a visible prompt.** Surface
  `needsAudioGesture` from `room.canPlaybackAudio` + `RoomEvent.AudioPlaybackStatusChanged`;
  show a "Toca para activar el sonido" button (and opportunistically call
  `resumeAudio()` from mic/cam toggles) → `room.startAudio()`.
**Why:** these only reproduce on real iOS devices — cannot be caught in-agent
(no camera; preview iframe lacks `allow="camera;microphone"`). The final
see+hear validation always requires the user's two phones.

## `track.attach()` swallows the single play() → a muted video can stay PAUSED (black)
A SECOND, distinct "no video" mode from the four above: lifecycle works, frames
even **decode** (`videoWidth>0`), audio works, yet BOTH self-view and remote are
black. **Root cause:** LiveKit `track.attach(el)` calls `el.play()` exactly once
and swallows the rejection; on iOS that lone attempt can be refused while the
`<video>` isn't laid-out/visible yet, leaving it **PAUSED** forever. `videoWidth`
proves the pipeline decoded a frame — it does NOT prove the element is playing or
visible. **The tell:** `el.paused===true` / `currentTime` frozen / `clientHeight`
0 while `videoWidth` is non-zero.
**Fix (all attach sites route through one `attachAndPlay`→`playVideo` helper):**
re-issue `el.play()` after attach AND again on `loadedmetadata`/`canplay`; pin
`el.muted=true; el.playsInline=true` imperatively right before each `play()`
(React applies `muted` as a property and can lag render → an unmuted-at-play()
video is the #1 iOS `NotAllowedError`); on a remaining **remote** rejection set
`needsVideoGesture` and show a "Toca para ver el vídeo" tap overlay (the
full-screen surface tap also calls `resumeVideo()`). Local rejection only records
a diag `localPlayError` (a black self-view already has the `mediaError`/retry UX;
a prompt there would confuse). Diag must carry `paused`/`currentTime`/`readyState`
/`clientWidth`/`clientHeight` (+`*PlayError`) for BOTH els — width alone can't
distinguish "decoding but paused/black" from "playing".

## Corrupted LiveKit creds masquerade as the iOS bug (check creds FIRST)
A glyph-swapped API key (LiveKit keys start `API`; an `I`→`l` swap gives `APl…`)
or a truncated/wrong API secret produces the EXACT same symptom as the iOS bug:
lifecycle works, remote video blank + audio silent — but on **every** device, not
just iOS. **Why it hides:** `mintRoomToken` signs locally and never validates
against LiveKit, so `serializeCall` happily returns a `mediaToken`+`mediaUrl` that
LiveKit then **rejects at room-join** → zero remote tracks. The app still shows
"in call" because that's only the DB state machine. So before blaming the client,
verify creds against the real project.
**Verification recipe (no phones, no extra deps — Node 24 has global `WebSocket`):**
1. Management API: `new RoomServiceClient(httpUrl,key,secret).listRooms()`.
   `invalid API key` = key not found in project (glyph swap / wrong project);
   if correcting the key flips the error to `invalid token`, the **secret** is
   wrong (signature fails). LiveKit Cloud secrets are ~43 chars (a 32-char one is
   truncated). The API key is NOT secret (it's the `iss` claim in every client
   token) so its chars are safe to inspect; the secret is.
2. Signal join: mint a join token (same grants as `mintRoomToken`) and open
   `wss://<host>/rtc?access_token=…&protocol=15&auto_subscribe=1&sdk=js`. `open`
   + first message = the join the client does is accepted (the thing that was
   failing). Two tokens for one room proves two-way room membership.
Final on-device see+hear still needs the user's two phones on the published domain.

## A self-view proves LOCAL capture only — get SFU-side evidence
**Why:** "I see my own camera but not the other person" tells you nothing about
whether your track ever reached the SFU. A self-`<video>` attaches the *local*
track; it is true even when nothing publishes. To diagnose a real two-phone
failure you need evidence from BOTH the client and the authoritative server room
view, correlated.
**How:** `useLiveKitCall` accumulates a structured snapshot (`diagRef`) and POSTs
it to `POST /live/diag` fire-and-forget at three moments — acquire-settled,
~6s "delayed" (the key one: connected-but-no-media shows here), and teardown —
plus on any toggle/switch failure. The server pairs it with
`listRoomParticipants(roomName)` (authoritative SFU identities + track kinds) in
ONE `req.log.info({liveDiag})` line. The triad that disambiguates the three
failure modes: `connectOk`/`connectError` (didn't join) → `gumMode`+
`cameraAcquired`+`publishedCamera/Mic` from `LocalTrackPublished` (joined but
published nothing) → `subscribedVideo/Audio` + the server participant track list
(published but remote sees no media). Env capture (UA, isSecureContext,
`navigator.standalone` PWA, mediaDevicesPresent, permissions.query camera/mic)
covers the iOS suspects. **The diag report NEVER contains a token.** Teardown uses
a plain fetch (not sendBeacon) so it's lost on tab-kill — rely on acquire +
delayed. Pass the effect-closure `callId` to `postDiag` so teardown logs the OLD
call even after the latch advances.

## Blind spot: a null mediaToken means ZERO diag rows (and that's the finding)
If a user's `mediaToken` is null (lapsed Gold per `issueMediaToken`'s getPlan
check, or a LiveKit env issue at mint), `useLiveKitCall` never activates → that
user posts NO `liveDiag` lines at all. **Absence of one side's diag is itself
evidence:** check that user's `GET /live/state` DTO for a null `mediaToken` and
the partner's server snapshot (it will show only one participant). Don't read
"no logs from one participant" as "diagnostics broken".

## Where the real-device evidence lives: dev preview, NOT a deployment
This repl has **no production deployment and no production Neon DB** (`executeSql
environment:"production"` → "does not have a production Neon database"; and
`fetch_deployment_logs` → "No deployment logs found"). Yet the two Gold test
phones' **real** `blocks`/`video_calls` rows are visible from the agent's
*development* `executeSql`. Conclusion: **the phones test on the public dev
preview URL** (`*.replit.dev` / `$REPLIT_DEV_DOMAIN`), which hits the dev API +
dev Replit Postgres — the same DB the agent can read/write and the same workflow
whose code is live. **So real-device diagnostics (incl. `live.diag`) land in the
DEV workflow logs (`refresh_all_logs`), never `fetch_deployment_logs`; and a DB
fix like removing a block applies immediately to the phones' next test.** Don't
chase a "published domain" for evidence until the app is actually published; the
`mediaError`-on-preview caveat below is about the *agent's own* in-browser iframe
(no `allow=camera`), not the user's phone on the dev URL.

## Sequential getUserMedia fallback keeps AUDIO alive when the camera dies
**Why:** a blocked/dead camera must not take the whole call down — audio is the
floor of a usable call.
**How:** combined `enableCameraAndMicrophone()` first; on throw, fall back to
`setMicrophoneEnabled(true)` THEN `setCameraEnabled(true)`, each in its own
try/catch recording a typed `gumErrors[]` entry (stage = combined/mic/camera).
`mediaError` (boolean, back-compat) tracks the CAMERA (self-view) outcome; a
typed `mediaErrorReason` (denied/busy/notfound/insecure/overconstrained/unknown,
classified from the DOMException `name` with an insecure-context check first)
drives an actionable Spanish message in `InCall` (`mediaErrorMessage()`). Partner
`role`/`looking_for` now ride the DTO (`loadParticipant` merges Supabase +
`getProfileDetails`) and render as chips via the shared `profile-format` labels.

## Front/back camera switch
`switchCamera` flips the published camera in place via
`LocalVideoTrack.restartTrack({ facingMode })` (no re-publish → seamless source
swap for the remote). `canSwitchCamera` is gated on `enumerateDevices()` finding
>1 `videoinput`, so the flip control only shows when it would do something.

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

## Match prerequisites: a block (either direction) is the #1 silent "won't match"
Three non-obvious reasons a Gold pair "searches forever and never matches" even
though both enqueue (POST /live/queue → 200) and poll cleanly with **no errors**:
- **A block in EITHER direction permanently excludes the pair.** `runMatch` calls
  `blockedSet(me)` = `iBlocked ∪ blockedMe ∪ getUnavailableIds()` and skips any
  candidate in it. So if A ever tapped "Bloquear" on B (in-call block button, or
  from chat/profile), A and B can NEVER random-match again until the block is
  removed — by design (blocking hides users everywhere incl. Live). This is the
  FIRST thing to check when a *previously-matching* pair suddenly stops: query
  `blocks` for both `(blocker,blocked)` orders. A real incident: a test pair
  matched 4× in a day, then stopped — cause was a block row created seconds after
  the last call, NOT any code change. The block button is always behind an
  explicit tap; report does NOT auto-block.
- **`age == null` ⇒ never matches anyone.** `ageMutual` returns false if *either*
  side's `userAge` is null, so an incomplete profile (Live does NOT gate on
  profile completeness, only Gold) can sit in queue indefinitely. The scope
  fallback below does NOT fix this — the UI must warn (see `getLiveProfileFlags`/
  idle banner) and the user must set an age.
- **No coordinates + a location scope ⇒ never matches.** Default UI scope is
  "nearby", which needs both sides' coords; "spain"/"europe" need the target's
  coords; "city" needs a city. `effectiveScope` (applied in `loadSnapshot`)
  downgrades the searcher's scope to "worldwide" when their own data can't
  satisfy it, so the *stored* queue scope + `video_calls.filters` are already
  effective — both match directions and skip/heartbeat/requeue see it, and it's
  idempotent (self-heals legacy rows).
**Why:** the failure is silent (200s, no logs); the cause is data (a block, a
null age, or missing coords), not the matcher. Before suspecting matchmaking
code, check the `blocks` table (both directions) and `age`/`latitude`/`longitude`
on the Supabase `profiles` rows.

## Repro recipe: drive a real 2-account match from the shell (no phones)
Confirmed working. Mint a Bearer per account (admin `generate_link` magiclink →
`verify` → `access_token`, see "E2E-testing authed endpoints" below), then hit
`localhost:80/api/live/state` + `POST /api/live/queue {scope,ageMin,ageMax}` for
both — the 2nd queue call returns the ringing call when they match. Clear
`live_queue` and any `ringing`/`active` `video_calls` first for a clean run. This
isolates matcher-vs-data instantly: if both stay `searching`, inspect `blocks`,
`age`, coords (above) — the matcher itself is rarely the culprit.

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
