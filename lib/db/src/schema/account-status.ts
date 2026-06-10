import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Self-service account state for temporary DEACTIVATION ("tomar un descanso").
 *
 * Lives in the repo-owned Replit Postgres (DATABASE_URL), NOT Supabase, because
 * the Supabase schema is not DDL-modifiable from this repo. `userId` holds a
 * Supabase auth user UUID; there is no SQL foreign key — the relationship is
 * enforced in application code.
 *
 * A missing row means the account is active. While `status = 'deactivated'` the
 * user is hidden from every surface that exposes them to others (discover, map,
 * favorites, public profile + photos, notifications, KixxMe Live). Timed
 * deactivations carry a `reactivateAt`; once it passes the account is treated as
 * active again (lazy, on read). Indefinite deactivations have a null
 * `reactivateAt` and only come back when the user logs in.
 */
export const accountStatusTable = pgTable("account_status", {
  // Supabase auth user id.
  userId: uuid("user_id").primaryKey(),
  // active | deactivated
  status: text("status").notNull().default("active"),
  // 1m | 3m | 6m | indefinite (null while active).
  deactivationType: text("deactivation_type"),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  // When a timed deactivation auto-reactivates; null for indefinite/active.
  reactivateAt: timestamp("reactivate_at", { withTimezone: true }),
  reason: text("reason"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AccountStatus = typeof accountStatusTable.$inferSelect;
export type InsertAccountStatus = typeof accountStatusTable.$inferInsert;
