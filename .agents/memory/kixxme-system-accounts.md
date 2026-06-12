---
name: KixxMe internal/system accounts
description: How the support/system account is hidden everywhere; the profile-incomplete invariant it relies on.
---

# Internal/system support account hiding

Identity is an email allowlist (env `SYSTEM_ACCOUNT_EMAILS`, default `supportkixxme@gmail.com`) resolved to user ids via a cached service-role id→email read (mirrors the test-Gold override pattern). The account is unioned into the central unavailability machinery: `isSystemAccount` into `isUnavailable` (per-id surfaces: GET /profiles/:id 404 + like) and `getSystemAccountIds()` into `getUnavailableIds()` (list surfaces, via `getVisibilityContext().hidden`). `is_system` is exposed ONLY on the private `/profiles/me` DTO (never PublicProfile) so the onboarding gate can skip it. This is the internal account, NOT the existing support pin / official-ticket feature.

**Invariant: the system/support account must NEVER be given a complete profile.**

**Why:** `getSystemAccountIds()` is an in-memory, opportunistically-populated Set (filled by `recordIfSystem` on auth, and lazily by `isSystemAccount`). Immediately after a server restart, before the account authenticates once, that Set is empty, so list-surface exclusion falls back solely on calidad mínima (an incomplete profile is already excluded from Descubrir grid/map). If an admin ever completes the support profile, there is a window where it could surface in lists until it next logs in.

**How to apply:** keep the support account profile incomplete — do not "fix" it by filling bio/photos/age/role. The per-id 404 + un-likeable protection does NOT depend on this (it does a live cached `isSystemAccount` lookup); only the list belt does.
