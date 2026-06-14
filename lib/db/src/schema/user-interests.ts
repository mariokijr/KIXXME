import { pgTable, uuid, text, primaryKey } from "drizzle-orm/pg-core";

/**
 * Stores the per-user interest/tag list (e.g. "gimnasio", "viajes").
 * Each row is one (user, tag) pair; the composite PK enforces uniqueness.
 * Lives in repo-owned Replit Postgres (DATABASE_URL) — same dual-DB pattern
 * as verification/visits/blocks.
 */
export const userInterestsTable = pgTable(
  "user_interests",
  {
    userId: uuid("user_id").notNull(),
    tag: text("tag").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.tag] }),
  }),
);

export type UserInterest = typeof userInterestsTable.$inferSelect;
