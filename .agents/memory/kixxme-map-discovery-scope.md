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

## Stat cards = server-computed GLOBAL totals (`gold_total`/`online_total`), NOT the marker list
The Gold map's two stat cards (Usuarios Gold / En línea ahora) read `mapData.gold_total` /
`mapData.online_total` — new fields on the `GET /map/users` envelope, computed server-side by
`mapCommunityStats(hidden)` in `profiles.ts`: count Supabase `plan='gold'` rows minus the
viewer's `hidden` set, INCLUDING self (self is never in hidden); `online_total` = those with
`isOnline(last_active_at)`. Global — independent of scope, coordinates, and `show_on_map`.
Returned on all success paths (non-Gold → 0/0). `GET /profiles/stats`/`useGetDiscoveryStats`
still exist for live.tsx; don't delete.
**Why:** the OLD approach (derive from the scoped marker `users` array) showed **0/0** when
the only Gold user was the viewer (markers exclude self via `.neq`) or had no coordinates
(markers require lat/lng) — so the counters lied about real data. Markers legitimately need
coords/scope/visibility; the headline counters must not. Counting an opted-out or location-less
Gold user in the aggregate is intentional ("invisible on the map" ≠ "not a Gold user").
**How to apply:** keep the counters decoupled from markers. Quirks (by design, not bugs): a
`GOLD_TEST_EMAILS` override viewer is NOT in `gold_total` (real plan stays 'free'); "Cerca"
can show 0 markers with non-zero counters; any actively-polling Gold viewer counts as ≥1 online
(self). Auto-updates via the existing 30s `refetchInterval`.

## Header "X en el mapa" counter is MARKER-synced (opposite of the stat cards)
The small top-right header counter is a DIFFERENT metric from the `gold_total`/`online_total`
stat cards: it must equal the pins actually drawn. Use `onMapCount = placeable.length +
(hasLocation ? 1 : 0)` — i.e. other placeable Gold users PLUS the viewer's own pin **iff** it
is drawn. The self ("you are here") marker is gated on `hasLocation`, so it is NOT pinned at the
`DEFAULT_CENTER` national-centroid fallback when the viewer has no coords.
**Why:** the bug was the header showing `placeable.length` (other users only, excludes self via
the server `.neq("id",self)`) while the self marker was ALWAYS rendered → a lone Gold viewer saw
their pin but "0 en el mapa". Reconcile by counting the self pin AND only drawing it when real.
**How to apply:** keep header counter == rendered markers in lockstep. Note the self pin renders/
counts even when "Mostrarme en el mapa" is OFF — `show_on_map` only hides you from OTHERS; the
header counts pins on YOUR map. Do NOT conflate with the stat cards, which stay marker-decoupled.

## Non-Gold map = full early-return sales screen (not an in-map overlay)
Non-Gold users get a whole-screen premium "trailer" (`components/map-demo.tsx`,
self-contained radar + fake crown markers + 3 marketing messages + "Hazte Gold" CTA)
returned **early** from `map-view.tsx` — `if (!isLoading && !canAccess) return <MapDemo/>`,
placed AFTER all hooks. Gate on `can_access`, never `profiles.plan`. The old dimmed-map +
lock-card overlay is gone.
**Map init lifecycle is tied to `[canAccess]`, NOT a one-time `[]` mount.** Because the early
return means the map div only renders during the loading frame or for Gold users, a one-time
`[]` init would build a Leaflet map during a non-Gold loading frame that the early return then
orphans (`mapRef` → removed node) → blank map if `can_access` later flips true via the 30s poll
while staying on /map (e.g. upgrade in another tab). So the init effect runs on `[canAccess]`
(guarded `if (!canAccess) return`) with cleanup `map.remove()` + null on access loss/unmount.
Do NOT revert to `[]` deps; and do NOT gate the `mapDivRef` div behind a post-load state flip
while keeping `[]` init — the effect would never re-run after the flip (the original trap).

## Stats count cap
`GET /profiles/stats` counts in JS (load-and-count) capped at 5000 rows — an early-stage
tradeoff, not exact at scale. "En línea ahora" has no client refetch interval, so it can be
stale until scope change/remount (matches the rest of the app's no-poll discovery pattern).
