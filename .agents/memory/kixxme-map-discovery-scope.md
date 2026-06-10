---
name: kixxme-map-discovery-scope
description: Scope-based discovery filtering (map), discovery stats, and the centralized visibility (hidden-ids) helper.
---

# Discovery scope, stats, and visibility

## Scope filtering ordering constraint
The Supabase profile query is capped at `.limit(200)`. Any scope (radius or country)
bounding-box pre-filter MUST be applied **inside the Supabase query, before `.limit`**,
then refined in JS (haversine for radius scopes).
**Why:** filtering after the limit silently samples only the 200 most-recent rows, so a
"España"/"Cerca" view would miss matching users who happen to be older rows. The box is an
over-approximation; the JS refine tightens it.
**How to apply:** when adding new scopes or query filters to `GET /profiles` /
`/profiles/stats`, push the coarse filter into the query builder, refine in JS after.

## Radius scopes require viewer coordinates
`scopeBoxFor` returns the sentinel `"empty"` for `nearby`/`province` when the viewer has no
lat/lng; handlers must short-circuit to `[]` (list) / `{registered:0, online:0}` (stats),
never 500. Country/worldwide scopes do not need viewer coords.

## Descubrir priority is layered stable-sort passes (weakest→strongest)
`GET /profiles` builds final order by applying `Array.sort` passes weakest→strongest, so the
**last pass wins**: base sort (recent/distance/online) < `completitud` < `is_verified` <
plan/Gold. Net: grid = verified-first → more-complete → base; map = Gold/Plus on top with
verified/completitud as secondaries.
**Why:** relies on `Array.sort` stability (ES2019+, Node 24 guaranteed) to preserve the prior
key within each tier. Verified-as-primary mirrors the existing Gold-priority pattern.
**How to apply:** to add a new priority key, insert a stable pass at the right strength rung
(earlier = weaker). The plan/Gold pass is **scope-only** (map); the grid (no scope) intentionally
does NOT float paid plans — it floats verified then completitud instead.
- **Gold/plan priority is scope-only** (the map opts in via `scope`); applied as the strongest pass.
- **`completitud`** = 0–6: `min(photoCount,4)` (batched `getPhotoCountsForUsers`, no N+1) + bio tiers
  (≥80→+2, ≥30→+1). Every candidate already passes calidad mínima, so it rewards exceeding the floor.
- **Sample-local, not global:** priority orders only the most-recent-active ≤200 candidate window, so a
  long-inactive verified profile can fall out of the sample entirely (same caveat as scope filtering).
- NOTE (was stale): the grid Descubrir ordering is **no longer "untouched"** — verified+completitud
  priority is now layered onto it.

## Centralized visibility (hidden ids)
`artifacts/api-server/src/lib/visibility.ts` is the single source for "who must this viewer
not see": `getVisibilityContext(viewerId)` → `{ hidden, iBlocked }` where
`hidden = iBlocked ∪ blockedMe ∪ deactivated`. Every surface exposing other users (list,
stats, likes, map) filters by `hidden`.
**Why:** the suspension model (a later task) plugs in **here** as one more union member — a
single insertion point instead of editing every endpoint.
**How to apply:** never re-implement block/deactivation filtering inline; call
`getVisibilityContext`/`getHiddenIds`.

## Headline stat cards are global, decoupled from the scope chips
The map's "Usuarios registrados / En línea ahora" cards call `useGetDiscoveryStats({ scope: "worldwide" })` — a fixed global scope — while the scope chips only drive the profile list (`useListProfiles({ scope })`).
**Why:** binding the headline to the active chip made it read `0` whenever a geo scope (e.g. España) had no users *in range*, which looked like a broken counter. Global totals are the intended product meaning of those cards.
**How to apply:** keep the two hooks on independent scopes; don't "simplify" them back to a shared `scope`.

## Stats count cap
`GET /profiles/stats` counts in JS (load-and-count) capped at 5000 rows — an early-stage
tradeoff, not exact at scale. "En línea ahora" has no client refetch interval, so it can be
stale until scope change/remount (matches the rest of the app's no-poll discovery pattern).
