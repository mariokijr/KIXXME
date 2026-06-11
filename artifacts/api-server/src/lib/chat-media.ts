import { randomUUID } from "node:crypto";
import { supabase } from "./supabase.js";

/**
 * Shared media handling for chat attachments (photos + voice notes) across both
 * surfaces: user↔user conversations (Supabase `messages`, public `avatars`
 * bucket) and Gold priority support tickets (Replit-Postgres `support_ticket_
 * messages`, public `support-media` bucket).
 *
 * Security posture (mirrors the existing profile-photo handling):
 *  - Strict MIME allowlist — images never include SVG (no stored XSS); audio is
 *    limited to the containers browsers actually record (webm/mp4/mpeg/ogg).
 *  - Decoded-size caps enforced server-side (8 MB image / 5 MB audio).
 *  - Object paths use `crypto.randomUUID()`, never a guessable timestamp.
 * Buckets are public with unguessable paths — the same model the existing chat
 * photos already use — so a polled support UI never has to re-mint signed URLs
 * (which would reset `<img>`/`<audio>` playback on every poll).
 */

export const SUPPORT_MEDIA_BUCKET = "support-media";
export const CHAT_BUCKET = "avatars";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

const IMAGE_EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const AUDIO_EXT_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
};

export type MediaKind = "image" | "audio";

export interface DecodedMedia {
  buffer: Buffer;
  ext: string;
  contentType: string;
  kind: MediaKind;
}

export type DecodeResult =
  | { ok: true; value: DecodedMedia }
  | { ok: false; error: string };

/** Strip any `;codecs=…` parameter MediaRecorder appends and normalise case. */
function baseMime(mime: string): string {
  return (mime.split(";")[0] ?? "").trim().toLowerCase();
}

/** Infer the attachment kind from the (base) MIME type, or null if neither. */
export function kindFromMime(mime: string): MediaKind | null {
  const base = baseMime(mime);
  if (base in IMAGE_EXT_BY_MIME) return "image";
  if (base in AUDIO_EXT_BY_MIME) return "audio";
  return null;
}

/**
 * Validate + decode a base64 upload for the given (or inferred) kind. Enforces
 * the MIME allowlist and the decoded-size cap. Returns a discriminated result so
 * callers can map a failure to a 400 with a Spanish message.
 */
export function decodeMedia(
  base64: string,
  mimeType: string,
  expected?: MediaKind,
): DecodeResult {
  const mime = baseMime(mimeType);
  const kind = kindFromMime(mime);
  if (!kind || (expected && kind !== expected)) {
    return {
      ok: false,
      error:
        expected === "image"
          ? "Formato de imagen no admitido (usa JPG, PNG o WebP)"
          : expected === "audio"
            ? "Formato de audio no admitido"
            : "Formato de archivo no admitido",
    };
  }
  const ext =
    kind === "image" ? IMAGE_EXT_BY_MIME[mime]! : AUDIO_EXT_BY_MIME[mime]!;

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    return { ok: false, error: "Archivo no válido" };
  }
  if (buffer.length === 0) return { ok: false, error: "Archivo vacío" };

  const cap = kind === "image" ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
  if (buffer.length > cap) {
    return {
      ok: false,
      error:
        kind === "image"
          ? "La imagen es demasiado grande (máx. 8 MB)"
          : "La nota de voz es demasiado grande (máx. 5 MB)",
    };
  }
  return { ok: true, value: { buffer, ext, contentType: mime, kind } };
}

/**
 * A voice note's duration is display-only metadata the client measures; the
 * server can't cheaply verify it. Clamp to an integer in [1, 60]; anything
 * unusable becomes null (the UI then just hides the seconds label).
 */
export function clampAudioDuration(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  if (n < 1) return 1;
  if (n > 60) return 60;
  return n;
}

/** Idempotently create the public support-media bucket (ignores "exists"). */
async function ensureSupportMediaBucket(): Promise<void> {
  const { error } = await supabase.storage.createBucket(SUPPORT_MEDIA_BUCKET, {
    public: true,
  });
  if (error && !/exist/i.test(error.message)) {
    throw new Error(`Failed to create support-media bucket: ${error.message}`);
  }
}

/** Upload to the public `avatars` bucket and return the public URL. */
export async function uploadChatObject(
  path: string,
  media: DecodedMedia,
): Promise<string> {
  const { error } = await supabase.storage
    .from(CHAT_BUCKET)
    .upload(path, media.buffer, {
      contentType: media.contentType,
      upsert: false,
    });
  if (error) throw new Error(error.message);
  return supabase.storage.from(CHAT_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Upload to the public `support-media` bucket and return the public URL,
 * creating the bucket on first use ("Bucket not found" → create → retry once).
 */
export async function uploadSupportObject(
  path: string,
  media: DecodedMedia,
): Promise<string> {
  const attempt = () =>
    supabase.storage.from(SUPPORT_MEDIA_BUCKET).upload(path, media.buffer, {
      contentType: media.contentType,
      upsert: false,
    });
  let { error } = await attempt();
  if (error && /bucket not found/i.test(error.message)) {
    await ensureSupportMediaBucket();
    ({ error } = await attempt());
  }
  if (error) throw new Error(error.message);
  return supabase.storage.from(SUPPORT_MEDIA_BUCKET).getPublicUrl(path).data
    .publicUrl;
}

/** Object path for a user↔user chat attachment (image or voice note). */
export function chatMediaPath(
  userId: string,
  conversationId: string,
  media: DecodedMedia,
): string {
  const sub = media.kind === "audio" ? "audio/" : "";
  return `${userId}/chat/${conversationId}/${sub}${randomUUID()}.${media.ext}`;
}

/** Object path for a support-ticket attachment (image or voice note). */
export function supportMediaPath(
  userId: string,
  ticketId: string,
  media: DecodedMedia,
): string {
  return `${userId}/${ticketId}/${randomUUID()}.${media.ext}`;
}
