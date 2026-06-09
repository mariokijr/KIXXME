import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, optionalAuth } from "../lib/auth.js";
import { distanceKm, isOnline } from "../lib/geo.js";

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

function toPublic(
  row: ProfileRow,
  viewer: { latitude: number | null; longitude: number | null } | null,
  likedSet: Set<string>,
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

  const { data: me } = await supabase
    .from("profiles")
    .select("latitude, longitude")
    .eq("id", auth.userId)
    .maybeSingle();

  const likedSet = await getLikedSet(auth.userId);

  const { data, error } = await supabase
    .from("profiles")
    .select(PUBLIC_COLUMNS)
    .neq("id", auth.userId)
    .not("username", "is", null)
    .order("last_active_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) {
    req.log.error({ error: error.message }, "profiles GET list: error");
    res.status(500).json({ error: error.message });
    return;
  }

  let profiles = (data as ProfileRow[]).map((row) =>
    toPublic(row, me ?? null, likedSet),
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

  res.json(profiles);
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
  res.json((data as ProfileRow[]).map((row) => toPublic(row, me ?? null, likedSet)));
});

router.get("/profiles/:id/photos", async (req, res) => {
  const { id } = req.params;
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

  const { error } = await supabase
    .from("likes")
    .upsert(
      { liker_id: auth.userId, liked_id: id },
      { onConflict: "liker_id,liked_id", ignoreDuplicates: true },
    );

  if (error) {
    req.log.error({ error: error.message }, "like POST: error");
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(201).json({ success: true });
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

router.get("/profiles/:id", async (req, res) => {
  const { id } = req.params;
  const viewer = await optionalAuth(req);

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
  if (viewer) {
    const { data: meRow } = await supabase
      .from("profiles")
      .select("latitude, longitude")
      .eq("id", viewer.userId)
      .maybeSingle();
    me = meRow ?? null;
    likedSet = await getLikedSet(viewer.userId);
  }

  res.json(toPublic(data as ProfileRow, me, likedSet));
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
