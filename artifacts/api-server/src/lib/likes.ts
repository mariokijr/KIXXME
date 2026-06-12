import { and, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import {
  db,
  likeActionsTable,
  rewardCreditsTable,
  type LikeKind,
} from "@workspace/db";
import { supabase } from "./supabase.js";
import { getPlan, type Plan } from "./entitlement.js";
import { getCreditBalance } from "./rewards.js";

/**
 * Likes & SuperLikes engine.
 *
 * Quotas are DERIVED from the append-only `like_actions` log via rolling-window
 * counts — there is no separate counter/balance row to drift. The actual like
 * row lives in Supabase `likes` (source of truth for existence); here we record
 * every action (for quotas + SuperLike status) and keep the two stores
 * consistent in application code (there are no cross-DB transactions).
 */

// --- Per-tier configuration ------------------------------------------------

/** A rolling-window allowance. A `null` limit means unlimited for that tier. */
interface WindowLimit {
  /** Max actions allowed within the rolling window. */
  max: number;
  /** Rolling window length in hours. */
  windowHours: number;
}

/** Regular likes: free is capped, paid tiers are unlimited. */
const LIKE_LIMITS: Record<Plan, WindowLimit | null> = {
  free: { max: 10, windowHours: 6 },
  plus: null,
  gold: null,
};

/** SuperLikes: everyone gets some; free recharges 1/24h, plus 5/24h, gold unlimited. */
const SUPERLIKE_LIMITS: Record<Plan, WindowLimit | null> = {
  free: { max: 1, windowHours: 24 },
  plus: { max: 5, windowHours: 24 },
  gold: null,
};

function limitFor(plan: Plan, kind: LikeKind): WindowLimit | null {
  return kind === "superlike" ? SUPERLIKE_LIMITS[plan] : LIKE_LIMITS[plan];
}

// --- Quota shapes ----------------------------------------------------------

export interface QuotaState {
  /** Units still available right now (base allowance + bonus credits). -1 when unlimited. */
  remaining: number;
  /** The tier cap for the window. -1 when unlimited. */
  limit: number;
  unlimited: boolean;
  /**
   * ISO time the next BASE unit recharges (oldest quota-funded action in the
   * window + window length). Only set when the base allowance is exhausted.
   * Bonus credits do not affect this — they recharge via daily claims.
   */
  rechargeAt: string | null;
  /** Bonus reward credits for this kind, already folded into `remaining`. */
  credits: number;
}

export interface LikeQuota {
  plan: Plan;
  likes: QuotaState;
  superlikes: QuotaState;
}

export type RecordLikeResult =
  | {
      ok: true;
      isSuper: boolean;
      matched: boolean;
      /**
       * Whether this like inserted a NEW liker→liked edge (vs. a no-op repeat
       * of an already-existing like). Engagement emails fire only on a new
       * edge so repeat/duplicate likes can't re-spam the recipient.
       */
      firstEdge: boolean;
      /**
       * True when this call was a no-op repeat of an existing like edge (the
       * charge was refunded). A like→SuperLike UPGRADE is NOT alreadyProcessed
       * (it keeps a one-SuperLike charge). The route surfaces this so the
       * client can skip re-celebrating / re-charging.
       */
      alreadyProcessed: boolean;
      quota: LikeQuota;
    }
  | { ok: false; reason: "limit"; kind: LikeKind; quota: LikeQuota }
  | { ok: false; reason: "error"; message: string };

// --- Rolling-window usage --------------------------------------------------

function windowStart(windowHours: number): Date {
  return new Date(Date.now() - windowHours * 60 * 60 * 1000);
}

/**
 * Count of a user's BASE (quota-funded) actions of a kind in the window, plus
 * the oldest's time. Credit-funded actions (`source='credit'`) are excluded so
 * they neither consume the base allowance nor extend the base lockout window.
 */
async function windowUsage(
  likerId: string,
  kind: LikeKind,
  windowHours: number,
): Promise<{ count: number; oldest: Date | null }> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      oldest: sql<Date | null>`min(${likeActionsTable.createdAt})`,
    })
    .from(likeActionsTable)
    .where(
      and(
        eq(likeActionsTable.likerId, likerId),
        eq(likeActionsTable.kind, kind),
        eq(likeActionsTable.source, "quota"),
        gt(likeActionsTable.createdAt, windowStart(windowHours)),
      ),
    );
  // `min(createdAt)` comes back from node-postgres as a STRING (not a Date)
  // even though the sql<> generic claims `Date`. Normalize to a real Date so
  // downstream `.getTime()` math in buildQuota cannot throw.
  const oldest = row?.oldest ? new Date(row.oldest) : null;
  return { count: row?.count ?? 0, oldest };
}

function buildQuota(
  limit: WindowLimit | null,
  usage: { count: number; oldest: Date | null },
  credits: number,
): QuotaState {
  if (!limit) {
    return { remaining: -1, limit: -1, unlimited: true, rechargeAt: null, credits };
  }
  const baseRemaining = Math.max(0, limit.max - usage.count);
  const rechargeAt =
    baseRemaining <= 0 && usage.oldest
      ? new Date(
          usage.oldest.getTime() + limit.windowHours * 60 * 60 * 1000,
        ).toISOString()
      : null;
  return {
    remaining: baseRemaining + credits,
    limit: limit.max,
    unlimited: false,
    rechargeAt,
    credits,
  };
}

/** Current like + SuperLike allowances for a user, resolved against their tier. */
export async function getLikeQuota(userId: string): Promise<LikeQuota> {
  const plan = await getPlan(userId);
  const likeLimit = LIKE_LIMITS[plan];
  const superLimit = SUPERLIKE_LIMITS[plan];
  const [likeUsage, superUsage, credits] = await Promise.all([
    likeLimit
      ? windowUsage(userId, "like", likeLimit.windowHours)
      : Promise.resolve({ count: 0, oldest: null }),
    superLimit
      ? windowUsage(userId, "superlike", superLimit.windowHours)
      : Promise.resolve({ count: 0, oldest: null }),
    getCreditBalance(userId),
  ]);
  return {
    plan,
    likes: buildQuota(likeLimit, likeUsage, credits.likes),
    superlikes: buildQuota(superLimit, superUsage, credits.superlikes),
  };
}

// --- Recording a like / SuperLike ------------------------------------------

/**
 * Record a like or SuperLike from `likerId` to `likedId`.
 *
 * Caller is responsible for the self/block/deactivated guards. This:
 *   1. Gates the quota and appends the action log row inside one transaction,
 *      serialized per-user with a `pg_advisory_xact_lock` so concurrent likes
 *      from the same user can't slip past the cap.
 *   2. Upserts the like into Supabase (source of truth). If that fails the just
 *      -inserted log row is deleted (compensating refund) so a downstream error
 *      never costs the user a like/SuperLike.
 *   3. Detects a mutual like AFTER our row exists, so two simultaneous mutual
 *      likes can't both miss the reciprocal row.
 */
export async function recordLike(
  likerId: string,
  likedId: string,
  kind: LikeKind,
): Promise<RecordLikeResult> {
  const plan = await getPlan(likerId);
  const limit = limitFor(plan, kind);

  const gate = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${likerId}))`);
    let source: "quota" | "credit" = "quota";
    let spendId: string | null = null;
    if (limit) {
      const [row] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(likeActionsTable)
        .where(
          and(
            eq(likeActionsTable.likerId, likerId),
            eq(likeActionsTable.kind, kind),
            eq(likeActionsTable.source, "quota"),
            gt(likeActionsTable.createdAt, windowStart(limit.windowHours)),
          ),
        );
      if ((row?.count ?? 0) >= limit.max) {
        // Base allowance exhausted — try to spend a bonus reward credit. The
        // balance (SUM of deltas) is read INSIDE this advisory-locked tx, so a
        // concurrent like can't double-spend the same credit.
        const [bal] = await tx
          .select({
            balance: sql<number>`coalesce(sum(${rewardCreditsTable.delta}), 0)::int`,
          })
          .from(rewardCreditsTable)
          .where(
            and(
              eq(rewardCreditsTable.userId, likerId),
              eq(rewardCreditsTable.kind, kind),
            ),
          );
        if ((bal?.balance ?? 0) <= 0) {
          return { blocked: true as const };
        }
        const [spend] = await tx
          .insert(rewardCreditsTable)
          .values({ userId: likerId, kind, delta: -1, reason: "spend" })
          .returning({ id: rewardCreditsTable.id });
        spendId = spend?.id ?? null;
        source = "credit";
      }
    }
    const [inserted] = await tx
      .insert(likeActionsTable)
      .values({ likerId, likedId, kind, source })
      .returning({ id: likeActionsTable.id });
    return { blocked: false as const, id: inserted?.id ?? null, spendId };
  });

  if (gate.blocked) {
    return {
      ok: false,
      reason: "limit",
      kind,
      quota: await getLikeQuota(likerId),
    };
  }

  const { data: upserted, error } = await supabase
    .from("likes")
    .upsert(
      { liker_id: likerId, liked_id: likedId },
      { onConflict: "liker_id,liked_id", ignoreDuplicates: true },
    )
    .select("liker_id");
  // With ignoreDuplicates the upsert is INSERT ... ON CONFLICT DO NOTHING, so
  // RETURNING (`.select()`) yields a row ONLY when a new edge was inserted; a
  // repeat like of an existing edge comes back empty.
  const firstEdge = !!(upserted && upserted.length > 0);

  if (error) {
    // Dual compensating refund: undo BOTH the action log row and any credit
    // spend row, so a downstream Supabase failure never costs the user a base
    // unit OR a bonus credit.
    await refundAction(gate.id, gate.spendId);
    return { ok: false, reason: "error", message: error.message };
  }

  // Idempotency. `firstEdge === false` means the Supabase like edge already
  // existed, so this is a REPEAT. Distinguish two cases:
  //   - like → SuperLike UPGRADE: keep the charge and the freshly-inserted
  //     superlike row (it becomes the latest action and promotes the pair to
  //     SuperLike status).
  //   - any other repeat (repeat like, repeat superlike, or a plain like after
  //     a prior superlike): refund the just-made charge (base unit + any credit)
  //     and report alreadyProcessed. Deleting the duplicate row also prevents a
  //     stale 'like' from overwriting an earlier SuperLike as the latest action.
  let alreadyProcessed = false;
  if (!firstEdge) {
    const isUpgrade =
      kind === "superlike" &&
      !(await hasExistingSuperLike(likerId, likedId, gate.id));
    if (!isUpgrade) {
      await refundAction(gate.id, gate.spendId);
      alreadyProcessed = true;
    }
  }

  const { data: reciprocal } = await supabase
    .from("likes")
    .select("liker_id")
    .eq("liker_id", likedId)
    .eq("liked_id", likerId)
    .maybeSingle();

  return {
    ok: true,
    isSuper: kind === "superlike",
    matched: !!reciprocal,
    firstEdge,
    alreadyProcessed,
    quota: await getLikeQuota(likerId),
  };
}

/**
 * Whether a SuperLike action already exists for this (liker, liked) pair,
 * ignoring `excludeId` (the row we just inserted). Used to tell a genuine
 * like→SuperLike upgrade from a repeat SuperLike.
 */
async function hasExistingSuperLike(
  likerId: string,
  likedId: string,
  excludeId: string | null,
): Promise<boolean> {
  const conds = [
    eq(likeActionsTable.likerId, likerId),
    eq(likeActionsTable.likedId, likedId),
    eq(likeActionsTable.kind, "superlike"),
  ];
  if (excludeId) conds.push(ne(likeActionsTable.id, excludeId));
  const rows = await db
    .select({ id: likeActionsTable.id })
    .from(likeActionsTable)
    .where(and(...conds))
    .limit(1);
  return rows.length > 0;
}

/**
 * Compensating refund: delete the just-inserted action log row and any credit
 * spend row in one transaction, so a downstream failure (or an idempotent
 * repeat) never costs the user a base unit OR a bonus credit. Best-effort.
 */
async function refundAction(
  actionId: string | null,
  spendId: string | null,
): Promise<void> {
  if (!actionId && !spendId) return;
  try {
    await db.transaction(async (tx) => {
      if (actionId) {
        await tx
          .delete(likeActionsTable)
          .where(eq(likeActionsTable.id, actionId));
      }
      if (spendId) {
        await tx
          .delete(rewardCreditsTable)
          .where(eq(rewardCreditsTable.id, spendId));
      }
    });
  } catch {
    /* best-effort refund */
  }
}

/**
 * True when `a` and `b` have a MUTUAL like (both directions). Used to gate
 * conversation creation (matched users may always chat, even on the free tier).
 * Reads the Supabase `likes` edges directly (no grammar-injection risk: ids are
 * passed as a parameterized `.in` list, not interpolated into an `.or` filter).
 */
export async function areMatched(a: string, b: string): Promise<boolean> {
  const { data } = await supabase
    .from("likes")
    .select("liker_id, liked_id")
    .in("liker_id", [a, b])
    .in("liked_id", [a, b]);
  const edges = new Set(
    (data ?? []).map((r) => `${r.liker_id}>${r.liked_id}`),
  );
  return edges.has(`${a}>${b}`) && edges.has(`${b}>${a}`);
}

// --- SuperLike status (for received-like notifications) ---------------------

/**
 * Of the given likers, return those whose CURRENT (most recent) like toward
 * `likedId` is a SuperLike. Used to flag/redact SuperLikes in notifications.
 */
export async function getSuperLikerIds(
  likedId: string,
  likerIds: string[],
): Promise<Set<string>> {
  if (likerIds.length === 0) return new Set();
  const rows = await db
    .select({
      likerId: likeActionsTable.likerId,
      kind: likeActionsTable.kind,
    })
    .from(likeActionsTable)
    .where(
      and(
        eq(likeActionsTable.likedId, likedId),
        inArray(likeActionsTable.likerId, likerIds),
      ),
    )
    .orderBy(desc(likeActionsTable.createdAt));

  const seen = new Set<string>();
  const superLikers = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.likerId)) continue;
    seen.add(r.likerId);
    if (r.kind === "superlike") superLikers.add(r.likerId);
  }
  return superLikers;
}
