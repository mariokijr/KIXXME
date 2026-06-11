import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * Persisted KixxMe Live media diagnostics — one row per client diagnostic post.
 *
 * Lives in the repo-owned Replit Postgres (DATABASE_URL), NOT Supabase. The
 * point of persisting (vs only `req.log.info`) is durability: the workflow log
 * buffer is repeatedly cleared/rotated, which loses the exact iOS camera
 * `DOMException` right when we need it to debug a black-screen report. A row
 * here survives that and is queryable directly (`SELECT … FROM live_diagnostics`).
 *
 * `callId`/`userId` are Supabase/`video_calls` UUIDs with no SQL foreign key
 * (cross-DB). `client` is the full client `LiveDiagReport` (no tokens, no PII
 * beyond the userAgent); `server` is the authoritative `listRoomParticipants`
 * snapshot so "didn't join" / "joined but published nothing" / "published but
 * muted/black" can be told apart.
 */
export const liveDiagnosticsTable = pgTable("live_diagnostics", {
  id: uuid("id").primaryKey().defaultRandom(),
  callId: uuid("call_id").notNull(),
  userId: uuid("user_id").notNull(),
  // caller | callee
  role: text("role"),
  // acquire | delayed | teardown | toggle-cam | toggle-mic
  reason: text("reason"),
  // Full client LiveDiagReport.
  client: jsonb("client"),
  // Authoritative server-side room participant snapshot.
  server: jsonb("server"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type LiveDiagnostics = typeof liveDiagnosticsTable.$inferSelect;
export type InsertLiveDiagnostics = typeof liveDiagnosticsTable.$inferInsert;
