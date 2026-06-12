import { eq } from "drizzle-orm";
import { db, profilePassesTable } from "@workspace/db";

/**
 * Record a "pass" / dislike ("no me interesa"). Idempotent: a repeat pass of
 * the same profile is a no-op (ON CONFLICT DO NOTHING on the unique
 * (passer, passed) index). Creates NO Supabase like edge and is never metered.
 */
export async function recordPass(
  passerId: string,
  passedId: string,
): Promise<void> {
  await db
    .insert(profilePassesTable)
    .values({ passerId, passedId })
    .onConflictDoNothing();
}

/**
 * The set of profile ids the given user has passed on. Used to exclude them
 * from Descubrir alongside the user's likes.
 */
export async function getPassedIds(passerId: string): Promise<Set<string>> {
  const rows = await db
    .select({ passedId: profilePassesTable.passedId })
    .from(profilePassesTable)
    .where(eq(profilePassesTable.passerId, passerId));
  return new Set(rows.map((r) => r.passedId));
}
