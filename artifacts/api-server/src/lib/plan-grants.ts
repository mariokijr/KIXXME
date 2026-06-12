import { eq } from "drizzle-orm";
import { db, planGrantsTable } from "@workspace/db";
import { supabase } from "./supabase.js";

/**
 * Multi-source entitlement bridge.
 *
 * Supabase `profiles.plan` is the authoritative entitlement read by the rest of
 * the app, but it has TWO writers now: Stripe (web checkout) and RevenueCat
 * (native in-app purchases). Each source records the tier it currently grants in
 * its own `plan_grants` row; the effective plan written to Supabase is the MAX
 * tier across sources. This is what stops a Stripe `subscription.deleted`
 * (Stripe grant → free) from revoking a Gold entitlement bought via the App
 * Store, and vice-versa.
 *
 * `recomputePlan` is the ONLY function that writes `profiles.plan`.
 */

export type GrantSource = "stripe" | "revenuecat";

const RANK: Record<string, number> = { free: 0, plus: 1, gold: 2 };

function rank(plan: string): number {
  return RANK[plan] ?? 0;
}

/** Normalize an arbitrary tier string to a known plan ("free" when unknown). */
export function normalizePlan(plan: string | null | undefined): string {
  const p = (plan ?? "free").toLowerCase();
  return p in RANK ? p : "free";
}

/** Authoritative write of Supabase `profiles.plan`. Only `recomputePlan` calls this. */
async function writeProfilePlan(userId: string, plan: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ plan })
    .eq("id", userId);
  if (error) {
    throw new Error(
      `Failed to update profiles.plan for ${userId}: ${error.message}`,
    );
  }
}

/** Upsert a single source's current grant (idempotent). */
export async function setPlanGrant(
  userId: string,
  source: GrantSource,
  plan: string,
): Promise<void> {
  const normalized = normalizePlan(plan);
  await db
    .insert(planGrantsTable)
    .values({ userId, source, plan: normalized })
    .onConflictDoUpdate({
      target: [planGrantsTable.userId, planGrantsTable.source],
      set: { plan: normalized, updatedAt: new Date() },
    });
}

/**
 * Recompute the effective plan (MAX tier across every grant source) and write it
 * to Supabase `profiles.plan`. Returns the effective plan. Idempotent.
 */
export async function recomputePlan(userId: string): Promise<string> {
  const rows = await db
    .select()
    .from(planGrantsTable)
    .where(eq(planGrantsTable.userId, userId));
  let effective = "free";
  for (const r of rows) {
    if (rank(r.plan) > rank(effective)) effective = r.plan;
  }
  await writeProfilePlan(userId, effective);
  return effective;
}

/**
 * Record a source's grant then recompute the effective plan in one step. This is
 * the entry point both the Stripe webhook and the RevenueCat webhook use instead
 * of writing `profiles.plan` directly.
 */
export async function applyPlanGrant(
  userId: string,
  source: GrantSource,
  plan: string,
): Promise<string> {
  await setPlanGrant(userId, source, plan);
  return recomputePlan(userId);
}
