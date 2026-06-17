import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * Emoji reactions on chat messages.
 * `messageId` is a Supabase message UUID (string) — no cross-DB FK,
 * enforced in application code like blocks and visits.
 * One (userId, messageId, emoji) tuple per user — they can react multiple
 * distinct emojis to the same message but only once each.
 */
export const messageReactionsTable = pgTable(
  "message_reactions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    messageId: text("message_id").notNull(),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqReaction: unique().on(t.userId, t.messageId, t.emoji),
  }),
);

export type MessageReaction = typeof messageReactionsTable.$inferSelect;
export type InsertMessageReaction = typeof messageReactionsTable.$inferInsert;
