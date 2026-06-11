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
      error: "Debes mantener al menos una foto en tu perfil.",
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

// Replace an existing photo's image in place (the "Cambiar" action). Keeps the
// row's position + is_avatar flag so the slot layout is stable and the
// MAX_PHOTOS cap / "last photo" rules are never tripped by a swap. Uploads the
// new object FIRST, then repoints the row, then removes the old object — so a
// mid-way failure never destroys the existing image.
router.put("/profiles/me/photos/:photoId", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { photoId } = req.params;
  const { base64, mime_type, filename } = req.body as {
    base64?: string;
    mime_type?: string;
    filename?: string;
  };

  if (!base64 || !mime_type || !filename) {
    res.status(400).json({ error: "base64, mime_type, and filename are required" });
    return;
  }

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

  const buffer = Buffer.from(base64, "base64");
  const newPath = `${auth.userId}/photos/${Date.now()}_${filename}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(newPath, buffer, { contentType: mime_type, upsert: false });

  if (uploadError) {
    req.log.error({ error: uploadError.message }, "photos PUT: storage upload error");
    res.status(400).json({ error: uploadError.message });
    return;
  }

  const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(newPath);
  const newUrl = urlData.publicUrl;

  const { data: updated, error: updateError } = await supabase
    .from("profile_photos")
    .update({ url: newUrl, storage_path: newPath })
    .eq("id", photoId)
    .eq("user_id", auth.userId)
    .select()
    .single();

  if (updateError || !updated) {
    // Roll back the just-uploaded object so we never orphan storage.
    await supabase.storage.from("avatars").remove([newPath]);
    req.log.error({ error: updateError?.message }, "photos PUT: row update error");
    res.status(400).json({ error: updateError?.message ?? "No se pudo actualizar la foto" });
    return;
  }

  // Keep profiles.avatar_url in sync when the replaced photo is the main one —
  // do this BEFORE removing the old object so the public avatar never briefly
  // points at a just-deleted file.
  if (photo.is_avatar) {
    const { error: avatarError } = await supabase
      .from("profiles")
      .update({ avatar_url: newUrl, updated_at: new Date().toISOString() })
      .eq("id", auth.userId);
    if (avatarError) {
      req.log.error({ error: avatarError.message }, "photos PUT: avatar_url sync error");
    }
  }

  // Remove the previous storage object (best-effort).
  if (photo.storage_path && photo.storage_path !== newPath) {
    await supabase.storage.from("avatars").remove([photo.storage_path]);
  }

  res.json(updated);
});

export default router;
