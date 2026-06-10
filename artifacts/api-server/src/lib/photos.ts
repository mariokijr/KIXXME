import { supabase } from "./supabase.js";
import { logger } from "./logger.js";

/**
 * Shared photo-removal core used by BOTH the self-service photo delete
 * (`routes/photos.ts`) and the admin "remove reported photo" action
 * (`routes/admin.ts`). Deletes the storage object + the `profile_photos` row,
 * and — when the removed photo was the avatar — re-promotes the owner's next
 * photo (by position) to avatar and updates `profiles.avatar_url` accordingly.
 *
 * Operates on a known row, so the caller is responsible for ownership /
 * authorization (a user may only delete their own; an admin may delete anyone's).
 */
export interface RemovablePhoto {
  id: string;
  user_id: string;
  storage_path: string;
  is_avatar: boolean;
}

/**
 * Batch photo-count lookup for many users at once (e.g. the Descubrir candidate
 * set), used to rank "more complete" profiles higher. Returns a Map keyed by
 * user_id; users with no photo rows are simply absent (treat as 0).
 */
export async function getPhotoCountsForUsers(
  userIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (userIds.length === 0) return map;
  const { data, error } = await supabase
    .from("profile_photos")
    .select("user_id")
    .in("user_id", userIds);
  if (error) {
    // Degrade gracefully (everyone scores 0 for gallery richness) but don't
    // swallow the failure silently — the completitud signal half-disappears.
    logger.warn({ error: error.message }, "getPhotoCountsForUsers: query error");
    return map;
  }
  for (const row of (data ?? []) as { user_id: string }[]) {
    map.set(row.user_id, (map.get(row.user_id) ?? 0) + 1);
  }
  return map;
}

export async function removePhotoRow(photo: RemovablePhoto): Promise<void> {
  await supabase.storage.from("avatars").remove([photo.storage_path]);
  await supabase.from("profile_photos").delete().eq("id", photo.id);

  if (photo.is_avatar) {
    const { data: next } = await supabase
      .from("profile_photos")
      .select("id, url")
      .eq("user_id", photo.user_id)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (next) {
      await supabase
        .from("profile_photos")
        .update({ is_avatar: true })
        .eq("id", next.id);
    }

    await supabase
      .from("profiles")
      .update({
        avatar_url: next?.url ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", photo.user_id);
  }
}
