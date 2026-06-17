import { Router } from "express";
import { count as drizzleCount, inArray as drizzleIn, sql as drizzleSql } from "drizzle-orm";
import { db, likeActionsTable } from "@workspace/db";
import { supabase } from "../lib/supabase.js";
import { requireAuth, optionalAuth } from "../lib/auth.js";
import {
  distanceKm,
  haversineKm,
  isOnline,
  scopeBoxFor,
  withinMapScope,
  boxAround,
  type MapScope,
  detectCountryBbox,
} from "../lib/geo.js";
import {
  getBlockRelations,
  isBlockedBetween,
  addBlock,
  removeBlock,
} from "../lib/blocks.js";
import { isUnavailable } from "../lib/moderation.js";
import { isSystemAccount } from "../lib/system-accounts.js";
import { getVisibilityContext, getHiddenIds } from "../lib/visibility.js";
import { recordLike, areMatched } from "../lib/likes.js";
import { getReceivedLikes } from "../lib/received-likes.js";
import { getBoostStatus, activateBoost, getActiveBoostedIds } from "../lib/boosts.js";
import { recordPass, getPassedIds } from "../lib/passes.js";
import { ensureConversation } from "../lib/conversations.js";
import {
  notifyMatchByEmail,
  notifyLikeByEmail,
  notifySuperLikeByEmail,
} from "../lib/like-notifications.js";
import { pushMatch, pushSuperLike } from "../lib/push-notifications.js";
import { getPlan } from "../lib/entitlement.js";
import {
  recordProfileVisit,
  countVisitors,
  listVisitors,
} from "../lib/visits.js";
import {
  getProfileDetails,
  getProfileDetailsForUsers,
  getPrivacyAcks,
  ackMapPrivacy,
  ackLivePrivacy,
  upsertProfileDetails,
  isValidRole,
  isValidLookingFor,
  isValidOrientation,
  isValidZodiacSign,
  isValidAlcohol,
  isValidTobacco,
  isValidExercise,
  isValidPets,
  getTutorialCompletedAt,
  markTutorialCompleted,
  getShowOnMap,
  setShowOnMap,
  getMapOptOutIds,
  getInvisibleMode,
  setInvisibleMode,
} from "../lib/profile-details.js";
import {
  getUserInterests,
  getUserInterestsForUsers,
  setUserInterests,
} from "../lib/user-interests.js";
import { getPhotoCountsForUsers } from "../lib/photos.js";
import { LikeProfileBody, UpdateMapVisibilityBody } from "@workspace/api-zod";

const router = Router();

const PUBLIC_COLUMNS =
  "id, username, bio, avatar_url, age, city, gender, location, created_at, latitude, longitude, last_active_at, is_verified, plan";

/** Minimum bio length for a profile to count as complete (calidad mínima). */
const MIN_BIO_LENGTH = 10;

type ProfileRow = {
  id: string;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  age: number | null;
  city: string | null;
  gender: string | null;
  location: string | null;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  last_active_at: string | null;
  is_verified: boolean | null;
  plan: string | null;
};

type PublicPlan = "free" | "plus" | "gold";

/** Mirror of entitlement normalization: anything but a known paid tier is free. */
function normalizePlan(plan: string | null): PublicPlan {
  if (plan === "gold" || plan === "plus") return plan;
  return "free";
}

/** Priority-visibility ranking for the world map (gold first, then plus). */
const PLAN_RANK: Record<PublicPlan, number> = { gold: 2, plus: 1, free: 0 };

/**
 * "Completitud" score used as a Descubrir priority signal. Every profile that
 * reaches this point already passes calidad mínima, so this rewards going
 * *beyond* the minimum: a fuller photo gallery and a richer bio. Higher = more
 * complete. Used to surface more-complete profiles first (under verified).
 */
function completenessScore(bio: string | null, photoCount: number): number {
  let score = Math.min(photoCount, 4); // 0..4 gallery richness
  const bioLen = bio?.trim().length ?? 0;
  if (bioLen >= 80) score += 2;
  else if (bioLen >= 30) score += 1;
  return score;
}

const MAP_SCOPES = [
  "nearby",
  "province",
  "spain",
  "europe",
  "worldwide",
] as const;

function parseScope(value: unknown): MapScope | null {
  return typeof value === "string" &&
    (MAP_SCOPES as readonly string[]).includes(value)
    ? (value as MapScope)
    : null;
}

// ---------------------------------------------------------------------------
// Activity-based discovery feeds
// ---------------------------------------------------------------------------
const VALID_FEEDS = [
  "recommended",
  "online",
  "new",
  "popular",
  "compatible",
] as const;
type DiscoverFeed = (typeof VALID_FEEDS)[number];

function parseFeed(value: unknown): DiscoverFeed {
  return typeof value === "string" &&
    (VALID_FEEDS as readonly string[]).includes(value)
    ? (value as DiscoverFeed)
    : "recommended";
}

/**
 * Compatibility score for the "compatible" feed.
 * Scores viewer↔candidate role/looking_for matches + shared interest overlap.
 */
function compatScore(
  viewerRole: string | null,
  viewerLookingFor: string | null,
  viewerInterests: Set<string>,
  candidateDetails:
    | { role?: string | null; looking_for?: string | null }
    | undefined,
  candidateInterests: string[],
): number {
  let score = 0;
  if (viewerRole && candidateDetails?.looking_for === viewerRole) score += 3;
  if (viewerLookingFor && candidateDetails?.role === viewerLookingFor)
    score += 3;
  const overlap = candidateInterests.filter((i) => viewerInterests.has(i)).length;
  score += Math.min(overlap, 4);
  return score;
}

function toPublic(
  row: ProfileRow,
  viewer: { latitude: number | null; longitude: number | null } | null,
  likedSet: Set<string>,
  blockedSet: Set<string>,
  details?: {
    role?: string | null;
    looking_for?: string | null;
    orientation?: string | null;
    height_cm?: number | null;
    zodiac_sign?: string | null;
    alcohol?: string | null;
    tobacco?: string | null;
    exercise?: string | null;
    pets?: string | null;
    interests?: string[];
  } | null,
) {
  return {
    id: row.id,
    username: row.username,
    bio: row.bio,
    avatar_url: row.avatar_url,
    age: row.age,
    city: row.city,
    gender: row.gender,
    location: row.location,
    created_at: row.created_at,
    distance_km: distanceKm(
      viewer?.latitude,
      viewer?.longitude,
      row.latitude,
      row.longitude,
    ),
    last_active_at: row.last_active_at ?? null,
    is_online: isOnline(row.last_active_at),
    is_verified: Boolean(row.is_verified),
    liked_by_me: likedSet.has(row.id),
    blocked_by_me: blockedSet.has(row.id),
    plan: normalizePlan(row.plan),
    role: details?.role ?? null,
    looking_for: details?.looking_for ?? null,
    orientation: details?.orientation ?? null,
    height_cm: details?.height_cm ?? null,
    zodiac_sign: details?.zodiac_sign ?? null,
    alcohol: details?.alcohol ?? null,
    tobacco: details?.tobacco ?? null,
    exercise: details?.exercise ?? null,
    pets: details?.pets ?? null,
    interests: details?.interests ?? [],
  };
}

async function getLikedSet(userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("likes")
    .select("liked_id")
    .eq("liker_id", userId);
  return new Set((data ?? []).map((r) => r.liked_id as string));
}

router.get("/profiles", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const feed = parseFeed(req.query.feed);
  const sort = (req.query.sort as string) ?? "recent";
  const scope = parseScope(req.query.scope);

  // --- Advanced filter params (plan-gated) -----------------------------------
  const ageMin = req.query.age_min ? parseInt(req.query.age_min as string, 10) : null;
  const ageMax = req.query.age_max ? parseInt(req.query.age_max as string, 10) : null;
  const onlineOnly = req.query.online_only === "true";

  // Basic filters are free for all users.
  // Only verified_only requires Plus/Gold (scarce feature, quality gate).
  const callerPlan = await getPlan(auth.userId);
  const isPaid = callerPlan === "plus" || callerPlan === "gold";

  const verifiedOnly = isPaid && req.query.verified_only === "true";
  const filterRole = (req.query.role as string | undefined) ?? null;
  const filterLookingFor = (req.query.looking_for as string | undefined) ?? null;
  const filterOrientation = (req.query.orientation as string | undefined) ?? null;
  const distanceMaxKm = req.query.distance_max_km
    ? parseFloat(req.query.distance_max_km as string)
    : null;
  const countryOnly = req.query.country_only === "true";

  const { data: me } = await supabase
    .from("profiles")
    .select("latitude, longitude")
    .eq("id", auth.userId)
    .maybeSingle();

  // Pre-fetch viewer profile details for the "compatible" feed.
  let viewerRole: string | null = null;
  let viewerLookingFor: string | null = null;
  let viewerInterestSet = new Set<string>();
  if (feed === "compatible") {
    const [vd, vi] = await Promise.all([
      getProfileDetails(auth.userId),
      getUserInterests(auth.userId),
    ]);
    viewerRole = vd?.role ?? null;
    viewerLookingFor = vd?.looking_for ?? null;
    viewerInterestSet = new Set(vi ?? []);
  }

  // Resolve the scope's DB-side bounding box. A radius scope (nearby/province)
  // with no viewer coordinates yields an empty list rather than a 500.
  const box = scope ? scopeBoxFor(scope, me ?? null) : null;
  if (box === "empty") {
    res.json([]);
    return;
  }

  const likedSet = await getLikedSet(auth.userId);
  const passedSet = await getPassedIds(auth.userId);
  const { hidden, iBlocked } = await getVisibilityContext(auth.userId);

  // Descubrir never re-shows a profile the viewer already acted on. "Acted on"
  // = liked/superliked (Supabase like edge) ∪ passed/disliked (Replit Postgres
  // profile_passes). The JS filter below is the correctness backstop; this
  // DB-side exclusion (capped, since PostgREST IN lists can't be unbounded)
  // keeps those already-handled profiles from eating the 200-row candidate
  // budget. The cap means a heavily-active user may still get a few interacted
  // rows in the sample — the JS filter drops them — but never sees them surface.
  const interacted = new Set([...likedSet, ...passedSet]);

  // Push the bounding box into the query BEFORE limiting, so we don't merely
  // sample the most-recent 200 rows and then drop everything out of scope.
  // Calidad mínima: only complete profiles appear in Descubrir. The Supabase
  // columns (main photo, age, city, bio) are filtered DB-side BEFORE the limit
  // so we don't waste the 200-row budget on incomplete profiles; role/looking_for
  // (repo-owned Postgres) are refined in JS below.
  // `base` is annotated so the conditional reassignments below don't accumulate
  // an excessively-deep inferred type (TS2589). All filter methods return the
  // same builder type, so `typeof base` is a stable, type-safe cap.
  const base = supabase.from("profiles").select(PUBLIC_COLUMNS);
  let query: typeof base = base
    .neq("id", auth.userId)
    .not("username", "is", null)
    .not("avatar_url", "is", null)
    .not("age", "is", null)
    .gte("age", 18)
    .not("city", "is", null)
    .not("bio", "is", null);
  // DB-side age filters (applied before .limit so they shrink the sample).
  if (ageMin != null && !Number.isNaN(ageMin)) query = query.gte("age", Math.max(18, ageMin));
  if (ageMax != null && !Number.isNaN(ageMax)) query = query.lte("age", ageMax);
  if (verifiedOnly) query = query.eq("is_verified", true);
  if (box) {
    query = query
      .gte("latitude", box.latMin)
      .lte("latitude", box.latMax)
      .gte("longitude", box.lngMin)
      .lte("longitude", box.lngMax);
  }
  if (interacted.size > 0) {
    query = query.not(
      "id",
      "in",
      `(${Array.from(interacted).slice(0, 250).join(",")})`,
    );
  }
  // "online" feed: DB-side filter so we don't waste the 200-row budget on offline users.
  if (feed === "online") {
    const onlineThreshold = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    query = query.gte("last_active_at", onlineThreshold);
  }

  // "new" feed uses registration date; all others use activity date.
  const dbOrderCol: "created_at" | "last_active_at" =
    feed === "new" ? "created_at" : "last_active_at";

  const { data, error } = await query
    .order(dbOrderCol, { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) {
    req.log.error({ error: error.message }, "profiles GET list: error");
    res.status(500).json({ error: error.message });
    return;
  }

  let rows = (data as ProfileRow[]).filter(
    (row) => !hidden.has(row.id) && !interacted.has(row.id),
  );

  // Precise refinement for radius scopes (the box is an over-approximation).
  if (scope) {
    rows = rows.filter((row) =>
      withinMapScope(me ?? null, row.latitude, row.longitude, scope),
    );
  }

  // "Mi país" filter: restrict to the same country as the caller (bounding box).
  // When the caller has no coordinates, the filter is ignored (shows all).
  if (countryOnly) {
    const callerBbox = detectCountryBbox(me?.latitude, me?.longitude);
    if (callerBbox) {
      rows = rows.filter((row) =>
        row.latitude != null &&
        row.longitude != null &&
        row.latitude  >= callerBbox.latMin && row.latitude  <= callerBbox.latMax &&
        row.longitude >= callerBbox.lngMin && row.longitude <= callerBbox.lngMax,
      );
    }
  }

  // Calidad mínima (part 2): require a role + "qué busca" and a minimum bio.
  // role/looking_for live in the repo-owned Postgres, so batch-load them for
  // the surviving candidates and drop anyone still incomplete.
  const detailsMap = await getProfileDetailsForUsers(rows.map((r) => r.id));
  rows = rows.filter((row) => {
    const d = detailsMap.get(row.id);
    return (
      !!row.avatar_url &&
      row.age != null &&
      row.age >= 18 &&
      !!row.city?.trim() &&
      (row.bio?.trim().length ?? 0) >= MIN_BIO_LENGTH &&
      !!d?.role &&
      !!d?.looking_for
    );
  });

  // JS-side advanced filters (Plus/Gold gated already resolved above).
  if (filterRole) rows = rows.filter((r) => detailsMap.get(r.id)?.role === filterRole);
  if (filterLookingFor) rows = rows.filter((r) => detailsMap.get(r.id)?.looking_for === filterLookingFor);
  if (filterOrientation) rows = rows.filter((r) => detailsMap.get(r.id)?.orientation === filterOrientation);

  // Completitud score per surviving candidate (gallery size + bio richness),
  // used as a Descubrir priority below the verified badge. One batched photo
  // count over the final candidate set — no N+1.
  const [photoCounts, interestsMap] = await Promise.all([
    getPhotoCountsForUsers(rows.map((r) => r.id)),
    getUserInterestsForUsers(rows.map((r) => r.id)),
  ]);
  const completeness = new Map<string, number>();
  for (const row of rows) {
    completeness.set(
      row.id,
      completenessScore(row.bio, photoCounts.get(row.id) ?? 0),
    );
  }

  let profiles = rows.map((row) =>
    toPublic(row, me ?? null, likedSet, iBlocked, {
      ...detailsMap.get(row.id),
      interests: interestsMap.get(row.id) ?? [],
    }),
  );

  // Post-toPublic JS filters (need computed fields like is_online, distance_km).
  if (onlineOnly) profiles = profiles.filter((p) => p.is_online);
  if (distanceMaxKm != null && !Number.isNaN(distanceMaxKm)) {
    profiles = profiles.filter((p) => p.distance_km != null && p.distance_km <= distanceMaxKm);
  }

  // ---------------------------------------------------------------------------
  // Feed-specific base sort (weakest key — will be refined by priority layers).
  // ---------------------------------------------------------------------------
  if (feed === "online") {
    // Closest first; nulls go to the end.
    profiles.sort((a, b) => {
      if (a.distance_km != null && b.distance_km != null)
        return a.distance_km - b.distance_km;
      if (a.distance_km == null) return 1;
      if (b.distance_km == null) return -1;
      return 0;
    });
  } else if (feed === "popular") {
    // Count likes received for each candidate from Replit Postgres like_actions.
    const candidateIds = profiles.map((p) => p.id);
    if (candidateIds.length > 0) {
      const likeCounts = await db
        .select({
          likedId: likeActionsTable.likedId,
          cnt: drizzleSql<number>`count(*)::int`,
        })
        .from(likeActionsTable)
        .where(drizzleIn(likeActionsTable.likedId, candidateIds))
        .groupBy(likeActionsTable.likedId);
      const popMap = new Map(likeCounts.map((r) => [r.likedId, r.cnt]));
      profiles.sort((a, b) => (popMap.get(b.id) ?? 0) - (popMap.get(a.id) ?? 0));
    }
  } else if (feed === "compatible") {
    // Score by mutual role/looking_for match + shared interests.
    profiles.sort((a, b) => {
      const sB = compatScore(
        viewerRole, viewerLookingFor, viewerInterestSet,
        detailsMap.get(b.id), interestsMap.get(b.id) ?? [],
      );
      const sA = compatScore(
        viewerRole, viewerLookingFor, viewerInterestSet,
        detailsMap.get(a.id), interestsMap.get(a.id) ?? [],
      );
      return sB - sA;
    });
  } else if (!req.query.feed) {
    // Backward-compat: honour the legacy `sort` param when no feed is given.
    if (sort === "distance") {
      profiles.sort((a, b) => {
        if (a.distance_km == null) return 1;
        if (b.distance_km == null) return -1;
        return a.distance_km - b.distance_km;
      });
    } else if (sort === "online") {
      profiles.sort((a, b) => Number(b.is_online) - Number(a.is_online));
    }
  }
  // recommended + new: DB order (last_active_at / created_at) is already the base.

  // Descubrir priority layering. Array.sort is stable, so each pass preserves
  // the prior order as its tie-breaker; the LAST sort applied is the strongest
  // key. Order of strength (weakest → strongest): feed/sort < completitud < verified
  // < plan (Gold > Plus > free, always) < boost. Net result: boosted profiles
  // first, then Gold, then Plus, then verified, then completitud, then feed sort.
  profiles.sort(
    (a, b) => (completeness.get(b.id) ?? 0) - (completeness.get(a.id) ?? 0),
  );
  profiles.sort((a, b) => Number(b.is_verified) - Number(a.is_verified));
  profiles.sort((a, b) => PLAN_RANK[b.plan] - PLAN_RANK[a.plan]);

  // Boost: strongest sort key — boosted profiles always appear first.
  const boostedIds = await getActiveBoostedIds(profiles.map((p) => p.id));
  if (boostedIds.size > 0) {
    profiles.sort((a, b) => Number(boostedIds.has(b.id)) - Number(boostedIds.has(a.id)));
  }

  res.json(profiles);
});

// Real community totals shown on the map stat cards ("Usuarios Gold" / "En línea
// ahora"). Deliberately GLOBAL and decoupled from the markers: a marker requires
// coordinates + scope + map-visibility, but the counters must reflect the REAL
// data (e.g. the lone Gold user with no location still counts as 1). Includes the
// viewer (self is never in `hidden`) and excludes blocked/hidden users. Computed
// live per request, so it auto-updates when someone buys Gold (plan flips) or
// goes online/offline (last_active_at within the online window).
async function mapCommunityStats(
  hidden: Set<string>,
): Promise<{ goldTotal: number; onlineTotal: number }> {
  // Count all users who have a location — the map is now open to everyone.
  // `goldTotal` is repurposed as "total map-eligible users" (field name kept
  // for API/client compat so codegen doesn't need to run for this change).
  const { data, error } = await supabase
    .from("profiles")
    .select("id, last_active_at")
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .limit(5000);
  if (error || !data) return { goldTotal: 0, onlineTotal: 0 };
  const rows = (
    data as { id: string; last_active_at: string | null }[]
  ).filter((r) => !hidden.has(r.id));
  return {
    goldTotal: rows.length,
    onlineTotal: rows.filter((r) => isOnline(r.last_active_at)).length,
  };
}

// Real-time map — open to all authenticated users who share their location.
// Any user with location enabled can view and appear on the map. Messaging
// from the map requires Gold on the sender's side (enforced in the UI).
// `can_access` is always true for authenticated users; kept in the envelope
// so existing clients degrade gracefully. Raw coordinates never leave the
// server (toPublic exposes only a rounded distance_km).
router.get("/map/users", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const showOnMap = await getShowOnMap(auth.userId);

  // Fetch viewer profile and visibility context in parallel.
  const [{ hidden, iBlocked }, { data: me }] = await Promise.all([
    getVisibilityContext(auth.userId),
    supabase
      .from("profiles")
      .select("latitude, longitude, last_active_at")
      .eq("id", auth.userId)
      .maybeSingle(),
  ]);

  // Stats are global (no scope/search) — hold even when the marker list is empty.
  const stats = await mapCommunityStats(hidden);

  // Optional geocoding search center — when provided by the client (user typed a
  // location in the search bar), distances are computed from that point and only
  // users within `search_radius_km` are returned, regardless of the viewer's GPS.
  const rawSearchLat = req.query.search_lat;
  const rawSearchLng = req.query.search_lng;
  const rawSearchRadius = req.query.search_radius_km;
  const searchLat = rawSearchLat != null ? parseFloat(rawSearchLat as string) : null;
  const searchLng = rawSearchLng != null ? parseFloat(rawSearchLng as string) : null;
  const searchRadiusKm = rawSearchRadius != null ? parseFloat(rawSearchRadius as string) : null;
  const searchCenter =
    searchLat != null &&
    searchLng != null &&
    !isNaN(searchLat) &&
    !isNaN(searchLng)
      ? { latitude: searchLat, longitude: searchLng }
      : null;

  const scope = parseScope(req.query.scope);

  // Determine bounding box: search center overrides scope when present.
  let box: ReturnType<typeof scopeBoxFor> | ReturnType<typeof boxAround> =
    scope ? scopeBoxFor(scope, me ?? null) : null;
  if (searchCenter && searchRadiusKm != null && !isNaN(searchRadiusKm)) {
    box = boxAround(searchCenter.latitude, searchCenter.longitude, searchRadiusKm);
  }

  if (box === "empty") {
    res.json({
      can_access: true,
      show_on_map: showOnMap,
      users: [],
      gold_total: stats.goldTotal,
      online_total: stats.onlineTotal,
    });
    return;
  }

  const likedSet = await getLikedSet(auth.userId);

  // All users WITH coordinates that pass calidad mínima appear on the map.
  // Supabase columns (coords/main photo/age/city/bio) are filtered DB-side
  // before the limit; role/looking_for (repo-owned Postgres) are refined in JS.
  let query = supabase
    .from("profiles")
    .select(PUBLIC_COLUMNS)
    .neq("id", auth.userId)
    .not("username", "is", null)
    .not("avatar_url", "is", null)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .not("age", "is", null)
    .gte("age", 18)
    .not("city", "is", null)
    .not("bio", "is", null);
  if (box) {
    query = query
      .gte("latitude", box.latMin)
      .lte("latitude", box.latMax)
      .gte("longitude", box.lngMin)
      .lte("longitude", box.lngMax);
  }

  const { data, error } = await query
    .order("last_active_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) {
    req.log.error({ error: error.message }, "map/users GET: error");
    res.status(500).json({ error: error.message });
    return;
  }

  let rows = (data as ProfileRow[]).filter((row) => !hidden.has(row.id));

  // Precise haversine refinement:
  // - For a geocoding search: filter by exact radius around the search center.
  // - For a scope-based request: use the existing withinMapScope helper.
  if (searchCenter && searchRadiusKm != null && !isNaN(searchRadiusKm)) {
    rows = rows.filter(
      (row) =>
        row.latitude != null &&
        row.longitude != null &&
        haversineKm(
          searchCenter.latitude,
          searchCenter.longitude,
          row.latitude,
          row.longitude,
        ) <= searchRadiusKm,
    );
  } else if (scope) {
    rows = rows.filter((row) =>
      withinMapScope(me ?? null, row.latitude, row.longitude, scope),
    );
  }

  // "Mostrarme en el mapa": drop anyone who opted out (invisible to everyone).
  const optedOut = await getMapOptOutIds(rows.map((r) => r.id));
  rows = rows.filter((row) => !optedOut.has(row.id));

  // Calidad mínima (part 2): require role + "qué busca" and a minimum bio.
  const detailsMap = await getProfileDetailsForUsers(rows.map((r) => r.id));
  rows = rows.filter((row) => {
    const d = detailsMap.get(row.id);
    return (
      !!row.avatar_url &&
      row.age != null &&
      row.age >= 18 &&
      !!row.city?.trim() &&
      (row.bio?.trim().length ?? 0) >= MIN_BIO_LENGTH &&
      !!d?.role &&
      !!d?.looking_for
    );
  });

  // Distance origin: use the geocoding search center when active, otherwise
  // fall back to the viewer's own location (or null for relative-less display).
  const distanceOrigin = searchCenter ?? me ?? null;

  const mapInterestsMap = await getUserInterestsForUsers(rows.map((r) => r.id));
  const users = rows.map((row) => ({
    ...toPublic(row, distanceOrigin, likedSet, iBlocked, {
      ...detailsMap.get(row.id),
      interests: mapInterestsMap.get(row.id) ?? [],
    }),
    // Approximate coordinates for map marker placement (~1 km precision).
    // Rounding to 2 decimal places (~1.1 km at mid-latitudes) preserves privacy
    // while placing markers in the correct area instead of a random bearing.
    lat_approx: row.latitude != null ? Math.round(row.latitude * 100) / 100 : null,
    lng_approx: row.longitude != null ? Math.round(row.longitude * 100) / 100 : null,
  }));

  // Closest first (strongest key), online users winning ties (stable sort).
  users.sort((a, b) => Number(b.is_online) - Number(a.is_online));
  users.sort((a, b) => {
    if (a.distance_km == null) return 1;
    if (b.distance_km == null) return -1;
    return a.distance_km - b.distance_km;
  });

  res.json({
    can_access: true,
    show_on_map: showOnMap,
    users,
    gold_total: stats.goldTotal,
    online_total: stats.onlineTotal,
  });
});

// NOTE: must be registered BEFORE `GET /profiles/:id` or "stats" is captured
// as an `:id` param.
router.get("/profiles/stats", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const scope = parseScope(req.query.scope);

  const { data: me } = await supabase
    .from("profiles")
    .select("latitude, longitude")
    .eq("id", auth.userId)
    .maybeSingle();

  const box = scope ? scopeBoxFor(scope, me ?? null) : null;
  if (box === "empty") {
    res.json({ registered: 0, online: 0 });
    return;
  }

  const hidden = await getHiddenIds(auth.userId);

  let query = supabase
    .from("profiles")
    .select("id, latitude, longitude, last_active_at")
    .neq("id", auth.userId)
    .not("username", "is", null);
  if (box) {
    query = query
      .gte("latitude", box.latMin)
      .lte("latitude", box.latMax)
      .gte("longitude", box.lngMin)
      .lte("longitude", box.lngMax);
  }

  // Counts are computed in JS because the hiding rules are viewer-relative
  // (block sets + deactivations) and radius scopes need haversine, so a
  // Supabase head:true count cannot be correct. Capped for early-stage scale.
  const { data, error } = await query.limit(5000);

  if (error) {
    req.log.error({ error: error.message }, "profiles/stats: error");
    res.status(500).json({ error: error.message });
    return;
  }

  type StatRow = {
    id: string;
    latitude: number | null;
    longitude: number | null;
    last_active_at: string | null;
  };

  let rows = (data as StatRow[]).filter((row) => !hidden.has(row.id));
  if (scope) {
    rows = rows.filter((row) =>
      withinMapScope(me ?? null, row.latitude, row.longitude, scope),
    );
  }

  const registered = rows.length;
  const online = rows.filter((row) => isOnline(row.last_active_at)).length;

  res.json({ registered, online });
});

router.get("/profiles/me", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", auth.userId)
    .maybeSingle();

  if (error) {
    req.log.error({ error: error.message }, "profiles/me: query error");
    res.status(500).json({ error: error.message });
    return;
  }

  if (!data) {
    const { data: created, error: createError } = await supabase
      .from("profiles")
      .upsert({ id: auth.userId }, { onConflict: "id" })
      .select()
      .single();

    if (createError) {
      req.log.error({ error: createError.message }, "profiles/me: auto-create error");
      res.status(500).json({ error: createError.message });
      return;
    }

    res.json({
      ...created,
      role: null,
      looking_for: null,
      tutorial_completed: false,
      map_privacy_acked: false,
      live_privacy_acked: false,
      is_system: await isSystemAccount(auth.userId),
    });
    return;
  }

  const [details, tutorialCompletedAt, isSystem, interests, privacyAcks, invisibleMode] = await Promise.all([
    getProfileDetails(auth.userId),
    getTutorialCompletedAt(auth.userId),
    isSystemAccount(auth.userId),
    getUserInterests(auth.userId),
    getPrivacyAcks(auth.userId),
    getInvisibleMode(auth.userId),
  ]);
  res.json({
    ...data,
    ...details,
    interests,
    tutorial_completed: tutorialCompletedAt != null,
    is_system: isSystem,
    map_privacy_acked: privacyAcks.mapAcked,
    live_privacy_acked: privacyAcks.liveAcked,
    invisible_mode: invisibleMode,
  });
});

router.put("/profiles/me", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const {
    username, bio, age, city, gender, location, avatar_url,
    role, looking_for,
    orientation, height_cm, zodiac_sign, alcohol, tobacco, exercise, pets,
  } = req.body as {
    username?: string;
    bio?: string;
    age?: number;
    city?: string;
    gender?: string;
    location?: string;
    avatar_url?: string;
    role?: string;
    looking_for?: string;
    orientation?: string;
    height_cm?: number;
    zodiac_sign?: string;
    alcohol?: string;
    tobacco?: string;
    exercise?: string;
    pets?: string;
  };

  if (role !== undefined && !isValidRole(role)) {
    res.status(400).json({ error: "invalid role" });
    return;
  }
  if (looking_for !== undefined && !isValidLookingFor(looking_for)) {
    res.status(400).json({ error: "invalid looking_for" });
    return;
  }
  if (orientation !== undefined && !isValidOrientation(orientation)) {
    res.status(400).json({ error: "invalid orientation" });
    return;
  }
  if (
    height_cm !== undefined &&
    (typeof height_cm !== "number" || height_cm < 100 || height_cm > 250)
  ) {
    res.status(400).json({ error: "height_cm must be between 100 and 250" });
    return;
  }
  if (zodiac_sign !== undefined && !isValidZodiacSign(zodiac_sign)) {
    res.status(400).json({ error: "invalid zodiac_sign" });
    return;
  }
  if (alcohol !== undefined && !isValidAlcohol(alcohol)) {
    res.status(400).json({ error: "invalid alcohol" });
    return;
  }
  if (tobacco !== undefined && !isValidTobacco(tobacco)) {
    res.status(400).json({ error: "invalid tobacco" });
    return;
  }
  if (exercise !== undefined && !isValidExercise(exercise)) {
    res.status(400).json({ error: "invalid exercise" });
    return;
  }
  if (pets !== undefined && !isValidPets(pets)) {
    res.status(400).json({ error: "invalid pets" });
    return;
  }
  if (
    age !== undefined &&
    (typeof age !== "number" || !Number.isInteger(age) || age < 18)
  ) {
    res
      .status(400)
      .json({ error: "Debes tener al menos 18 años para usar KixxMe." });
    return;
  }

  const record: Record<string, unknown> = {
    id: auth.userId,
    updated_at: new Date().toISOString(),
  };
  if (username !== undefined) record.username = username;
  if (bio !== undefined) record.bio = bio;
  if (age !== undefined) record.age = age;
  if (city !== undefined) record.city = city;
  if (gender !== undefined) record.gender = gender;
  if (location !== undefined) record.location = location;
  if (avatar_url !== undefined) record.avatar_url = avatar_url;

  const { data, error } = await supabase
    .from("profiles")
    .upsert(record, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    req.log.error({ error: error.message, code: error.code }, "profiles/me PUT: upsert error");
    res.status(400).json({ error: error.message });
    return;
  }

  // Repo-owned extra fields (Replit Postgres). Only the provided ones are
  // written (omitted keys are left untouched); on failure surface a 500 so the
  // client can retry rather than silently dropping the edit.
  const hasDetails = role !== undefined || looking_for !== undefined ||
    orientation !== undefined || height_cm !== undefined || zodiac_sign !== undefined ||
    alcohol !== undefined || tobacco !== undefined || exercise !== undefined || pets !== undefined;
  if (hasDetails) {
    try {
      await upsertProfileDetails(auth.userId, {
        role,
        lookingFor: looking_for,
        orientation,
        heightCm: height_cm,
        zodiacSign: zodiac_sign,
        alcohol,
        tobacco,
        exercise,
        pets,
      });
    } catch (e) {
      req.log.error(
        { error: e instanceof Error ? e.message : String(e) },
        "profiles/me PUT: profile_details upsert error",
      );
      res.status(500).json({ error: "Could not save profile details" });
      return;
    }
  }

  const [details, tutorialCompletedAt] = await Promise.all([
    getProfileDetails(auth.userId),
    getTutorialCompletedAt(auth.userId),
  ]);
  res.json({ ...data, ...details, tutorial_completed: tutorialCompletedAt != null });
});

// Mark the mandatory onboarding tutorial as completed (idempotent set-once).
// Returns the full owner profile so the client can prime its cache and move on
// to the mandatory-profile step without an extra round trip.
router.get("/profiles/me/interests", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const interests = await getUserInterests(auth.userId);
  res.json({ interests });
});

router.put("/profiles/me/interests", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  try {
    const interests = await setUserInterests(auth.userId, req.body?.interests ?? []);
    res.json({ interests });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post("/profiles/me/tutorial", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  await markTutorialCompleted(auth.userId);

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", auth.userId)
    .maybeSingle();

  if (error) {
    req.log.error({ error: error.message }, "profiles/me/tutorial: query error");
    res.status(500).json({ error: error.message });
    return;
  }

  const details = await getProfileDetails(auth.userId);
  res.json({ ...(data ?? { id: auth.userId }), ...details, tutorial_completed: true });
});

router.put("/profiles/me/location", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { latitude, longitude } = req.body as {
    latitude?: number;
    longitude?: number;
  };

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    res.status(400).json({ error: "latitude and longitude must be numbers" });
    return;
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({
      latitude,
      longitude,
      location_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.userId)
    .select()
    .single();

  if (error) {
    req.log.error({ error: error.message }, "profiles/me/location PUT: error");
    res.status(400).json({ error: error.message });
    return;
  }

  res.json(data);
});

// Toggle "Mostrarme en el mapa". When off, the user is excluded from every other
// Gold user's map (getMapOptOutIds). Touches only show_on_map — never clobbers
// role/looking_for. Registered before `/profiles/:id` (static path wins).
router.put("/profiles/me/map-visibility", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const parsed = UpdateMapVisibilityBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "show_on_map must be a boolean" });
    return;
  }

  await setShowOnMap(auth.userId, parsed.data.show_on_map);
  res.json({ show_on_map: parsed.data.show_on_map });
});

router.post("/profiles/me/map-privacy-ack", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  await ackMapPrivacy(auth.userId);
  res.status(204).end();
});

router.post("/profiles/me/live-privacy-ack", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  await ackLivePrivacy(auth.userId);
  res.status(204).end();
});

// Invisible mode (Gold only) — skip visitor footprint when viewing profiles
router.put("/profiles/me/invisible-mode", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const plan = await getPlan(auth.userId);
  if (plan !== "gold") {
    res.status(402).json({ error: "Se requiere Gold para el modo invisible" });
    return;
  }
  const body = req.body as { invisible_mode?: unknown };
  if (typeof body.invisible_mode !== "boolean") {
    res.status(400).json({ error: "invisible_mode must be a boolean" });
    return;
  }
  await setInvisibleMode(auth.userId, body.invisible_mode);
  res.json({ success: true });
});

// Username search (used by Discover search bar)
router.get("/profiles/search", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) { res.json([]); return; }

  const { hidden } = await getVisibilityContext(auth.userId);
  const hiddenIds = [...hidden];

  const { data: rows } = await supabase
    .from("profiles")
    .select(PUBLIC_COLUMNS)
    .ilike("username", `%${q}%`)
    .neq("id", auth.userId)
    .limit(20);

  if (!rows?.length) { res.json([]); return; }

  const visible = rows.filter((r) => !hiddenIds.includes(r.id));
  if (!visible.length) { res.json([]); return; }

  const detailsMap = await getProfileDetailsForUsers(visible.map((r) => r.id));
  const profiles = visible.map((r) =>
    toPublic(r as ProfileRow, null, new Set(), new Set(), {
      ...detailsMap.get(r.id),
      interests: [],
    }),
  );
  res.json(profiles);
});

router.get("/profiles/me/likes", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { data: likes } = await supabase
    .from("likes")
    .select("liked_id")
    .eq("liker_id", auth.userId);

  const ids = (likes ?? []).map((r) => r.liked_id as string);
  if (ids.length === 0) {
    res.json([]);
    return;
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("latitude, longitude")
    .eq("id", auth.userId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("profiles")
    .select(PUBLIC_COLUMNS)
    .in("id", ids);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Which of my likes are mutual (the other user liked me back) → matched=true,
  // so the Cuadrícula can badge matches. One batched query over the people who
  // liked me, intersected with my outgoing likes.
  const { data: incoming } = await supabase
    .from("likes")
    .select("liker_id")
    .eq("liked_id", auth.userId)
    .in("liker_id", ids);
  const matchedSet = new Set((incoming ?? []).map((r) => r.liker_id as string));

  const likedSet = new Set(ids);
  const { hidden, iBlocked } = await getVisibilityContext(auth.userId);
  const favRows = (data as ProfileRow[]).filter((row) => !hidden.has(row.id));
  const [favDetailsMap, favInterestsMap] = await Promise.all([
    getProfileDetailsForUsers(favRows.map((r) => r.id)),
    getUserInterestsForUsers(favRows.map((r) => r.id)),
  ]);
  res.json(
    favRows.map((row) => ({
      ...toPublic(row, me ?? null, likedSet, iBlocked, {
        ...favDetailsMap.get(row.id),
        interests: favInterestsMap.get(row.id) ?? [],
      }),
      matched: matchedSet.has(row.id),
    })),
  );
});

router.get("/likes/received", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { hidden } = await getVisibilityContext(auth.userId);
  const result = await getReceivedLikes(auth.userId, hidden);
  res.json(result);
});

router.get("/profiles/me/boost", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const status = await getBoostStatus(auth.userId);
  res.json(status);
});

router.post("/profiles/me/boost", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const result = await activateBoost(auth.userId);
  if (!result.ok) {
    if (result.reason === "already_active") {
      res.status(409).json({ error: "Ya tienes un boost activo." });
      return;
    }
    res
      .status(402)
      .json({ error: `Necesitas ${5} créditos de like para activar un boost.` });
    return;
  }
  res.json(result.status);
});

router.get("/profiles/:id/photos", async (req, res) => {
  const { id } = req.params;

  // An unavailable user (deactivated or moderated) is hidden everywhere: don't
  // expose their photos.
  if (await isUnavailable(id)) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const { data, error } = await supabase
    .from("profile_photos")
    .select("*")
    .eq("user_id", id)
    .order("position", { ascending: true });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data ?? []);
});

router.post("/profiles/:id/like", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { id } = req.params;
  if (id === auth.userId) {
    res.status(400).json({ error: "Cannot like yourself" });
    return;
  }

  const parsed = LikeProfileBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Solicitud inválida" });
    return;
  }
  const kind = parsed.data.kind ?? "like";

  if (await isBlockedBetween(auth.userId, id)) {
    res.status(403).json({ error: "No puedes dar me gusta a este usuario" });
    return;
  }

  if (await isUnavailable(id)) {
    res.status(404).json({ error: "Perfil no disponible" });
    return;
  }

  const result = await recordLike(auth.userId, id, kind);

  if (!result.ok) {
    if (result.reason === "limit") {
      const message =
        result.kind === "superlike"
          ? "Has usado todos tus SuperLikes. Consigue más con KixxMe Plus o Gold."
          : "Has alcanzado tu límite de likes. Vuelve más tarde o desbloquea KixxMe Plus para likes ilimitados.";
      res.status(429).json({ error: message });
      return;
    }
    req.log.error({ error: result.message }, "like POST: error");
    res.status(400).json({ error: result.message });
    return;
  }

  // Engagement emails (fire-and-forget, never throw). A mutual Match emails
  // BOTH users; otherwise a SuperLike emails its recipient. Match takes
  // precedence so a SuperLike that matches sends the (more exciting) Match
  // email instead of the SuperLike one — mirroring the in-app behaviour.
  // Gated on `firstEdge`: only a NEW like emits an email, so repeat/duplicate
  // likes (unlimited for Plus/Gold) can't re-spam the recipient.
  if (result.firstEdge) {
    if (result.matched) {
      void notifyMatchByEmail(auth.userId, id);
      void pushMatch(auth.userId, id);
    } else if (result.isSuper) {
      void notifySuperLikeByEmail(id, auth.userId);
      void pushSuperLike(id, auth.userId);
    } else {
      // Regular like — notify the recipient (rate-limited to once per 24 h per sender).
      void notifyLikeByEmail(id, auth.userId);
    }
  }

  // On a mutual match, auto-create the conversation so a thread appears in
  // Mensajes for both users immediately (both may then chat free). Idempotent
  // and self-healing — called on EVERY match, not just the first edge — and
  // best-effort: a hiccup here must never fail the like itself.
  if (result.matched) {
    try {
      await ensureConversation(auth.userId, id);
    } catch (err) {
      req.log.error(
        { error: err instanceof Error ? err.message : String(err) },
        "like POST: ensureConversation failed",
      );
    }
  }

  res.status(201).json({
    matched: result.matched,
    is_super: result.isSuper,
    already_processed: result.alreadyProcessed,
    quota: result.quota,
  });
});

router.delete("/profiles/:id/like", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { id } = req.params;
  const { error } = await supabase
    .from("likes")
    .delete()
    .eq("liker_id", auth.userId)
    .eq("liked_id", id);

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({ success: true });
});

// Pass ("no me interesa"): record a free, unlimited, idempotent dismissal so
// the profile stops appearing in Descubrir. Creates no Supabase like edge and
// never charges quota/credits. Repeat passes are no-ops.
router.post("/profiles/:id/pass", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { id } = req.params;
  if (id === auth.userId) {
    res.status(400).json({ error: "Cannot pass yourself" });
    return;
  }

  try {
    await recordPass(auth.userId, id);
  } catch (err) {
    req.log.error(
      { error: err instanceof Error ? err.message : String(err) },
      "pass POST: error",
    );
    res.status(400).json({ error: "No se pudo registrar la acción" });
    return;
  }

  res.json({ success: true });
});

router.post("/profiles/:id/block", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { id } = req.params;
  if (id === auth.userId) {
    res.status(400).json({ error: "Cannot block yourself" });
    return;
  }

  try {
    await addBlock(auth.userId, id);
  } catch (e) {
    req.log.error({ error: (e as Error).message }, "block POST: error");
    res.status(400).json({ error: "Could not block user" });
    return;
  }

  res.status(201).json({ success: true });
});

router.delete("/profiles/:id/block", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { id } = req.params;
  try {
    await removeBlock(auth.userId, id);
  } catch (e) {
    req.log.error({ error: (e as Error).message }, "unblock DELETE: error");
    res.status(400).json({ error: "Could not unblock user" });
    return;
  }

  res.json({ success: true });
});

// Must be registered BEFORE "/profiles/:id" so Express doesn't capture the
// literal "blocks" as the :id param.
router.get("/profiles/blocks", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { iBlocked } = await getBlockRelations(auth.userId);
  const ids = [...iBlocked];
  if (ids.length === 0) {
    res.json([]);
    return;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(PUBLIC_COLUMNS)
    .in("id", ids);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Everyone in this list is blocked-by-me by definition; keep ordering stable
  // by most-recently-blocked is not tracked, so sort by username for a calm UI.
  const blockedSet = new Set(ids);
  const rows = (data as ProfileRow[])
    .map((row) => toPublic(row, null, new Set<string>(), blockedSet))
    .sort((a, b) =>
      (a.username ?? "").localeCompare(b.username ?? "", "es", {
        sensitivity: "base",
      }),
    );
  res.json(rows);
});

// "En línea": a directory of currently-online users, visible to everyone. Unlike
// the swipe deck this does NOT exclude profiles the viewer already liked/passed
// (it's a who's-online list, not a deck), but it applies the same calidad mínima
// and visibility (block/deactivation/moderation) filters. Mirrors /profiles/stats'
// JS isOnline() filter rather than a DB time predicate.
router.get("/profiles/online", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { data: me } = await supabase
    .from("profiles")
    .select("latitude, longitude")
    .eq("id", auth.userId)
    .maybeSingle();

  const likedSet = await getLikedSet(auth.userId);
  const { hidden, iBlocked } = await getVisibilityContext(auth.userId);

  const { data, error } = await supabase
    .from("profiles")
    .select(PUBLIC_COLUMNS)
    .neq("id", auth.userId)
    .not("username", "is", null)
    .not("avatar_url", "is", null)
    .not("age", "is", null)
    .gte("age", 18)
    .not("city", "is", null)
    .not("bio", "is", null)
    .order("last_active_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) {
    req.log.error({ error: error.message }, "profiles/online GET: error");
    res.status(500).json({ error: error.message });
    return;
  }

  let rows = (data as ProfileRow[]).filter(
    (row) => !hidden.has(row.id) && isOnline(row.last_active_at),
  );

  // Calidad mínima (part 2): role + "qué busca" + minimum bio (Postgres-side).
  const detailsMap = await getProfileDetailsForUsers(rows.map((r) => r.id));
  rows = rows.filter((row) => {
    const d = detailsMap.get(row.id);
    return (
      !!row.avatar_url &&
      row.age != null &&
      row.age >= 18 &&
      !!row.city?.trim() &&
      (row.bio?.trim().length ?? 0) >= MIN_BIO_LENGTH &&
      !!d?.role &&
      !!d?.looking_for
    );
  });

  const onlineInterestsMap = await getUserInterestsForUsers(rows.map((r) => r.id));
  res.json(rows.map((row) => toPublic(row, me ?? null, likedSet, iBlocked, {
    ...detailsMap.get(row.id),
    interests: onlineInterestsMap.get(row.id) ?? [],
  })));
});

// "Empareja": the viewer's mutual matches (both liked each other). Excludes
// blocked/deactivated/moderated users; every item carries matched=true.
router.get("/profiles/me/matches", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const [{ data: outgoing }, { data: incoming }] = await Promise.all([
    supabase.from("likes").select("liked_id").eq("liker_id", auth.userId),
    supabase.from("likes").select("liker_id").eq("liked_id", auth.userId),
  ]);

  const likedIds = new Set((outgoing ?? []).map((r) => r.liked_id as string));
  const matchedIds = (incoming ?? [])
    .map((r) => r.liker_id as string)
    .filter((likerId) => likedIds.has(likerId));

  if (matchedIds.length === 0) {
    res.json([]);
    return;
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("latitude, longitude")
    .eq("id", auth.userId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("profiles")
    .select(PUBLIC_COLUMNS)
    .in("id", matchedIds);

  if (error) {
    req.log.error({ error: error.message }, "profiles/me/matches GET: error");
    res.status(500).json({ error: error.message });
    return;
  }

  const likedSet = new Set(matchedIds);
  const { hidden, iBlocked } = await getVisibilityContext(auth.userId);
  const matchRows = (data as ProfileRow[]).filter((row) => !hidden.has(row.id));
  const [matchDetailsMap, matchInterestsMap] = await Promise.all([
    getProfileDetailsForUsers(matchRows.map((r) => r.id)),
    getUserInterestsForUsers(matchRows.map((r) => r.id)),
  ]);
  res.json(
    matchRows.map((row) => ({
      ...toPublic(row, me ?? null, likedSet, iBlocked, {
        ...matchDetailsMap.get(row.id),
        interests: matchInterestsMap.get(row.id) ?? [],
      }),
      matched: true,
    })),
  );
});

router.get("/profiles/:id", async (req, res) => {
  const { id } = req.params;
  const viewer = await optionalAuth(req);

  // An unavailable user (deactivated or moderated) is hidden everywhere; treat
  // their profile as not found.
  if (await isUnavailable(id)) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(PUBLIC_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  let me: { latitude: number | null; longitude: number | null } | null = null;
  let likedSet = new Set<string>();
  let blockedSet = new Set<string>();
  if (viewer) {
    const { data: meRow } = await supabase
      .from("profiles")
      .select("latitude, longitude")
      .eq("id", viewer.userId)
      .maybeSingle();
    me = meRow ?? null;
    likedSet = await getLikedSet(viewer.userId);
    blockedSet = (await getBlockRelations(viewer.userId)).iBlocked;
  }

  // Record the visit for "who viewed my profile". Fire-and-forget, throttled,
  // and skipped when either user has blocked the other OR the viewer has
  // invisible mode on (Gold feature: browse without leaving footprints).
  if (viewer && viewer.userId !== id) {
    void (async () => {
      const [blocked, viewerIsInvisible] = await Promise.all([
        isBlockedBetween(viewer.userId, id),
        getInvisibleMode(viewer.userId),
      ]);
      if (!blocked && !viewerIsInvisible) {
        await recordProfileVisit(viewer.userId, id);
      }
    })();
  }

  const [details, interests] = await Promise.all([
    getProfileDetails(id),
    getUserInterests(id),
  ]);
  res.json(toPublic(data as ProfileRow, me, likedSet, blockedSet, { ...details, interests }));
});

/**
 * "Who viewed my profile". Everyone gets the deduped `count` (excluding blocked
 * / deactivated / moderated viewers); visitor identities are revealed only to
 * Plus and Gold (`can_see_visitors`). Free users get an empty list + the upsell.
 */
router.get("/me/visitors", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const [{ hidden }, plan] = await Promise.all([
    getVisibilityContext(auth.userId),
    getPlan(auth.userId),
  ]);
  const canSee = plan !== "free";
  const count = await countVisitors(auth.userId, hidden);

  if (!canSee) {
    res.json({ count, can_see_visitors: false, visitors: [] });
    return;
  }

  const rows = await listVisitors(auth.userId, hidden, 50);
  const ids = rows.map((r) => r.viewerId);
  const profileMap = new Map<string, ProfileRow>();
  if (ids.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, avatar_url, age, city, is_verified, plan")
      .in("id", ids);
    for (const p of (data ?? []) as ProfileRow[]) {
      profileMap.set(p.id, p);
    }
  }

  const visitors = rows
    .map((r) => {
      const p = profileMap.get(r.viewerId);
      if (!p) return null;
      return {
        id: p.id,
        username: p.username ?? null,
        avatar_url: p.avatar_url ?? null,
        age: p.age ?? null,
        city: p.city ?? null,
        is_verified: Boolean(p.is_verified),
        plan: normalizePlan(p.plan),
        visited_at: r.lastVisitedAt.toISOString(),
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  res.json({ count, can_see_visitors: true, visitors });
});

router.post("/profiles/me/avatar", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { base64, mime_type, filename } = req.body as {
    base64?: string;
    mime_type?: string;
    filename?: string;
  };

  if (!base64 || !mime_type || !filename) {
    res.status(400).json({ error: "base64, mime_type, and filename are required" });
    return;
  }

  const buffer = Buffer.from(base64, "base64");
  const storagePath = `${auth.userId}/${filename}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(storagePath, buffer, { contentType: mime_type, upsert: true });

  if (uploadError) {
    res.status(400).json({ error: uploadError.message });
    return;
  }

  const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(storagePath);
  const avatarUrl = urlData.publicUrl;

  await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq("id", auth.userId);

  res.json({ avatar_url: avatarUrl });
});

export default router;
