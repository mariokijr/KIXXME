---
name: KixxMe sound effects
description: How interaction-gated, mobile-safe one-shot sound cues are wired, and the iOS audio-unlock quirk.
---

# Sound effects (like / pass / superlike / match / Live)

Central helper `artifacts/kixxme/src/lib/sound.ts` exposes `playSound(name)`; WAV assets live in `artifacts/kixxme/public/sounds/`.

## iOS audio unlock: prime with volume=0, not muted
On the first user gesture (pointerdown/touchstart/keydown) every cue element is played once and immediately reset, to satisfy the mobile autoplay policy so later **network-deferred** cues still play.
**Why:** a like/superlike sound fires in the React Query `onSuccess`, which resolves after the originating gesture window has closed — without priming, iOS/Android silently block it. And priming with `muted=true` does NOT reliably unlock later *unmuted* playback on iOS Safari; a real silent play (`volume=0`, restore volume after) does.
**How to apply:** keep playback post-interaction + fail-silent (`play().catch` + try/catch), never loop, and prime via `volume=0` if you add new cues.

## No double-play: one call site per event
like/superlike live in the single centralized `useLikeActions` onSuccess (suppressed on the match branch — match has its own cue in `match-celebration` `celebrate()`); pass plays once in swipe-deck's decide; live plays once on the Countdown mount.
**Why:** like/superlike are triggered from many surfaces (discover/favorites/map/swipe) — centralizing in the hook is the only place that covers them all without duplicating, and the match branch must suppress them so a mutual like plays only the match cue.
