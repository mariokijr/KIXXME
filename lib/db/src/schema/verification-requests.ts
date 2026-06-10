import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Profile / identity verification requests, in the repo-owned Replit Postgres
 * (DATABASE_URL), NOT Supabase. The verified BADGE itself is the Supabase
 * `profiles.is_verified` boolean (the source of truth rendered on cards and
 * profiles); this table records the manual-review WORKFLOW (who asked, when, the
 * admin decision) that gates flipping that flag.
 *
 * There are no cross-DB foreign keys — `userId`/`reviewedBy` hold Supabase auth
 * user UUIDs and the join to `profiles` is done in application code. Approval
 * writes `profiles.is_verified = true` via the service-role Supabase client.
 *
 * At most one OPEN (pending) request per user is enforced by a partial unique
 * index; the app also checks first so it can return a friendly Spanish 409.
 */
export const verificationRequestsTable = pgTable(
  "verification_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Supabase auth user requesting verification.
    userId: uuid("user_id").notNull(),
    // pending | approved | rejected
    status: text("status").notNull().default("pending"),
    // Optional admin note (e.g. rejection reason).
    note: text("note"),
    // Admin (Supabase auth user) who reviewed the request.
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // At most one pending request per user (race-safe; app also pre-checks).
    uniqueIndex("verification_requests_user_pending_idx")
      .on(t.userId)
      .where(sql`status = 'pending'`),
    // Admin queue: WHERE status = 'pending' ORDER BY created_at.
    index("verification_requests_status_created_idx").on(
      t.status,
      t.createdAt,
    ),
    // Latest request per user for status derivation.
    index("verification_requests_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export type VerificationRequest =
  typeof verificationRequestsTable.$inferSelect;
export type InsertVerificationRequest =
  typeof verificationRequestsTable.$inferInsert;
export type VerificationStatusValue = "pending" | "approved" | "rejected";
