import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Tracks which users have consumed their one-time free Gold trial.
 *
 * Fraud-prevention columns:
 * - `payment_fingerprint` — Stripe card fingerprint (unique per card number).
 *   A partial unique index ensures no two different users can activate a trial
 *   with the same physical card.
 * - `ip_address` — client IP at checkout time for audit / pattern detection.
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
    paymentFingerprint: text("payment_fingerprint"),
    ipAddress: text("ip_address"),
    activatedAt: timestamp("activated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("free_trial_uses_sub_idx").on(t.stripeSubscriptionId),
    uniqueIndex("free_trial_uses_fingerprint_idx")
      .on(t.paymentFingerprint)
      .where(sql`payment_fingerprint IS NOT NULL`),
  ],
);

export type FreeTrialUse = typeof freeTrialUsesTable.$inferSelect;
export type InsertFreeTrialUse = typeof freeTrialUsesTable.$inferInsert;
