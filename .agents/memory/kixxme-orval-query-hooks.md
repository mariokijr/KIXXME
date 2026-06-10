---
name: Orval react-query hooks
description: Gotchas when passing options to Orval-generated react-query hooks (queryKey requirement) and freezing positionally-consumed lists.
---

## Passing options requires an explicit `queryKey`

The Orval-generated hooks in `@workspace/api-client-react` (e.g. `useListProfiles`,
`useListProfilePhotos`) take `(params?, options?)` where `options.query` is a
`UseQueryOptions`. The moment you pass *any* `query` options, TypeScript requires
`queryKey` too — it is not auto-filled when you supply your own options object.

**How to apply:** import the matching `getXQueryKey(params)` helper and pass it:
```ts
useListProfiles(
  { sort: "recent" },
  { query: { queryKey: getListProfilesQueryKey({ sort: "recent" }),
             staleTime: Infinity, refetchOnWindowFocus: false } },
);
```
Omitting `queryKey` gives `TS2741: Property 'queryKey' is missing`. (Calling the
hook with no options at all is fine — the key is defaulted internally.)

## Freeze a list that is consumed by position

`App.tsx` builds the QueryClient with defaults (staleTime 0, refetchOnWindowFocus
true). Any UI that indexes into a fetched array by position (e.g. a swipe deck doing
`profiles.slice(index, index+3)`) will silently reorder under the index on a
window-focus refetch — re-showing or skipping items.

**Why:** the swipe-discovery deck (`components/swipe-deck.tsx`) hit exactly this; a
focus refetch of `sort:"recent"` (last_active_at desc) reorders as users go active.

**How to apply:** for positionally-consumed queries set `staleTime: Infinity` +
`refetchOnWindowFocus: false` (explicit `refetch()` still works for a manual
"Buscar de nuevo"), or snapshot the array on mount.
