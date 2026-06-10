import {
  pgTable,
  uuid,
  text,
  integer,
  doublePrecision,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * KixxMe Live — repo-owned tables for the Gold-only video-call feature.
 *
 * These live in the repo-owned Replit Postgres (DATABASE_URL), NOT Supabase,
 * because the Supabase schema is not DDL-modifiable from this repo. All user
 * references hold Supabase auth user UUIDs validated in application code; there
 * are no SQL foreign keys across databases.
 *
 * This is the scaffold for a future WebRTC/LiveKit integration: rows carry a
 * `roomName` that a media server can later bind to, but no media tokens or
 * streams are issued yet (see api-server `lib/live.ts` issueMediaToken stub).
 */

/** Match scope for random video calls. */
export type LiveScope = "nearby" | "city" | "spain" | "europe" | "worldwide";

/** One participant's search preferences + skip streak at match time. */
export type LiveParticipantFilters = {
  scope: LiveScope;
  ageMin: number;
  ageMax: number;
  /** Consecutive "Siguiente" skips this user had accumulated entering the call. */
  skipCount: number;
};

/**
 * Snapshot of BOTH parties' filters, stored on a random call so either side can
 * be re-queued (with the correct preferences + skip streak) when someone hits
 * "Siguiente" or cancels. Private calls leave this null.
 */
export type LiveCallFilters = {
  caller: LiveParticipantFilters;
  callee: LiveParticipantFilters;
};

/**
 * Active pool of users searching for a random video call. One row per user
 * (enforced by a unique user_id). Age/location are SNAPSHOTTED at enqueue time
 * so the transactional matcher can run entirely inside Replit Postgres without
 * a cross-DB read of Supabase `profiles` mid-match.
 */
export const liveQueueTable = pgTable(
  "live_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Supabase auth user searching for a match (unique: one entry per user).
    userId: uuid("user_id").notNull().unique(),
    // Desired match scope.
    scope: text("scope").$type<LiveScope>().notNull(),
    // Desired partner age range.
    ageMin: integer("age_min").notNull(),
    ageMax: integer("age_max").notNull(),
    // Snapshot of the searcher's own age (for mutual filtering); may be null.
    userAge: integer("user_age"),
    // Snapshot of the searcher's location/city (from Supabase at enqueue).
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    city: text("city"),
    // Consecutive "Siguiente" skips in the current search session. Reset to 0 on
    // a fresh search/accept; incremented when this user skips. The skip endpoint
    // refuses once this reaches the per-session cap (anti-abuse).
    skipCount: integer("skip_count").notNull().default(0),
    // The partner this user just skipped (or was skipped by), so the matcher can
    // avoid immediately re-pairing the same two people. Cleared on fresh search.
    lastSkippedPartnerId: uuid("last_skipped_partner_id"),
    // Refreshed on each poll; rows older than the staleness window are expired.
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("live_queue_last_seen_idx").on(t.lastSeenAt)],
);

/**
 * A video call — either a random match or a private invite from a chat.
 *
 * "Both must accept" is modelled with two independent acceptance timestamps;
 * a call becomes `active` only once both are set (for private calls the caller
 * accepts implicitly on creation).
 */
export const videoCallsTable = pgTable(
  "video_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Future LiveKit/WebRTC room identifier (e.g. `live-<uuid>`).
    roomName: text("room_name").notNull().unique(),
    // "random" (matchmaking) | "private" (invite from a chat).
    type: text("type").$type<"random" | "private">().notNull(),
    // ringing | active | ended | declined | cancelled | missed | skipped
    status: text("status")
      .$type<
        | "ringing"
        | "active"
        | "ended"
        | "declined"
        | "cancelled"
        | "missed"
        | "skipped"
      >()
      .notNull()
      .default("ringing"),
    // Caller is the user who initiated (search owner or private inviter).
    callerId: uuid("caller_id").notNull(),
    // Callee is the matched/invited user.
    calleeId: uuid("callee_id").notNull(),
    // Snapshot of BOTH parties' random-search filters (caller + callee) that
    // produced the match, so either side can be re-queued on skip/cancel. Null
    // for private (invite) calls.
    filters: jsonb("filters").$type<LiveCallFilters | null>(),
    // Independent acceptances; both required before a call goes active.
    callerAcceptedAt: timestamp("caller_accepted_at", { withTimezone: true }),
    calleeAcceptedAt: timestamp("callee_accepted_at", { withTimezone: true }),
    // Free-form reason set when a call ends (e.g. "hangup", "reported").
    endReason: text("end_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Set when both parties have accepted and the call went active.
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    index("video_calls_caller_idx").on(t.callerId),
    index("video_calls_callee_idx").on(t.calleeId),
    index("video_calls_status_idx").on(t.status),
  ],
);

export type LiveQueueEntry = typeof liveQueueTable.$inferSelect;
export type InsertLiveQueueEntry = typeof liveQueueTable.$inferInsert;
export type VideoCall = typeof videoCallsTable.$inferSelect;
export type InsertVideoCall = typeof videoCallsTable.$inferInsert;
