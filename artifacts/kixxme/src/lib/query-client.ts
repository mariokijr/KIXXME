import { QueryClient } from "@tanstack/react-query";

/**
 * Single shared React Query client for the whole app.
 *
 * Kept in its own module (rather than created inline in App.tsx) so that
 * non-component code — notably the auth flow — can call `queryClient.clear()`
 * on login / session change / logout. Without that, a previous account's
 * cached responses (e.g. `GET /me/moderation` → `isAdmin`) could leak across a
 * session switch.
 *
 * Performance defaults:
 * - refetchOnWindowFocus: false — prevents every tab-switch from firing a
 *   batch of DB queries. The app has explicit polling intervals on live
 *   data (conversations, notifications); focus-refetch on top of that
 *   doubles the request rate for no user-visible benefit.
 * - staleTime: 30_000 — data stays fresh for 30 s so route navigations
 *   don't re-fetch immediately (polling handles freshness instead).
 * - retry: 1 — reduces waterfall latency on transient errors; most errors
 *   in this app are auth-gated and won't succeed on retry anyway.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 1,
      networkMode: "offlineFirst",
    },
  },
});
