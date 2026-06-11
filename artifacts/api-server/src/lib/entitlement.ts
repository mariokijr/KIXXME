import { supabase } from "./supabase.js";

export type Plan = "free" | "plus" | "gold";

/**
 * Testing-only Gold override.
 *
 * The real entitlement source of truth is Supabase `profiles.plan`, written
 * ONLY by the Stripe webhook. To let specific accounts exercise Gold features
 * (e.g. KixxMe Live) WITHOUT a real subscription, a small case-insensitive
 * allowlist of emails can be supplied via the `GOLD_TEST_EMAILS` env var
 * (comma-separated), mirroring the `ADMIN_EMAILS` pattern.
 *
 * This is a read-only override: it never writes `profiles.plan`, never touches
 * Stripe, and disappears the moment the env var is cleared. It is consulted
 * only when the real plan isn't already Gold, the email is resolved with the
 * pure service-role `admin.getUserById` read (no session attachment), and the
 * per-user decision is cached so it adds no round-trip on the hot path — and
 * none at all in production when the allowlist is empty.
 */
const TEST_GOLD_TTL_MS = 5 * 60_000;
const testGoldCache = new Map<string, { gold: boolean; expires: number }>();

function goldTestEmails(): Set<string> {
  return new Set(
    (process.env.GOLD_TEST_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function isTestGold(userId: string): Promise<boolean> {
  const allow = goldTestEmails();
  if (allow.size === 0) return false;
  const now = Date.now();
  const cached = testGoldCache.get(userId);
  if (cached && cached.expires > now) return cached.gold;
  let gold = false;
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    const email = data?.user?.email?.toLowerCase() ?? null;
    gold = email ? allow.has(email) : false;
  } catch {
    gold = false;
  }
  testGoldCache.set(userId, { gold, expires: now + TEST_GOLD_TTL_MS });
  return gold;
}

/**
 * Read a user's entitlement plan. The authoritative source of truth is
 * Supabase `profiles.plan`, written only by the Stripe webhook (see
 * `lib/billing.ts`). Anything other than a known paid tier resolves to "free".
 * A `GOLD_TEST_EMAILS` allowlist can promote specific accounts to Gold for
 * testing without a subscription (see `isTestGold`).
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
  if (plan === "gold") return "gold";
  if (await isTestGold(userId)) return "gold";
  if (plan === "plus") return "plus";
  return "free";
}

/** True when the user currently holds Gold entitlement. */
export async function hasGold(userId: string): Promise<boolean> {
  return (await getPlan(userId)) === "gold";
}
