import { Router } from "express";
import { supabase, supabaseAuth } from "../lib/supabase.js";

const router = Router();

function getToken(req: { headers: { authorization?: string } }): string | null {
  return req.headers.authorization?.replace("Bearer ", "") ?? null;
}

async function requireAuth(
  req: Parameters<typeof getToken>[0],
  res: { status: (n: number) => { json: (o: unknown) => void } }
): Promise<{ userId: string; token: string } | null> {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return null;
  }
  return { userId: data.user.id, token };
}

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
    res.status(404).json({ error: "Profile not found" });
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

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (username !== undefined) updates.username = username;
  if (bio !== undefined) updates.bio = bio;
  if (age !== undefined) updates.age = age;
  if (city !== undefined) updates.city = city;
  if (gender !== undefined) updates.gender = gender;
  if (location !== undefined) updates.location = location;
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", auth.userId)
    .select()
    .maybeSingle();

  if (error) {
    req.log.error({ error: error.message, code: error.code }, "profiles/me PUT: update error");
    res.status(400).json({ error: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json(data);
});

router.get("/profiles/:id", async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, bio, avatar_url, created_at")
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

  res.json(data);
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
