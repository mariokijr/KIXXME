---
name: KixxMe moderation, reporting & admin
description: How moderation gating, the admin boundary, reporting storage, and unavailable-ids visibility fit together — the non-obvious decisions.
---

# Moderation, reporting & admin

## Admin boundary is server-only; client gates are UX
- The real admin boundary is `requireAdmin` on every `/admin/*` handler (email allowlist from the `ADMIN_EMAILS` env var, case-insensitive).
- The web `AdminRoute` wrapper and the "Panel de moderación" entry link (both keyed off `isAdmin` from `GET /me/moderation`) are **UX-only**. Never treat the client gate as a security boundary — a non-admin who forces the route still gets 403s from the server.
- **Why:** keeps a single source of truth for who is an admin and avoids shipping authorization logic to the client.
- **How to apply:** any new admin capability must add a `requireAdmin` check server-side; the client gate is optional polish on top.

## ADMIN_EMAILS must be set or nobody is an admin
- With `ADMIN_EMAILS` empty/unset, `isAdmin` is false for everyone: no admin link, `/admin` redirects to `/discover`, all admin endpoints 403.
- It is a comma-separated allowlist. The API server has **no hot reload** — restart `artifacts/api-server: API Server` after changing it.

## The moderation gate and its exemptions
- `requireAuth(req, res, { allowModerated? })` runs a moderation gate after token validation: suspended/banned users get **403 with `{ code: 'suspended'|'banned', until }`** so the client renders the right Spanish full-screen.
- Pass `{ allowModerated: true }` for the few endpoints a moderated user must still reach: their own moderation status (`GET /me/moderation`), logout, and **self-service exit** — both the account deactivation/deletion verification endpoints use it.
- **Why:** a suspended or banned user retains the right to leave / erase their data; gating those endpoints would trap them. Token validation still runs first, so an unauthenticated request is still 401.
- **How to apply:** default to NO exemption. Only add `allowModerated` to endpoints that are a user's own-account escape hatch or status read.

## Reports reuse `support_reports`; moderation hides via unavailable-ids
- Reporting did **not** add a new table — `support_reports` was extended with `reportType` and `targetType` discriminators plus target id columns (message/conversation/call/photo) and triage fields. Crossing a report threshold auto-creates an `account_flags` row.
- Suspension/ban hides a user everywhere through the single visibility hook: `getUnavailableIds()` = deactivated ∪ moderated, unioned into `getVisibilityContext`. This is the same pattern map/discover already use — do not re-filter moderation per-surface.
- **Why:** one centralized hide path means a new "unavailable" reason (deactivated, moderated, future states) is added in one place and applies to discover/map/stats/likes/conversations/live at once.
- **Per-surface gotcha:** "hidden everywhere" must include the *direct* conversation read paths (GET messages, POST read), not just list/send — a stale or hand-crafted conversation URL would otherwise leak a moderated user's chat history. Reads return **404 "Perfil no disponible"** (not 403) so they don't leak the moderation state.

## Clear the shared React Query cache on every auth boundary
- A single shared `queryClient` (`artifacts/kixxme/src/lib/query-client.ts`) must be `.clear()`-ed on **every** session entry/exit: login, signup, applySession (reset-password session adoption), logout, and the token-refresh-failure sign-out in the auth token getter.
- **Why:** `isAdmin` (and other per-user responses like `GET /me/moderation`) is cached; without clearing, account B can briefly inherit account A's cached admin state after a session switch on the same tab — the visible "wrong admin / admin not recognized" symptom. Client-only display issue (server `requireAdmin` is still the real boundary), but it's the one users see.
- **How to apply:** any NEW login/logout/session-adopt path must call `queryClient.clear()` right after `persist(...)`.

## Advanced panel: sanction history, reversible remove, warnings
- Sanction history is an **append-only** `moderation_actions` ledger (Replit Postgres) written *inside* the `lib/moderation.ts` helpers (warn/suspend/ban/remove/restore/lift + remove_photo), never from the routes — so every transition is logged exactly once at the source. `recordModerationAction` is best-effort/never-throws: a history hiccup must not abort the state change (`account_moderation` is the current-state source of truth).
- **Admin "remove" ≠ GDPR delete.** It is a new `removed` state on `account_moderation` — a soft, restorable soft-delete (`restoreUser`) that touches no data. The irreversible erase stays in self-service `lib/account.ts deleteAccount`, which also purges the user's `moderation_actions` rows so history never outlives the account.
- **`removed` is a full moderation state** alongside suspended/banned: no expiry (like banned), included in `getModeratedIds()`/`getUnavailableIds()` (hidden everywhere), and the auth gate 403s it with its own `code`.
- Warnings change **no account state** — they only append history + email the user; the email IS the user-facing effect.

## Admin user directory: cross-DB state filter + pagination correctness
- The directory lists **Supabase `profiles`** (the user source of truth) but moderation state lives in **Replit Postgres** — two DBs, no join. Filtering state in JS *after* `.range()` is wrong twice: it misses moderated users beyond the fetched slice, and `total` reflects the unfiltered count.
- **Fix:** resolve the id set in Postgres up front, then constrain the Supabase query so `count:exact` + `.range()` stay correct. For suspended/banned/removed: `.in("id", getUserIdsInState(state))` (empty set → short-circuit `{users:[],total:0}`). For "active": `.not("id","in","(...)")` over `getModeratedIds()` (the complement). `getUserIdsInState` is expiry-aware — an elapsed suspension counts as active.
- Frontend pager must use **real offset paging** (`offset = page*PAGE_SIZE`, PAGE_SIZE ≤ the server's `limit` cap of 100), NOT a growing `limit` — the server clamps `limit ≤ 100`, so a grow-the-page "load more" silently stops past 100.

## Two admin-surface safety guards
- **PostgREST search injection:** a free-text `q` interpolated into `.or("username.ilike.%${q}%,city.ilike.%${q}%")` can break/inject the filter grammar via `,` `(` `)`. Strip them before interpolation (`q.replace(/[,()]/g," ")`). Verified at runtime: a raw `a,b)` term errors; the stripped term does not.
- **Self-sanction guard:** the report-resolve side-effect (and warn/suspend/ban/remove handlers) must skip when the target is the acting admin (`report.targetUserId !== auth.userId`) — otherwise a sole admin can suspend/ban/remove themselves into a lockout.

## Admin notifications are derived, never stored
- There is **no notifications table** in this app — both user notifications (likes/matches) and the admin moderation notification are derived on read at `GET /notifications/summary`. The admin block (`open_reports`/`open_flags`/`latest_report_at`, present only for `isAdminEmail`) mirrors `/admin/summary`'s "open" definitions; the frontend bell toasts when `latest_report_at` advances.
- **Why:** "every report creates an admin notification" is satisfied by the derived feed, consistent with how likes/matches work — adding a notifications table would be a needless second source of truth.
- **How to apply (baseline gotcha):** a derived real-time toast must set its "init/seen" ref on the *first* poll even when the queue is empty (treat null latest as ts=0). Gating the whole effect on a truthy timestamp skips the baseline, so the very first item after a clean queue only baselines and never toasts.
