import React from "react";
import {
  useGetMyModeration,
  getGetMyModerationQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { SuspendedScreen } from "@/components/suspended-screen";

/**
 * App-wide enforcement boundary. When a session exists it reads
 * GET /me/moderation (the one endpoint a moderated user can still reach) and,
 * if the account is suspended or banned, replaces the entire app with the
 * Spanish suspended/banned screen. The server independently rejects every other
 * API call with 403, so this is purely the user-facing explanation.
 */
export function ModerationGate({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();

  const { data } = useGetMyModeration({
    query: {
      queryKey: getGetMyModerationQueryKey(),
      enabled: !!session,
      refetchInterval: 60_000,
      staleTime: 30_000,
    },
  });

  if (session && data && data.state !== "active") {
    return (
      <SuspendedScreen
        state={data.state}
        reason={data.reason}
        suspendedUntil={data.suspendedUntil}
      />
    );
  }

  return <>{children}</>;
}
