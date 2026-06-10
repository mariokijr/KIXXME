import { and, eq, sql } from "drizzle-orm";
import { db, rewardCreditsTable, userStreaksTable } from "@workspace/db";
import type { LikeKind } from "@workspace/db";

/**
 * Gamification engine: daily streaks + daily rewards that grant bonus
 * like/SuperLike CREDITS. Credits live in the append-only `reward_credits`
 * ledger (Replit Postgres); the spendable balance is SUM(delta) per
 * (user, kind). The like/SuperLike SPEND path lives in `lib/likes.ts` — it
 * draws a credit (delta -1) only once the base rolling-window allowance is
 * exhausted, inside the same per-user advisory-locked transaction so the
 * balance can never go negative.
 *
 * Streaks are driven by the CLAIM, not arbitrary activity, and keyed on the
 * UTC calendar day (computed via toISOString().slice(0,10), never local-time
 * Date methods).
 */

// --- Reward configuration --------------------------------------------------

/** Bonus regular likes granted on every successful daily claim. */
const DAILY_LIKE_REWARD = 5;
/** A bonus SuperLike is granted every Nth consecutive day. */
const SUPERLIKE_MILESTONE_EVERY = 7;
/** How many bonus SuperLikes a milestone grants. */
const SUPERLIKE_MILESTONE_AMOUNT = 1;

// --- Shapes ----------------------------------------------------------------

export interface CreditBalance {
  likes: number;
  superlikes: number;
}

export interface RewardsState {
  streak: { current: number; longest: number };
  claimable: boolean;
  nextClaimAt: string | null;
  credits: CreditBalance;
}

export type ClaimResult =
  | {
      ok: true;
      streak: { current: number; longest: number };
      granted: CreditBalance;
      credits: CreditBalance;
      milestone: boolean;
    }
  | { ok: false; reason: "already_claimed"; nextClaimAt: string };

// --- UTC calendar-day helpers ----------------------------------------------

/** Today's UTC calendar day as YYYY-MM-DD. */
function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** ISO instant of the next UTC midnight after `now`. */
function nextUtcMidnight(now: Date = new Date()): string {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return new Date(next).toISOString();
}

/** True when `dateStr` (YYYY-MM-DD) is exactly the day before `today`. */
function isYesterday(dateStr: string, today: string): boolean {
  const next = new Date(`${dateStr}T00:00:00.000Z`).getTime() + 86_400_000;
  return new Date(next).toISOString().slice(0, 10) === today;
}

/** True when a stored claim day still keeps the streak "alive" relative to today. */
function streakAlive(lastClaimDate: string, today: string): boolean {
  return lastClaimDate === today || isYesterday(lastClaimDate, today);
}

// --- Balance ---------------------------------------------------------------

/**
 * Spendable bonus-credit balance for a user, derived as SUM(delta) per kind.
 * Clamped at 0 defensively (it can't go negative by construction).
 */
export async function getCreditBalance(userId: string): Promise<CreditBalance> {
  const rows = await db
    .select({
      kind: rewardCreditsTable.kind,
      balance: sql<number>`coalesce(sum(${rewardCreditsTable.delta}), 0)::int`,
    })
    .from(rewardCreditsTable)
    .where(eq(rewardCreditsTable.userId, userId))
    .groupBy(rewardCreditsTable.kind);

  const out: CreditBalance = { likes: 0, superlikes: 0 };
  for (const r of rows) {
    if (r.kind === "superlike") out.superlikes = Math.max(0, r.balance);
    else if (r.kind === "like") out.likes = Math.max(0, r.balance);
  }
  return out;
}

// --- Rewards state (read) --------------------------------------------------

export async function getRewardsState(userId: string): Promise<RewardsState> {
  const today = utcDay();
  const [streakRow, credits] = await Promise.all([
    db
      .select()
      .from(userStreaksTable)
      .where(eq(userStreaksTable.userId, userId))
      .then((r) => r[0]),
    getCreditBalance(userId),
  ]);

  const longest = streakRow?.longestStreak ?? 0;
  // A streak that hasn't been kept alive (missed a day) reads as 0 — it will
  // reset to 1 on the next claim.
  let current = 0;
  if (streakRow?.lastClaimDate && streakAlive(streakRow.lastClaimDate, today)) {
    current = streakRow.currentStreak;
  }
  const claimable = streakRow?.lastClaimDate !== today;
  const nextClaimAt = claimable ? null : nextUtcMidnight();

  return { streak: { current, longest }, claimable, nextClaimAt, credits };
}

// --- Daily reward claim (write) --------------------------------------------

/**
 * Claim today's daily reward. Idempotent per UTC day: a second claim the same
 * day returns `already_claimed` with the next-claim instant. Streak increments
 * when yesterday was claimed, otherwise resets to 1. The streak upsert and the
 * credit-grant inserts happen in one per-user advisory-locked transaction (the
 * same lock the like-spend path uses).
 */
export async function claimDailyReward(userId: string): Promise<ClaimResult> {
  const today = utcDay();

  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);

    const [existing] = await tx
      .select()
      .from(userStreaksTable)
      .where(eq(userStreaksTable.userId, userId));

    if (existing?.lastClaimDate === today) {
      return { claimed: false as const };
    }

    const newStreak =
      existing?.lastClaimDate && isYesterday(existing.lastClaimDate, today)
        ? existing.currentStreak + 1
        : 1;
    const longest = Math.max(existing?.longestStreak ?? 0, newStreak);
    const now = new Date();

    await tx
      .insert(userStreaksTable)
      .values({
        userId,
        currentStreak: newStreak,
        longestStreak: longest,
        lastClaimDate: today,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userStreaksTable.userId,
        set: {
          currentStreak: newStreak,
          longestStreak: longest,
          lastClaimDate: today,
          updatedAt: now,
        },
      });

    const milestone = newStreak % SUPERLIKE_MILESTONE_EVERY === 0;
    const granted: CreditBalance = {
      likes: DAILY_LIKE_REWARD,
      superlikes: milestone ? SUPERLIKE_MILESTONE_AMOUNT : 0,
    };

    const grants: { userId: string; kind: LikeKind; delta: number; reason: string }[] = [
      { userId, kind: "like", delta: granted.likes, reason: "daily_reward" },
    ];
    if (granted.superlikes > 0) {
      grants.push({
        userId,
        kind: "superlike",
        delta: granted.superlikes,
        reason: "streak_milestone",
      });
    }
    await tx.insert(rewardCreditsTable).values(grants);

    return {
      claimed: true as const,
      streak: { current: newStreak, longest },
      granted,
      milestone,
    };
  });

  if (!outcome.claimed) {
    return {
      ok: false,
      reason: "already_claimed",
      nextClaimAt: nextUtcMidnight(),
    };
  }

  // Balance read after commit reflects the just-granted credits.
  const credits = await getCreditBalance(userId);
  return {
    ok: true,
    streak: outcome.streak,
    granted: outcome.granted,
    credits,
    milestone: outcome.milestone,
  };
}
