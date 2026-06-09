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
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data.user) { res.status(401).json({ error: "Invalid or expired token" }); return null; }
  return { userId: data.user.id, token };
}

router.get("/profiles/me/photos", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { data, error } = await supabase
    .from("profile_photos")
    .select("*")
    .eq("user_id", auth.userId)
    .order("position", { ascending: true });

  if (error) { req.log.error({ error: error.message }, "photos GET: query error"); res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.post("/profiles/me/photos", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { base64, mime_type, filename, set_as_avatar } = req.body as {
    base64?: string; mime_type?: string; filename?: string; set_as_avatar?: boolean;
  };

  if (!base64 || !mime_type || !filename) {
    res.status(400).json({ error: "base64, mime_type, and filename are required" });
    return;
  }

  const buffer = Buffer.from(base64, "base64");
  const storagePath = `${auth.userId}/photos/${Date.now()}_${filename}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(storagePath, buffer, { contentType: mime_type, upsert: false });

  if (uploadError) {
    req.log.error({ error: uploadError.message }, "photos POST: storage upload error");
    res.status(400).json({ error: uploadError.message });
    return;
  }

  const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(storagePath);
  const url = urlData.publicUrl;

  const { count } = await supabase
    .from("profile_photos")
    .select("*", { count: "exact", head: true })
    .eq("user_id", auth.userId);

  const isAvatar = set_as_avatar ?? false;

  if (isAvatar) {
    await supabase.from("profile_photos").update({ is_avatar: false }).eq("user_id", auth.userId);
  }

  const { data: photo, error: insertError } = await supabase
    .from("profile_photos")
    .insert({ user_id: auth.userId, storage_path: storagePath, url, is_avatar: isAvatar, position: count ?? 0 })
    .select()
    .single();

  if (insertError) { res.status(400).json({ error: insertError.message }); return; }

  if (isAvatar) {
    await supabase.from("profiles").update({ avatar_url: url, updated_at: new Date().toISOString() }).eq("id", auth.userId);
  }

  res.status(201).json(photo);
});

router.delete("/profiles/me/photos/:photoId", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { photoId } = req.params;

  const { data: photo, error: fetchError } = await supabase
    .from("profile_photos")
    .select("*")
    .eq("id", photoId)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (fetchError || !photo) { res.status(404).json({ error: "Photo not found" }); return; }

  await supabase.storage.from("avatars").remove([photo.storage_path]);
  await supabase.from("profile_photos").delete().eq("id", photoId);

  if (photo.is_avatar) {
    const { data: next } = await supabase
      .from("profile_photos")
      .select("url")
      .eq("user_id", auth.userId)
      .neq("id", photoId)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();

    await supabase
      .from("profiles")
      .update({ avatar_url: next?.url ?? null, updated_at: new Date().toISOString() })
      .eq("id", auth.userId);
  }

  res.json({ success: true });
});

router.patch("/profiles/me/photos/:photoId/avatar", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { photoId } = req.params;

  const { data: photo, error: fetchError } = await supabase
    .from("profile_photos")
    .select("*")
    .eq("id", photoId)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (fetchError || !photo) { res.status(404).json({ error: "Photo not found" }); return; }

  await supabase.from("profile_photos").update({ is_avatar: false }).eq("user_id", auth.userId);
  await supabase.from("profile_photos").update({ is_avatar: true }).eq("id", photoId);
  await supabase.from("profiles").update({ avatar_url: photo.url, updated_at: new Date().toISOString() }).eq("id", auth.userId);

  res.json({ success: true });
});

export default router;
