# Memory Index

- [Orval react-query hooks](kixxme-orval-query-hooks.md) — passing a `query` options object to a generated hook requires an explicit `queryKey`; lists shown positionally must be frozen against focus refetch.
- [Map discovery scope & visibility](kixxme-map-discovery-scope.md) — scope box pre-filter must run before `.limit`; gold-priority sort only when scope present; `visibility.ts` is the single hidden-ids hook (suspension plugs in there).
- [Moderation, reporting & admin](kixxme-moderation-admin.md) — admin boundary is server `requireAdmin` (client gates are UX-only); `ADMIN_EMAILS` must be set; moderation gate 403s suspended/banned except own-status/logout/self-delete; reports reuse `support_reports`; moderation hides via `getUnavailableIds()`.
