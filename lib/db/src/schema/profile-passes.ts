import {
  pgTable,
  uuid,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * "Pass" / dislike records ("no me interesa"), in the repo-owned Replit Postgres
 * (DATABASE_URL), NOT Supabase. A pass is a deliberate dismissal in Descubrir:
 * unlike a like, it creates NO Supabase `likes` edge, is free/unlimited, and is
 * never metered. Its only job is to keep a passed profile from re-appearing in
 * Descubrir.
 *
 * One row per (passer, passed) pair — repeat passes are idempotent
 * (onConflictDoNothing on the unique index), so there are no duplicates and no
 * double-processing. There are no cross-DB foreign keys: `passerId`/`passedId`
 * hold Supabase auth user UUIDs and the join to `profiles` is done in app code.
 *
 * Deliberately kept SEPARATE from `like_actions` so the append-only
 * "latest action per pair = SuperLike status" invariant there stays clean.
 */
export const profilePassesTable = pgTable(
  "profile_passes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Supabase auth user who dismissed the profile.
    passerId: uuid("passer_id").notNull(),
    // Supabase auth user who was dismissed.
    passedId: uuid("passed_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Dedup + idempotency: one row per (passer, passed).
    uniqueIndex("profile_passes_passer_passed_idx").on(
      t.passerId,
      t.passedId,
    ),
    // Discover exclusion lookup: WHERE passer_id = ?.
    index("profile_passes_passer_idx").on(t.passerId),
  ],
);

export type ProfilePass = typeof profilePassesTable.$inferSelect;
export type InsertProfilePass = typeof profilePassesTable.$inferInsert;
