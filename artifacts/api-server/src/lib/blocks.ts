import { and, eq, or } from "drizzle-orm";
import { db, blocksTable } from "@workspace/db";

/**
 * Block relations for a viewer, resolved in a single query.
 * - `iBlocked`: user ids the viewer has blocked.
 * - `blockedMe`: user ids that have blocked the viewer.
 */
export async function getBlockRelations(
  me: string,
): Promise<{ iBlocked: Set<string>; blockedMe: Set<string> }> {
  const rows = await db
    .select({
      blockerId: blocksTable.blockerId,
      blockedId: blocksTable.blockedId,
    })
    .from(blocksTable)
    .where(or(eq(blocksTable.blockerId, me), eq(blocksTable.blockedId, me)));

  const iBlocked = new Set<string>();
  const blockedMe = new Set<string>();
  for (const r of rows) {
    if (r.blockerId === me) iBlocked.add(r.blockedId);
    if (r.blockedId === me) blockedMe.add(r.blockerId);
  }
  return { iBlocked, blockedMe };
}

/** True when either user has blocked the other. */
export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  const rows = await db
    .select({ id: blocksTable.id })
    .from(blocksTable)
    .where(
      or(
        and(eq(blocksTable.blockerId, a), eq(blocksTable.blockedId, b)),
        and(eq(blocksTable.blockerId, b), eq(blocksTable.blockedId, a)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function addBlock(me: string, other: string): Promise<void> {
  await db
    .insert(blocksTable)
    .values({ blockerId: me, blockedId: other })
    .onConflictDoNothing();
}

export async function removeBlock(me: string, other: string): Promise<void> {
  await db
    .delete(blocksTable)
    .where(
      and(eq(blocksTable.blockerId, me), eq(blocksTable.blockedId, other)),
    );
}
