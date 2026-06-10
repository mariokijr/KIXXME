import React, { useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/lib/auth";
import { NotificationsProvider } from "@/lib/notifications";
import { MatchCelebrationProvider } from "@/lib/match-celebration";
import { LimitUpsellProvider } from "@/lib/limit-upsell";
import { WelcomeModal } from "@/components/welcome-modal";
import { useGeolocation } from "@/lib/use-geolocation";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { ModerationGate } from "@/components/moderation-gate";
import BottomNav from "@/components/layout/bottom-nav";

import Login from "@/pages/login";
import Signup from "@/pages/signup";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import Profile from "@/pages/profile";
import PublicProfile from "@/pages/public-profile";
import Discover from "@/pages/discover";
import MapView from "@/pages/map-view";
import Chats from "@/pages/chats";
import ChatPage from "@/pages/chat";
import Premium from "@/pages/premium";
import Favorites from "@/pages/favorites";
import Support from "@/pages/support";
import Settings from "@/pages/settings";
import Live from "@/pages/live";
import Admin from "@/pages/admin";
import {
  useGetMyModeration,
  getGetMyModerationQueryKey,
} from "@workspace/api-client-react";

function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-[100dvh] flex flex-col"
      style={{
        background:
          "radial-gradient(ellipse 100% 50% at 50% 0%, hsl(270 30% 8%) 0%, hsl(238 25% 4%) 60%)",
      }}
    >
      <div
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom))" }}
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
    if (!isLoading) setLocation(session ? "/discover" : "/login");
  }, [isLoading, session, setLocation]);

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
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/discover">{() => <ProtectedMain component={Discover} />}</Route>
      <Route path="/map">{() => <ProtectedMain component={MapView} />}</Route>
      <Route path="/live">{() => <ProtectedMain component={Live} />}</Route>
      <Route path="/chats">{() => <ProtectedMain component={Chats} />}</Route>
      <Route path="/chats/:id">{() => <ProtectedRoute component={ChatPage} />}</Route>
      <Route path="/profile">{() => <ProtectedMain component={Profile} />}</Route>
      <Route path="/premium">{() => <ProtectedMain component={Premium} />}</Route>
      <Route path="/favorites">{() => <ProtectedMain component={Favorites} />}</Route>
      <Route path="/support">{() => <ProtectedMain component={Support} />}</Route>
      <Route path="/settings">{() => <ProtectedMain component={Settings} />}</Route>
      <Route path="/admin">{() => <AdminRoute component={Admin} />}</Route>
      <Route path="/profile/:id">{() => <ProtectedRoute component={PublicProfile} />}</Route>
      <Route component={NotFound} />
    </Switch>
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
                  <LocationSync />
                  <ModerationGate>
                    <WelcomeModal />
                    <Router />
                  </ModerationGate>
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
