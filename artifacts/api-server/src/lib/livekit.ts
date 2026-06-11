import { AccessToken, RoomServiceClient, type VideoGrant } from "livekit-server-sdk";
import { logger } from "./logger.js";

/**
 * LiveKit media-plane integration (KixxMe Live).
 *
 * This module is the ONLY place that talks to LiveKit credentials. It mints
 * short-lived, room-scoped access tokens so a client can join exactly one call
 * room — never a wildcard grant. Recording is explicitly disabled.
 *
 * Configuration comes from three secrets:
 *   - LIVEKIT_URL        the wss:// project URL (also surfaced to the client)
 *   - LIVEKIT_API_KEY    API key (server-only)
 *   - LIVEKIT_API_SECRET API secret used to sign tokens (server-only)
 *
 * When any secret is missing the module degrades gracefully: token minting
 * returns null and Live behaves like the pre-media scaffold (no token, no
 * connection) instead of throwing.
 */

export interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

/** Read the LiveKit config, or null when not fully configured. */
export function getLiveKitConfig(): LiveKitConfig | null {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

/** True when all three LiveKit secrets are present. */
export function isLiveKitConfigured(): boolean {
  return getLiveKitConfig() !== null;
}

/** The wss:// URL clients connect to, or null when not configured. */
export function getLiveKitUrl(): string | null {
  return getLiveKitConfig()?.url ?? null;
}

/**
 * Token lifetime. Long enough to cover a full call plus reconnects; the token
 * only authorizes *joining* the room, so a generous window is safe and avoids
 * mid-call re-auth churn.
 */
const TOKEN_TTL = "2h";

/**
 * Mint a media token scoped to exactly one room.
 *
 * The grant is locked to `roomName` (`roomJoin` + `room`), so the resulting JWT
 * is useless for any other room. `identity` becomes the participant identity
 * inside the room. Publishing/subscribing are allowed (it's a 1:1 video call);
 * recording is explicitly off (`roomRecord: false`).
 *
 * Returns null when LiveKit is not configured. Callers MUST have already
 * verified entitlement (Gold) and that `identity` is a participant of the call
 * that owns `roomName` — this function does not re-check authorization.
 */
export async function mintRoomToken(
  roomName: string,
  identity: string,
  displayName?: string | null,
): Promise<string | null> {
  const cfg = getLiveKitConfig();
  if (!cfg) return null;

  try {
    const at = new AccessToken(cfg.apiKey, cfg.apiSecret, {
      identity,
      name: displayName ?? undefined,
      ttl: TOKEN_TTL,
    });
    const grant: VideoGrant = {
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      // No recording: KixxMe Live calls are never recorded.
      roomRecord: false,
    };
    at.addGrant(grant);
    return await at.toJwt();
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), roomName },
      "mintRoomToken: failed to sign LiveKit token",
    );
    return null;
  }
}

/** RoomServiceClient needs the https:// host, not the wss:// client URL. */
function toHttpUrl(wsUrl: string): string {
  return wsUrl.replace(/^ws/, "http");
}

let roomService: RoomServiceClient | null = null;

function getRoomService(): RoomServiceClient | null {
  const cfg = getLiveKitConfig();
  if (!cfg) return null;
  if (!roomService) {
    roomService = new RoomServiceClient(
      toHttpUrl(cfg.url),
      cfg.apiKey,
      cfg.apiSecret,
    );
  }
  return roomService;
}

/**
 * Authoritative server-side snapshot of who is actually in a call's LiveKit
 * room and what each participant has published. This is the ground truth the
 * client cannot fake: it reveals whether a device joined the room at all and
 * whether its camera/mic tracks reached the SFU — exactly what's needed to tell
 * "didn't join", "joined but published nothing", and "published but no media"
 * apart. Returns null when LiveKit is unconfigured or the room doesn't exist
 * yet (no one has joined). Never throws.
 *
 * Protobuf enum values are wire-stable, so we map the numeric codes to readable
 * names locally instead of importing the enums (avoids version-coupling).
 */
const TRACK_TYPE: Record<number, string> = {
  0: "audio",
  1: "video",
  2: "data",
};
const TRACK_SOURCE: Record<number, string> = {
  0: "unknown",
  1: "camera",
  2: "microphone",
  3: "screen_share",
  4: "screen_share_audio",
};
const PARTICIPANT_STATE: Record<number, string> = {
  0: "joining",
  1: "joined",
  2: "active",
  3: "disconnected",
};

export interface RoomTrackInfo {
  source: string;
  type: string;
  muted: boolean;
}

export interface RoomParticipantInfo {
  identity: string;
  state: string;
  joinedAtSec: number | null;
  trackCount: number;
  tracks: RoomTrackInfo[];
}

export async function listRoomParticipants(
  roomName: string,
): Promise<RoomParticipantInfo[] | null> {
  const svc = getRoomService();
  if (!svc) return null;
  try {
    const participants = await svc.listParticipants(roomName);
    return participants.map((p) => ({
      identity: p.identity,
      state: PARTICIPANT_STATE[Number(p.state)] ?? String(p.state),
      joinedAtSec: Number(p.joinedAt) || null,
      trackCount: p.tracks.length,
      tracks: p.tracks.map((t) => ({
        source: TRACK_SOURCE[Number(t.source)] ?? String(t.source),
        type: TRACK_TYPE[Number(t.type)] ?? String(t.type),
        muted: Boolean(t.muted),
      })),
    }));
  } catch (err) {
    // A not-found room (no one joined yet) is expected and informative, not an
    // error — return an empty snapshot so the diag log clearly shows "nobody in
    // the room" rather than a missing field.
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), roomName },
      "listRoomParticipants: room not found or list failed",
    );
    return [];
  }
}

/**
 * Best-effort teardown of a call's LiveKit room when the call ends or a user is
 * blocked, so a token still within its TTL can't be reused to rejoin the room.
 *
 * No-op when LiveKit isn't configured; never throws (deleting a room that was
 * never created — e.g. a call declined before anyone joined — is treated as
 * success).
 */
export async function deleteRoom(roomName: string): Promise<void> {
  const svc = getRoomService();
  if (!svc) return;
  try {
    await svc.deleteRoom(roomName);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), roomName },
      "deleteRoom: failed (room may not exist)",
    );
  }
}
