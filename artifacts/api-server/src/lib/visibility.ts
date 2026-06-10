import { getBlockRelations } from "./blocks.js";
import { getDeactivatedIds } from "./account.js";

/**
 * The set of user ids that must be hidden from `viewerId` everywhere a profile
 * is exposed (discovery, map, favorites, likes, etc.): users the viewer blocked,
 * users who blocked the viewer, and any deactivated account.
 *
 * This is the single union point for visibility. When account suspension /
 * moderation lands, add `getSuspendedIds()` here so every surface inherits the
 * exclusion without changing each call site.
 *
 * `iBlocked` is returned alongside the union because callers that render a
 * profile still need it to flag `blocked_by_me` without re-querying blocks.
 */
export async function getVisibilityContext(
  viewerId: string,
): Promise<{ hidden: Set<string>; iBlocked: Set<string> }> {
  const [{ iBlocked, blockedMe }, deactivated] = await Promise.all([
    getBlockRelations(viewerId),
    getDeactivatedIds(),
  ]);
  const hidden = new Set<string>(deactivated);
  for (const id of iBlocked) hidden.add(id);
  for (const id of blockedMe) hidden.add(id);
  return { hidden, iBlocked };
}

/** Convenience wrapper for callers that only need the hidden union. */
export async function getHiddenIds(viewerId: string): Promise<Set<string>> {
  return (await getVisibilityContext(viewerId)).hidden;
}
