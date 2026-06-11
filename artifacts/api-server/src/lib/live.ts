import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import {
  db,
  liveQueueTable,
  videoCallsTable,
  type VideoCall,
  type LiveScope,
  type LiveParticipantFilters,
} from "@workspace/db";
import { supabase } from "./supabase.js";
import { getBlockRelations } from "./blocks.js";
import { getUnavailableIds } from "./moderation.js";
import { getPlan } from "./entitlement.js";
import { mintRoomToken, getLiveKitUrl, deleteRoom } from "./livekit.js";
import { haversineKm } from "./geo.js";

/**
 * KixxMe Live matchmaking + call lifecycle.
 *
 * This module owns the queue, the match algorithm, and the call state machine.
 * The media plane is LiveKit: `issueMediaToken` mints a room-scoped token for an
 * active call (attached to the DTO by `serializeCall`), and `endCall` tears the
 * room down via `deleteRoom`. Media credentials are minted only while a call is
 * `active`; ringing/declined/cancelled/skipped calls never get a token.
 */

// --- Tunables --------------------------------------------------------------

/** Max distance for the "nearby" scope. */
const NEARBY_KM = 100;
/** Queue rows not refreshed within this window are treated as gone. */
const STALE_MS = 30_000;
/** Ringing calls older than this are auto-expired to "missed". */
const RING_TTL_MS = 60_000;
/**
 * Maximum number of consecutive "Siguiente" skips allowed per search session.
 * Once a user has skipped this many times in a row without accepting or starting
 * a fresh search, further skips are refused (anti-abuse). Reset on accept or a
 * brand-new search.
 */
const MAX_SKIPS = 3;
/**
 * Transaction-scoped advisory lock key. Serializing the match critical section
 * makes a double-match (two concurrent searchers each matching the other)
 * impossible; it is released automatically on commit/rollback.
 */
const MATCH_LOCK_KEY = 987654321;

// Rough bounding boxes. Supabase has no country column, so "spain"/"europe"
// scopes are approximated by lat/lng extents (documented limitation).
const SPAIN_BOX = { latMin: 27.4, latMax: 43.9, lngMin: -18.3, lngMax: 4.6 };
const EUROPE_BOX = { latMin: 34, latMax: 71.5, lngMin: -25, lngMax: 45 };

// --- Types -----------------------------------------------------------------

export interface LiveCallParticipantDTO {
  id: string;
  username: string | null;
  avatar_url: string | null;
  age: number | null;
  city: string | null;
}

export interface LiveCallDTO {
  id: string;
  roomName: string;
  type: VideoCall["type"];
  status: VideoCall["status"];
  role: "caller" | "callee";
  callerAccepted: boolean;
  calleeAccepted: boolean;
  partner: LiveCallParticipantDTO;
  mediaToken: string | null;
  mediaUrl: string | null;
  createdAt: string;
}

interface Snapshot {
  userId: string;
  scope: LiveScope;
  ageMin: number;
  ageMax: number;
  userAge: number | null;
  lat: number | null;
  lng: number | null;
  city: string | null;
  /** Consecutive skips in the current session (carried across re-queues). */
  skipCount: number;
  /** Partner just skipped with this user, excluded from the next match. */
  lastSkippedPartnerId: string | null;
}

interface Geo {
  lat: number | null;
  lng: number | null;
  city: string | null;
}

export type CallOutcome = VideoCall | "notfound" | "forbidden";

// --- Media plane (LiveKit) -------------------------------------------------

/**
 * Issue a room-scoped LiveKit media token for `userId` to join `roomName`.
 *
 * GATING: tokens are Gold-only — a non-Gold (or lapsed) user always gets null,
 * so entitlement is enforced server-side at the exact moment a token is minted,
 * not merely in the UI. The returned token is locked to exactly `roomName` (see
 * `mintRoomToken`), so it can never be used to join any other call's room.
 *
 * Callers pass the room + viewer of a call the viewer already belongs to
 * (`serializeCall` derives both from the viewer's own call row), so participant
 * authorization is structural. Returns null when LiveKit is not configured.
 */
export async function issueMediaToken(
  roomName: string,
  userId: string,
): Promise<string | null> {
  if ((await getPlan(userId)) !== "gold") return null;
  return mintRoomToken(roomName, userId);
}

// --- Scope / age matching --------------------------------------------------

function normCity(city: string): string {
  return city.trim().toLowerCase();
}

function inBox(
  lat: number | null,
  lng: number | null,
  box: { latMin: number; latMax: number; lngMin: number; lngMax: number },
): boolean {
  if (lat == null || lng == null) return false;
  return (
    lat >= box.latMin &&
    lat <= box.latMax &&
    lng >= box.lngMin &&
    lng <= box.lngMax
  );
}

/** Whether `target` satisfies `viewer`'s desired `scope`. */
function scopeMatches(viewer: Geo, target: Geo, scope: LiveScope): boolean {
  switch (scope) {
    case "worldwide":
      return true;
    case "spain":
      return inBox(target.lat, target.lng, SPAIN_BOX);
    case "europe":
      return inBox(target.lat, target.lng, EUROPE_BOX);
    case "city":
      return (
        !!viewer.city &&
        !!target.city &&
        normCity(viewer.city) === normCity(target.city)
      );
    case "nearby":
      if (
        viewer.lat == null ||
        viewer.lng == null ||
        target.lat == null ||
        target.lng == null
      ) {
        return false;
      }
      return haversineKm(viewer.lat, viewer.lng, target.lat, target.lng) <=
        NEARBY_KM;
    default:
      return false;
  }
}

/**
 * Downgrade a scope to "worldwide" when the searcher lacks the data that scope
 * needs to ever match: coordinates for nearby/spain/europe, or a city for the
 * city scope. Without this a user who never granted location would enqueue with
 * (say) "nearby" and sit in the queue forever, because scopeMatches can never
 * be satisfied without coordinates. The UI separately warns the user (see
 * getLiveProfileFlags) so the fallback is never silent.
 */
function effectiveScope(
  scope: LiveScope,
  geo: Geo,
): LiveScope {
  const noCoords = geo.lat == null || geo.lng == null;
  if (
    noCoords &&
    (scope === "nearby" || scope === "spain" || scope === "europe")
  ) {
    return "worldwide";
  }
  if (scope === "city" && !geo.city) return "worldwide";
  return scope;
}

/** Both users must fall inside each other's requested age range. */
function ageMutual(
  a: { userAge: number | null; ageMin: number; ageMax: number },
  b: { userAge: number | null; ageMin: number; ageMax: number },
): boolean {
  if (a.userAge == null || b.userAge == null) return false;
  return (
    b.userAge >= a.ageMin &&
    b.userAge <= a.ageMax &&
    a.userAge >= b.ageMin &&
    a.userAge <= b.ageMax
  );
}

// --- Snapshots / hydration -------------------------------------------------

async function loadSnapshot(
  userId: string,
  filters: { scope: LiveScope; ageMin: number; ageMax: number },
): Promise<Snapshot> {
  const { data } = await supabase
    .from("profiles")
    .select("age, latitude, longitude, city")
    .eq("id", userId)
    .maybeSingle();
  const lat = (data?.latitude as number | null) ?? null;
  const lng = (data?.longitude as number | null) ?? null;
  const city = (data?.city as string | null) ?? null;
  return {
    userId,
    // Fall back to worldwide when the chosen scope can't be satisfied with this
    // user's data (no coordinates / no city). See effectiveScope.
    scope: effectiveScope(filters.scope, { lat, lng, city }),
    ageMin: filters.ageMin,
    ageMax: filters.ageMax,
    userAge: (data?.age as number | null) ?? null,
    lat,
    lng,
    city,
    // Fresh load = fresh session: streak resets and no excluded partner. Callers
    // that need to preserve a streak (skip/heartbeat) override these.
    skipCount: 0,
    lastSkippedPartnerId: null,
  };
}

/**
 * Profile-readiness flags for the Live idle screen. `hasAge` is a hard match
 * requirement (ageMutual rejects any pair where either side has no age), so the
 * UI must nudge the user to set it; `hasLocation` only affects scope (false →
 * location scopes fall back to worldwide). Cheap single indexed read; the route
 * only calls this on the idle screen (Gold, not searching, not in a call), so it
 * never runs on the search-poll hot path.
 */
export async function getLiveProfileFlags(
  userId: string,
): Promise<{ hasAge: boolean; hasLocation: boolean }> {
  const { data } = await supabase
    .from("profiles")
    .select("age, latitude, longitude")
    .eq("id", userId)
    .maybeSingle();
  const age = (data?.age as number | null) ?? null;
  const lat = (data?.latitude as number | null) ?? null;
  const lng = (data?.longitude as number | null) ?? null;
  return { hasAge: age != null, hasLocation: lat != null && lng != null };
}

async function loadParticipant(userId: string): Promise<LiveCallParticipantDTO> {
  const { data } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, age, city")
    .eq("id", userId)
    .maybeSingle();
  return {
    id: userId,
    username: (data?.username as string | null) ?? null,
    avatar_url: (data?.avatar_url as string | null) ?? null,
    age: (data?.age as number | null) ?? null,
    city: (data?.city as string | null) ?? null,
  };
}

export async function serializeCall(
  row: VideoCall,
  viewerId: string,
): Promise<LiveCallDTO> {
  const isCaller = row.callerId === viewerId;
  const partnerId = isCaller ? row.calleeId : row.callerId;
  const partner = await loadParticipant(partnerId);
  // Mint a room-scoped media token only once the call is active. issueMediaToken
  // is Gold-gated and locks the token to this call's room; mediaUrl is surfaced
  // only alongside a real token, so the client never gets one without the other.
  const mediaToken =
    row.status === "active"
      ? await issueMediaToken(row.roomName, viewerId)
      : null;
  return {
    id: row.id,
    roomName: row.roomName,
    type: row.type,
    status: row.status,
    role: isCaller ? "caller" : "callee",
    callerAccepted: row.callerAcceptedAt != null,
    calleeAccepted: row.calleeAcceptedAt != null,
    partner,
    mediaToken,
    mediaUrl: mediaToken ? getLiveKitUrl() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

// --- Active call lookup ----------------------------------------------------

/**
 * The user's current ringing/active call, if any. A ringing call that has
 * outlived its TTL is lazily expired to "missed" so neither party gets stuck.
 */
export async function getActiveCall(
  userId: string,
): Promise<VideoCall | undefined> {
  const rows = await db
    .select()
    .from(videoCallsTable)
    .where(
      and(
        inArray(videoCallsTable.status, ["ringing", "active"]),
        or(
          eq(videoCallsTable.callerId, userId),
          eq(videoCallsTable.calleeId, userId),
        ),
      ),
    )
    .orderBy(desc(videoCallsTable.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row) return undefined;
  if (
    row.status === "ringing" &&
    Date.now() - row.createdAt.getTime() > RING_TTL_MS
  ) {
    await db
      .update(videoCallsTable)
      .set({ status: "missed", endedAt: new Date(), endReason: "timeout" })
      .where(eq(videoCallsTable.id, row.id));
    return undefined;
  }
  return row;
}

// --- Matchmaking -----------------------------------------------------------

/** Build the values + conflict-update set for upserting a searcher's queue row. */
function queueUpsertParts(snap: Snapshot, stamp: Date) {
  const cols = {
    scope: snap.scope,
    ageMin: snap.ageMin,
    ageMax: snap.ageMax,
    userAge: snap.userAge,
    lat: snap.lat,
    lng: snap.lng,
    city: snap.city,
    skipCount: snap.skipCount,
    lastSkippedPartnerId: snap.lastSkippedPartnerId,
    lastSeenAt: stamp,
  };
  return { values: { userId: snap.userId, ...cols }, set: cols };
}

/** A participant's stored filters, falling back to permissive defaults. */
function filtersOf(
  f: LiveParticipantFilters | undefined,
): { scope: LiveScope; ageMin: number; ageMax: number } {
  return {
    scope: f?.scope ?? "worldwide",
    ageMin: f?.ageMin ?? 18,
    ageMax: f?.ageMax ?? 99,
  };
}

/**
 * Core transactional matcher. Serialized via an advisory xact lock; candidate
 * rows are additionally locked FOR UPDATE SKIP LOCKED. On a match, both queue
 * rows are removed and a ringing call (type "random", both acceptances pending)
 * is created. With no match, the searcher's queue row is upserted (this also
 * doubles as the search heartbeat by refreshing last_seen_at).
 */
async function runMatch(
  me: string,
  snap: Snapshot,
  blocked: Set<string>,
): Promise<VideoCall | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${MATCH_LOCK_KEY})`);

    const candidates = await tx
      .select()
      .from(liveQueueTable)
      .where(ne(liveQueueTable.userId, me))
      .orderBy(asc(liveQueueTable.lastSeenAt))
      .for("update", { skipLocked: true });

    const now = Date.now();
    const match = candidates.find((c) => {
      if (blocked.has(c.userId)) return false;
      if (now - c.lastSeenAt.getTime() > STALE_MS) return false;
      // Don't immediately re-pair two people who just skipped each other.
      if (snap.lastSkippedPartnerId === c.userId) return false;
      if (c.lastSkippedPartnerId === me) return false;
      if (!ageMutual(snap, c)) return false;
      // Each side's own scope must be satisfied by the other.
      if (!scopeMatches(snap, c, snap.scope)) return false;
      if (!scopeMatches(c, snap, c.scope)) return false;
      return true;
    });

    if (match) {
      await tx
        .delete(liveQueueTable)
        .where(inArray(liveQueueTable.userId, [me, match.userId]));
      const [call] = await tx
        .insert(videoCallsTable)
        .values({
          roomName: `live-${randomUUID()}`,
          type: "random",
          status: "ringing",
          callerId: me,
          calleeId: match.userId,
          // Snapshot BOTH parties' filters + skip streaks so either side can be
          // re-queued correctly on skip/cancel.
          filters: {
            caller: {
              scope: snap.scope,
              ageMin: snap.ageMin,
              ageMax: snap.ageMax,
              skipCount: snap.skipCount,
            },
            callee: {
              scope: match.scope,
              ageMin: match.ageMin,
              ageMax: match.ageMax,
              skipCount: match.skipCount,
            },
          },
        })
        .returning();
      return call ?? null;
    }

    const { values, set } = queueUpsertParts(snap, new Date());
    await tx
      .insert(liveQueueTable)
      .values(values)
      .onConflictDoUpdate({ target: liveQueueTable.userId, set });
    return null;
  });
}

async function blockedSet(me: string): Promise<Set<string>> {
  const { iBlocked, blockedMe } = await getBlockRelations(me);
  const all = new Set<string>(iBlocked);
  for (const id of blockedMe) all.add(id);
  // Unavailable users (deactivated or moderated) are hidden everywhere,
  // including the Live roulette.
  const unavailable = await getUnavailableIds();
  for (const id of unavailable) all.add(id);
  return all;
}

/** Start (or refresh) a random search and attempt an immediate match. */
export async function enqueueAndMatch(
  me: string,
  filters: { scope: LiveScope; ageMin: number; ageMax: number },
): Promise<VideoCall | null> {
  const snap = await loadSnapshot(me, filters);
  const blocked = await blockedSet(me);
  return runMatch(me, snap, blocked);
}

/**
 * Poll-time heartbeat: if the user has a queue row, refresh it and re-attempt a
 * match using the snapshot stored at enqueue (no Supabase read on the hot path).
 * Returns the matched call, `searching`, or null when not queued.
 */
export async function heartbeatAndMatch(
  me: string,
): Promise<{ call?: VideoCall; searching?: boolean } | null> {
  const [row] = await db
    .select()
    .from(liveQueueTable)
    .where(eq(liveQueueTable.userId, me))
    .limit(1);
  if (!row) return null;

  const snap: Snapshot = {
    userId: me,
    scope: row.scope,
    ageMin: row.ageMin,
    ageMax: row.ageMax,
    userAge: row.userAge,
    lat: row.lat,
    lng: row.lng,
    city: row.city,
    skipCount: row.skipCount,
    lastSkippedPartnerId: row.lastSkippedPartnerId,
  };
  const blocked = await blockedSet(me);
  const call = await runMatch(me, snap, blocked);
  return call ? { call } : { searching: true };
}

export async function leaveQueue(me: string): Promise<void> {
  await db.delete(liveQueueTable).where(eq(liveQueueTable.userId, me));
}

// --- Private calls (invite from a chat) ------------------------------------

/**
 * Create a private call invite. The caller accepts implicitly on creation, so
 * only the callee's acceptance is outstanding ("both must accept" handshake).
 */
export async function createPrivateCall(
  caller: string,
  callee: string,
): Promise<VideoCall> {
  const [call] = await db
    .insert(videoCallsTable)
    .values({
      roomName: `live-${randomUUID()}`,
      type: "private",
      status: "ringing",
      callerId: caller,
      calleeId: callee,
      callerAcceptedAt: new Date(),
    })
    .returning();
  if (!call) throw new Error("Failed to create private call");
  return call;
}

// --- Call lifecycle transitions -------------------------------------------

function isParticipant(row: VideoCall, userId: string): boolean {
  return row.callerId === userId || row.calleeId === userId;
}

/** Record an acceptance; the call goes active once both sides have accepted. */
export async function acceptCall(
  callId: string,
  userId: string,
): Promise<CallOutcome> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(videoCallsTable)
      .where(eq(videoCallsTable.id, callId))
      .for("update");
    if (!row) return "notfound";
    if (!isParticipant(row, userId)) return "forbidden";
    if (row.status !== "ringing") return row;

    const isCaller = row.callerId === userId;
    const callerAcceptedAt = isCaller ? new Date() : row.callerAcceptedAt;
    const calleeAcceptedAt = isCaller ? row.calleeAcceptedAt : new Date();
    const bothAccepted = callerAcceptedAt != null && calleeAcceptedAt != null;

    const [updated] = await tx
      .update(videoCallsTable)
      .set({
        callerAcceptedAt,
        calleeAcceptedAt,
        status: bothAccepted ? "active" : "ringing",
        startedAt: bothAccepted ? new Date() : row.startedAt,
      })
      .where(eq(videoCallsTable.id, callId))
      .returning();
    return updated ?? "notfound";
  });
}

/**
 * Terminate a call (decline/cancel/end). Returns the outcome plus `flipped`:
 * `true` only when THIS call actually performed the status transition (vs. a
 * stale/duplicate request on an already-terminal call). Callers use `flipped`
 * to run side effects (e.g. partner re-queue) exactly once.
 */
async function terminate(
  callId: string,
  userId: string,
  status: "declined" | "cancelled" | "ended",
  allowedFrom: VideoCall["status"][],
  reason: string,
): Promise<{ outcome: CallOutcome; flipped: boolean }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(videoCallsTable)
      .where(eq(videoCallsTable.id, callId))
      .for("update");
    if (!row) return { outcome: "notfound", flipped: false };
    if (!isParticipant(row, userId)) return { outcome: "forbidden", flipped: false };
    // Already in a terminal/other state — nothing to flip (stale/duplicate).
    if (!allowedFrom.includes(row.status)) return { outcome: row, flipped: false };

    const [updated] = await tx
      .update(videoCallsTable)
      .set({ status, endedAt: new Date(), endReason: reason })
      .where(eq(videoCallsTable.id, callId))
      .returning();
    if (!updated) return { outcome: "notfound", flipped: false };
    return { outcome: updated, flipped: true };
  });
}

export async function declineCall(
  callId: string,
  userId: string,
): Promise<CallOutcome> {
  const { outcome, flipped } = await terminate(
    callId, userId, "declined", ["ringing"], "declined",
  );
  // Declining a random match returns the *other* participant to the queue so
  // they keep roulette-ing. Only when WE actually flipped the call (not a
  // stale/duplicate request). requeuePartner is a no-op for private calls.
  if (flipped && typeof outcome !== "string") {
    await requeuePartner(outcome, userId);
  }
  return outcome;
}

/**
 * Re-queue the *other* participant of a random call after the given user leaves
 * (cancel/skip), so the partner keeps roulette-ing instead of being dropped to
 * idle. Resets the partner's streak (they didn't skip). No-op for private calls.
 */
async function requeuePartner(call: VideoCall, exitingUserId: string): Promise<void> {
  if (call.type !== "random") return;
  const partnerId =
    call.callerId === exitingUserId ? call.calleeId : call.callerId;
  const partnerIsCaller = call.callerId === partnerId;
  const partnerF = partnerIsCaller ? call.filters?.caller : call.filters?.callee;
  const base = await loadSnapshot(partnerId, filtersOf(partnerF));
  const snap: Snapshot = { ...base, skipCount: 0, lastSkippedPartnerId: null };
  const { values, set } = queueUpsertParts(snap, new Date());
  await db
    .insert(liveQueueTable)
    .values(values)
    .onConflictDoUpdate({ target: liveQueueTable.userId, set });
}

export async function cancelCall(
  callId: string,
  userId: string,
): Promise<CallOutcome> {
  const { outcome, flipped } = await terminate(
    callId, userId, "cancelled", ["ringing"], "cancelled",
  );
  // Only re-queue the partner when WE actually cancelled a ringing random call
  // (flipped = a genuine transition, not a stale/duplicate request).
  if (flipped && typeof outcome !== "string") {
    await requeuePartner(outcome, userId);
  }
  return outcome;
}

export type SkipOutcome =
  | "notfound"
  | "forbidden"
  | "invalid"
  | "limit"
  | "ok";

/**
 * "Siguiente": skip the current random match and return BOTH users to the queue
 * to find someone new. Random + ringing only; participant-guarded. The skipper's
 * consecutive-skip streak increments and is capped at MAX_SKIPS (anti-abuse);
 * the partner's streak resets. The two are excluded from immediately re-matching.
 */
export async function skipCall(
  callId: string,
  userId: string,
): Promise<SkipOutcome> {
  // Pre-read (outside the tx) to validate and to do Supabase snapshot loads
  // without holding row locks across network I/O.
  const [pre] = await db
    .select()
    .from(videoCallsTable)
    .where(eq(videoCallsTable.id, callId))
    .limit(1);
  if (!pre) return "notfound";
  if (!isParticipant(pre, userId)) return "forbidden";
  if (pre.type !== "random" || pre.status !== "ringing") return "invalid";

  const skipperIsCaller = pre.callerId === userId;
  const partnerId = skipperIsCaller ? pre.calleeId : pre.callerId;
  const myF = skipperIsCaller ? pre.filters?.caller : pre.filters?.callee;
  const partnerF = skipperIsCaller ? pre.filters?.callee : pre.filters?.caller;
  const myStreak = myF?.skipCount ?? 0;
  if (myStreak >= MAX_SKIPS) return "limit";

  const [myBase, partnerBase] = await Promise.all([
    loadSnapshot(userId, filtersOf(myF)),
    loadSnapshot(partnerId, filtersOf(partnerF)),
  ]);
  const mySnap: Snapshot = {
    ...myBase,
    skipCount: myStreak + 1,
    lastSkippedPartnerId: partnerId,
  };
  const partnerSnap: Snapshot = {
    ...partnerBase,
    skipCount: 0,
    lastSkippedPartnerId: userId,
  };

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(videoCallsTable)
      .where(eq(videoCallsTable.id, callId))
      .for("update");
    if (!row) return "notfound";
    if (!isParticipant(row, userId)) return "forbidden";
    if (row.type !== "random" || row.status !== "ringing") return "invalid";
    // Re-check the streak against the freshly locked row (guards a racing skip).
    const lockedStreak =
      (skipperIsCaller ? row.filters?.caller : row.filters?.callee)?.skipCount ??
        0;
    if (lockedStreak >= MAX_SKIPS) return "limit";

    await tx
      .update(videoCallsTable)
      .set({ status: "skipped", endedAt: new Date(), endReason: "skipped" })
      .where(eq(videoCallsTable.id, callId));

    const stamp = new Date();
    for (const snap of [mySnap, partnerSnap]) {
      const { values, set } = queueUpsertParts(snap, stamp);
      await tx
        .insert(liveQueueTable)
        .values(values)
        .onConflictDoUpdate({ target: liveQueueTable.userId, set });
    }
    return "ok";
  });
}

export async function endCall(
  callId: string,
  userId: string,
  reason?: string,
): Promise<CallOutcome> {
  const { outcome, flipped } = await terminate(
    callId,
    userId,
    "ended",
    ["ringing", "active"],
    reason && reason.length > 0 ? reason.slice(0, 100) : "hangup",
  );
  // Best-effort: tear down the LiveKit room so a still-valid token can't be
  // reused to rejoin after a hang-up or block. Fire-and-forget; no-op when
  // LiveKit isn't configured. Only when WE actually ended the call (flipped).
  if (flipped && typeof outcome !== "string") {
    void deleteRoom(outcome.roomName);
  }
  return outcome;
}
