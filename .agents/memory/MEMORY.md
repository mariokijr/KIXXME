# Memory Index

- [Orval react-query hooks](kixxme-orval-query-hooks.md) — passing a `query` options object to a generated hook requires an explicit `queryKey`; lists shown positionally must be frozen against focus refetch.
- [Map discovery scope & visibility](kixxme-map-discovery-scope.md) — scope box pre-filter must run before `.limit`; gold-priority sort only when scope present; `visibility.ts` is the single hidden-ids hook (suspension plugs in there).
- [Moderation, reporting & admin](kixxme-moderation-admin.md) — server `requireAdmin` is the real boundary (client gates UX-only); suspended/banned hidden via `getUnavailableIds()` at every surface; admin notifications are derived from open reports, not stored.
- [Verification & profile visitors](kixxme-verification-visitors.md) — verified badge is Supabase `is_verified` (write it before the Drizzle queue row on approve, self-healing); visitor identities gated server-side to Plus+Gold; visit recording never throws + DB-throttled.
- [Supabase shared-client session pollution](kixxme-supabase-client-session-pollution.md) — never sign in/up/refresh/setSession on a service-role/data client; it demotes all `.from()` to that user's RLS. Use a dedicated anon auth client.
- [Sound effects](kixxme-sound-effects.md) — interaction-gated, fail-silent one-shot cues; prime audio with volume=0 (not muted) for iOS unlock; one call site per event (like/superlike centralized, match suppresses them).
- [Custom-domain launch](kixxme-custom-domain-launch.md) — `appBaseUrl()` from `APP_BASE_URL` secret (`REPLIT_DOMAINS` fallback); Supabase redirect allowlist must list the domain; addable only post-publish.
- [PWA & mobile packaging](kixxme-pwa-mobile.md) — prod-only SW must never touch `/api` or cross-origin; `assetlinks.json` served file-first; Play fingerprint = Play App Signing key, not local keystore.
- [Daily rewards, streaks & credit ledger](kixxme-rewards-streaks.md) — `like_actions.source` discriminator keeps credit-funded likes out of the derived base lockout; credit spend is inside the per-user advisory lock w/ dual refund; unlimited tiers accrue but hide chips.
