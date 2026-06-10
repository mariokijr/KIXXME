import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, optionalAuth } from "../lib/auth.js";
import {
  distanceKm,
  isOnline,
  scopeBoxFor,
  withinMapScope,
  type MapScope,
} from "../lib/geo.js";
import {
  getBlockRelations,
  isBlockedBetween,
  addBlock,
  removeBlock,
} from "../lib/blocks.js";
import { isDeactivated } from "../lib/account.js";
import { getVisibilityContext, getHiddenIds } from "../lib/visibility.js";
import { recordLike } from "../lib/likes.js";
import { LikeProfileBody } from "@workspace/api-zod";

const router = Router();

const PUBLIC_COLUMNS =
  "id, username, bio, avatar_url, age, city, gender, location, created_at, latitude, longitude, last_active_at, is_verified, plan";

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

function toPublic(
  row: ProfileRow,
  viewer: { latitude: number | null; longitude: number | null } | null,
  likedSet: Set<string>,
  blockedSet: Set<string>,
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
    is_online: isOnline(row.last_active_at),
    is_verified: Boolean(row.is_verified),
    liked_by_me: likedSet.has(row.id),
    blocked_by_me: blockedSet.has(row.id),
    plan: normalizePlan(row.plan),
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

  const sort = (req.query.sort as string) ?? "recent";
  const scope = parseScope(req.query.scope);

  const { data: me } = await supabase
    .from("profiles")
    .select("latitude, longitude")
    .eq("id", auth.userId)
    .maybeSingle();

  // Resolve the scope's DB-side bounding box. A radius scope (nearby/province)
  // with no viewer coordinates yields an empty list rather than a 500.
  const box = scope ? scopeBoxFor(scope, me ?? null) : null;
  if (box === "empty") {
    res.json([]);
    return;
  }

  const likedSet = await getLikedSet(auth.userId);
  const { hidden, iBlocked } = await getVisibilityContext(auth.userId);

  // Push the bounding box into the query BEFORE limiting, so we don't merely
  // sample the most-recent 200 rows and then drop everything out of scope.
  let query = supabase
    .from("profiles")
    .select(PUBLIC_COLUMNS)
    .neq("id", auth.userId)
    .not("username", "is", null);
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
    req.log.error({ error: error.message }, "profiles GET list: error");
    res.status(500).json({ error: error.message });
    return;
  }

  let rows = (data as ProfileRow[]).filter((row) => !hidden.has(row.id));

  // Precise refinement for radius scopes (the box is an over-approximation).
  if (scope) {
    rows = rows.filter((row) =>
      withinMapScope(me ?? null, row.latitude, row.longitude, scope),
    );
  }

  const profiles = rows.map((row) =>
    toPublic(row, me ?? null, likedSet, iBlocked),
  );

  if (sort === "distance") {
    profiles.sort((a, b) => {
      if (a.distance_km == null) return 1;
      if (b.distance_km == null) return -1;
      return a.distance_km - b.distance_km;
    });
  } else if (sort === "online") {
    profiles.sort((a, b) => Number(b.is_online) - Number(a.is_online));
  }
  // recent: rows already arrive ordered by last_active_at desc from the DB.

  // Gold priority visibility: on the world map (scope present), surface Gold —
  // then Plus — profiles first. Array.sort is stable, so the sort chosen above
  // is preserved as the secondary order.
  if (scope) {
    profiles.sort((a, b) => PLAN_RANK[b.plan] - PLAN_RANK[a.plan]);
  }

  res.json(profiles);
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

    res.json(created);
    return;
  }

  res.json(data);
});

router.put("/profiles/me", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { username, bio, age, city, gender, location, avatar_url } = req.body as {
    username?: string;
    bio?: string;
    age?: number;
    city?: string;
    gender?: string;
    location?: string;
    avatar_url?: string;
  };

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

  res.json(data);
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

  const likedSet = new Set(ids);
  const { hidden, iBlocked } = await getVisibilityContext(auth.userId);
  res.json(
    (data as ProfileRow[])
      .filter((row) => !hidden.has(row.id))
      .map((row) => toPublic(row, me ?? null, likedSet, iBlocked)),
  );
});

router.get("/profiles/:id/photos", async (req, res) => {
  const { id } = req.params;

  // A deactivated user is hidden everywhere: don't expose their photos.
  if (await isDeactivated(id)) {
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

  if (await isDeactivated(id)) {
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

  res.status(201).json({
    matched: result.matched,
    is_super: result.isSuper,
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

router.get("/profiles/:id", async (req, res) => {
  const { id } = req.params;
  const viewer = await optionalAuth(req);

  // A deactivated user is hidden everywhere; treat their profile as not found.
  if (await isDeactivated(id)) {
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

  res.json(toPublic(data as ProfileRow, me, likedSet, blockedSet));
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
