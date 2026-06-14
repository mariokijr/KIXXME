import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db, profileDetailsTable, rewardCreditsTable } from "@workspace/db";
import { getCreditBalance } from "./rewards.js";

const BOOST_DURATION_MS = 30 * 60 * 1000; // 30 minutes
export const BOOST_CREDIT_COST = 5;

export interface BoostStatusResult {
  active: boolean;
  expires_at: string | null;
  credits_available: number;
}

/**
 * Returns the current boost status for a user.
 */
export async function getBoostStatus(
  userId: string,
): Promise<BoostStatusResult> {
  const [row, credits] = await Promise.all([
    db
      .select({ boostExpiresAt: profileDetailsTable.boostExpiresAt })
      .from(profileDetailsTable)
      .where(eq(profileDetailsTable.userId, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    getCreditBalance(userId),
  ]);

  const now = new Date();
  const expiresAt = row?.boostExpiresAt ?? null;
  const active = expiresAt != null && expiresAt > now;

  return {
    active,
    expires_at: active ? expiresAt!.toISOString() : null,
    credits_available: credits.likes,
  };
}

/**
 * Activates a 30-minute profile boost for the user.
 *
 * Returns `{ ok: true, status }` on success.
 * Returns `{ ok: false, reason: "already_active" }` if a boost is already running.
 * Returns `{ ok: false, reason: "insufficient_credits" }` if < BOOST_CREDIT_COST credits.
 */
export async function activateBoost(userId: string): Promise<
  | { ok: true; status: BoostStatusResult }
  | { ok: false; reason: "already_active" | "insufficient_credits" }
> {
  return await db.transaction(async (tx) => {
    // Check current boost.
    const [existing] = await tx
      .select({ boostExpiresAt: profileDetailsTable.boostExpiresAt })
      .from(profileDetailsTable)
      .where(eq(profileDetailsTable.userId, userId))
      .limit(1);

    const now = new Date();
    if (existing?.boostExpiresAt && existing.boostExpiresAt > now) {
      return { ok: false as const, reason: "already_active" as const };
    }

    // Check credit balance inside the transaction.
    const [balRow] = await tx
      .select({
        balance: sql<number>`coalesce(sum(${rewardCreditsTable.delta}), 0)::int`,
      })
      .from(rewardCreditsTable)
      .where(
        and(
          eq(rewardCreditsTable.userId, userId),
          eq(rewardCreditsTable.kind, "like"),
        ),
      );

    const balance = balRow?.balance ?? 0;
    if (balance < BOOST_CREDIT_COST) {
      return { ok: false as const, reason: "insufficient_credits" as const };
    }

    // Deduct credits (append-only ledger, delta negative).
    await tx.insert(rewardCreditsTable).values({
      userId,
      kind: "like",
      delta: -BOOST_CREDIT_COST,
      reason: "spend",
    });

    // Set boost expiry.
    const expiresAt = new Date(now.getTime() + BOOST_DURATION_MS);
    await tx
      .insert(profileDetailsTable)
      .values({ userId, boostExpiresAt: expiresAt })
      .onConflictDoUpdate({
        target: profileDetailsTable.userId,
        set: { boostExpiresAt: expiresAt },
      });

    return {
      ok: true as const,
      status: {
        active: true,
        expires_at: expiresAt.toISOString(),
        credits_available: balance - BOOST_CREDIT_COST,
      },
    };
  });
}

/**
 * Returns the subset of `userIds` that currently have an active boost.
 * Used by the discovery sort — never throws, returns empty set on error.
 */
export async function getActiveBoostedIds(
  userIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  try {
    const now = new Date();
    const rows = await db
      .select({ userId: profileDetailsTable.userId })
      .from(profileDetailsTable)
      .where(
        and(
          inArray(profileDetailsTable.userId, userIds),
          gt(profileDetailsTable.boostExpiresAt, now),
        ),
      );
    return new Set(rows.map((r) => r.userId));
  } catch {
    return new Set();
  }
}
