---
name: Mandatory email verification (signup OTP)
description: How the mandatory 6-digit email-verification gate is rolled out safely, and the escape-hatch rule for any full-screen mandatory gate.
---

# Mandatory email verification (signup OTP)

New accounts are unusable until the user proves email access via a 6-digit OTP. State =
nullable `emailVerifiedAt` on Replit-Postgres `profile_details` (we own it; Supabase is not
DDL-modifiable). Enforcement is centralized in `requireAuth` via an `allowUnverified` opt that
403s `{code:"email_unverified"}` after the moderation gate. Reuses the `account.ts` OTP
lifecycle (`verify_email` CodeAction). See replit.md for the file map.

## Rolling out a mandatory gate without lockouts (the durable pattern)
Two safeguards make it safe to ship a brand-new mandatory gate to a live app:
- **`created_at` cutoff grandfathering** — legacy accounts (Supabase `created_at` < cutoff,
  and NaN/unparseable => grandfathered) are treated as already-verified, so existing users are
  never forced through a new step. Cutoff is a fixed UTC instant in `lib/email-verification.ts`.
- **FAIL OPEN inside `isEmailVerified`** — any DB error (e.g. the prod column not yet applied)
  treats the user as verified rather than locking everyone out.

**Why:** the prod Replit-PG column is applied by Replit's Publish diff flow, which can lag the
code deploy by seconds; without fail-open the whole app would 403 during that window. Do NOT
hand-write a prod migration — Publish diffs dev schema → prod.
**How to apply:** any future "mandatory gate for all users" (new onboarding step, new legal
consent) should copy this cutoff + fail-open shape, not a hard flip.

## Escape-hatch rule for ANY full-screen mandatory gate
A full-screen mandatory gate that depends on a user-typed, load-bearing value (here: the email
address) MUST include a "Cerrar sesión" / logout escape. Otherwise a user who mistyped that
value at signup is permanently trapped: they can never receive the code, and Settings / delete
account live *behind* the gate. The verify screen calls `useAuth().logout`.
**Why:** caught in architect review — every other exit (settings, self-service delete) is gated,
so the screen itself is the only reachable surface.
**How to apply:** add a logout/exit affordance to every blocking full-screen gate, not just this one.

## Welcome email is deferred to first verification
The signup welcome email is NOT sent at signup; it fires exactly once on the first successful
verify (`markEmailVerified` returns the stored ts via COALESCE; `firstSet` = returned ts equals
the ts we tried to write). Grandfathered users already got their welcome at original signup, so
nobody is welcome-less. Edge: the same-day post-midnight/pre-deploy cohort can get a second
welcome on first verify — one-day cohort, accepted.

## Supabase Confirm-email must stay OFF
Signup relies on `supabase.auth.signUp` returning a session immediately (our own OTP replaces
Supabase's email confirmation). If Supabase "Confirm email" is turned ON, signup returns a null
session and the flow breaks — the signup route logs a loud warning when session is null.
