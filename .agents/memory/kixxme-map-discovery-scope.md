---
name: kixxme-map-discovery-scope
description: Scope-based discovery filtering (map), discovery stats, and the centralized visibility (hidden-ids) helper.
---

# Discovery scope, stats, and visibility

## Map is open to all — messaging from it requires Gold (sender-side only)
The world map runs on a dedicated `GET /map/users?scope=` returning an envelope
`{can_access, show_on_map, users, gold_total, online_total}`.
- `can_access` is **always `true`** for authenticated users (kept in envelope for client compat; was the Gold gate, now unused as a gate).
- **Candidates = OTHER users** with coordinates AND `show_on_map=true` (ANY plan), passing calidad mínima and `getVisibilityContext().hidden`.
- The **"Mensaje" button in the selected card is gated on the VIEWER's Gold status** (`profile.plan === "gold"`), checked client-side. Non-Gold viewers see a locked amber button → `/premium`. The recipient's plan does not matter.
- Markers: Gold users get gold border + 👑 crown; non-Gold users get purple ring. `markerHtml()` checks `user.plan === "gold"`.
- `gold_total` in the envelope is **repurposed** to count all location-enabled users (not just Gold). API field name kept to avoid codegen run. Frontend label = "En el mapa". `online_total` = location-enabled users with `isOnline()`.

**Why:** the map's value grows with more users visible; gating viewing behind Gold hurt retention. Messaging is the premium action, not discovery.

**Map init lifecycle is tied to `[canAccess]`**, NOT a one-time `[]` mount. `canAccess` flips `false→true` when the API responds; tying init to it prevents building a Leaflet map before the container is in the DOM (which causes an orphaned mapRef). The `canAccess` var = `mapData?.can_access ?? false` which is `false` pre-load, `true` post-load.

**Do NOT add a `plan='gold'` filter** to the candidate query in `GET /map/users` — that was the old design.

## Scope filtering ordering constraint
The Supabase profile query is capped at `.limit(200)`. Any scope (radius or country)
bounding-box pre-filter MUST be applied **inside the Supabase query, before `.limit`**,
then refined in JS (haversine for radius scopes).
**Why:** filtering after the limit silently samples only the 200 most-recent rows, so a
"España"/"Cerca" view would miss matching users who happen to be older rows.
**How to apply:** when adding new scopes or query filters, push the coarse filter into the query builder, refine in JS after.

## Radius scopes require viewer coordinates
`scopeBoxFor` returns the sentinel `"empty"` for `nearby`/`province` when the viewer has no
lat/lng; handlers must short-circuit to `[]` (list) / `{registered:0, online:0}` (stats),
never 500. Country/worldwide scopes do not need viewer coords.

## Descubrir priority is layered stable-sort passes (weakest→strongest)
`GET /profiles` builds final order by applying `Array.sort` passes weakest→strongest, so the
**last pass wins**: base sort (recent/distance/online) < `completitud` < `is_verified` <
plan/Gold. Net: grid = verified-first → more-complete → base; map = Gold/Plus on top with
verified/completitud as secondaries.
**Why:** relies on `Array.sort` stability (ES2019+, Node 24 guaranteed). Verified-as-primary mirrors the Gold-priority pattern.
**How to apply:** to add a new priority key, insert a stable pass at the right strength rung. The plan/Gold pass is **scope-only** (map); the grid intentionally does NOT float paid plans.
- **`completitud`** = 0–6: `min(photoCount,4)` (batched `getPhotoCountsForUsers`, no N+1) + bio tiers (≥80→+2, ≥30→+1).
- **Sample-local, not global:** priority orders only the most-recent-active ≤200 candidate window.

## Centralized visibility (hidden ids)
`artifacts/api-server/src/lib/visibility.ts` is the single source for "who must this viewer
not see": `getVisibilityContext(viewerId)` → `{ hidden, iBlocked }` where
`hidden = iBlocked ∪ blockedMe ∪ deactivated`. Every surface exposing other users (list,
stats, likes, map) filters by `hidden`.
**Why:** the suspension model plugs in **here** as one more union member — a single insertion point.
**How to apply:** never re-implement block/deactivation filtering inline; call `getVisibilityContext`/`getHiddenIds`.

## Stat cards = server-computed GLOBAL totals (`gold_total`/`online_total`), NOT the marker list
The map's two stat cards (En el mapa / En línea ahora) read `mapData.gold_total` /
`mapData.online_total` — computed server-side by `mapCommunityStats(hidden)` in `profiles.ts`.
`gold_total` now counts ALL users with lat/lng (not just plan='gold'). `online_total` = those
with `isOnline(last_active_at)`. Global — independent of scope. `GET /profiles/stats`/
`useGetDiscoveryStats` still exist for live.tsx; don't delete.
**Why:** the old per-marker count showed 0/0 when the only user was the viewer (markers exclude
self via `.neq`) or had no coordinates — the headline counters must be marker-decoupled.
**Quirks (by design):** opted-out or location-less users count in aggregate; "Cerca" can show 0 markers with non-zero counters; self always counted.

## Header "X en el mapa" counter is MARKER-synced (opposite of the stat cards)
The top-right header counter must equal pins actually drawn: `onMapCount = placeable.length +
(hasLocation ? 1 : 0)`. The self ("you are here") marker is gated on `hasLocation`, so it is
NOT pinned at the DEFAULT_CENTER fallback when the viewer has no coords.
**How to apply:** keep header counter == rendered markers in lockstep. Do NOT conflate with the stat cards, which stay marker-decoupled.

## Stats count cap
`mapCommunityStats` counts in JS (load-and-count) capped at 5000 rows — an early-stage
tradeoff, not exact at scale.
