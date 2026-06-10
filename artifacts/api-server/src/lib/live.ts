import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import {
  db,
  liveQueueTable,
  videoCallsTable,
  type VideoCall,
  type LiveScope,
} from "@workspace/db";
import { supabase } from "./supabase.js";
import { getBlockRelations } from "./blocks.js";
import { haversineKm } from "./geo.js";

/**
 * KixxMe Live matchmaking + call lifecycle.
 *
 * SCAFFOLD: this module owns the queue, the match algorithm, and the call state
 * machine, but it does NOT touch any media plane. There is no WebRTC, no SFU,
 * and no token minting yet — see `issueMediaToken` for the single integration
 * point a future LiveKit (or similar) wiring would replace.
 */

// --- Tunables --------------------------------------------------------------

/** Max distance for the "nearby" scope. */
const NEARBY_KM = 100;
/** Queue rows not refreshed within this window are treated as gone. */
const STALE_MS = 30_000;
/** Ringing calls older than this are auto-expired to "missed". */
const RING_TTL_MS = 60_000;
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
}

interface Geo {
  lat: number | null;
  lng: number | null;
  city: string | null;
}

export type CallOutcome = VideoCall | "notfound" | "forbidden";

// --- Media plane (future integration point) --------------------------------

/**
 * LIVEKIT / WEBRTC INTEGRATION POINT.
 *
 * In the full feature this returns a signed, room-scoped media token (e.g. a
 * LiveKit access token) so the client can join `roomName`. The scaffold has no
 * media server, so it always returns null and the client renders a placeholder
 * in-call surface. Wiring real media is intentionally isolated to this one
 * function plus the `roomName` already persisted on every call row.
 */
export function issueMediaToken(
  _roomName: string,
  _userId: string,
): string | null {
  return null;
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
  return {
    userId,
    scope: filters.scope,
    ageMin: filters.ageMin,
    ageMax: filters.ageMax,
    userAge: (data?.age as number | null) ?? null,
    lat: (data?.latitude as number | null) ?? null,
    lng: (data?.longitude as number | null) ?? null,
    city: (data?.city as string | null) ?? null,
  };
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
  return {
    id: row.id,
    roomName: row.roomName,
    type: row.type,
    status: row.status,
    role: isCaller ? "caller" : "callee",
    callerAccepted: row.callerAcceptedAt != null,
    calleeAccepted: row.calleeAcceptedAt != null,
    partner,
    // No media plane in the scaffold; a real deploy would mint a token here
    // once the call is active.
    mediaToken:
      row.status === "active" ? issueMediaToken(row.roomName, viewerId) : null,
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
          filters: {
            scope: snap.scope,
            ageMin: snap.ageMin,
            ageMax: snap.ageMax,
          },
        })
        .returning();
      return call ?? null;
    }

    const stamp = new Date();
    await tx
      .insert(liveQueueTable)
      .values({
        userId: me,
        scope: snap.scope,
        ageMin: snap.ageMin,
        ageMax: snap.ageMax,
        userAge: snap.userAge,
        lat: snap.lat,
        lng: snap.lng,
        city: snap.city,
        lastSeenAt: stamp,
      })
      .onConflictDoUpdate({
        target: liveQueueTable.userId,
        set: {
          scope: snap.scope,
          ageMin: snap.ageMin,
          ageMax: snap.ageMax,
          userAge: snap.userAge,
          lat: snap.lat,
          lng: snap.lng,
          city: snap.city,
          lastSeenAt: stamp,
        },
      });
    return null;
  });
}

async function blockedSet(me: string): Promise<Set<string>> {
  const { iBlocked, blockedMe } = await getBlockRelations(me);
  const all = new Set<string>(iBlocked);
  for (const id of blockedMe) all.add(id);
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

async function terminate(
  callId: string,
  userId: string,
  status: "declined" | "cancelled" | "ended",
  allowedFrom: VideoCall["status"][],
  reason: string,
): Promise<CallOutcome> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(videoCallsTable)
      .where(eq(videoCallsTable.id, callId))
      .for("update");
    if (!row) return "notfound";
    if (!isParticipant(row, userId)) return "forbidden";
    if (!allowedFrom.includes(row.status)) return row;

    const [updated] = await tx
      .update(videoCallsTable)
      .set({ status, endedAt: new Date(), endReason: reason })
      .where(eq(videoCallsTable.id, callId))
      .returning();
    return updated ?? "notfound";
  });
}

export function declineCall(callId: string, userId: string): Promise<CallOutcome> {
  return terminate(callId, userId, "declined", ["ringing"], "declined");
}

export function cancelCall(callId: string, userId: string): Promise<CallOutcome> {
  return terminate(callId, userId, "cancelled", ["ringing"], "cancelled");
}

export function endCall(
  callId: string,
  userId: string,
  reason?: string,
): Promise<CallOutcome> {
  return terminate(
    callId,
    userId,
    "ended",
    ["ringing", "active"],
    reason && reason.length > 0 ? reason.slice(0, 100) : "hangup",
  );
}
