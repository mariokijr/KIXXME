import { supabase } from "./supabase.js";
import { logger } from "./logger.js";
import { appBaseUrl, sendEmail, missedCallEmail } from "./email.js";
import { claimEmailSend } from "./email-policy.js";

/**
 * Email notifications for KixxMe Live.
 *
 * Currently a single nudge: a "llamada perdida" email sent to the callee of a
 * PRIVATE (direct, person-to-person) call that rang out without an answer.
 * Random-match (roulette) calls never email — both parties are live in real
 * time, so a missed match is meaningless out of band.
 *
 * Fire-and-forget: callers invoke with `void` and this never throws (failures
 * are logged), so a mail problem can never turn a successful call transition
 * into an error. `getUserById` is a pure service-role read and does NOT pollute
 * the shared client session.
 */

// At most one missed-call email per caller->callee per window, so repeated
// unanswered calls (or concurrent lazy "missed" transitions) never flood.
const MISSED_CALL_COOLDOWN_MS = 30 * 60 * 1000;

async function getEmail(userId: string): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) {
    logger.warn(
      { err: error.message, userId },
      "getUserById failed (email lookup for missed-call notification)",
    );
    return null;
  }
  return data.user?.email ?? null;
}

async function getUsername(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  return (data?.username as string | undefined) ?? null;
}

/**
 * Notify the callee that they missed a private call. The caller's name is
 * revealed (a direct call is between two people who chose to connect, unlike an
 * anonymous match). Claims first so the cooldown also short-circuits the lookups
 * on repeated calls.
 */
export async function notifyMissedCallByEmail(
  calleeId: string,
  callerId: string,
): Promise<void> {
  try {
    const claimed = await claimEmailSend({
      userId: calleeId,
      category: "missed_call",
      dedupKey: `missed:${callerId}:${calleeId}`,
      cooldownMs: MISSED_CALL_COOLDOWN_MS,
    });
    if (!claimed) return;

    const email = await getEmail(calleeId);
    if (!email) return;
    const callerName = await getUsername(callerId);
    const base = appBaseUrl();
    const t = missedCallEmail({
      callerName,
      appUrl: base ? `${base}/` : undefined,
    });
    await sendEmail({ to: email, subject: t.subject, html: t.html });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "notifyMissedCallByEmail failed",
    );
  }
}
