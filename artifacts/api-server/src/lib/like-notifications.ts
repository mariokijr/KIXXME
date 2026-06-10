import { supabase } from "./supabase.js";
import { logger } from "./logger.js";
import { getPlan } from "./entitlement.js";
import {
  appBaseUrl,
  sendEmail,
  matchEmail,
  superLikeReceivedEmail,
} from "./email.js";

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
    const tasks: Promise<boolean>[] = [];
    if (emailA) {
      const t = matchEmail(nameB ?? "alguien", appUrl);
      tasks.push(sendEmail({ to: emailA, subject: t.subject, html: t.html }));
    }
    if (emailB) {
      const t = matchEmail(nameA ?? "alguien", appUrl);
      tasks.push(sendEmail({ to: emailB, subject: t.subject, html: t.html }));
    }
    await Promise.all(tasks);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "notifyMatchByEmail failed",
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
