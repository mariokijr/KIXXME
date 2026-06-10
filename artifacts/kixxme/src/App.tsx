import React, { useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/lib/auth";
import { NotificationsProvider } from "@/lib/notifications";
import { useGeolocation } from "@/lib/use-geolocation";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import BottomNav from "@/components/layout/bottom-nav";

import Login from "@/pages/login";
import Signup from "@/pages/signup";
import Profile from "@/pages/profile";
import PublicProfile from "@/pages/public-profile";
import Discover from "@/pages/discover";
import MapView from "@/pages/map-view";
import Chats from "@/pages/chats";
import ChatPage from "@/pages/chat";
import Premium from "@/pages/premium";
import Favorites from "@/pages/favorites";
import Support from "@/pages/support";
import Live from "@/pages/live";

const queryClient = new QueryClient();

function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-[100dvh] flex flex-col"
      style={{
        background:
          "radial-gradient(ellipse 100% 50% at 50% 0%, hsl(270 30% 8%) 0%, hsl(238 25% 4%) 60%)",
      }}
    >
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: "72px" }}>
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
      <Route path="/discover">{() => <ProtectedMain component={Discover} />}</Route>
      <Route path="/map">{() => <ProtectedMain component={MapView} />}</Route>
      <Route path="/live">{() => <ProtectedMain component={Live} />}</Route>
      <Route path="/chats">{() => <ProtectedMain component={Chats} />}</Route>
      <Route path="/chats/:id">{() => <ProtectedRoute component={ChatPage} />}</Route>
      <Route path="/profile">{() => <ProtectedMain component={Profile} />}</Route>
      <Route path="/premium">{() => <ProtectedMain component={Premium} />}</Route>
      <Route path="/favorites">{() => <ProtectedMain component={Favorites} />}</Route>
      <Route path="/support">{() => <ProtectedMain component={Support} />}</Route>
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
              <LocationSync />
              <Router />
            </NotificationsProvider>
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
