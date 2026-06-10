import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
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
  free: { max: 15, windowHours: 6 },
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
  | { ok: true; isSuper: boolean; matched: boolean; quota: LikeQuota }
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
  return { count: row?.count ?? 0, oldest: row?.oldest ?? null };
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

  const { error } = await supabase
    .from("likes")
    .upsert(
      { liker_id: likerId, liked_id: likedId },
      { onConflict: "liker_id,liked_id", ignoreDuplicates: true },
    );

  if (error) {
    // Dual compensating refund: undo BOTH the action log row and any credit
    // spend row, so a downstream Supabase failure never costs the user a base
    // unit OR a bonus credit. Both deletes run in one transaction so a partial
    // failure can't leave the credit spent but the like un-recorded.
    try {
      await db.transaction(async (tx) => {
        if (gate.id) {
          await tx
            .delete(likeActionsTable)
            .where(eq(likeActionsTable.id, gate.id));
        }
        if (gate.spendId) {
          await tx
            .delete(rewardCreditsTable)
            .where(eq(rewardCreditsTable.id, gate.spendId));
        }
      });
    } catch {
      /* best-effort refund */
    }
    return { ok: false, reason: "error", message: error.message };
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
    quota: await getLikeQuota(likerId),
  };
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
