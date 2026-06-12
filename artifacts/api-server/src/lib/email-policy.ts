/**
 * Email anti-spam policy: deduplication, rate-limiting/grouping, and the
 * (foundation for) per-user notification preferences.
 *
 * Backed by two repo-owned Replit-Postgres tables (`@workspace/db`):
 *   - `notification_preferences` — opt-out flags for the engagement categories.
 *   - `email_sends` — an append-only-ish ledger of what we've already sent,
 *     keyed by (category, dedupKey), with a UNIQUE index that makes the claim
 *     race-free.
 *
 * The two ideas:
 *   1. ALWAYS-ON categories (security, account, payments, subscriptions,
 *      support) bypass preferences — they are transactional and important. They
 *      may still go through the ledger purely for idempotency (e.g. Stripe
 *      webhook retries).
 *   2. ENGAGEMENT categories (messages, matches, superlikes, conversation
 *      invites) respect preferences AND are rate-limited so we never send "20
 *      emails for the same conversation".
 *
 * Everything here is best-effort and fail-soft: on any DB error we err on the
 * side of NOT sending (returning false) so a glitch can never cause a flood.
 */
import { db, notificationPreferencesTable, emailSendsTable } from "@workspace/db";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { logger } from "./logger.js";

export type EmailCategory =
  // Engagement (preference-gated + rate-limited)
  | "message"
  | "match"
  | "superlike"
  | "conversation_invite"
  // Always-on (bypass preferences; ledger used only for idempotency)
  | "invoice_paid"
  | "payment_failed"
  | "premium_ended"
  | "ticket_opened"
  | "ticket_closed"
  | "report_received"
  | "report_resolved";

/**
 * Maps an engagement category to its preference column. Categories absent from
 * this map are ALWAYS-ON and bypass the preference check entirely.
 */
const PREFERENCE_COLUMN: Partial<
  Record<
    EmailCategory,
    | "emailMessages"
    | "emailMatches"
    | "emailSuperlikes"
    | "emailConversationInvites"
  >
> = {
  message: "emailMessages",
  match: "emailMatches",
  superlike: "emailSuperlikes",
  conversation_invite: "emailConversationInvites",
};

/**
 * Whether the user has this engagement category enabled. A missing row means
 * "all defaults on", so we never have to back-fill existing users. Always-on
 * categories return true. Fail-soft: on error default to enabled (true) so a
 * preferences glitch never silently swallows a wanted notification — the ledger
 * claim still guards against floods.
 */
export async function isEmailCategoryEnabled(
  userId: string,
  category: EmailCategory,
): Promise<boolean> {
  const column = PREFERENCE_COLUMN[category];
  if (!column) return true; // always-on
  try {
    const [row] = await db
      .select({ value: notificationPreferencesTable[column] })
      .from(notificationPreferencesTable)
      .where(eq(notificationPreferencesTable.userId, userId))
      .limit(1);
    if (!row) return true; // no row → defaults (on)
    return row.value;
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), userId, category },
      "email-policy: preference lookup failed; defaulting to enabled",
    );
    return true;
  }
}

export interface ClaimEmailSendOptions {
  userId: string;
  category: EmailCategory;
  /**
   * Per-event uniqueness scope, e.g. `conv:<id>:<recipientId>`, `invoice:<id>`,
   * `pair:<a>:<b>`. Combined with `category` it forms the ledger's unique key.
   */
  dedupKey: string;
  /**
   * When omitted, the claim is "once ever" (idempotent — used for Stripe
   * webhook retries and once-per-relationship invites). When set, the claim is
   * "at most once per this window": a later event for the same key is allowed
   * only after the cooldown elapses.
   */
  cooldownMs?: number;
}

/**
 * Atomically claims the right to send one email. Returns true only to the
 * single caller that should actually send. Combines:
 *   - the preference check (engagement categories only), then
 *   - a race-free insert against the UNIQUE(category, dedupKey) index.
 *
 * Call this immediately BEFORE sending; if it returns true and the send then
 * fails, the transport layer is already fail-soft. (We accept the rare lost
 * email over the complexity of compensating the ledger.)
 */
export async function claimEmailSend(
  options: ClaimEmailSendOptions,
): Promise<boolean> {
  const { userId, category, dedupKey, cooldownMs } = options;

  if (!(await isEmailCategoryEnabled(userId, category))) return false;

  try {
    if (cooldownMs == null) {
      // Once-ever: insert, do nothing on conflict. We "won" iff a row landed.
      const inserted = await db
        .insert(emailSendsTable)
        .values({ userId, category, dedupKey })
        .onConflictDoNothing({
          target: [emailSendsTable.category, emailSendsTable.dedupKey],
        })
        .returning({ id: emailSendsTable.id });
      return inserted.length > 0;
    }

    // Once-per-cooldown: upsert, refreshing sentAt only when the existing row is
    // older than the window. `returning()` yields a row exactly when we should
    // send (fresh insert, or a stale row we just refreshed).
    const cutoff = new Date(Date.now() - cooldownMs);
    const claimed = await db
      .insert(emailSendsTable)
      .values({ userId, category, dedupKey })
      .onConflictDoUpdate({
        target: [emailSendsTable.category, emailSendsTable.dedupKey],
        set: { sentAt: sql`now()`, userId },
        setWhere: lt(emailSendsTable.sentAt, cutoff),
      })
      .returning({ id: emailSendsTable.id });
    return claimed.length > 0;
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        userId,
        category,
        dedupKey,
      },
      "email-policy: claim failed; suppressing send",
    );
    return false;
  }
}

/**
 * Releases a claim so the next event re-arms a notification. Used when a
 * recipient reads a conversation: the next time they go offline and receive
 * messages, they get one fresh "tienes mensajes nuevos" email.
 */
export async function clearEmailClaim(
  category: EmailCategory,
  dedupKey: string,
): Promise<void> {
  try {
    await db
      .delete(emailSendsTable)
      .where(
        and(
          eq(emailSendsTable.category, category),
          eq(emailSendsTable.dedupKey, dedupKey),
        ),
      );
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        category,
        dedupKey,
      },
      "email-policy: clearEmailClaim failed",
    );
  }
}

/**
 * Records that an email was sent WITHOUT gating on it — a pure marker for
 * cross-category suppression (e.g. a match email marks the pair so a chat email
 * fired seconds later is suppressed). Best-effort; never throws.
 */
export async function recordEmailSent(
  userId: string,
  category: EmailCategory,
  dedupKey: string,
): Promise<void> {
  try {
    await db
      .insert(emailSendsTable)
      .values({ userId, category, dedupKey })
      .onConflictDoUpdate({
        target: [emailSendsTable.category, emailSendsTable.dedupKey],
        set: { sentAt: sql`now()`, userId },
      });
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        userId,
        category,
        dedupKey,
      },
      "email-policy: recordEmailSent failed",
    );
  }
}

/**
 * True when a (category, dedupKey) email was sent within `withinMs`. Used to
 * suppress a chat notification right after a match notification for the pair.
 * Fail-soft: on error returns false (do not suppress).
 */
export async function wasEmailedRecently(
  category: EmailCategory,
  dedupKey: string,
  withinMs: number,
): Promise<boolean> {
  try {
    const cutoff = new Date(Date.now() - withinMs);
    const [row] = await db
      .select({ id: emailSendsTable.id })
      .from(emailSendsTable)
      .where(
        and(
          eq(emailSendsTable.category, category),
          eq(emailSendsTable.dedupKey, dedupKey),
          gt(emailSendsTable.sentAt, cutoff),
        ),
      )
      .limit(1);
    return Boolean(row);
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        category,
        dedupKey,
      },
      "email-policy: wasEmailedRecently failed",
    );
    return false;
  }
}

/** Stable `pair:<min>:<max>` key for symmetric (two-user) suppression. */
export function pairKey(a: string, b: string): string {
  return a < b ? `pair:${a}:${b}` : `pair:${b}:${a}`;
}
