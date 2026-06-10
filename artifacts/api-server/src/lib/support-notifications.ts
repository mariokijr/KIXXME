import { supabase } from "./supabase.js";
import { logger } from "./logger.js";
import { appBaseUrl, sendEmail, supportReplyEmail } from "./email.js";

/**
 * Fire-and-forget email to a support ticket's owner when an admin replies.
 *
 * Like the other engagement emails (see `like-notifications.ts`), this never
 * throws — callers invoke it with `void` — so a mail problem can't turn a
 * successful reply into a request error. The reply body is intentionally NOT
 * included; the email only nudges the user back into the app.
 *
 * `getUserById` is a pure service-role read; it does NOT attach a session to
 * the shared client the way signIn/signUp/refreshSession/setSession do.
 */
export async function notifySupportReplyByEmail(
  ownerId: string,
  subject: string,
): Promise<void> {
  try {
    const { data, error } = await supabase.auth.admin.getUserById(ownerId);
    if (error) {
      logger.warn(
        { err: error.message, ownerId },
        "support reply email: getUserById failed",
      );
      return;
    }
    const email = data.user?.email ?? null;
    if (!email) return;
    const t = supportReplyEmail(subject, appBaseUrl());
    await sendEmail({ to: email, subject: t.subject, html: t.html });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "notifySupportReplyByEmail failed",
    );
  }
}
