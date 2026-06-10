---
name: KixxMe verification & profile visitors
description: Durable decisions for the verified-badge flow and "Quién visitó tu perfil" — two-DB write ordering, plan gating, throttling.
---

# Verification badge & profile visitors

## Verification: two-DB write ordering (approve)
The verified badge is **Supabase `profiles.is_verified`** (source of truth, same pattern as `plan`). `verification_requests` (Replit Postgres / Drizzle) is only the review queue.

**Rule:** Approve writes Supabase `is_verified=true` **first**, then flips the Drizzle row to `approved`. Reject only touches Drizzle.

**Why:** No cross-DB transaction exists. If the Supabase write fails it throws before any Drizzle change → request stays `pending` and the admin retries. If the Drizzle write fails *after* Supabase, `getVerificationStatus` still derives "approved" from `is_verified=true` regardless of the queue row, so the user sees the badge; re-approving the stuck `pending` row is idempotent. Reversing the order would risk marking a request approved without the badge actually being granted.

**How to apply:** Any future "grant entitlement that lives in Supabase + track request in Drizzle" flow should write the Supabase source-of-truth first and derive status with Supabase winning. Review handlers must act only on `pending` rows (guard against double-processing).

## One open request per user
`verification_requests` has a **partial unique index on `userId` WHERE status='pending'**. This is the real guard against duplicate open requests — the request handler's "already pending" check is a friendly fast-path, not the integrity boundary. A unique-violation on insert means "already pending"; surface it as 409, don't 500.

## Visitor identities are a paid feature — gate on the server
`GET /me/visitors` always returns the deduped `count`, but only populates the `visitors` array when `plan !== "free"` (`can_see_visitors`). **Identities never leave the API for free users** — do not ship them and hide client-side.

**Decision:** visitor identities are unlocked for **Plus AND Gold** (`plan !== "free"`), not Gold-only. The premium page lists "Quién visitó tu perfil" under Plus features. (Architect-validated.)

Both the count and the list filter through `getVisibilityContext().hidden` (blocked ∪ deactivated ∪ moderated), so blocked/banned users leak into neither.

## Visit recording
Recorded fire-and-forget inside `GET /profiles/:id`, **after** the unavailable/404/block guards, excluding self-visits. `recordProfileVisit` never throws (try/catch + warn). 1-hour throttle is done at the DB via `onConflictDoUpdate` + `setWhere` on the `unique(viewerId,profileId)` row — race-safe, no read-then-write. Never let visit recording block or fail the profile fetch.

## Known gap
Gold "Modo incógnito" (browse without being recorded as a visitor) is advertised on the premium page but **not implemented**. When built, it plugs in at `recordProfileVisit` (skip recording when the viewer is Gold + incognito-on).
