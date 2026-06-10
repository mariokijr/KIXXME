import { QueryClient } from "@tanstack/react-query";

/**
 * Single shared React Query client for the whole app.
 *
 * Kept in its own module (rather than created inline in App.tsx) so that
 * non-component code — notably the auth flow — can call `queryClient.clear()`
 * on login / session change / logout. Without that, a previous account's
 * cached responses (e.g. `GET /me/moderation` → `isAdmin`) could leak across a
 * session switch.
 */
export const queryClient = new QueryClient();
