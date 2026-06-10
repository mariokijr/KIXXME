import { supabase } from "./supabase.js";

export type Plan = "free" | "plus" | "gold";

/**
 * Read a user's entitlement plan. The authoritative source of truth is
 * Supabase `profiles.plan`, written only by the Stripe webhook (see
 * `lib/billing.ts`). Anything other than a known paid tier resolves to "free".
 */
export async function getPlan(userId: string): Promise<Plan> {
  const { data, error } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to read plan for ${userId}: ${error.message}`);
  }
  const plan = (data?.plan as string | null) ?? "free";
  if (plan === "gold" || plan === "plus") return plan;
  return "free";
}

/** True when the user currently holds Gold entitlement. */
export async function hasGold(userId: string): Promise<boolean> {
  return (await getPlan(userId)) === "gold";
}
