import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth } from "../lib/auth.js";
import { removePhotoRow } from "../lib/photos.js";

const router = Router();

const MAX_PHOTOS = 4;

router.get("/profiles/me/photos", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { data, error } = await supabase
    .from("profile_photos")
    .select("*")
    .eq("user_id", auth.userId)
    .order("position", { ascending: true });

  if (error) {
    req.log.error({ error: error.message }, "photos GET: query error");
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data ?? []);
});

router.post("/profiles/me/photos", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { base64, mime_type, filename, set_as_avatar } = req.body as {
    base64?: string;
    mime_type?: string;
    filename?: string;
    set_as_avatar?: boolean;
  };

  if (!base64 || !mime_type || !filename) {
    res.status(400).json({ error: "base64, mime_type, and filename are required" });
    return;
  }

  const { count: existingCount } = await supabase
    .from("profile_photos")
    .select("*", { count: "exact", head: true })
    .eq("user_id", auth.userId);

  if ((existingCount ?? 0) >= MAX_PHOTOS) {
    res.status(400).json({ error: `Puedes subir un máximo de ${MAX_PHOTOS} fotos` });
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

  // First photo becomes the avatar automatically.
  const isAvatar = (set_as_avatar ?? false) || (existingCount ?? 0) === 0;

  if (isAvatar) {
    await supabase.from("profile_photos").update({ is_avatar: false }).eq("user_id", auth.userId);
  }

  const { data: photo, error: insertError } = await supabase
    .from("profile_photos")
    .insert({
      user_id: auth.userId,
      storage_path: storagePath,
      url,
      is_avatar: isAvatar,
      position: existingCount ?? 0,
    })
    .select()
    .single();

  if (insertError) {
    res.status(400).json({ error: insertError.message });
    return;
  }

  if (isAvatar) {
    await supabase
      .from("profiles")
      .update({ avatar_url: url, updated_at: new Date().toISOString() })
      .eq("id", auth.userId);
  }

  res.status(201).json(photo);
});

router.post("/profiles/me/photos/reorder", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { photo_ids } = req.body as { photo_ids?: string[] };
  if (!Array.isArray(photo_ids) || photo_ids.length === 0) {
    res.status(400).json({ error: "photo_ids must be a non-empty array" });
    return;
  }

  const { data: owned } = await supabase
    .from("profile_photos")
    .select("id")
    .eq("user_id", auth.userId);

  const ownedIds = new Set((owned ?? []).map((p) => p.id as string));
  for (const id of photo_ids) {
    if (!ownedIds.has(id)) {
      res.status(400).json({ error: "photo_ids contains a photo you do not own" });
      return;
    }
  }

  await Promise.all(
    photo_ids.map((id, index) =>
      supabase
        .from("profile_photos")
        .update({ position: index })
        .eq("id", id)
        .eq("user_id", auth.userId),
    ),
  );

  const { data, error } = await supabase
    .from("profile_photos")
    .select("*")
    .eq("user_id", auth.userId)
    .order("position", { ascending: true });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data ?? []);
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

  if (fetchError || !photo) {
    res.status(404).json({ error: "Photo not found" });
    return;
  }

  // Every discoverable profile must keep at least one photo (the main photo).
  // Block deleting the last remaining one — the user must add another first.
  const { count } = await supabase
    .from("profile_photos")
    .select("*", { count: "exact", head: true })
    .eq("user_id", auth.userId);

  if ((count ?? 0) <= 1) {
    res.status(400).json({
      error: "No puedes eliminar tu única foto. Sube otra antes de borrar esta.",
    });
    return;
  }

  await removePhotoRow({
    id: photo.id,
    user_id: photo.user_id,
    storage_path: photo.storage_path,
    is_avatar: photo.is_avatar,
  });

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

  if (fetchError || !photo) {
    res.status(404).json({ error: "Photo not found" });
    return;
  }

  await supabase.from("profile_photos").update({ is_avatar: false }).eq("user_id", auth.userId);
  await supabase.from("profile_photos").update({ is_avatar: true }).eq("id", photoId);
  await supabase
    .from("profiles")
    .update({ avatar_url: photo.url, updated_at: new Date().toISOString() })
    .eq("id", auth.userId);

  res.json({ success: true });
});

export default router;
