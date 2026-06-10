---
name: KixxMe Likes / SuperLikes / Matches
description: Load-bearing rules for the dual-DB likes engine — append-only log, derived quotas, free-viewer redaction, compensating refund.
---

# KixxMe Likes / SuperLikes / Matches

The feature spans both databases: the **action log** lives in Replit Postgres
(Drizzle `like_actions`), but the actual "like" **edge** lives in Supabase
`likes`. Keep these rules in mind when touching anything here.

## Append-only log is load-bearing — never prune for GC
`like_actions` (liker_id, liked_id, kind 'like'|'superlike', created_at) is
append-only. "Is this a SuperLike?" is derived as: *the latest `like_actions`
row for (liker, liked) is `superlike` AND the like still exists in Supabase
`likes`.*
**Why:** pruning old rows (e.g. for housekeeping/quota cleanup) would silently
downgrade SuperLikes back to regular likes and corrupt the rolling quota windows.
**How to apply:** deleting a user's own rows on account deletion is fine; never
add a time-based or count-based GC sweep.

## Quotas are derived, not stored counters
Like/SuperLike limits are computed from rolling-window counts over
`like_actions`, not from a stored counter column. Free = 15 likes/6h + 1
SuperLike/24h; Plus = unlimited likes + 5 SuperLikes/24h; Gold = unlimited both.
SuperLike `rechargeAt` = oldest SuperLike in the 24h window + 24h.
**Why:** a derived count can't drift out of sync with the source of truth.

## Compensating refund keeps quota honest across the DB boundary
`recordLike` runs in a Postgres transaction under
`pg_advisory_xact_lock(hashtext(userId))`, counts + inserts the log row, then
upserts the Supabase `likes` edge. **If the Supabase write fails, it deletes the
just-inserted log row** so the user isn't charged quota for a like that never
landed.
**Why:** there are no cross-DB transactions; the log and the edge can diverge,
so the write path must self-heal.

## Free-viewer SuperLike redaction is server-enforced — UI must not assume reveal
Each liker appears **once** in `notifications.likes`. If their current like is a
SuperLike and the viewer is free, the server FULLY redacts: opaque synthetic id
(truncated `sha256(liker+liked)`), null username/avatar_url, `revealed=false`.
A redacted superliker must NOT also appear as a named regular like.
**How to apply:** the frontend reveal path must gate on `revealed && username`
(never infer identity from the id). The opaque id can't collide with real match
ids. Plus/Gold get `revealed=true` + real sender. A mutual SuperLike is announced
as a Match (so it's excluded from the likes toast).

## Engagement emails must gate on a NEW edge, not on `matched`
`recordLike` returns `matched` derived purely from reciprocal-row existence, so
once a pair is mutual *every* later like (incl. unlimited Plus/Gold likes)
reports `matched: true` again. Firing Match/SuperLike emails off `matched`/`isSuper`
alone re-spams the recipient on each repeat like. Gate on `firstEdge` instead:
the Supabase upsert uses `ignoreDuplicates` (INSERT … ON CONFLICT DO NOTHING), so
`.select()` returns a row ONLY when a new edge was inserted — `firstEdge =
rows.length > 0`. The route emails only when `firstEdge`.
**Why:** `matched` must stay reciprocal-existence-based (the in-app match
celebration depends on it on every like), so the no-spam guard lives at the email
layer, not by changing `matched`.
**Known residual:** an unlike (deletes the edge) → re-like inserts a genuinely
new edge, so a toggle still re-fires. Fully fixing it needs a persistent
per-pair "already notified" record (queued follow-up), not edge detection.

## Misc
- 429 (quota exceeded) responses carry a Spanish message at JSON `{ error }`
  (frontend reads `err.data.error`, `err.status === 429`).
- `likeProfile` request body is `required: false` so a plain `like()` with no
  `{kind}` keeps compiling everywhere.
- Match detection queries the reciprocal like AFTER inserting yours; blocks are
  guarded first via `isBlockedBetween`. A regular like that completes a match
  still triggers the celebration (match takes precedence over the kind toast).
