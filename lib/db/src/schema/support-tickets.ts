import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Priority support chat — threaded admin↔user tickets ("Soporte Premium Gold").
 *
 * Lives in the repo-owned Replit Postgres (DATABASE_URL), NOT Supabase, because
 * the Supabase schema is not DDL-modifiable from this repo. `userId`, `closedBy`
 * and the message `senderId` hold Supabase auth user UUIDs; there are no SQL
 * foreign keys to Supabase — those relationships are enforced in application
 * code. The ONLY real FK is `support_ticket_messages.ticketId` → this table
 * (both are same-DB), with ON DELETE CASCADE so removing a ticket removes its
 * thread.
 *
 * Authorization model (enforced in `lib/support-tickets.ts` + routes):
 * - OPENING a ticket from the user side requires Gold (hasGold).
 * - REPLYING to an existing ticket requires only ownership (so an admin-initiated
 *   ticket to a free user can still be answered by that user).
 * - An admin (requireAdmin) bypasses Gold and may act on ANY ticket.
 * - Every read/write checks `ticket.userId === auth.userId` OR isAdmin (else 404).
 *
 * Status machine (transitions only ever applied inside lib/support-tickets.ts):
 * - user opens                → pending
 * - user replies              → pending (keep urgent; reopen closed → pending)
 * - admin replies             → answered (reopens closed, clears urgent)
 * - admin opens (for a user)  → answered (ball in the user's court)
 * - admin set-status endpoint  → may force pending|answered|closed|urgent
 */
export type SupportTicketStatus = "pending" | "answered" | "closed" | "urgent";
export type SupportActorRole = "user" | "admin";

export const supportTicketsTable = pgTable(
  "support_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Supabase auth user who owns the ticket (the affected user).
    userId: uuid("user_id").notNull(),
    // pending | answered | closed | urgent
    status: text("status")
      .$type<SupportTicketStatus>()
      .notNull()
      .default("pending"),
    // Short Spanish subject supplied when the ticket is opened.
    subject: text("subject").notNull(),
    // Who opened the ticket: user (Gold self-service) | admin (outreach).
    openedByRole: text("opened_by_role").$type<SupportActorRole>().notNull(),
    // Bumped on every message; the conversation list sorts by this.
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Role that sent the most recent message (drives status + unread logic).
    lastSenderRole: text("last_sender_role")
      .$type<SupportActorRole>()
      .notNull(),
    // When the owner last opened the thread (for the user's unread badge).
    userLastReadAt: timestamp("user_last_read_at", { withTimezone: true }),
    // When an admin last opened the thread (for the admin's unread badge).
    adminLastReadAt: timestamp("admin_last_read_at", { withTimezone: true }),
    // Admin who closed the ticket + when (null while open).
    closedBy: uuid("closed_by"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("support_tickets_user_idx").on(t.userId),
    index("support_tickets_status_idx").on(t.status),
    index("support_tickets_last_message_idx").on(t.lastMessageAt),
  ],
);

export type SupportTicket = typeof supportTicketsTable.$inferSelect;
export type InsertSupportTicket = typeof supportTicketsTable.$inferInsert;
