import {
  pgTable,
  uuid,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * "Who viewed my profile" records, in the repo-owned Replit Postgres
 * (DATABASE_URL), NOT Supabase. One row per (viewer, profile) pair — a repeat
 * visit bumps `lastVisitedAt` (throttled in app code) instead of inserting a
 * duplicate, so the visitor list/count is naturally deduped.
 *
 * There are no cross-DB foreign keys — `viewerId`/`profileId` hold Supabase auth
 * user UUIDs; the join to `profiles` and all block/deactivation/suspension
 * hiding is done in application code at read time (and skipped at write time
 * when the two users are blocked). Recording is fire-and-forget so it can never
 * fail the underlying profile read.
 */
export const profileVisitsTable = pgTable(
  "profile_visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Supabase auth user who viewed the profile.
    viewerId: uuid("viewer_id").notNull(),
    // Supabase auth user whose profile was viewed.
    profileId: uuid("profile_id").notNull(),
    lastVisitedAt: timestamp("last_visited_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Dedup: one row per (viewer, profile); upserted on repeat visits.
    uniqueIndex("profile_visits_viewer_profile_idx").on(
      t.viewerId,
      t.profileId,
    ),
    // Visitor list for an owner: WHERE profile_id = ? ORDER BY last_visited_at DESC.
    index("profile_visits_profile_visited_idx").on(
      t.profileId,
      t.lastVisitedAt,
    ),
  ],
);

export type ProfileVisit = typeof profileVisitsTable.$inferSelect;
export type InsertProfileVisit = typeof profileVisitsTable.$inferInsert;
