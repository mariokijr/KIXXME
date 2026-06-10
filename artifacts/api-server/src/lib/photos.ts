import { supabase } from "./supabase.js";

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
