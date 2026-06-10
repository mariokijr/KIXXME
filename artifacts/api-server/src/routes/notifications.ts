import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth } from "../lib/auth.js";
import { getBlockRelations } from "../lib/blocks.js";

const router = Router();

/**
 * Aggregated in-app notification state for the current user:
 * - unread message count (across visible conversations)
 * - recent likes received (people who liked me)
 * - matches (mutual likes), with the moment the match was completed
 *
 * Block enforcement: users on either side of a block are excluded, matching
 * every other surface that exposes another user.
 */
router.get("/notifications/summary", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const me = auth.userId;
  const { iBlocked, blockedMe } = await getBlockRelations(me);
  const isBlocked = (id: string) => iBlocked.has(id) || blockedMe.has(id);

  // People who liked me (most recent first).
  const { data: received, error: receivedError } = await supabase
    .from("likes")
    .select("liker_id, created_at")
    .eq("liked_id", me)
    .order("created_at", { ascending: false })
    .limit(100);

  if (receivedError) {
    req.log.error({ error: receivedError.message }, "notifications: likes query error");
    res.status(500).json({ error: receivedError.message });
    return;
  }

  // People I liked, for mutual-like (match) detection.
  const { data: sent } = await supabase
    .from("likes")
    .select("liked_id, created_at")
    .eq("liker_id", me);

  const myLikes = new Map<string, string>();
  for (const r of sent ?? []) {
    myLikes.set(r.liked_id as string, r.created_at as string);
  }

  const receivedVisible = (received ?? []).filter(
    (r) => !isBlocked(r.liker_id as string),
  );

  // Hydrate the profiles involved in one query.
  const userIds = Array.from(
    new Set(receivedVisible.map((r) => r.liker_id as string)),
  );
  const profileMap = new Map<
    string,
    { username: string | null; avatar_url: string | null }
  >();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, avatar_url")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.id as string, {
        username: (p.username as string | null) ?? null,
        avatar_url: (p.avatar_url as string | null) ?? null,
      });
    }
  }

  const likes = receivedVisible.map((r) => {
    const info = profileMap.get(r.liker_id as string);
    return {
      user_id: r.liker_id as string,
      username: info?.username ?? null,
      avatar_url: info?.avatar_url ?? null,
      created_at: r.created_at as string,
    };
  });

  // A match is a like received from someone I also liked. The match is
  // "completed" at the later of the two like timestamps.
  const matches = receivedVisible
    .filter((r) => myLikes.has(r.liker_id as string))
    .map((r) => {
      const theirAt = r.created_at as string;
      const myAt = myLikes.get(r.liker_id as string) as string;
      const matchedAt = Date.parse(theirAt) >= Date.parse(myAt) ? theirAt : myAt;
      const info = profileMap.get(r.liker_id as string);
      return {
        user_id: r.liker_id as string,
        username: info?.username ?? null,
        avatar_url: info?.avatar_url ?? null,
        matched_at: matchedAt,
      };
    })
    .sort((a, b) => Date.parse(b.matched_at) - Date.parse(a.matched_at));

  // Unread messages across conversations where the other user hasn't blocked me.
  const { data: convs } = await supabase
    .from("conversations")
    .select("id, user1_id, user2_id")
    .or(`user1_id.eq.${me},user2_id.eq.${me}`)
    .limit(200);

  const visibleConvIds = (convs ?? [])
    .filter((c) => {
      const otherId = c.user1_id === me ? c.user2_id : c.user1_id;
      return !blockedMe.has(otherId as string);
    })
    .map((c) => c.id as string);

  let unreadMessages = 0;
  if (visibleConvIds.length > 0) {
    const { count } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .in("conversation_id", visibleConvIds)
      .neq("sender_id", me)
      .is("read_at", null)
      .is("deleted_at", null);
    unreadMessages = count ?? 0;
  }

  res.json({
    unread_messages: unreadMessages,
    likes,
    matches,
  });
});

export default router;
