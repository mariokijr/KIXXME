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

## Gold-priority sort is scope-only and stability-dependent
Gold users are floated to the top of `GET /profiles` results **only when a `scope` is
present**, applied as a secondary pass after the distance/online sort and relying on
`Array.sort` stability to preserve the chosen order within each tier.
**Why:** the grid "Descubrir" page calls `useListProfiles()` *without* scope, so its existing
ordering must stay untouched; only the map opts into priority visibility.

## Centralized visibility (hidden ids)
`artifacts/api-server/src/lib/visibility.ts` is the single source for "who must this viewer
not see": `getVisibilityContext(viewerId)` → `{ hidden, iBlocked }` where
`hidden = iBlocked ∪ blockedMe ∪ deactivated`. Every surface exposing other users (list,
stats, likes, map) filters by `hidden`.
**Why:** the suspension model (a later task) plugs in **here** as one more union member — a
single insertion point instead of editing every endpoint.
**How to apply:** never re-implement block/deactivation filtering inline; call
`getVisibilityContext`/`getHiddenIds`.

## Stats count cap
`GET /profiles/stats` counts in JS (load-and-count) capped at 5000 rows — an early-stage
tradeoff, not exact at scale. "En línea ahora" has no client refetch interval, so it can be
stale until scope change/remount (matches the rest of the app's no-poll discovery pattern).
