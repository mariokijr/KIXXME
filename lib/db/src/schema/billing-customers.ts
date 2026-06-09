import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Maps a Supabase auth user to their Stripe customer/subscription.
 *
 * This lives in the repo-owned Replit Postgres (DATABASE_URL), NOT Supabase,
 * because the Supabase schema is not DDL-modifiable from this repo. It is a
 * cache/mapping layer — the authoritative entitlement is `profiles.plan` in
 * Supabase. The primary user mapping in webhooks is the
 * `subscription_data.metadata.supabase_user_id` set at checkout; this table
 * additionally prevents duplicate Stripe customers and lets subscription.*
 * webhook events resolve back to a user.
 */
export const billingCustomersTable = pgTable("billing_customers", {
  userId: uuid("user_id").primaryKey(),
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  plan: text("plan").notNull().default("free"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type BillingCustomer = typeof billingCustomersTable.$inferSelect;
export type InsertBillingCustomer = typeof billingCustomersTable.$inferInsert;
