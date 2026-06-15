import React, { useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/lib/auth";
import { NotificationsProvider } from "@/lib/notifications";
import { MatchCelebrationProvider } from "@/lib/match-celebration";
import { LimitUpsellProvider } from "@/lib/limit-upsell";
import { GoldUpsellProvider } from "@/lib/gold-upsell";
import { WelcomeModal } from "@/components/welcome-modal";
import { useGeolocation } from "@/lib/use-geolocation";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { ModerationGate } from "@/components/moderation-gate";
import { EmailVerificationGate } from "@/components/email-verification-gate";
import { OnboardingGate } from "@/components/onboarding-gate";
import BottomNav from "@/components/layout/bottom-nav";

const Login = React.lazy(() => import("@/pages/login"));
const Signup = React.lazy(() => import("@/pages/signup"));
const ForgotPassword = React.lazy(() => import("@/pages/forgot-password"));
const ResetPassword = React.lazy(() => import("@/pages/reset-password"));
const Profile = React.lazy(() => import("@/pages/profile"));
const PublicProfile = React.lazy(() => import("@/pages/public-profile"));
const Discover = React.lazy(() => import("@/pages/discover"));
const MapView = React.lazy(() => import("@/pages/map-view"));
const Chats = React.lazy(() => import("@/pages/chats"));
const ChatPage = React.lazy(() => import("@/pages/chat"));
const SupportInboxThread = React.lazy(() => import("@/pages/support-inbox-thread"));
const Premium = React.lazy(() => import("@/pages/premium"));
const Favorites = React.lazy(() => import("@/pages/favorites"));
const Matches = React.lazy(() => import("@/pages/matches"));
const Support = React.lazy(() => import("@/pages/support"));
const Settings = React.lazy(() => import("@/pages/settings"));
const ChangePassword = React.lazy(() => import("@/pages/change-password"));
const CancelSubscription = React.lazy(() => import("@/pages/cancel-subscription"));
const Trial = React.lazy(() => import("@/pages/trial"));
const Live = React.lazy(() => import("@/pages/live"));
const Admin = React.lazy(() => import("@/pages/admin"));
const BlockedUsers = React.lazy(() => import("@/pages/blocked-users"));
const LesGustas = React.lazy(() => import("@/pages/les-gustas"));
const Welcome = React.lazy(() => import("@/pages/welcome"));
const AuthCallback = React.lazy(() => import("@/pages/auth-callback"));
const LegalPage = React.lazy(() => import("@/pages/legal-page"));
import { ConfirmProvider } from "@/lib/confirm";
import {
  useGetMyModeration,
  getGetMyModerationQueryKey,
} from "@workspace/api-client-react";

function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="h-[100dvh] flex flex-col relative"
      style={{ background: "hsl(238,28%,4%)" }}
    >
      {/* Aurora ambient glow — fixed behind all content */}
      <div
        className="fixed inset-0 pointer-events-none overflow-hidden"
        style={{ zIndex: 0 }}
        aria-hidden
      >
        {/* Top-center violet burst */}
        <div
          className="absolute"
          style={{
            top: "-25%",
            left: "5%",
            width: "90%",
            height: "70%",
            background: "radial-gradient(ellipse, rgba(139,92,246,0.42) 0%, transparent 65%)",
            filter: "blur(60px)",
          }}
        />
        {/* Right-side pink glow */}
        <div
          className="absolute"
          style={{
            top: "15%",
            right: "-25%",
            width: "70%",
            height: "55%",
            background: "radial-gradient(ellipse, rgba(236,72,153,0.24) 0%, transparent 68%)",
            filter: "blur(72px)",
          }}
        />
        {/* Bottom-left indigo pool */}
        <div
          className="absolute"
          style={{
            bottom: "0%",
            left: "-15%",
            width: "60%",
            height: "45%",
            background: "radial-gradient(ellipse, rgba(99,102,241,0.20) 0%, transparent 68%)",
            filter: "blur(60px)",
          }}
        />
        {/* Subtle center haze to unify */}
        <div
          className="absolute"
          style={{
            top: "35%",
            left: "20%",
            width: "60%",
            height: "40%",
            background: "radial-gradient(ellipse, rgba(168,85,247,0.10) 0%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />
      </div>
      <div
        className="flex-1 overflow-y-auto relative"
        style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom))", zIndex: 1 }}
      >
        {children}
      </div>
      <BottomNav />
    </div>
  );
}

function ProtectedMain({ component: Component }: { component: React.ComponentType<any> }) {
  const { session, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !session) setLocation("/login");
  }, [isLoading, session, setLocation]);

  if (isLoading || !session) return null;

  return (
    <MainLayout>
      <Component />
    </MainLayout>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { session, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !session) setLocation("/login");
  }, [isLoading, session, setLocation]);

  if (isLoading || !session) return null;
  return <Component />;
}

function AdminRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { session, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  const { data: moderation, isLoading: modLoading } = useGetMyModeration({
    query: { enabled: !!session, queryKey: getGetMyModerationQueryKey() },
  });

  useEffect(() => {
    if (!isLoading && !session) {
      setLocation("/login");
      return;
    }
    if (session && !modLoading && moderation && !moderation.isAdmin) {
      setLocation("/discover");
    }
  }, [isLoading, session, modLoading, moderation, setLocation]);

  if (isLoading || !session || modLoading) return null;
  if (!moderation?.isAdmin) return null;
  return <Component />;
}

function LocationSync() {
  const { session } = useAuth();
  const { request } = useGeolocation();
  const doneRef = useRef(false);

  useEffect(() => {
    if (!session || doneRef.current) return;
    if (!("permissions" in navigator) || !("geolocation" in navigator)) return;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((res) => {
        if (res.state === "granted") {
          doneRef.current = true;
          request();
        }
      })
      .catch(() => {});
  }, [session, request]);

  return null;
}

function HomeRedirect() {
  const { session, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && session) setLocation("/discover");
  }, [isLoading, session, setLocation]);

  // Unauthenticated visitors get the premium welcome landing (not a bare login).
  if (!isLoading && !session) return <Welcome />;
  if (!isLoading && session) return null;

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center gap-4"
      style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, hsl(270 40% 12%) 0%, hsl(238 25% 5%) 65%)" }}
    >
      <div className="animate-pulse">
        <KixxMeLogo size={72} badge />
      </div>
      <span className="text-3xl font-display tracking-widest text-gradient-brand animate-pulse">CARGANDO...</span>
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  const routeKey = location.split("?")[0];

  return (
    <React.Suspense
      fallback={
        <div
          className="min-h-screen w-full flex flex-col items-center justify-center gap-4"
          style={{ background: "hsl(238,28%,4%)" }}
        >
          <div className="animate-pulse">
            <KixxMeLogo size={56} badge />
          </div>
        </div>
      }
    >
      <AnimatePresence mode="sync" initial={false}>
        <motion.div
          key={routeKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          style={{ minHeight: "100%", willChange: "opacity" }}
        >
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/welcome" component={Welcome} />
            <Route path="/login" component={Login} />
            <Route path="/signup" component={Signup} />
            <Route path="/forgot-password" component={ForgotPassword} />
            <Route path="/reset-password" component={ResetPassword} />
            <Route path="/auth/callback" component={AuthCallback} />
            <Route path="/legal/:slug">{(params) => <LegalPage slug={params.slug} />}</Route>
            <Route path="/legal">{() => <LegalPage />}</Route>
            <Route path="/privacy">{() => <LegalPage slug="privacidad" />}</Route>
            <Route path="/terms">{() => <LegalPage slug="terminos" />}</Route>
            <Route path="/discover">{() => <ProtectedMain component={Discover} />}</Route>
            <Route path="/map">{() => <ProtectedMain component={MapView} />}</Route>
            <Route path="/live">{() => <ProtectedMain component={Live} />}</Route>
            <Route path="/chats">{() => <ProtectedMain component={Chats} />}</Route>
            <Route path="/chats/:id">{() => <ProtectedRoute component={ChatPage} />}</Route>
            <Route path="/support-inbox/:userId">{() => <ProtectedMain component={SupportInboxThread} />}</Route>
            <Route path="/profile">{() => <ProtectedMain component={Profile} />}</Route>
            <Route path="/premium">{() => <ProtectedMain component={Premium} />}</Route>
            <Route path="/trial">{() => <ProtectedMain component={Trial} />}</Route>
            <Route path="/favorites">{() => <ProtectedMain component={Favorites} />}</Route>
            <Route path="/matches">{() => <ProtectedMain component={Matches} />}</Route>
            <Route path="/support">{() => <ProtectedMain component={Support} />}</Route>
            <Route path="/settings">{() => <ProtectedMain component={Settings} />}</Route>
            <Route path="/settings/password">{() => <ProtectedMain component={ChangePassword} />}</Route>
            <Route path="/settings/cancel-subscription">{() => <ProtectedMain component={CancelSubscription} />}</Route>
            <Route path="/settings/blocked">{() => <ProtectedMain component={BlockedUsers} />}</Route>
            <Route path="/les-gustas">{() => <ProtectedMain component={LesGustas} />}</Route>
            <Route path="/admin">{() => <AdminRoute component={Admin} />}</Route>
            <Route path="/profile/:id">{() => <ProtectedRoute component={PublicProfile} />}</Route>
            <Route component={NotFound} />
          </Switch>
        </motion.div>
      </AnimatePresence>
    </React.Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <NotificationsProvider>
              <MatchCelebrationProvider>
                <LimitUpsellProvider>
                  <GoldUpsellProvider>
                    <ConfirmProvider>
                      <LocationSync />
                      <ModerationGate>
                        <EmailVerificationGate>
                          <OnboardingGate>
                            <WelcomeModal />
                            <Router />
                          </OnboardingGate>
                        </EmailVerificationGate>
                      </ModerationGate>
                    </ConfirmProvider>
                  </GoldUpsellProvider>
                </LimitUpsellProvider>
              </MatchCelebrationProvider>
            </NotificationsProvider>
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
