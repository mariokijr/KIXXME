import React, { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Flame } from "lucide-react";

import Login from "@/pages/login";
import Signup from "@/pages/signup";
import Profile from "@/pages/profile";
import PublicProfile from "@/pages/public-profile";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { session, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !session) {
      setLocation("/login");
    }
  }, [isLoading, session, setLocation]);

  if (isLoading || !session) return null;

  return <Component />;
}

function HomeRedirect() {
  const { session, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (session) {
        setLocation("/profile");
      } else {
        setLocation("/login");
      }
    }
  }, [isLoading, session, setLocation]);

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center gap-4"
      style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, hsl(270 40% 12%) 0%, hsl(238 25% 5%) 65%)" }}
    >
      <Flame
        className="w-10 h-10 text-orange-400 animate-pulse"
        style={{ filter: "drop-shadow(0 0 12px rgba(249,115,22,0.8))" }}
      />
      <span className="text-3xl font-display tracking-widest text-gradient-brand animate-pulse">
        CARGANDO...
      </span>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/profile">
        {() => <ProtectedRoute component={Profile} />}
      </Route>
      <Route path="/profile/:id">
        {() => <ProtectedRoute component={PublicProfile} />}
      </Route>
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
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
