import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Tracks which users have consumed their one-time free trial of Gold.
 *
 * Each user gets exactly one free trial, enforced by the PRIMARY KEY on
 * `user_id`. Inserting with `onConflictDoNothing` is the race-free check:
 * a row already exists → the trial was already used. `stripe_subscription_id`
 * is set once the checkout.session.completed webhook fires.
 *
 * This table lives in Replit Postgres (DATABASE_URL via @workspace/db) —
 * separate from Supabase — so it survives Stripe account switches and is
 * auditable without touching the Supabase admin panel.
 */
export const freeTrialUsesTable = pgTable(
  "free_trial_uses",
  {
    userId: uuid("user_id").primaryKey(),
    stripeSubscriptionId: text("stripe_subscription_id"),
    activatedAt: timestamp("activated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("free_trial_uses_sub_idx").on(t.stripeSubscriptionId),
  ],
);

export type FreeTrialUse = typeof freeTrialUsesTable.$inferSelect;
export type InsertFreeTrialUse = typeof freeTrialUsesTable.$inferInsert;
