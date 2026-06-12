import { supabase } from "./supabase.js";
import { logger } from "./logger.js";
import { isOnline } from "./geo.js";
import {
  appBaseUrl,
  sendEmail,
  newMessagesEmail,
  premiumConversationStartedEmail,
} from "./email.js";
import { claimEmailSend, wasEmailedRecently, pairKey } from "./email-policy.js";

/**
 * Email notifications for chat activity. All fire-and-forget (callers `void`
 * them) and never throw — a mail problem can never turn a successful send into a
 * request error.
 *
 * Anti-spam (see `email-policy.ts`):
 *   - "Tienes mensajes nuevos" is sent only when the recipient is OFFLINE and is
 *     rate-limited to one email per conversation per `MESSAGE_COOLDOWN_MS`. The
 *     claim is re-armed when the recipient reads the thread (`clearEmailClaim`
 *     with `messageDedupKey`).
 *   - Suppressed entirely if we emailed this pair about a fresh match in the
 *     last `MATCH_SUPPRESS_MS` (the match email already nudged them).
 *   - The Gold "alguien quiere conocerte" conversation-invite is once-ever per
 *     conversation.
 */

/** One grouped "new messages" email per conversation per 6h window. */
const MESSAGE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
/** Don't chat-email a pair within 30 min of their match email. */
const MATCH_SUPPRESS_MS = 30 * 60 * 1000;

export type MessageMediaKind = "text" | "photo" | "voice";

/** Stable per-recipient dedup key; shared with the read-reset call sites. */
export function messageDedupKey(
  conversationId: string,
  recipientId: string,
): string {
  return `conv:${conversationId}:${recipientId}`;
}

async function getEmail(userId: string): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) {
    logger.warn(
      { err: error.message, userId },
      "getUserById failed (email lookup for message notification)",
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
 * Notify the recipient of a new message when they are offline. Covers text,
 * photos, and voice notes (all created via POST /conversations/:id/messages).
 */
export async function notifyNewMessageByEmail(opts: {
  conversationId: string;
  senderId: string;
  recipientId: string;
  mediaKind: MessageMediaKind;
}): Promise<void> {
  const { conversationId, senderId, recipientId, mediaKind } = opts;
  try {
    // 1. Skip if the recipient is currently active — they'll see it in-app.
    const { data: recipient } = await supabase
      .from("profiles")
      .select("last_active_at")
      .eq("id", recipientId)
      .maybeSingle();
    if (recipient && isOnline(recipient.last_active_at as string | null)) {
      return;
    }

    // 2. Suppress right after a match email for this pair.
    if (
      await wasEmailedRecently(
        "match",
        pairKey(senderId, recipientId),
        MATCH_SUPPRESS_MS,
      )
    ) {
      return;
    }

    // 3. Resolve the email BEFORE claiming so a missing email never burns the
    //    dedup slot.
    const email = await getEmail(recipientId);
    if (!email) return;

    // 4. Preference check + grouped rate limit, atomically.
    const claimed = await claimEmailSend({
      userId: recipientId,
      category: "message",
      dedupKey: messageDedupKey(conversationId, recipientId),
      cooldownMs: MESSAGE_COOLDOWN_MS,
    });
    if (!claimed) return;

    const senderName = await getUsername(senderId);
    const base = appBaseUrl();
    const { subject, html } = newMessagesEmail({
      senderName: senderName ?? "Alguien",
      mediaKind,
      appUrl: base ? `${base}/chats/${conversationId}` : undefined,
    });
    await sendEmail({ to: email, subject, html });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "notifyNewMessageByEmail failed",
    );
  }
}

/**
 * Notify a recipient that a Gold user has started a brand-new conversation with
 * them (no prior match). Once-ever per conversation, preference-gated.
 */
export async function notifyConversationInviteByEmail(opts: {
  conversationId: string;
  senderId: string;
  recipientId: string;
}): Promise<void> {
  const { conversationId, senderId, recipientId } = opts;
  try {
    const email = await getEmail(recipientId);
    if (!email) return;
    const claimed = await claimEmailSend({
      userId: recipientId,
      category: "conversation_invite",
      dedupKey: `conv_invite:${conversationId}`,
    });
    if (!claimed) return;
    const senderName = await getUsername(senderId);
    const base = appBaseUrl();
    const { subject, html } = premiumConversationStartedEmail({
      senderName: senderName ?? "Alguien",
      appUrl: base ? `${base}/chats/${conversationId}` : undefined,
    });
    await sendEmail({ to: email, subject, html });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "notifyConversationInviteByEmail failed",
    );
  }
}
