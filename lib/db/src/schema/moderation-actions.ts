import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Append-only audit log of every moderation action taken against an account
 * (the SANCTION HISTORY shown in the admin panel).
 *
 * Lives in the repo-owned Replit Postgres (DATABASE_URL), NOT Supabase. `userId`
 * holds the moderated Supabase auth user UUID and `actedBy` the admin's UUID;
 * there are no SQL foreign keys — relationships are enforced in application code.
 *
 * This table is intentionally append-only (same pattern as `like_actions` /
 * `reward_credits`): `account_moderation` is the single-row current-state cache
 * that the auth gate and visibility set read, while every transition that
 * produced that state is recorded here so the full history survives later
 * overwrites. Warnings (`warn`) live ONLY here — they record + notify without
 * changing `account_moderation` state.
 */
export const moderationActionsTable = pgTable("moderation_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Supabase auth user the action was taken against.
  userId: uuid("user_id").notNull(),
  // warn | suspend | ban | remove | restore | lift | remove_photo
  action: text("action").notNull(),
  // Spanish reason/justification shown to the admin (and reused in emails).
  reason: text("reason"),
  // Extra machine/human context (e.g. removed photo id, prior state).
  detail: text("detail"),
  // For timed suspensions: the number of days applied (null otherwise).
  durationDays: integer("duration_days"),
  // Supabase auth user id of the admin who performed the action.
  actedBy: uuid("acted_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ModerationAction = typeof moderationActionsTable.$inferSelect;
export type InsertModerationAction = typeof moderationActionsTable.$inferInsert;
