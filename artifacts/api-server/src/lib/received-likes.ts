import { and, desc, eq, inArray } from "drizzle-orm";
import { db, likeActionsTable } from "@workspace/db";
import { supabase } from "./supabase.js";
import { getPlan } from "./entitlement.js";

const PROFILE_COLS = "id, username, avatar_url, age, city, is_verified, plan";

export interface ReceivedLikeProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  age: number | null;
  city: string | null;
  is_verified: boolean;
  plan: string;
  is_super: boolean;
  liked_at: string;
}

export interface ReceivedLikesResult {
  count: number;
  can_see: boolean;
  profiles: ReceivedLikeProfile[];
}

/**
 * Returns profiles that have liked `userId` but haven't been liked back yet
 * (i.e. not mutual — matches are excluded). Free users get only the count;
 * Plus/Gold users get the full profile list.
 *
 * `hidden` is the set of user-ids the viewer should never see
 * (blocked + deactivated + moderated), already computed by the caller.
 */
export async function getReceivedLikes(
  userId: string,
  hidden: Set<string>,
): Promise<ReceivedLikesResult> {
  const plan = await getPlan(userId);
  const canSee = plan !== "free";

  // People who liked me.
  const { data: likedMe } = await supabase
    .from("likes")
    .select("liker_id")
    .eq("liked_id", userId);

  const likedMeIds: string[] = (likedMe ?? []).map((r) => r.liker_id);

  // People I already liked back — these become matches (exclude from pending).
  const { data: iLiked } = await supabase
    .from("likes")
    .select("liked_id")
    .eq("liker_id", userId);
  const iLikedSet = new Set<string>((iLiked ?? []).map((r) => r.liked_id));

  // Pending = liked me but NOT mutual, NOT hidden.
  const pending = likedMeIds.filter(
    (id) => !iLikedSet.has(id) && !hidden.has(id),
  );

  const count = pending.length;

  if (!canSee || pending.length === 0) {
    return { count, can_see: canSee, profiles: [] };
  }

  // For each pending liker, find the latest like_actions row to get kind + created_at.
  const actions = await db
    .select({
      likerId: likeActionsTable.likerId,
      kind: likeActionsTable.kind,
      createdAt: likeActionsTable.createdAt,
    })
    .from(likeActionsTable)
    .where(
      and(
        inArray(likeActionsTable.likerId, pending),
        eq(likeActionsTable.likedId, userId),
      ),
    )
    .orderBy(desc(likeActionsTable.createdAt));

  // Keep only the latest action per liker (first occurrence after desc sort).
  const latestAction = new Map<
    string,
    { kind: string; createdAt: Date }
  >();
  for (const row of actions) {
    if (!latestAction.has(row.likerId)) {
      latestAction.set(row.likerId, { kind: row.kind, createdAt: row.createdAt });
    }
  }

  // Fetch Supabase profiles for the pending likers.
  const { data: profileRows } = await supabase
    .from("profiles")
    .select(PROFILE_COLS)
    .in("id", pending);

  if (!profileRows) return { count, can_see: canSee, profiles: [] };

  // Sort: SuperLikes first, then by most-recent like.
  const profiles: ReceivedLikeProfile[] = profileRows
    .map((p) => {
      const action = latestAction.get(p.id);
      return {
        id: p.id,
        username: p.username ?? "",
        avatar_url: p.avatar_url ?? null,
        age: p.age ?? null,
        city: p.city ?? null,
        is_verified: Boolean(p.is_verified),
        plan: p.plan ?? "free",
        is_super: action?.kind === "superlike",
        liked_at: action?.createdAt?.toISOString() ?? new Date().toISOString(),
      };
    })
    .sort((a, b) => {
      if (a.is_super !== b.is_super) return a.is_super ? -1 : 1;
      return new Date(b.liked_at).getTime() - new Date(a.liked_at).getTime();
    });

  return { count, can_see: canSee, profiles };
}
