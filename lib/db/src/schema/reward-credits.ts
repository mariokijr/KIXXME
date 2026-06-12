import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Append-only ledger of bonus like / SuperLike CREDITS earned from gamification
 * (daily rewards, streak milestones), in the repo-owned Replit Postgres
 * (DATABASE_URL), NOT Supabase. There are no cross-DB foreign keys — `userId`
 * holds a Supabase auth UUID.
 *
 * The available credit balance for a (user, kind) is derived as SUM(delta):
 *   - a grant inserts a positive `delta` (reason 'daily_reward' |
 *     'streak_milestone' | 'special_milestone'),
 *   - a spend inserts `delta = -1` (reason 'spend') when a like/SuperLike is taken
 *     beyond the base rolling-window allowance (see `lib/likes.ts`).
 * Spends are only ever inserted inside the same per-user advisory-locked
 * transaction that checks the balance, so the SUM can never go negative.
 *
 * NEVER prune this table — like `like_actions`, the balance is derived from the
 * full history, so deleting rows would silently change users' balances.
 */
export const rewardCreditsTable = pgTable(
  "reward_credits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Supabase auth user id who owns the credits.
    userId: uuid("user_id").notNull(),
    // like | superlike — which balance this row affects.
    kind: text("kind").notNull(),
    // +N for a grant, -1 for a spend. Balance = SUM(delta).
    delta: integer("delta").notNull(),
    // daily_reward | streak_milestone | special_milestone | spend
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Balance: SUM(delta) WHERE user_id = ? AND kind = ?
    index("reward_credits_user_kind_idx").on(t.userId, t.kind),
  ],
);

export type RewardCredit = typeof rewardCreditsTable.$inferSelect;
export type InsertRewardCredit = typeof rewardCreditsTable.$inferInsert;
