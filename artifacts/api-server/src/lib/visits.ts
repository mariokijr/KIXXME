import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import { db, profileVisitsTable } from "@workspace/db";
import { logger } from "./logger.js";

/**
 * "Who viewed my profile" recording + reads over the repo-owned
 * `profile_visits` table. One row per (viewer, profile) pair; a repeat visit
 * bumps `lastVisitedAt` (throttled below) so the list/count stay deduped.
 *
 * Visitor identities live in Supabase and are joined in the route; here we only
 * deal with the visit edges and accept a `hidden` set so blocked / deactivated /
 * moderated users are filtered out of BOTH the count and the list at read time.
 */

/** Record (or refresh) a profile view. Fire-and-forget — never throws. */
export async function recordProfileVisit(
  viewerId: string,
  profileId: string,
): Promise<void> {
  if (viewerId === profileId) return;
  try {
    await db
      .insert(profileVisitsTable)
      .values({ viewerId, profileId, lastVisitedAt: new Date() })
      .onConflictDoUpdate({
        target: [profileVisitsTable.viewerId, profileVisitsTable.profileId],
        set: { lastVisitedAt: new Date() },
        // Throttle: only bump the timestamp if the last visit was over an hour
        // ago, so rapid re-opens don't churn the "recent visitors" ordering.
        setWhere: sql`${profileVisitsTable.lastVisitedAt} < now() - interval '1 hour'`,
      });
  } catch (err) {
    logger.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        viewerId,
        profileId,
      },
      "recordProfileVisit failed (non-fatal)",
    );
  }
}

/** Deduped visitor count for an owner, excluding any hidden viewer ids. */
export async function countVisitors(
  profileId: string,
  hidden: Set<string>,
): Promise<number> {
  const hiddenIds = [...hidden];
  const where =
    hiddenIds.length > 0
      ? and(
          eq(profileVisitsTable.profileId, profileId),
          notInArray(profileVisitsTable.viewerId, hiddenIds),
        )
      : eq(profileVisitsTable.profileId, profileId);
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(profileVisitsTable)
    .where(where);
  return row?.c ?? 0;
}

/** Recent visitor edges for an owner (most recent first), excluding hidden ids. */
export async function listVisitors(
  profileId: string,
  hidden: Set<string>,
  limit = 50,
): Promise<{ viewerId: string; lastVisitedAt: Date }[]> {
  const hiddenIds = [...hidden];
  const where =
    hiddenIds.length > 0
      ? and(
          eq(profileVisitsTable.profileId, profileId),
          notInArray(profileVisitsTable.viewerId, hiddenIds),
        )
      : eq(profileVisitsTable.profileId, profileId);
  return db
    .select({
      viewerId: profileVisitsTable.viewerId,
      lastVisitedAt: profileVisitsTable.lastVisitedAt,
    })
    .from(profileVisitsTable)
    .where(where)
    .orderBy(desc(profileVisitsTable.lastVisitedAt))
    .limit(limit);
}
