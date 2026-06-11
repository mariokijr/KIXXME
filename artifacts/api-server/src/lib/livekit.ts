import { AccessToken, type VideoGrant } from "livekit-server-sdk";
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
