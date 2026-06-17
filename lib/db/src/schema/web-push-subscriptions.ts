import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * VAPID web push subscriptions.
 * Each row represents one browser/device subscription (PushSubscription object).
 * Endpoint uniqueness means one row per browser instance regardless of user —
 * if a user re-subscribes the same browser we upsert rather than duplicate.
 */
export const webPushSubscriptionsTable = pgTable(
  "web_push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqEndpoint: unique().on(t.endpoint),
  }),
);

export type WebPushSubscription =
  typeof webPushSubscriptionsTable.$inferSelect;
export type InsertWebPushSubscription =
  typeof webPushSubscriptionsTable.$inferInsert;
