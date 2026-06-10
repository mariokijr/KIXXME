import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

/**
 * Short-lived email verification codes that gate the sensitive, irreversible
 * account actions (temporary deactivation and permanent deletion).
 *
 * Lives in the repo-owned Replit Postgres (DATABASE_URL). A 6-digit code is
 * generated, its sha256 hash stored here, and the plaintext emailed to the
 * user's registered address. Confirmation looks up the latest unconsumed,
 * non-expired row for the (user, action), increments `attempts` atomically
 * (capped to defeat brute force), constant-time compares the hash, then marks
 * the row consumed so it cannot be replayed.
 */
export type AccountActionPayload = {
  deactivationType?: "1m" | "3m" | "6m" | "indefinite";
};

export const accountActionCodesTable = pgTable("account_action_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Supabase auth user id the code belongs to.
  userId: uuid("user_id").notNull(),
  // deactivate | delete
  action: text("action").notNull(),
  // sha256(plaintext code) — the plaintext is only ever emailed, never stored.
  codeHash: text("code_hash").notNull(),
  // Action parameters captured at request time (e.g. the deactivation duration).
  payload: jsonb("payload").$type<AccountActionPayload>(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AccountActionCode = typeof accountActionCodesTable.$inferSelect;
export type InsertAccountActionCode = typeof accountActionCodesTable.$inferInsert;
