import { supabase } from "./supabase.js";
import { logger } from "./logger.js";
import {
  appBaseUrl,
  sendEmail,
  supportReplyEmail,
  supportNewMessageEmail,
  supportTicketClosedEmail,
  reportResolvedEmail,
  SUPPORT_EMAIL,
} from "./email.js";
import { claimEmailSend } from "./email-policy.js";

const PREVIEW_LEN = 140;

/** Flatten + cap a message body for an email preview line. */
function previewOf(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_LEN ? `${flat.slice(0, PREVIEW_LEN)}…` : flat;
}

/** Strip CR/LF so a user-supplied subject can't inject outbound headers. */
function singleLine(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]+/g, " ").trim();
}

/** Best-effort public username for a user id (display only). */
async function loadUsername(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle();
    const name = (data?.username as string | null) ?? null;
    return name && name.trim().length > 0 ? name.trim() : "Un usuario";
  } catch {
    return "Un usuario";
  }
}

/**
 * Fire-and-forget email to a support ticket's owner when support replies.
 *
 * Like the other engagement emails (see `like-notifications.ts`), this never
 * throws — callers invoke it with `void` — so a mail problem can't turn a
 * successful reply into a request error. The reply body / subject are
 * intentionally NOT included; the email only nudges the user back into the app
 * (the user-facing copy must carry no sensitive info).
 *
 * `getUserById` is a pure service-role read; it does NOT attach a session to
 * the shared client the way signIn/signUp/refreshSession/setSession do.
 */
export async function notifySupportReplyByEmail(ownerId: string): Promise<void> {
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
    const t = supportReplyEmail(appBaseUrl());
    await sendEmail({ to: email, subject: t.subject, html: t.html });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "notifySupportReplyByEmail failed",
    );
  }
}

/**
 * Fire-and-forget email to SUPPORT_EMAIL when a user opens a priority ticket or
 * replies in one, so the operator (supportkixxme@gmail.com) gets nudged even
 * when not in the app. This is the operator's OWN inbox, so a username + short
 * preview is fine (same trust level as the existing report emails). Never throws.
 */
export async function notifySupportNewMessageByEmail(
  ownerId: string,
  subject: string,
  body: string,
  isNew: boolean,
): Promise<void> {
  try {
    const username = await loadUsername(ownerId);
    const t = supportNewMessageEmail({
      username,
      ticketSubject: singleLine(subject).slice(0, 200) || "Soporte prioritario",
      preview: previewOf(body),
      isNew,
      appUrl: appBaseUrl(),
    });
    await sendEmail({ to: SUPPORT_EMAIL, subject: t.subject, html: t.html });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "notifySupportNewMessageByEmail failed",
    );
  }
}

/**
 * Fire-and-forget ack to a ticket's owner when an operator closes their ticket.
 * Always-on (no preference gate) — it is a direct response to the user's own
 * support request, not engagement mail. Never throws.
 */
export async function notifySupportTicketClosedByEmail(
  ownerId: string,
  ticketId: string,
): Promise<void> {
  try {
    // Idempotent (always-on): re-closing the same ticket never re-emails.
    const claimed = await claimEmailSend({
      userId: ownerId,
      category: "ticket_closed",
      dedupKey: `ticket_closed:${ticketId}`,
    });
    if (!claimed) return;
    const { data, error } = await supabase.auth.admin.getUserById(ownerId);
    if (error) {
      logger.warn(
        { err: error.message, ownerId },
        "ticket closed email: getUserById failed",
      );
      return;
    }
    const email = data.user?.email ?? null;
    if (!email) return;
    const base = appBaseUrl();
    const t = supportTicketClosedEmail({
      appUrl: base ? `${base}/support` : undefined,
    });
    await sendEmail({ to: email, subject: t.subject, html: t.html });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "notifySupportTicketClosedByEmail failed",
    );
  }
}

/**
 * Fire-and-forget ack to a reporter when an admin resolves their report. Never
 * reveals the reported user or the action taken (privacy + safety) — only that
 * the report was reviewed. Always-on. Never throws.
 */
export async function notifyReportResolvedByEmail(
  reporterId: string,
  reportId: string,
): Promise<void> {
  try {
    // Idempotent (always-on): re-resolving the same report never re-emails.
    const claimed = await claimEmailSend({
      userId: reporterId,
      category: "report_resolved",
      dedupKey: `report_resolved:${reportId}`,
    });
    if (!claimed) return;
    const { data, error } = await supabase.auth.admin.getUserById(reporterId);
    if (error) {
      logger.warn(
        { err: error.message, reporterId },
        "report resolved email: getUserById failed",
      );
      return;
    }
    const email = data.user?.email ?? null;
    if (!email) return;
    const base = appBaseUrl();
    const t = reportResolvedEmail({
      appUrl: base ? `${base}/support` : undefined,
    });
    await sendEmail({ to: email, subject: t.subject, html: t.html });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "notifyReportResolvedByEmail failed",
    );
  }
}
