import { supabase } from "./supabase.js";
import { logger } from "./logger.js";
import { getPlan } from "./entitlement.js";
import {
  appBaseUrl,
  sendEmail,
  matchEmail,
  superLikeReceivedEmail,
  likeReceivedEmail,
} from "./email.js";
import {
  claimEmailSend,
  isEmailCategoryEnabled,
  recordEmailSent,
  pairKey,
} from "./email-policy.js";

/**
 * Email notifications for likes. A like that becomes a mutual Match emails BOTH
 * parties (each sees the other's name); a SuperLike emails the recipient.
 *
 * These are fire-and-forget: callers invoke them with `void` and they never
 * throw (every failure is logged), so a mail problem can never turn a
 * successful like into a request error.
 *
 * Looking up a user's email uses the service-role auth admin API
 * (`getUserById`), which is a pure read — it does NOT attach a session to the
 * shared client the way signIn/signUp/verifyOtp/refreshSession/setSession do,
 * so it is safe to call on the shared `supabase` client.
 */

async function getEmail(userId: string): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) {
    logger.warn(
      { err: error.message, userId },
      "getUserById failed (email lookup for like notification)",
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

/** Email both users that they've matched (each one sees the OTHER's name). */
export async function notifyMatchByEmail(
  userAId: string,
  userBId: string,
): Promise<void> {
  try {
    const appUrl = appBaseUrl();
    const [emailA, emailB, nameA, nameB] = await Promise.all([
      getEmail(userAId),
      getEmail(userBId),
      getUsername(userAId),
      getUsername(userBId),
    ]);
    const [wantA, wantB] = await Promise.all([
      isEmailCategoryEnabled(userAId, "match"),
      isEmailCategoryEnabled(userBId, "match"),
    ]);
    const tasks: Promise<boolean>[] = [];
    if (emailA && wantA) {
      const t = matchEmail(nameB ?? "alguien", appUrl);
      tasks.push(sendEmail({ to: emailA, subject: t.subject, html: t.html }));
    }
    if (emailB && wantB) {
      const t = matchEmail(nameA ?? "alguien", appUrl);
      tasks.push(sendEmail({ to: emailB, subject: t.subject, html: t.html }));
    }
    await Promise.all(tasks);
    // Mark the pair so a chat "tienes mensajes nuevos" email fired seconds later
    // (the match auto-opens a conversation) is suppressed — but only when we
    // actually sent a match email.
    if (tasks.length > 0) {
      await recordEmailSent(userAId, "match", pairKey(userAId, userBId));
    }
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "notifyMatchByEmail failed",
    );
  }
}

/**
 * Email the recipient of a regular (non-super) like. Rate-limited to once per
 * 24 h per (sender, recipient) pair so repeated likes from the same person
 * don't spam the inbox. Suppressed when the pair has already matched (a match
 * email covers it) or when the recipient opted out.
 */
export async function notifyLikeByEmail(
  recipientId: string,
  senderId: string,
): Promise<void> {
  try {
    const email = await getEmail(recipientId);
    if (!email) return;
    // Once-per-24h per sender→recipient; the dedupKey encodes the direction
    // so A liking B and B liking A each get their own email slot.
    const claimed = await claimEmailSend({
      userId: recipientId,
      category: "like",
      dedupKey: `like:${senderId}:${recipientId}`,
      cooldownMs: 24 * 60 * 60 * 1000,
    });
    if (!claimed) return;
    const t = likeReceivedEmail(appBaseUrl());
    await sendEmail({ to: email, subject: t.subject, html: t.html });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "notifyLikeByEmail failed",
    );
  }
}

/**
 * Email the recipient of a SuperLike. The sender's name is only revealed to
 * Plus/Gold recipients (same redaction as in-app notifications); free
 * recipients get an anonymous "alguien" plus an upsell.
 */
export async function notifySuperLikeByEmail(
  recipientId: string,
  senderId: string,
): Promise<void> {
  try {
    const email = await getEmail(recipientId);
    if (!email) return;
    if (!(await isEmailCategoryEnabled(recipientId, "superlike"))) return;
    const plan = await getPlan(recipientId);
    const senderName = plan !== "free" ? await getUsername(senderId) : null;
    const t = superLikeReceivedEmail(senderName, appBaseUrl());
    await sendEmail({ to: email, subject: t.subject, html: t.html });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "notifySuperLikeByEmail failed",
    );
  }
}
