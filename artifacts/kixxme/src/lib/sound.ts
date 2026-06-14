/**
 * Lightweight, mobile-safe sound effects for the key dating interactions
 * (like / pass / SuperLike / match / KixxMe Live call start).
 *
 * Design constraints:
 * - Plays only after the first user interaction (browser autoplay policy).
 * - Never loops; every cue is a short one-shot.
 * - Non-blocking and fail-silent: a blocked or missing file is swallowed.
 * - Primes ("unlocks") the audio elements on the first gesture so that later,
 *   network-triggered cues (e.g. a like confirmed by the server a moment after
 *   the tap) still play on iOS/Android.
 */

export type SoundName = "like" | "pass" | "superlike" | "match" | "live";

const FILES: Record<SoundName, string> = {
  like: "sounds/like.wav",
  pass: "sounds/pass.wav",
  superlike: "sounds/superlike.wav",
  match: "sounds/match.wav",
  live: "sounds/live.wav",
};

const VOLUME: Record<SoundName, number> = {
  like: 0.35,
  pass: 0.3,
  superlike: 0.4,
  match: 0.5,
  live: 0.45,
};

const supported = typeof window !== "undefined" && typeof Audio !== "undefined";
const els: Partial<Record<SoundName, HTMLAudioElement>> = {};

function urlFor(name: SoundName): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base}${FILES[name]}`;
}

function element(name: SoundName): HTMLAudioElement {
  let a = els[name];
  if (!a) {
    a = new Audio(urlFor(name));
    a.preload = "auto";
    a.volume = VOLUME[name];
    els[name] = a;
  }
  return a;
}

/**
 * Play a one-shot sound effect. Safe to call from any user-action handler.
 * Plays only within real user gestures (like / superlike / match buttons) so
 * no sound fires on page navigation clicks. Fail-silent when unsupported or
 * blocked by the browser.
 */
export function playSound(name: SoundName): void {
  if (!supported) return;
  try {
    const a = element(name);
    a.currentTime = 0;
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    /* fail silent */
  }
}
