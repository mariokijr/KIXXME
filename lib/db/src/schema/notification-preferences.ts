import { pgTable, uuid, boolean, timestamp } from "drizzle-orm/pg-core";

/**
 * Per-user email notification preferences, in the repo-owned Replit Postgres
 * (DATABASE_URL), NOT Supabase.
 *
 * Only the OPTIONAL, engagement-style categories are represented here. The
 * always-on categories — security (password / suspicious login), account
 * lifecycle, payments / subscriptions, and support — are intentionally NOT
 * columns: they are transactional and legally/operationally important, so they
 * bypass preferences entirely (see `ALWAYS_ON_CATEGORIES` in `email-policy.ts`).
 *
 * A missing row means "all defaults" (everything on); helpers treat absent rows
 * as the all-true default, so we never have to back-fill existing users. This is
 * the foundation for a future in-app "Notificaciones" settings screen — no
 * routes/UI are wired yet.
 */
export const notificationPreferencesTable = pgTable("notification_preferences", {
  // Supabase auth user id the preferences belong to (one row per user).
  userId: uuid("user_id").primaryKey(),
  // New chat messages / photos / voice notes from another user.
  emailMessages: boolean("email_messages").notNull().default(true),
  // Mutual matches.
  emailMatches: boolean("email_matches").notNull().default(true),
  // Received SuperLikes.
  emailSuperlikes: boolean("email_superlikes").notNull().default(true),
  // Received regular likes (non-mutual; once per sender per 24h).
  emailLikes: boolean("email_likes").notNull().default(true),
  // A Gold user started a conversation with you without a prior match.
  emailConversationInvites: boolean("email_conversation_invites")
    .notNull()
    .default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type NotificationPreferences =
  typeof notificationPreferencesTable.$inferSelect;
export type InsertNotificationPreferences =
  typeof notificationPreferencesTable.$inferInsert;
