import type { Logger } from "pino";
import type { CodeAction } from "./account.js";
import { createActionCode } from "./account.js";
import { getEmailVerifiedAt } from "./profile-details.js";
import { isSystemEmail } from "./system-accounts.js";
import { sendEmail, emailVerificationCodeEmail } from "./email.js";

/**
 * Mandatory email verification at signup. A freshly-registered account is
 * unusable until the user proves access to their inbox with a 6-digit code
 * (15-min TTL, 5 attempts, 60s resend cooldown — all enforced by the shared
 * hardened code lifecycle in `lib/account.ts`). Verification state is the
 * `emailVerifiedAt` column on Replit-Postgres `profile_details` (we own it;
 * the Supabase schema is NOT DDL-modifiable from this repo).
 *
 * The gate itself lives in `requireAuth` (lib/auth.ts) via `allowUnverified`.
 */

/** The code-lifecycle action key (free-text column → no migration needed). */
export const VERIFY_EMAIL_ACTION: CodeAction = "verify_email";

/**
 * Accounts created BEFORE this instant are grandfathered (never gated), so
 * the feature only applies to new signups. Set to the day enforcement was
 * re-enabled (2026-06-14) after Resend was fully configured with a verified
 * custom domain, making email delivery reliable. Accounts registered during
 * the brief gap (2026-06-12 → 2026-06-14) when the gate was temporarily
 * disabled (due to Gmail quota exhaustion) are grandfathered by this date.
 */
export const EMAIL_VERIFICATION_ENFORCED_FROM = Date.UTC(2026, 5, 14); // 2026-06-14T00:00:00Z

/** Minimal shape of the Supabase auth user we need to decide verification. */
interface VerifiableUser {
  id: string;
  email?: string | null;
  created_at?: string;
}

/** Lightweight email sanity check (presence of a single @ with non-empty sides). */
export function isValidEmail(email: string | null | undefined): boolean {
  if (typeof email !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Whether this user has satisfied the mandatory email check. Order:
 *  1. Accounts created before the cutoff (or with an unparseable created_at) are
 *     grandfathered → always verified.
 *  2. System/support accounts are exempt → always verified.
 *  3. Otherwise the `emailVerifiedAt` column must be set.
 *
 * FAILS OPEN: any DB error returns `true`. Verification is a usability gate, not
 * a security boundary (auth + moderation already protect access), so a transient
 * blip — or the column being absent in an environment that hasn't run the
 * migration — must never lock the entire user base out.
 */
export async function isEmailVerified(
  user: VerifiableUser,
  log?: Logger,
): Promise<boolean> {
  // 1. Grandfather legacy accounts by creation time.
  const createdMs = user.created_at
    ? new Date(user.created_at).getTime()
    : NaN;
  if (Number.isNaN(createdMs) || createdMs < EMAIL_VERIFICATION_ENFORCED_FROM) {
    return true;
  }

  // 2. System/support accounts never go through email verification.
  if (isSystemEmail(user.email)) return true;

  // 3. New accounts must have a verified timestamp.
  try {
    const verifiedAt = await getEmailVerifiedAt(user.id);
    return verifiedAt !== null;
  } catch (err) {
    log?.warn(
      { err: err instanceof Error ? err.message : String(err), userId: user.id },
      "email-verification: status lookup failed — failing open",
    );
    return true;
  }
}

/**
 * Generate a fresh code and email it. Returns whether the email was sent and the
 * code's expiry. The caller is responsible for the resend cooldown (see
 * `requestCooldownRemaining`). Never throws — `sendEmail` logs and returns false
 * when email is not configured.
 */
export async function sendVerificationEmail(
  userId: string,
  email: string,
): Promise<{ sent: boolean; expiresAt: Date }> {
  const { code, expiresAt } = await createActionCode(userId, VERIFY_EMAIL_ACTION);
  const { subject, html } = emailVerificationCodeEmail(code);
  const sent = await sendEmail({ to: email, subject, html });
  return { sent, expiresAt };
}
