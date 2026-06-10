import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Append-only log of like / SuperLike ACTIONS, in the repo-owned Replit Postgres
 * (DATABASE_URL), NOT Supabase. The like row itself lives in the Supabase
 * `likes` table (the source of truth for whether a like exists); this table
 * records WHO did WHAT and WHEN so we can:
 *   - rate-limit free users (rolling-window counts: 10 regular likes / 6h),
 *   - meter SuperLikes (free 1 / 24h, plus 5 / 24h, gold unlimited),
 *   - mark a like as a SuperLike (the latest action for a (liker, liked) pair).
 *
 * There are no cross-DB foreign keys — the link to Supabase users is enforced in
 * application code. Quotas count ACTIONS, so a re-like after an unlike re-counts
 * (this doubles as anti-spam).
 *
 * NEVER prune this table: SuperLike status is derived from the latest action per
 * pair, so deleting history would silently downgrade SuperLikes to plain likes.
 */
export const likeActionsTable = pgTable(
  "like_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Supabase auth user id of the person performing the like.
    likerId: uuid("liker_id").notNull(),
    // Supabase auth user id of the person being liked.
    likedId: uuid("liked_id").notNull(),
    // like | superlike
    kind: text("kind").notNull().default("like"),
    // quota | credit — how this action was paid for. A 'credit' action was
    // funded by a reward credit (see `reward_credits`) and so does NOT count
    // toward the base rolling-window quota; quota counting filters source =
    // 'quota'. Default 'quota' keeps every pre-existing row correct.
    source: text("source").notNull().default("quota"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Rolling-window quota counts: WHERE liker_id = ? AND kind = ? AND created_at > ?
    index("like_actions_liker_created_idx").on(t.likerId, t.createdAt),
    // Latest action per (liked, liker) pair for SuperLike-received detection.
    index("like_actions_liked_liker_created_idx").on(
      t.likedId,
      t.likerId,
      t.createdAt,
    ),
  ],
);

export type LikeAction = typeof likeActionsTable.$inferSelect;
export type InsertLikeAction = typeof likeActionsTable.$inferInsert;
export type LikeKind = "like" | "superlike";
