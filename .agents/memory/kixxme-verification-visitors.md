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

**Distinguishing the race from a real failure without sniffing the driver error:** the insert is wrapped so that on ANY failure it best-effort removes the just-uploaded selfie (orphan cleanup) and then **re-reads status** — a now-`pending` row means the partial-unique race fired → 409; anything else is logged and rethrown → 500. Prefer this observable-state check over matching Postgres `23505`, because the drizzle node-postgres error shape is not guaranteed and the codebase has no established 23505 pattern (it uses `onConflict*` elsewhere).

## Identity selfie is private, admin-only (never public)
The verification request carries an identity **selfie** stored in a **dedicated PRIVATE Supabase storage bucket** (`verification-selfies`, `public:false`), separate from the public profile-photo bucket. Path is `userId/<ts>.<ext>`; the column is nullable `verification_requests.selfiePath` (Drizzle/Replit Postgres) — the bytes live in Supabase storage, only the path lives in the queue row.

**Rule:** the raw path/object never leaves the API. Admins view it only via a short-lived **signed URL** (~10 min) minted inside the `requireAdmin`-gated `GET /admin/verifications` (`selfie_url`, nullable). Public URL access returns 400 (e2e-proven). Mime allowlist = jpeg/png/webp only (**no SVG** → no stored-XSS via the signed URL); decoded size capped (5MB) in the route after a generated-Zod shape check.

**Upload/insert ordering:** cheap checks (already-verified / already-pending) → upload selfie → insert row. On the unique-race the just-uploaded object is removed so concurrent requests can't orphan storage. Re-requests after a rejection intentionally **keep** the old object (no delete-on-resubmit); cleanup happens at account deletion.

**Account deletion must purge it:** `deleteAccount` calls `purgeUserVerification(userId)` (best-effort storage list+remove of `verification-selfies/userId/*` + delete queue rows) **before** the irreversible Supabase auth delete, so an identity selfie never outlives the account.

**Why:** an identity face photo is more sensitive than a profile photo and is collected solely for manual admin comparison; it must never be publicly addressable, must expire from the admin's view, and must be erasable on account deletion.

## Visitor identities are a paid feature — gate on the server
`GET /me/visitors` always returns the deduped `count`, but only populates the `visitors` array when `plan !== "free"` (`can_see_visitors`). **Identities never leave the API for free users** — do not ship them and hide client-side.

**Decision:** visitor identities are unlocked for **Plus AND Gold** (`plan !== "free"`), not Gold-only. The premium page lists "Quién visitó tu perfil" under Plus features. (Architect-validated.)

Both the count and the list filter through `getVisibilityContext().hidden` (blocked ∪ deactivated ∪ moderated), so blocked/banned users leak into neither.

## Visit recording
Recorded fire-and-forget inside `GET /profiles/:id`, **after** the unavailable/404/block guards, excluding self-visits. `recordProfileVisit` never throws (try/catch + warn). 1-hour throttle is done at the DB via `onConflictDoUpdate` + `setWhere` on the `unique(viewerId,profileId)` row — race-safe, no read-then-write. Never let visit recording block or fail the profile fetch.

## Known gap
Gold "Modo incógnito" (browse without being recorded as a visitor) is advertised on the premium page but **not implemented**. When built, it plugs in at `recordProfileVisit` (skip recording when the viewer is Gold + incognito-on).
