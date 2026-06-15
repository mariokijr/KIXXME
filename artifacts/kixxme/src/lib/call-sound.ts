/**
 * Web Audio API based call sounds — iPhone-inspired ring + hangup.
 *
 * startRinging() loops a dual-tone ring (480 Hz + 440 Hz bursts every 3.2 s).
 * stopRinging() cancels the loop (call connect / user hangs up / page unmount).
 * playHangup() plays a short descending end-call tone.
 *
 * All functions fail silently when Web Audio is unavailable or suspended.
 */

let _ctx: AudioContext | null = null;
let _ringInterval: ReturnType<typeof setInterval> | null = null;
let _ringing = false;

function ctx(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  if (!_ctx) _ctx = new AudioContext();
  if (_ctx.state === "suspended") void _ctx.resume();
  return _ctx;
}

function ringBurst(c: AudioContext): void {
  const now = c.currentTime;
  for (const freq of [480, 440]) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.04);
    gain.gain.setValueAtTime(0.18, now + 0.90);
    gain.gain.linearRampToValueAtTime(0, now + 1.15);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + 1.15);
  }
}

export function startRinging(): void {
  if (_ringing) return;
  _ringing = true;
  const c = ctx();
  if (!c) return;
  try {
    ringBurst(c);
    _ringInterval = setInterval(() => {
      const c2 = ctx();
      if (c2) try { ringBurst(c2); } catch { /* noop */ }
    }, 3200);
  } catch { /* fail silent */ }
}

export function stopRinging(): void {
  if (!_ringing) return;
  _ringing = false;
  if (_ringInterval !== null) {
    clearInterval(_ringInterval);
    _ringInterval = null;
  }
}

export function playHangup(): void {
  const c = ctx();
  if (!c) return;
  try {
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.linearRampToValueAtTime(200, now + 0.45);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.5);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.5);
  } catch { /* fail silent */ }
}
