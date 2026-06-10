---
name: KixxMe account lifecycle (deactivation/deletion)
description: Durable rules for the email-verified account deactivation/deletion feature — enforcement parity, cross-DB deletion ordering, and the verification-code security model.
---

# Account lifecycle: deactivation & deletion

## Enforcement parity is the easy thing to forget
Deactivated users must be hidden on **every** surface that exposes another user — exactly like blocks. Treat block-filtering and deactivation-filtering as **parallel** visibility filters: any place that loads the block set must also union `getDeactivatedIds()` (list surfaces) or call `isDeactivated()` (single-target/refuse-contact surfaces).

**Why:** GET /conversations originally filtered only the block set, so a partner who deactivated still appeared in the chat list with live profile data — and it was internally inconsistent because notifications/summary already excluded them from unread counts. The product promise is "hidden from every surface."

**How to apply:** When adding/auditing any endpoint that returns or contacts another user (discover, likes, profiles, photos, conversations list + message/image send, notifications, live matcher), confirm BOTH filters are applied. A new surface that only checks blocks is a silent leak.

## Cross-DB deletion ordering: auth user dies LAST
`deleteAccount` spans both databases. Order: cancel Stripe subs (best-effort) → delete Supabase rows child-before-parent (so any FK to `profiles` can't block) → **all** repo-owned Replit-Postgres rows → **finally** `supabase.auth.admin.deleteUser`.

**Why:** Deletion is irreversible. If any earlier step throws, the function aborts *before* the auth user is removed, so the account still exists and a freshly-issued code re-runs the whole cleanup idempotently. Deleting the auth user first would orphan data with no way to retry under that identity.

**Deletion completeness (the easy thing to miss):** "permanent delete" must erase **every** repo-owned table that references the user, not just the account-lifecycle tables. When adding any new repo-owned table that stores a Supabase user UUID (billing, support reports, blocks, live, etc.), add a matching delete to `deleteAccount` — including secondary references (e.g. a support report's *target*, not only its *reporter*). A residual row after delete is a privacy/compliance gap. There are no cross-DB FKs, so nothing enforces this for you.

## Verification-code security model
6-digit codes (`crypto.randomInt`) stored **sha256-only**, 15-min TTL, 60s per-(user,action) cooldown (429 on violation), attempts incremented **atomically before** compare with a 5-attempt cap, constant-time compare (`timingSafeEqual`), consumed-on-success (no replay), prior unconsumed codes deleted on re-request. All endpoints require auth and act only on the caller, so there is no account-enumeration surface. Known negligible TOCTOU races (cooldown check; `consumedAt` set without a `consumed_at IS NULL` guard) are acceptable because both actions are idempotent.

## Frontend sign-out after confirm
After a successful deactivate/delete confirm, the settings page calls `useAuth().logout()`. `logout()` clears local state in `onSettled`, so it works even though the logout API call 401s (deactivate triggers a global Supabase sign-out; delete removes the auth user entirely).
