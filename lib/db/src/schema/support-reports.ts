import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Support requests and problem reports submitted from the app (the Soporte
 * page, "Contactar soporte"/"Reportar problema" actions, and in-chat reports).
 *
 * Lives in the repo-owned Replit Postgres (DATABASE_URL), NOT Supabase, because
 * the Supabase schema is not DDL-modifiable from this repo. There are no SQL
 * foreign keys to the Supabase `profiles`/auth tables; `reporterId` and
 * `targetUserId` hold Supabase user UUIDs validated in application code.
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
  // Triage state: open | in_progress | resolved | closed.
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SupportReport = typeof supportReportsTable.$inferSelect;
export type InsertSupportReport = typeof supportReportsTable.$inferInsert;
