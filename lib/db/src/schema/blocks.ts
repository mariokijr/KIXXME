import { pgTable, uuid, timestamp, unique } from "drizzle-orm/pg-core";

export const blocksTable = pgTable(
  "blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blockerId: uuid("blocker_id").notNull(),
    blockedId: uuid("blocked_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("blocks_blocker_blocked_unique").on(t.blockerId, t.blockedId)],
);

export type Block = typeof blocksTable.$inferSelect;
export type InsertBlock = typeof blocksTable.$inferInsert;
