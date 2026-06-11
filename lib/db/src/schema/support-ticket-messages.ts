import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { supportTicketsTable, type SupportActorRole } from "./support-tickets";

/**
 * One message in a priority support ticket thread (see `support-tickets.ts`).
 *
 * Lives in the repo-owned Replit Postgres alongside `support_tickets`. `senderId`
 * holds a Supabase auth user UUID (no cross-DB FK). `ticketId` IS a real SQL
 * foreign key (same DB) with ON DELETE CASCADE, so deleting a ticket — or purging
 * a user's tickets on account deletion — removes the thread automatically.
 *
 * `senderRole` is derived server-side at insert time (owner → "user",
 * admin-and-not-owner → "admin") and never trusted from the client.
 *
 * A message carries at least one of `body` / `imageUrl` / `audioUrl` (enforced
 * in app code, not SQL). Attachment URLs point at the public `support-media`
 * Supabase bucket; `audioDuration` is the voice-note length in seconds (1–60),
 * stored for display because webm/opus blobs report Infinity for their duration.
 */
export const supportTicketMessagesTable = pgTable(
  "support_ticket_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTicketsTable.id, { onDelete: "cascade" }),
    // Supabase auth user who sent the message (the owner or an admin).
    senderId: uuid("sender_id").notNull(),
    // user | admin — derived server-side, never from the client.
    senderRole: text("sender_role").$type<SupportActorRole>().notNull(),
    // Nullable: an attachment-only message (photo or voice note) has no body.
    body: text("body"),
    imageUrl: text("image_url"),
    audioUrl: text("audio_url"),
    audioDuration: integer("audio_duration"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("support_ticket_messages_ticket_idx").on(t.ticketId),
    index("support_ticket_messages_created_idx").on(t.createdAt),
  ],
);

export type SupportTicketMessage =
  typeof supportTicketMessagesTable.$inferSelect;
export type InsertSupportTicketMessage =
  typeof supportTicketMessagesTable.$inferInsert;
