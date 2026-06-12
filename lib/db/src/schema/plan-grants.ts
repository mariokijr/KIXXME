import { pgTable, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * Per-source entitlement grants.
 *
 * The authoritative plan still lives in Supabase `profiles.plan`, but it now has
 * MORE THAN ONE writer: Stripe (web checkout) and RevenueCat (native in-app
 * purchases). Each source records the tier it currently grants in its own row
 * (one row per `(userId, source)`), and the effective plan is the MAX tier
 * across all sources (see `lib/plan-grants.ts recomputePlan`). This prevents one
 * source from clobbering the other — e.g. a Stripe `subscription.deleted` event
 * setting the Stripe grant to `free` must NOT revoke a Gold entitlement the user
 * bought through the App Store.
 *
 * Lives in the repo-owned Replit Postgres (DATABASE_URL), NOT Supabase, because
 * the Supabase schema is not DDL-modifiable from this repo.
 */
export const planGrantsTable = pgTable(
  "plan_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    /** 'stripe' | 'revenuecat' */
    source: text("source").notNull(),
    /** 'free' | 'plus' | 'gold' */
    plan: text("plan").notNull().default("free"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("plan_grants_user_source_unique").on(t.userId, t.source)],
);

export type PlanGrant = typeof planGrantsTable.$inferSelect;
export type InsertPlanGrant = typeof planGrantsTable.$inferInsert;
