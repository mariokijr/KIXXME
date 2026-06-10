import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Auto-flagged accounts that need a moderator's review.
 *
 * Lives in the repo-owned Replit Postgres (DATABASE_URL), NOT Supabase. `userId`
 * holds a Supabase auth user UUID (no SQL foreign key).
 *
 * Raised automatically when an account crosses the report threshold
 * (`report_threshold`) or trips the simple spam / copy-paste message detector
 * (`spam_pattern`). One open flag per (userId, reason) is maintained; repeated
 * triggers bump `count` and refresh `detail` rather than inserting duplicates.
 * Moderators clear a flag by setting `status` to reviewed/dismissed from the
 * dashboard.
 */
export const accountFlagsTable = pgTable("account_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Supabase auth user that was flagged.
  userId: uuid("user_id").notNull(),
  // report_threshold | spam_pattern
  reason: text("reason").notNull(),
  // Human-readable Spanish explanation shown in the dashboard.
  detail: text("detail"),
  // How many times this flag has been (re)triggered while open.
  count: integer("count").notNull().default(1),
  // open | reviewed | dismissed
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AccountFlag = typeof accountFlagsTable.$inferSelect;
export type InsertAccountFlag = typeof accountFlagsTable.$inferInsert;
