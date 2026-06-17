import { pgTable, text } from "drizzle-orm/pg-core";

/**
 * Stores reply-to metadata for chat messages.
 * messageId is the Supabase UUID (as text) of the message that is a reply.
 * We snapshot content/sender at reply time so we never need to re-fetch the
 * original message (which may be deleted).
 */
export const messageReplyRefsTable = pgTable("message_reply_refs", {
  messageId: text("message_id").primaryKey(),
  replyToMessageId: text("reply_to_message_id").notNull(),
  replyToContent: text("reply_to_content"),
  replyToSenderId: text("reply_to_sender_id").notNull(),
  replyToType: text("reply_to_type").notNull().default("text"),
});

export type MessageReplyRef = typeof messageReplyRefsTable.$inferSelect;
export type InsertMessageReplyRef = typeof messageReplyRefsTable.$inferInsert;
