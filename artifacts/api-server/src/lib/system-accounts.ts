import { supabase } from "./supabase.js";

/**
 * Internal "system" accounts (e.g. the `supportkixxme@gmail.com` support
 * identity). These exist to operate the app — they run the admin dashboard and
 * the official "👑 Soporte KixxMe" ticket — but must NEVER appear as a real
 * person to other users: hidden from Descubrir (grid + cards), the map, En
 * línea, Cuadrícula, Empareja, public profiles, likes/superlikes and
 * conversation creation, and they skip the mandatory onboarding entirely.
 *
 * Identity is an email allowlist (`SYSTEM_ACCOUNT_EMAILS`, comma-separated,
 * case-insensitive; defaults to the known support address), mirroring the
 * `ADMIN_EMAILS` / `GOLD_TEST_EMAILS` patterns. Two complementary lookups:
 *
 * - `isSystemAccount(userId)` — per-id check used by the id-addressable
 *   surfaces (GET /profiles/:id, like). It resolves id→email via the pure
 *   service-role `admin.getUserById` read and caches the decision (5 min), so
 *   it is correct immediately after a restart with no warm-up.
 * - `getSystemAccountIds()` — a best-effort set unioned into the list-surface
 *   visibility filter. It is populated opportunistically as system accounts
 *   authenticate (`recordIfSystem` from `requireAuth`) plus whenever
 *   `isSystemAccount` resolves true. During the brief window after a restart
 *   before the support account has authenticated, list surfaces still exclude
 *   it because a system account has no "complete" profile and therefore never
 *   passes calidad mínima — so it must never be given a complete profile.
 */

const SYSTEM_TTL_MS = 5 * 60_000;
const systemCache = new Map<string, { system: boolean; expires: number }>();
const knownSystemIds = new Set<string>();

const DEFAULT_SYSTEM_EMAILS = ["supportkixxme@gmail.com"];

export function systemAccountEmails(): Set<string> {
  const raw = (process.env.SYSTEM_ACCOUNT_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const emails = raw.length > 0 ? raw : DEFAULT_SYSTEM_EMAILS;
  return new Set(emails);
}

function isSystemEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return systemAccountEmails().has(email.toLowerCase());
}

/**
 * Opportunistically record a user as a system account when their email matches.
 * Zero-cost: called from `requireAuth` where the email is already resolved.
 */
export function recordIfSystem(
  userId: string,
  email: string | null | undefined,
): void {
  if (isSystemEmail(email)) {
    knownSystemIds.add(userId);
    systemCache.set(userId, {
      system: true,
      expires: Date.now() + SYSTEM_TTL_MS,
    });
  }
}

/** Per-id check (cached id→email via service-role read); robust after restart. */
export async function isSystemAccount(userId: string): Promise<boolean> {
  const now = Date.now();
  const cached = systemCache.get(userId);
  if (cached && cached.expires > now) return cached.system;
  let system = false;
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    system = isSystemEmail(data?.user?.email ?? null);
  } catch {
    system = false;
  }
  systemCache.set(userId, { system, expires: now + SYSTEM_TTL_MS });
  if (system) knownSystemIds.add(userId);
  return system;
}

/** Best-effort set of known system-account ids (grows as accounts authenticate). */
export function getSystemAccountIds(): Set<string> {
  return new Set(knownSystemIds);
}
