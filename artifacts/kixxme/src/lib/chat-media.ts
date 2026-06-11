/**
 * Shared helpers for chat attachments (photos + voice notes), used by both the
 * user↔user chat and the Gold↔Support ticket chat. Everything here is
 * client-side: image downscale, audio MIME selection, duration formatting and a
 * single global audio-playback manager so only one voice note plays at a time.
 */

const MAX_IMAGE_DIM = 1280;
const JPEG_QUALITY = 0.82;

/** Read a Blob/File into a bare base64 payload (no data-URL prefix). */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Downscale an image File to a <=MAX_IMAGE_DIM JPEG. Returns the base64 payload
 * (for upload) plus a data URL (for an instant local preview before send).
 */
export async function downscaleImage(
  file: File,
): Promise<{ base64: string; dataUrl: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("No se pudo procesar la imagen."));
    i.src = dataUrl;
  });
  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;
  if (width > MAX_IMAGE_DIM || height > MAX_IMAGE_DIM) {
    if (width >= height) {
      height = Math.round((height * MAX_IMAGE_DIM) / width);
      width = MAX_IMAGE_DIM;
    } else {
      width = Math.round((width * MAX_IMAGE_DIM) / height);
      height = MAX_IMAGE_DIM;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no permite procesar la imagen.");
  ctx.drawImage(img, 0, 0, width, height);
  const outUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const base64 = outUrl.split(",")[1] ?? "";
  if (!base64) throw new Error("No se pudo procesar la imagen.");
  return { base64, dataUrl: outUrl };
}

/**
 * Pick a MediaRecorder MIME type the current browser actually supports. iOS
 * Safari can't record webm/opus, so we fall back to mp4 (and finally to the
 * browser default). The server's allowlist accepts webm/mp4/mpeg/ogg.
 */
export function pickAudioMime(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg;codecs=opus",
  ];
  const rec = (
    window as unknown as {
      MediaRecorder?: { isTypeSupported?: (t: string) => boolean };
    }
  ).MediaRecorder;
  if (rec?.isTypeSupported) {
    for (const t of candidates) {
      if (rec.isTypeSupported(t)) return t;
    }
  }
  return "";
}

/** Derive a sensible file extension from a recorded-audio MIME type. */
export function audioExt(mime: string): string {
  const m = (mime || "").toLowerCase();
  if (m.includes("mp4")) return "m4a";
  if (m.includes("mpeg")) return "mp3";
  if (m.includes("ogg")) return "ogg";
  return "webm";
}

/** Format a seconds count as m:ss (e.g. 7 → "0:07", 75 → "1:15"). */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

export const MAX_RECORD_SECONDS = 60;

/**
 * Global single-playback manager. Voice notes register their <audio> element
 * here; starting one pauses any other that's playing, so two bubbles never talk
 * over each other (mirrors how WhatsApp/Telegram behave).
 */
class AudioPlaybackManager {
  private current: HTMLAudioElement | null = null;

  play(el: HTMLAudioElement) {
    if (this.current && this.current !== el) {
      this.current.pause();
    }
    this.current = el;
  }

  stop(el: HTMLAudioElement) {
    if (this.current === el) this.current = null;
  }
}

export const audioPlayback = new AudioPlaybackManager();
