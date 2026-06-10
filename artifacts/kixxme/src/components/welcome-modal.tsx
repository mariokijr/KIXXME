import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Sparkles, Heart, Star } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";

const KEY_PREFIX = "kixxme:welcome-pending:";

/** localStorage key for the one-time post-registration welcome flag. */
export function welcomeKey(userId: string) {
  return `${KEY_PREFIX}${userId}`;
}

const STEPS = [
  { icon: Sparkles, text: "Descubre chicos cerca con Tarjetas y el mapa" },
  { icon: Heart, text: "Da Me gusta y haz match para empezar a chatear" },
  { icon: Star, text: "Completa tu perfil con fotos para destacar" },
];

/**
 * Mounted once near the app root. After a successful registration the signup
 * flow writes `kixxme:welcome-pending:<userId>` to localStorage; this modal
 * shows once for that user and clears the flag on dismiss, so it never appears
 * again and never shows for pre-existing accounts.
 */
export function WelcomeModal() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      setOpen(false);
      return;
    }
    try {
      if (localStorage.getItem(welcomeKey(user.id))) setOpen(true);
    } catch {
      // localStorage unavailable — skip the welcome rather than crash.
    }
  }, [user]);

  const dismiss = () => {
    if (user) {
      try {
        localStorage.removeItem(welcomeKey(user.id));
      } catch {
        // ignore storage errors
      }
    }
    setOpen(false);
  };

  const goProfile = () => {
    dismiss();
    setLocation("/profile");
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-6 animate-in fade-in duration-200"
      style={{ background: "rgba(8,7,18,0.92)", backdropFilter: "blur(12px)" }}
      onClick={dismiss}
      data-testid="overlay-welcome"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl border p-7 flex flex-col items-center text-center gap-5 animate-in zoom-in-95 duration-200"
        style={{
          background: "linear-gradient(160deg, hsl(270 35% 11%), hsl(238 28% 7%))",
          borderColor: "rgba(168,85,247,0.35)",
          boxShadow: "0 0 60px rgba(168,85,247,0.25)",
        }}
      >
        <KixxMeLogo size={64} badge />

        <div className="flex flex-col gap-2">
          <h2
            className="font-display text-3xl tracking-wide text-gradient-brand"
            data-testid="text-welcome-title"
          >
            ¡Bienvenido a KixxMe!
          </h2>
          <p className="font-sans text-sm text-muted-foreground leading-relaxed">
            Tu perfil está listo. Así puedes empezar a conectar con chicos cerca de ti:
          </p>
        </div>

        <ul className="w-full flex flex-col gap-2.5 text-left">
          {STEPS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "rgba(168,85,247,0.15)" }}
              >
                <Icon className="w-4 h-4 text-[hsl(280,80%,72%)]" />
              </span>
              <span className="font-sans text-sm text-foreground/90">{text}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2.5 w-full pt-1">
          <button
            onClick={goProfile}
            className="h-12 rounded-xl font-display text-lg tracking-widest text-white hover:opacity-90 transition-opacity border-0"
            style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
            data-testid="button-welcome-complete"
          >
            Completar mi perfil
          </button>
          <button
            onClick={dismiss}
            className="h-11 rounded-xl font-sans text-sm text-muted-foreground border border-border/40 hover:text-foreground transition-colors"
            data-testid="button-welcome-dismiss"
          >
            Explorar primero
          </button>
        </div>
      </div>
    </div>
  );
}
