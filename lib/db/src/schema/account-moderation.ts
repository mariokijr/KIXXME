import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Admin-imposed moderation state for an account (SUSPENSION / BAN).
 *
 * Lives in the repo-owned Replit Postgres (DATABASE_URL), NOT Supabase. `userId`
 * holds a Supabase auth user UUID; there is no SQL foreign key — the relationship
 * is enforced in application code.
 *
 * Kept deliberately ORTHOGONAL to `account_status` (self-service deactivation):
 * a user can deactivate themselves AND be moderated, and login-reactivation must
 * never clear a moderation action. A missing row means the account is not
 * moderated.
 *
 * - `suspended` with a `suspendedUntil` in the future = temporary suspension;
 *   once it passes the account is treated as active again (lazy, on read).
 * - `suspended` with a null `suspendedUntil` = indefinite suspension.
 * - `banned` = permanent; `suspendedUntil` is ignored.
 *
 * While suspended/banned the user is blocked from the API (auth gate) AND hidden
 * from every surface that exposes them to others (unioned into the visibility
 * hidden set).
 */
export const accountModerationTable = pgTable("account_moderation", {
  // Supabase auth user id.
  userId: uuid("user_id").primaryKey(),
  // active | suspended | banned
  state: text("state").notNull().default("active"),
  // When a timed suspension lifts; null = indefinite (or banned).
  suspendedUntil: timestamp("suspended_until", { withTimezone: true }),
  reason: text("reason"),
  // Supabase auth user id of the admin who applied the action.
  actedBy: uuid("acted_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AccountModeration = typeof accountModerationTable.$inferSelect;
export type InsertAccountModeration = typeof accountModerationTable.$inferInsert;
