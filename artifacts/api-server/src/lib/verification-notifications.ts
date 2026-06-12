import { supabase } from "./supabase.js";
import { logger } from "./logger.js";
import {
  appBaseUrl,
  sendEmail,
  verificationApprovedEmail,
  verificationRejectedEmail,
} from "./email.js";
import { claimEmailSend } from "./email-policy.js";

/**
 * Fire-and-forget email telling a user the outcome of their profile
 * (identity selfie) verification review. Always-on (transactional), idempotent
 * per request id so a retry can never double-email. Never throws — a mail
 * problem must not affect the admin review result. `getUserById` is a pure
 * service-role read and does not pollute the shared client session.
 */
export async function notifyVerificationReviewedByEmail(
  userId: string,
  decision: "approve" | "reject",
  note: string | null,
  requestId: string,
): Promise<void> {
  try {
    const category =
      decision === "approve"
        ? "verification_approved"
        : "verification_rejected";
    const claimed = await claimEmailSend({
      userId,
      category,
      dedupKey: `verification:${requestId}`,
    });
    if (!claimed) return;

    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error) {
      logger.warn(
        { err: error.message, userId },
        "verification review email: getUserById failed",
      );
      return;
    }
    const email = data.user?.email ?? null;
    if (!email) return;

    const base = appBaseUrl();
    const appUrl = base ? `${base}/profile` : undefined;
    const t =
      decision === "approve"
        ? verificationApprovedEmail({ appUrl })
        : verificationRejectedEmail({ note, appUrl });
    await sendEmail({ to: email, subject: t.subject, html: t.html });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "notifyVerificationReviewedByEmail failed",
    );
  }
}
