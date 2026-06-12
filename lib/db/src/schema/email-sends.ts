import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * Append-only ledger of EMAILS we have sent, in the repo-owned Replit Postgres
 * (DATABASE_URL). This is the anti-spam backbone: it lets us deduplicate and
 * rate-limit notification emails so we never send "20 emails for the same
 * conversation".
 *
 * Each row is one logical send identified by (`category`, `dedupKey`):
 *   - category: a coarse channel like 'message', 'match', 'superlike',
 *     'invoice_paid', 'payment_failed', 'premium_ended', ... (see
 *     `email-policy.ts`).
 *   - dedupKey: the per-event uniqueness scope, e.g. `conv:<conversationId>`
 *     (one message-digest email per conversation per cooldown), `invoice:<id>`
 *     (idempotent Stripe webhook retries), or `pair:<a>:<b>` (one match email).
 *
 * A UNIQUE(category, dedupKey) index makes "send once ever" race-free via
 * onConflictDoNothing. For "send at most once per cooldown" the policy helper
 * conditionally inserts only when no row newer than the cooldown exists, so a
 * later event for the same key is allowed once the window passes.
 *
 * `clearEmailClaim` DELETEs rows (e.g. when a recipient reads a conversation),
 * which re-arms the next notification — so this ledger is mutable by design,
 * unlike the strictly append-only `like_actions`.
 */
export const emailSendsTable = pgTable(
  "email_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Recipient Supabase auth user id (best-effort; some sends are to operators).
    userId: uuid("user_id").notNull(),
    category: text("category").notNull(),
    dedupKey: text("dedup_key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("email_sends_category_dedup_key_idx").on(
      t.category,
      t.dedupKey,
    ),
    // Cooldown lookups: latest row for a (category, dedupKey) by recency.
    index("email_sends_dedup_sent_idx").on(t.dedupKey, t.sentAt),
  ],
);

export type EmailSend = typeof emailSendsTable.$inferSelect;
export type InsertEmailSend = typeof emailSendsTable.$inferInsert;
