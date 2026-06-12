import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Push-notification device registration tokens.
 *
 * Both iOS and Android route through Firebase Cloud Messaging (iOS via an APNs
 * key uploaded to Firebase), so a single FCM registration token type covers
 * both platforms. One row per token (`token` is unique); a single user can have
 * many devices. `platform` is informational ('ios' | 'android' | 'web').
 *
 * Lives in the repo-owned Replit Postgres (DATABASE_URL), NOT Supabase, because
 * the Supabase schema is not DDL-modifiable from this repo. Invalid tokens are
 * pruned lazily when FCM reports them UNREGISTERED (see `lib/push.ts`).
 */
export const deviceTokensTable = pgTable("device_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  token: text("token").notNull().unique(),
  platform: text("platform").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type DeviceToken = typeof deviceTokensTable.$inferSelect;
export type InsertDeviceToken = typeof deviceTokensTable.$inferInsert;
