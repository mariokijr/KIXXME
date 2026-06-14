import React from "react";
import { useLocation } from "wouter";
import {
  useGetEmailVerification,
  getGetEmailVerificationQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { VerifyEmailScreen } from "@/components/verify-email-screen";

// Auth flows that must run even when a session exists (set-new-password, OAuth
// landing) plus the unauthenticated public pages. These are never gated.
const PUBLIC_PATHS = new Set([
  "/login",
  "/signup",
  "/welcome",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
]);
const PUBLIC_PREFIXES = ["/legal"];

function GateSplash() {
  return (
    <div
      className="min-h-[100dvh] w-full flex flex-col items-center justify-center gap-4"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 0%, hsl(270 40% 12%) 0%, hsl(238 25% 5%) 65%)",
      }}
    >
      <div className="animate-pulse">
        <KixxMeLogo size={72} badge />
      </div>
      <span className="text-3xl font-display tracking-widest text-gradient-brand animate-pulse">
        CARGANDO...
      </span>
    </div>
  );
}

/**
 * Mandatory email-verification gate. Sits between ModerationGate and
 * OnboardingGate: a freshly-registered user must prove access to their inbox
 * (6-digit code) before any app surface — including onboarding — renders.
 *
 * Safety rails mirror OnboardingGate:
 * - Unauthenticated users and public auth pages pass straight through.
 * - It fails OPEN on any API error so a transient blip never traps a user
 *   behind the verify screen.
 * - Legacy users (created before the cutoff) and the system account come back
 *   `verified:true` from the server, so they pass through untouched.
 */
export function EmailVerificationGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, isLoading: authLoading } = useAuth();
  const [location] = useLocation();

  const { data, isLoading, isError } = useGetEmailVerification({
    query: { enabled: !!session, queryKey: getGetEmailVerificationQueryKey() },
  });

  const isPublic =
    PUBLIC_PATHS.has(location) ||
    PUBLIC_PREFIXES.some((p) => location.startsWith(p));

  if (authLoading) return <GateSplash />;
  if (!session) return <>{children}</>;
  if (isPublic) return <>{children}</>;

  if (isLoading) return <GateSplash />;

  // Fail open: never trap a user behind verification on an API error.
  if (isError || !data) return <>{children}</>;

  if (!data.verified) return <VerifyEmailScreen email={data.email} />;

  return <>{children}</>;
}
