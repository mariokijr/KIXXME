import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Support requests AND user-to-user moderation reports.
 *
 * Lives in the repo-owned Replit Postgres (DATABASE_URL), NOT Supabase, because
 * the Supabase schema is not DDL-modifiable from this repo. There are no SQL
 * foreign keys to the Supabase `profiles`/auth/messages/photos tables nor to the
 * repo-owned `video_calls` table; the various id columns hold those rows' UUIDs
 * and the relationships are enforced/joined in application code.
 *
 * Two kinds of rows share this table:
 * - Support requests ("Contactar soporte" / "Reportar un problema") — `category`
 *   is the origin (contact|general|settings) and the moderation columns are null.
 * - Moderation reports (report a profile/photo/message/video call/Live user) —
 *   `reportType` is the abuse category and `targetType` + the matching target id
 *   identify the reported content. These are what the admin dashboard triages.
 */
export const supportReportsTable = pgTable("support_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Supabase auth user who filed the report.
  reporterId: uuid("reporter_id").notNull(),
  // Origin / nature: contact | chat | profile | settings | general.
  category: text("category").notNull(),
  // Supabase profile being reported, when applicable.
  targetUserId: uuid("target_user_id"),
  subject: text("subject"),
  message: text("message").notNull(),
  // Optional reply-to address supplied by the reporter.
  contactEmail: text("contact_email"),

  // --- Moderation fields (null for plain support requests) -----------------
  // Abuse category: spam | fake_profile | harassment | video_behavior |
  // underage | other.
  reportType: text("report_type"),
  // What was reported: profile | photo | message | video_call | live_user.
  targetType: text("target_type"),
  // Supabase messages.id (when targetType = message).
  targetMessageId: uuid("target_message_id"),
  // Supabase conversations.id (context for a reported message).
  targetConversationId: uuid("target_conversation_id"),
  // Repo-owned video_calls.id (when targetType = video_call).
  targetCallId: uuid("target_call_id"),
  // Supabase profile_photos.id (when targetType = photo).
  targetPhotoId: uuid("target_photo_id"),

  // Triage state: open | in_progress | resolved | closed.
  status: text("status").notNull().default("open"),
  // Admin who resolved/closed the report + how.
  resolvedBy: uuid("resolved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolutionNote: text("resolution_note"),
  // Action the admin took: none | suspend | ban | remove_photo | dismiss.
  actionTaken: text("action_taken"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SupportReport = typeof supportReportsTable.$inferSelect;
export type InsertSupportReport = typeof supportReportsTable.$inferInsert;
