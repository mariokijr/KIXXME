---
name: KixxMe mandatory onboarding gate
description: How the non-skippable new-user onboarding (tutorial + mandatory profile) gates the whole app, and the invariants it must keep.
---

# Mandatory onboarding gate

New users (email/pwd signup) are forced through an animated tutorial carousel, then a
mandatory profile, before any app surface renders. The gate wraps the whole Router
*inside* `ModerationGate`.

## Invariants (don't break these)

- **The gate must FAIL OPEN.** On any profile/photos API error, missing profile, or
  null status it renders `children`, never the onboarding. A transient backend blip must
  never trap a paying/legacy user behind onboarding. profile.tsx's own `isOnboarding`
  flow stays as a backstop.
  **Why:** trapping an existing user behind onboarding is far worse than briefly letting
  one slip through; the server still enforces calidad mínima + min-age 18 on write.

- **`tutorial_completed` must stay out of PublicProfile.** It lives only on the private
  `Profile` (GET /profiles/me) and is read via a dedicated accessor, deliberately NOT
  folded into `getProfileDetails` (which feeds PublicProfile). Adding it there leaks an
  internal flag to other users.

- **`computeMandatoryProfile` is the single source of truth** for "is this profile
  complete" — shared by the gate, the mandatory-profile screen, and profile.tsx
  handleSave. Don't fork the completeness rule; change it in one place.

- **Back-fill the tutorial flag once for legacy complete users.** When an
  already-complete user has no flag, fire `completeTutorial` exactly once (guarded by a
  `useRef` set synchronously *before* `.mutate()`, so StrictMode + the new-identity
  mutation object don't double-fire). Server set-once is `COALESCE(tutorial_completed_at,
  now())`, so repeat calls are idempotent (timestamp never resets).

- **Cache priming drives the gate.** Both POST /profiles/me/tutorial and PUT /profiles/me
  return `tutorial_completed`; finishing the tutorial / saving the profile calls
  `setQueryData(getGetMyProfileQueryKey(), data)` (+ photo invalidate) so the gate
  re-evaluates immediately instead of waiting on a refetch.

## Gate render order (all hooks unconditional, before any early return)
authLoading→Splash · !session→children · public path→children · profile/photos
loading→Splash · error/!profile→children (fail open) · complete→children · else
!tutorial_completed→TutorialCarousel else MandatoryProfile.

Public allowlist (never gated): /login /signup /welcome /forgot-password
/reset-password /auth/callback + prefix /legal.
