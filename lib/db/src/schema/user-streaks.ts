import { pgTable, uuid, integer, date, timestamp } from "drizzle-orm/pg-core";

/**
 * Per-user daily-reward streak state, in the repo-owned Replit Postgres
 * (DATABASE_URL), NOT Supabase. One row per user (PK = Supabase auth UUID).
 *
 * The streak is driven by the daily-reward CLAIM, not arbitrary activity:
 * claiming once per UTC calendar day keeps the streak alive. `lastClaimDate`
 * is a UTC `YYYY-MM-DD` string; the claim path (see `lib/rewards.ts`) compares
 * it to today/yesterday computed via `toISOString().slice(0, 10)` — never
 * local-time Date methods — to decide increment vs reset.
 */
export const userStreaksTable = pgTable("user_streaks", {
  // Supabase auth user id.
  userId: uuid("user_id").primaryKey(),
  // Consecutive days claimed up to and including lastClaimDate.
  currentStreak: integer("current_streak").notNull().default(0),
  // Best streak ever reached.
  longestStreak: integer("longest_streak").notNull().default(0),
  // UTC calendar day (YYYY-MM-DD) of the most recent claim; null before first.
  lastClaimDate: date("last_claim_date"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type UserStreak = typeof userStreaksTable.$inferSelect;
export type InsertUserStreak = typeof userStreaksTable.$inferInsert;
