# Memory Index

- [Orval react-query hooks](kixxme-orval-query-hooks.md) — passing a `query` options object to a generated hook requires an explicit `queryKey`; lists shown positionally must be frozen against focus refetch.
- [Map discovery scope & visibility](kixxme-map-discovery-scope.md) — scope box pre-filter must run before `.limit`; gold-priority sort only when scope present; `visibility.ts` is the single hidden-ids hook (suspension plugs in there).
- [Moderation, reporting & admin](kixxme-moderation-admin.md) — server `requireAdmin` is the real boundary (client gates UX-only); suspended/banned hidden via `getUnavailableIds()` at every surface; admin notifications are derived from open reports, not stored.
- [Verification & profile visitors](kixxme-verification-visitors.md) — verified badge is Supabase `is_verified` (write it before the Drizzle queue row on approve, self-healing); visitor identities gated server-side to Plus+Gold; visit recording never throws + DB-throttled.
- [Custom-domain launch](kixxme-custom-domain-launch.md) — `appBaseUrl()` driven by `APP_BASE_URL` (deployment-secret only) w/ `REPLIT_DOMAINS` fallback; Supabase redirect allowlist must include the domain or reset links fall back to Site URL; custom domain only addable after first publish.
- [Daily rewards, streaks & credit ledger](kixxme-rewards-streaks.md) — `like_actions.source` discriminator keeps credit-funded likes out of the derived base lockout; credit spend is inside the per-user advisory lock w/ dual refund; unlimited tiers accrue but hide chips.
