---
name: kixxme-map-discovery-scope
description: Scope-based discovery filtering (map), discovery stats, and the centralized visibility (hidden-ids) helper.
---

# Discovery scope, stats, and visibility

## The map is Gold-exclusive on its OWN endpoint (not GET /profiles)
The world map runs on a dedicated `GET /map/users?scope=` returning an envelope
`{can_access, show_on_map, users}` — it is NOT the shared `GET /profiles` (which stays
open for the Descubrir grid). Two hard rules:
- **Gate on the server-computed `can_access`, never on raw `profiles.plan`.** `can_access`
  comes from `hasGold(userId)`, so it honors the read-only `GOLD_TEST_EMAILS` override; a
  client that checks `profile.plan === "gold"` would lock out test-Gold accounts.
- **Candidates = OTHER users with `plan='gold'` AND coordinates AND `show_on_map=true`**
  (opt-out via batched `getMapOptOutIds`), then the same calidad mínima +
  `getVisibilityContext().hidden` filters as the grid. Privacy toggle writes via
  `setShowOnMap` (`onConflictDoUpdate` touching ONLY `show_on_map` — never clobber
  role/looking_for); `show_on_map` is kept OUT of `getProfileDetails` (private).
**Why:** the map is a premium surface; mixing its gate into `GET /profiles` would have gated
the open grid too. Coordinates never leave the server (`toPublic` → rounded `distance_km`
only; client re-projects with the hashed-bearing offset for the approximate-location margin).
**Known asymmetry (acceptable):** a `GOLD_TEST_EMAILS` viewer can *use* the map but won't
*appear* as a marker to others — the candidate query reads real `profiles.plan='gold'` and
the override never writes plan. Matches the documented read-only override semantics.

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

## Stat cards: map derives from its own list; `useGetDiscoveryStats` lives on for live.tsx
The Gold map's two stat cards (Usuarios Gold / En línea) are now derived from the loaded
`GET /map/users` list (`users.length` + online count) — the map no longer calls
`useGetDiscoveryStats`. The `GET /profiles/stats` endpoint + `useGetDiscoveryStats` hook are
still used elsewhere (e.g. `live.tsx`), so do NOT delete them.
**Why:** the map list is already Gold-scoped, so its own cards are the truthful counts; a
separate worldwide stats call would over-count (non-Gold + opted-out users).
**How to apply:** if you re-add headline counters to the map, derive from the map list, not
a global stats call.

## Non-Gold map = full early-return sales screen (not an in-map overlay)
Non-Gold users get a whole-screen premium "trailer" (`components/map-demo.tsx`,
self-contained radar + fake crown markers + 3 marketing messages + "Hazte Gold" CTA)
returned **early** from `map-view.tsx` — `if (!isLoading && !canAccess) return <MapDemo/>`,
placed AFTER all hooks. Gate on `can_access`, never `profiles.plan`. The old dimmed-map +
lock-card overlay is gone.
**Latent edge case (accepted, not fixed):** the Leaflet init effect has `[]` deps, so during
the non-Gold `isLoading` frame the main return mounts the map div and inits a Leaflet map;
the early return then unmounts that div, orphaning `mapRef`. If `can_access` later flips true
via the 30s poll *while the user stays on /map* (e.g. upgrade in another tab), the init effect
never re-runs → blank map. The normal upgrade path (CTA → /premium → back) remounts MapView
fresh, so it rarely bites. Fix (if needed): tie map init lifecycle to `canAccess` (init/cleanup
on `[canAccess]`) instead of `[]` — but that touches the core Gold map, so test carefully.

## Stats count cap
`GET /profiles/stats` counts in JS (load-and-count) capped at 5000 rows — an early-stage
tradeoff, not exact at scale. "En línea ahora" has no client refetch interval, so it can be
stale until scope change/remount (matches the rest of the app's no-poll discovery pattern).
