import React, { useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMyProfile,
  getGetMyProfileQueryKey,
  useListMyPhotos,
  getListMyPhotosQueryKey,
  useCompleteTutorial,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { computeMandatoryProfile } from "@/lib/profile-form";
import { TutorialCarousel } from "@/components/onboarding/tutorial-carousel";
import { MandatoryProfile } from "@/components/onboarding/mandatory-profile";

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

function OnboardingSplash() {
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
 * Mandatory onboarding gate. Sits inside ModerationGate and wraps the whole app:
 * a freshly-registered user must finish the animated tutorial and then complete
 * the required profile fields before anything else renders.
 *
 * Safety rails:
 * - Unauthenticated users and public auth pages pass straight through.
 * - It fails OPEN on any API error / missing profile so a transient blip never
 *   traps a user behind onboarding.
 * - Already-complete profiles (pre-existing users) pass through and get the
 *   tutorial flag back-filled once, so the tutorial never resurfaces later.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { session, isLoading: authLoading } = useAuth();
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const completeTutorial = useCompleteTutorial();
  const backfilledRef = useRef(false);

  const { data: profile, isLoading: profileLoading, isError: profileError } =
    useGetMyProfile({
      query: { enabled: !!session, queryKey: getGetMyProfileQueryKey() },
    });
  const { data: photos, isLoading: photosLoading, isError: photosError } =
    useListMyPhotos({
      query: { enabled: !!session, queryKey: getListMyPhotosQueryKey() },
    });

  const status = profile
    ? computeMandatoryProfile({
        username: profile.username,
        bio: profile.bio,
        age: profile.age ?? null,
        city: profile.city,
        role: profile.role ?? null,
        looking_for: profile.looking_for ?? null,
        avatar_url: profile.avatar_url,
        photoCount: photos?.length ?? 0,
      })
    : null;

  // Back-fill the tutorial flag exactly once for users who are already complete
  // but predate the flag, so they never see the tutorial.
  useEffect(() => {
    if (!session || !profile || !status?.complete) return;
    if (profile.tutorial_completed || backfilledRef.current) return;
    backfilledRef.current = true;
    completeTutorial.mutate(undefined, {
      onSuccess: (data) =>
        queryClient.setQueryData(getGetMyProfileQueryKey(), data),
    });
  }, [session, profile, status?.complete, completeTutorial, queryClient]);

  const handleTutorialFinish = useCallback(() => {
    completeTutorial.mutate(undefined, {
      onSuccess: (data) =>
        queryClient.setQueryData(getGetMyProfileQueryKey(), data),
      onError: () =>
        toast({
          title: "No pudimos continuar",
          description: "Vuelve a intentarlo en un momento.",
          variant: "destructive",
        }),
    });
  }, [completeTutorial, queryClient, toast]);

  const isPublic =
    PUBLIC_PATHS.has(location) ||
    PUBLIC_PREFIXES.some((p) => location.startsWith(p));

  // Pre-auth / public routes never gate.
  if (authLoading) return <OnboardingSplash />;
  if (!session) return <>{children}</>;
  if (isPublic) return <>{children}</>;

  // Wait for the data we gate on.
  if (profileLoading || photosLoading) return <OnboardingSplash />;

  // Fail open: never trap a user behind onboarding because of an API error.
  if (profileError || photosError || !profile || !status) return <>{children}</>;

  if (status.complete) return <>{children}</>;

  // Incomplete → mandatory onboarding. Tutorial first (unless already finished).
  if (!profile.tutorial_completed) {
    return (
      <TutorialCarousel
        onFinish={handleTutorialFinish}
        finishing={completeTutorial.isPending}
      />
    );
  }
  return <MandatoryProfile />;
}
