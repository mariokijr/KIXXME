import { supabase } from "./supabase.js";
import { logger } from "./logger.js";
import {
  appBaseUrl,
  sendEmail,
  MODERATION_WARNING_SUBJECT,
  moderationWarningEmailHtml,
  MODERATION_SUSPENDED_SUBJECT,
  moderationSuspendedEmailHtml,
  MODERATION_BANNED_SUBJECT,
  moderationBannedEmailHtml,
  MODERATION_REMOVED_SUBJECT,
  moderationRemovedEmailHtml,
  MODERATION_RESTORED_SUBJECT,
  moderationRestoredEmailHtml,
} from "./email.js";

/**
 * Email notifications for admin moderation actions (warn / suspend / ban /
 * remove / restore). For a warning, the email is the ONLY user-facing surface —
 * a warning changes no account state.
 *
 * These are fire-and-forget: callers invoke them with `void` and they never
 * throw (every failure is logged), so a mail problem can never turn a
 * successful moderation action into a request error.
 *
 * Looking up a user's email uses the service-role auth admin API
 * (`getUserById`), a pure read that does NOT attach a session to the shared
 * client (unlike signIn/signUp/verifyOtp/refreshSession/setSession), so it is
 * safe on the shared `supabase` client.
 */

async function getEmail(userId: string): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) {
    logger.warn(
      { err: error.message, userId },
      "getUserById failed (email lookup for moderation notification)",
    );
    return null;
  }
  return data.user?.email ?? null;
}

export async function notifyWarningByEmail(
  userId: string,
  reason: string | null,
): Promise<void> {
  try {
    const email = await getEmail(userId);
    if (!email) return;
    await sendEmail({
      to: email,
      subject: MODERATION_WARNING_SUBJECT,
      html: moderationWarningEmailHtml(reason, appBaseUrl()),
    });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "notifyWarningByEmail failed",
    );
  }
}

export async function notifySuspensionByEmail(
  userId: string,
  reason: string | null,
  until: Date | null,
): Promise<void> {
  try {
    const email = await getEmail(userId);
    if (!email) return;
    await sendEmail({
      to: email,
      subject: MODERATION_SUSPENDED_SUBJECT,
      html: moderationSuspendedEmailHtml(reason, until),
    });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "notifySuspensionByEmail failed",
    );
  }
}

export async function notifyBanByEmail(
  userId: string,
  reason: string | null,
): Promise<void> {
  try {
    const email = await getEmail(userId);
    if (!email) return;
    await sendEmail({
      to: email,
      subject: MODERATION_BANNED_SUBJECT,
      html: moderationBannedEmailHtml(reason),
    });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "notifyBanByEmail failed",
    );
  }
}

export async function notifyRemovalByEmail(
  userId: string,
  reason: string | null,
): Promise<void> {
  try {
    const email = await getEmail(userId);
    if (!email) return;
    await sendEmail({
      to: email,
      subject: MODERATION_REMOVED_SUBJECT,
      html: moderationRemovedEmailHtml(reason),
    });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "notifyRemovalByEmail failed",
    );
  }
}

export async function notifyRestoreByEmail(userId: string): Promise<void> {
  try {
    const email = await getEmail(userId);
    if (!email) return;
    await sendEmail({
      to: email,
      subject: MODERATION_RESTORED_SUBJECT,
      html: moderationRestoredEmailHtml(appBaseUrl()),
    });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "notifyRestoreByEmail failed",
    );
  }
}
